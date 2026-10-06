"""Spatially clip shapes, preserving GTFS distances and original segment order."""
import gzip, json, math, bisect, struct, shutil, hashlib
from array import array
import sys
from collections import defaultdict
from pathlib import Path
try:
    from scripts.render_geometry import attributes, display_levels, LEVELS
except ModuleNotFoundError:
    from render_geometry import attributes, display_levels, LEVELS


def tiles_for_edge(p, q, cell):
    # Bounding-box coverage also includes long fallback edges and exact boundaries.
    for y in range(math.floor((min(p[0], q[0])-1e-10)/cell), math.floor((max(p[0], q[0])+1e-10)/cell)+1):
        for x in range(math.floor((min(p[1], q[1])-1e-10)/cell), math.floor((max(p[1], q[1])+1e-10)/cell)+1):
            yield f'{y}:{x}'


def partition(g, s, cell=.05, parents=None):
    edge_tiles=[]; tile_edges=defaultdict(set); tile_shapes=defaultdict(dict)
    for e,(a,b) in enumerate(g['edges']):
        ids=list(tiles_for_edge(g['points'][a],g['points'][b],cell))
        if parents is not None:ids=[key for key in ids if ':'.join(str(int(v)//2) for v in key.split(':')) in parents]
        edge_tiles.append(ids)
        for key in ids:tile_edges[key].add(e)
    for sid,(refs,ds,*_) in enumerate(g['shapes']):
        for k,ref in enumerate(refs):
            for key in edge_tiles[abs(ref)-1]:
                tile_shapes[key].setdefault(sid,[]).append([k,ref,ds[k]])
    shape_patterns=defaultdict(list);pattern_trips=defaultdict(list)
    for pi,p in enumerate(s['patterns']):shape_patterns[p[0]].append(pi)
    for ti,t in enumerate(s['trips']):pattern_trips[t[3]].append(ti)
    for key,es in tile_edges.items():
        shapes=tile_shapes[key];pis=sorted({pi for sid in shapes for pi in shape_patterns[sid]})
        local_patterns=[];local_trips=[]
        for pi in pis:
            p=s['patterns'][pi];dist=p[1]
            segments=[ds for _,_,ds in shapes[p[0]] if ds[1]>=dist[0] and ds[0]<=dist[-1]]
            if not segments:continue
            first=max(0,bisect.bisect_right(dist,min(ds[0] for ds in segments))-1)
            last=min(len(dist),bisect.bisect_right(dist,max(ds[1] for ds in segments))+1)
            local=[p[0],dist[first:last],p[2][first:last],p[3]]
            if len(p)>4:local.append(p[4][first:last])
            local_patterns.append([pi,local,first])
            for ti in pattern_trips[pi]:
                t=s['trips'][ti];local_trips.append([ti,[*t[:5],t[5][first*2:last*2],*t[6:]]])
        local_trips.sort(key=lambda v:v[0])
        yield key,{'edges':[[e,g['points'][g['edges'][e][0]],g['points'][g['edges'][e][1]]] for e in sorted(es)],'shapes':[[sid,segs] for sid,segs in shapes.items()]}, {'patterns':local_patterns,'trips':local_trips}


def encode_schedule(data):
    values=array('I');trips=[]
    for tid,t in data['trips']:
        offset=len(values);values.extend(t[5]);trips.append([tid,[*t[:5],[offset,len(t[5])],*t[6:]]])
    header=json.dumps({'version':1,'patterns':data['patterns'],'trips':trips},ensure_ascii=False,separators=(',',':')).encode()
    header+=b' ' * (-len(header)%4)
    if sys.byteorder!='little':values.byteswap()
    return struct.pack('<I',len(header))+header+values.tobytes()


def write_chunks(directory, g=None, s=None, cell=.05):
    if g is None:g=json.load(gzip.open(directory/'geometry.json.gz'))
    if s is None:s=json.load(gzip.open(directory/'schedule.json.gz'))
    manifest={'version':2,'cell':cell,'levels':LEVELS,'chunks':{}}
    attrs=attributes(g,s)
    anchors={tuple(g["points"][g["edges"][abs(ref)-1][endpoint]]) for refs,*_ in g["shapes"] if refs for ref,endpoint in [(refs[0],0 if refs[0]>0 else 1),(refs[-1],1 if refs[-1]>0 else 0)]}
    target=directory/'chunks'
    if target.exists():shutil.rmtree(target)
    target.mkdir()
    dense=set()
    def adaptive():
        for key,geometry,schedule in partition(g,s,cell):
            if len(encode_schedule(schedule))>2_000_000:
                dense.add(key);continue
            yield key,geometry,schedule,cell
        for key,geometry,schedule in partition(g,s,cell/2,dense):
            yield 'fine-'+key,geometry,schedule,cell/2
    for key,geometry,schedule,tile_cell in adaptive():
        numeric=key.removeprefix('fine-')
        y,x=map(int,numeric.split(':'));stem=key.replace(':','_');entry={'bounds':[y*tile_cell,x*tile_cell,(y+1)*tile_cell,(x+1)*tile_cell]}
        for name,data in [('geometry',geometry),('schedule',schedule)]:
            raw=encode_schedule(data) if name=='schedule' else json.dumps(data,ensure_ascii=False,separators=(',',':')).encode();blob=gzip.compress(raw,mtime=0)
            digest=hashlib.sha256(raw).hexdigest()[:16]
            path=f'chunks/{stem}.{digest}.{name}.'+('bin.gz' if name=='schedule' else 'json.gz');(directory/path).write_bytes(blob)
            entry[name]=path;entry[name+'Bytes']=len(blob);entry[name+'DecodedBytes']=len(raw)
        levels=display_levels(geometry,attrs,anchors)
        entry['render']={}
        for level,segments in levels.items():
            raw=json.dumps({'version':1,'level':level,'segments':segments},separators=(',',':')).encode();blob=gzip.compress(raw,mtime=0)
            digest=hashlib.sha256(raw).hexdigest()[:16];path=f'chunks/{stem}.{digest}.{level}.json.gz';(directory/path).write_bytes(blob)
            entry['render'][level]={'path':path,'bytes':len(blob),'decodedBytes':len(raw),'segments':len(segments)}
        entry['routes']=sorted({t[1][0] for t in schedule['trips']})
        entry['agencies']=sorted({t[1][1] for t in schedule['trips']})
        manifest['chunks'][key]=entry
    manifest_raw=json.dumps(manifest,separators=(',',':')).encode()
    (directory/'chunks.json').write_bytes(manifest_raw)
    (directory/'chunks.json.gz').write_bytes(gzip.compress(manifest_raw,mtime=0))
    meta=json.loads((directory/'meta.json').read_text());associations=[set() for _ in meta['routes']]
    for t in s['trips']:associations[t[0]].add(t[1])
    meta['routeAgencies']=[sorted(v) for v in associations];meta['chunked']=1
    (directory/'meta.json').write_text(json.dumps(meta,ensure_ascii=False,separators=(',',':')))
    print(f"Spatial chunks: {len(manifest['chunks'])}, geometry {sum(c['geometryBytes'] for c in manifest['chunks'].values())/1e6:.2f} MB, schedule {sum(c['scheduleBytes'] for c in manifest['chunks'].values())/1e6:.2f} MB",flush=True)
    return manifest

if __name__=='__main__':write_chunks(Path('dist/data'))
