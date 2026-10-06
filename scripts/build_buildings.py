"""OSM -> conservative, geographic building skyline envelopes. No client polygons.

Two circles bound each footprint: a containing circle gives a possible skyline,
an inscribed circle gives a guaranteed blocker in the documented flat-ground model.
The observer cell radius and entire azimuth sector are included in these bounds.
"""
import argparse, gzip, hashlib, json, math, re, resource, shutil, struct, time, urllib.request
from pathlib import Path
import numpy as np

CELL=(.0001,.00015)
TILE=.01
STEP=5
RANGE=500
OBSERVER=1.5
X=111320*math.cos(math.radians(50))
Y=111320
MODEL={'algorithm':4,'cell':CELL,'tile':TILE,'step':STEP,'range':RANGE,'observer':OBSERVER,'floor':3,'roofFallback':0,'projection':[X,Y],'source':'OSM/Geofabrik CZ','envelope':'inner-outer-circle'}
MODEL_ID=hashlib.sha256(json.dumps(MODEL,sort_keys=True).encode()).hexdigest()[:16]
SOURCE_URL='https://download.geofabrik.de/europe/czech-republic-latest.osm.pbf'


def number(value):
    if value is None:return None
    text=str(value).strip()
    match=re.fullmatch(r'(\d+(?:\.\d+)?)\s*(m|ft)?',text)
    if not match:return None
    n=float(match[1])*(.3048 if match[2]=='ft' else 1)
    return n if 0<=n<=1000 else None


def height_model(tags):
    height=number(tags.get('height'))
    if height and height>0:
        quality='estimated' if 'est' in tags.get('source:height','').lower() else 'exact'
        # height already includes the roof: never add roof:height twice.
        return height,quality
    levels=number(tags.get('building:levels'))
    if levels and 0<levels<=100:
        roof=number(tags.get('roof:height'))
        roof_levels=number(tags.get('roof:levels'))
        return levels*3+(roof if roof is not None else (roof_levels or 0)*3),'estimated'
    return None,'unknown'


def tile_key(lat,lon):return f'{math.floor(lat/TILE+1e-9)}:{math.floor(lon/TILE+1e-9)}'
def site_key(lat,lon):return math.floor(lat/CELL[0]+.5),math.floor(lon/CELL[1]+.5)
def site_tile(key):return tile_key(key[0]*CELL[0],key[1]*CELL[1])


def geographic_keys(g):
    # A corridor, not route/trip IDs. Sample long edges as well as their midpoint.
    keys=set()
    for a,b in g['edges']:
        p,q=g['points'][a],g['points'][b]
        n=max(1,math.ceil(math.hypot((p[0]-q[0])*Y,(p[1]-q[1])*X)/10))
        for i in range(n+1):
            k=site_key(p[0]+(q[0]-p[0])*i/n,p[1]+(q[1]-p[1])*i/n)
            for dy in (-1,0,1):
                for dx in (-1,0,1):keys.add((k[0]+dy,k[1]+dx))
    return keys


def circles(poly,known=True):
    import shapely
    from shapely.geometry import Point
    minx,miny,maxx,maxy=poly.bounds
    outer=[(minx+maxx)/2,(miny+maxy)/2,math.hypot(maxx-minx,maxy-miny)/2]
    # Guaranteed contained circle, including holes / concave footprints.
    if known:
        c=poly.representative_point();inner=[c.x,c.y,c.distance(poly.boundary)]
    else:inner=[outer[0],outer[1],0]
    return outer,inner


def extract(pbf,tiles,directory):
    import osmium
    import shapely
    from shapely.geometry import shape
    from shapely.ops import transform,unary_union
    directory.mkdir(parents=True,exist_ok=True)
    records={t:[] for t in tiles};failed=0;total=0;seen=set();failure_tiles=set();fatal=False
    minlat=min(int(t.split(':')[0])*TILE for t in tiles)-.01
    maxlat=max((int(t.split(':')[0])+1)*TILE for t in tiles)+.01
    minlon=min(int(t.split(':')[1])*TILE for t in tiles)-.015
    maxlon=max((int(t.split(':')[1])+1)*TILE for t in tiles)+.015
    factory=osmium.geom.GeoJSONFactory()
    def distribute(record,bounds):
        minx,miny,maxx,maxy=bounds
        for y in range(math.floor((miny-RANGE-20)/Y/TILE),math.floor((maxy+RANGE+20)/Y/TILE)+1):
            for x in range(math.floor((minx-RANGE-20)/X/TILE),math.floor((maxx+RANGE+20)/X/TILE)+1):
                t=f'{y}:{x}'
                if t in records:records[t].append(record)
    def mark_failure(bounds):
        nonlocal fatal
        if bounds is None:fatal=True;return
        w,s,e,n=bounds
        for yy in range(math.floor((s-.01)/TILE),math.floor((n+.01)/TILE)+1):
            for xx in range(math.floor((w-.015)/TILE),math.floor((e+.015)/TILE)+1):failure_tiles.add(f'{yy}:{xx}')
    class Handler(osmium.SimpleHandler):
        def area(self,a):
            nonlocal failed,total
            tags=dict(a.tags)
            if not any(tags.get(k) not in (None,'no') for k in ('building','building:part')):return
            # osmium's area assembler handles relation holes and suppresses member ways.
            identity=('w' if a.from_way() else 'r')+str(a.orig_id())
            if identity in seen:return
            seen.add(identity)
            bounds=None
            try:
                poly=shape(json.loads(factory.create_multipolygon(a)))
                bounds=poly.bounds
                w,s,e,n=poly.bounds
                if n<minlat or s>maxlat or e<minlon or w>maxlon:return
                poly=transform(lambda x,y,z=None:(np.asarray(x)*X,np.asarray(y)*Y),poly)
                if not poly.is_valid:poly=shapely.make_valid(poly)
                parts=[p for p in getattr(poly,'geoms',[poly]) if p.geom_type=='Polygon' and p.area>0]
                if not parts:raise ValueError('no polygon')
                h,q=height_model(tags)
                suspended=number(tags.get('min_height')) or number(tags.get('building:min_level')) or 0
                # Roofs / raised parts need an altitude interval, not one skyline.
                if suspended or tags.get('building')=='roof':q='unknown';h=None
                for i,p in enumerate(parts):
                    outer,inner=circles(p,known=h is not None)
                    distribute([identity+':'+str(i),outer,inner,h,q,tags.get('building:part') not in (None,'no')],p.bounds)
                total+=1
                if total%20000==0:print("OSM buildings extracted",total,flush=True)
            except Exception:
                failed+=1;mark_failure(bounds)
        def way(self,w):
            # A tunnel/covered transport way is a local uncertainty corridor.
            tags=dict(w.tags)
            if not (tags.get('railway') or tags.get('highway')):return
            if tags.get('tunnel') in (None,'no') and tags.get('covered') in (None,'no'):return
            bounds=None
            try:
                poly=shape(json.loads(factory.create_linestring(w))).buffer(.00006)
                bounds=poly.bounds
                poly=transform(lambda x,y,z=None:(np.asarray(x)*X,np.asarray(y)*Y),poly)
                outer,inner=circles(poly,known=False)
                distribute(['covered:'+str(w.id),outer,inner,None,'unknown',False],poly.bounds)
            except Exception:
                failed+=1;mark_failure(bounds)
    Handler().apply_file(str(pbf),locations=True,idx='sparse_file_array')
    # A malformed source geometry cannot be silently treated as missing buildings.
    # Mark all tiles unverified for this extract if any relevant object failed parsing.
    quality_counts={'exact':0,'estimated':0,'unknown':0}
    for t,objects in records.items():
        objects=sorted({o[0]:o for o in objects}.values(),key=lambda o:o[0])
        # Keep outline AND parts conservatively: max envelopes never add heights.
        # An unheighted outline remains uncertainty even if some parts have height.
        raw=json.dumps({'objects':objects,'complete':not fatal and t not in failure_tiles},separators=(',',':')).encode()
        (directory/(t.replace(':','_')+'.json.gz')).write_bytes(gzip.compress(raw,mtime=0))
    # Count unique components only, not their halo copies.
    unique={o[0]:o for objects in records.values() for o in objects}
    for o in unique.values():quality_counts[o[4]]+=1
    return {'objects':total,'components':len(unique),'failed':failed,'fatal':fatal,'failedTiles':sorted(failure_tiles & tiles),'heights':quality_counts}


def profiles(keys,objects,step=STEP):
    """Bounds valid for any point in the cell and any azimuth in its sector.

    Unknown footprint heights are direction masks, never a made-up height.
    Returned lowerExact/lowerEstimated/upper are deci-degrees + quality flags.
    """
    sites=np.array([[k[1]*CELL[1]*X,k[0]*CELL[0]*Y] for k in keys])
    n=len(sites);bins=int(360/step)
    exact=np.zeros((n,bins),dtype=np.uint16);estimated=exact.copy();upper=exact.copy();flags=np.zeros((n,bins),dtype=np.uint8)
    radius=math.hypot(CELL[0]*Y,CELL[1]*X)/2
    angles=np.arange(bins)*step+step/2
    for _,outer,inner,h,q,_ in objects:
        delta=np.array(outer[:2])-sites;d=np.hypot(delta[:,0],delta[:,1]);r=outer[2]+radius
        if np.all(d-r>RANGE):continue
        direction=np.degrees(np.arctan2(delta[:,0],delta[:,1]))%360
        diff=np.abs((angles[None,:]-direction[:,None]+180)%360-180)
        width=np.degrees(np.arcsin(np.minimum(1,r/np.maximum(d,1e-9))))
        possible=(diff<=width[:,None]+step/2)|(d[:,None]<=r)
        possible &= (d[:,None]-r<=RANGE)
        if q=='unknown':flags[possible]|=1;continue
        maxangle=np.ceil(np.degrees(np.arctan2(max(0,h-OBSERVER),np.maximum(.01,d-r)))*10).astype(np.uint16)
        upper=np.maximum(upper,np.where(possible,maxangle[:,None],0))
        if q=='estimated':flags[possible]|=2
        # Shrinking inscribed circle accounts for ALL observer offsets in the cell.
        delta=np.array(inner[:2])-sites;d=np.hypot(delta[:,0],delta[:,1]);r=inner[2]-radius
        if r<=0:continue
        direction=np.degrees(np.arctan2(delta[:,0],delta[:,1]))%360
        diff=np.abs((angles[None,:]-direction[:,None]+180)%360-180)+step/2
        width=np.degrees(np.arcsin(np.minimum(1,r/np.maximum(d,1e-9))))
        guaranteed=(diff<width[:,None])&(d[:,None]>r)&(d[:,None]+r<=RANGE)
        # d+r bounds the furthest intersection: a safe lower blocking angle.
        minangle=np.floor(np.degrees(np.arctan2(max(0,h-OBSERVER),d+r))*10).astype(np.uint16)
        target=estimated if q=='estimated' else exact
        np.maximum(target,np.where(guaranteed,minangle[:,None],0),out=target)
    return exact,estimated,upper,flags


def encode(keys,values):
    # SF B1, count u32, 72 samples; per record int32 y,x + 3*u16 + u8.
    output=bytearray(b'SFB1'+struct.pack('<I',len(keys)))
    for i,k in enumerate(keys):
        output.extend(struct.pack('<ii',*k))
        for arr in values[:3]:output.extend(arr[i].astype('<u2').tobytes())
        output.extend(values[3][i].tobytes())
    return bytes(output)


def source_coverage(cache):
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    path=cache/'coverage.poly'
    if not path.exists():
        with urllib.request.urlopen('https://download.geofabrik.de/europe/czech-republic.poly',timeout=60) as response:path.write_bytes(response.read())
    rings=[];holes=[];current=[];hole=False
    for line in path.read_text().splitlines()[1:]:
        line=line.strip()
        if line=='END':
            if current:(holes if hole else rings).append(Polygon(current));current=[]
        elif len(line.split())==2:
            current.append(tuple(map(float,line.split())))
        elif line:hole=line.startswith('!')
    area=unary_union(rings)
    for h in holes:area=area.difference(h)
    if area.is_empty:raise ValueError('Missing source coverage')
    return area


def download(cache):
    source=cache/'czech.osm.pbf';info=cache/'source.json'
    # Static source refresh is explicit, independent of every GTFS/README build.
    if source.exists() and info.exists():return source,json.loads(info.read_text())
    temp=source.with_suffix('.part');digest=hashlib.sha256()
    with urllib.request.urlopen(SOURCE_URL,timeout=90) as r,temp.open('wb') as out:
        metadata={'url':r.url,'lastModified':r.headers.get('Last-Modified'),'downloadedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
        while block:=r.read(1024*1024):out.write(block);digest.update(block)
    temp.replace(source);metadata['sha256']=digest.hexdigest();info.write_text(json.dumps(metadata));return source,metadata


def build(directory=Path('dist/data'),cache=Path('.cache/buildings'),source=None):
    started=time.perf_counter();cache.mkdir(parents=True,exist_ok=True)
    g=json.load(gzip.open(directory/'geometry.json.gz'));keys=geographic_keys(g);by_tile={}
    for k in sorted(keys):by_tile.setdefault(site_tile(k),[]).append(k)
    if source:
        pbf=Path(source);sha=hashlib.sha256()
        with pbf.open('rb') as f:
            while block:=f.read(1024*1024):sha.update(block)
        metadata={'url':SOURCE_URL,'sha256':sha.hexdigest()}
        import osmium
        try:
            with osmium.io.Reader(str(pbf)) as reader:metadata['dataTimestamp']=reader.header().get('osmosis_replication_timestamp')
        except Exception:pass
    else:pbf,metadata=download(cache)
    extraction=cache/('source-v3-'+metadata['sha256'][:16]);extraction.mkdir(exist_ok=True)
    source_tiles=extraction/'tiles';state=extraction/'state.json'
    previous=json.loads(state.read_text()) if state.exists() else {}
    new_tiles=set(by_tile)-set(previous.get('tiles',[]))
    if new_tiles:
        stats=extract(pbf,set(by_tile),source_tiles)
        previous={'tiles':sorted(by_tile),'stats':stats};state.write_text(json.dumps(previous))
    else:stats=previous['stats']
    print('OSM source ready',stats,flush=True)
    coverage=source_coverage(cache)
    target=directory/'building-horizon'
    if target.exists():shutil.rmtree(target)
    target.mkdir();manifest={'version':1,'model':MODEL,'modelId':MODEL_ID,'cell':CELL,'step':STEP,'source':metadata,'license':'ODbL-1.0','stats':stats,'chunks':{}}
    computed=cached=empty=0;published=0
    store=cache/('profiles-'+MODEL_ID);store.mkdir(exist_ok=True)
    for t,site_keys in sorted(by_tile.items()):
        y,x=map(int,t.split(':'));source_blob=(source_tiles/(t.replace(':','_')+'.json.gz')).read_bytes();data=json.loads(gzip.decompress(source_blob))
        bounds=[y*TILE,x*TILE,(y+1)*TILE,(x+1)*TILE]
        from shapely.geometry import box
        if not data['complete'] or not coverage.covers(box(bounds[1]-.008,bounds[0]-.005,bounds[3]+.008,bounds[2]+.005)):
            manifest['chunks'][t]={'bounds':bounds,'status':'unknown'};continue
        if not data['objects']:
            manifest['chunks'][t]={'bounds':bounds,'status':'empty'};empty+=len(site_keys);continue
        # Per tile source fingerprint. GTFS IDs never enter the key.
        identity=hashlib.sha256(source_blob).hexdigest()[:16]
        folder=store/(t.replace(':','_')+'-'+identity);folder.mkdir(exist_ok=True)
        # Incremental profile rows, indexed by stable geographic coordinates.
        cached_path=folder/'rows.bin';rows={}
        size=8+int(360/STEP)*7
        if cached_path.exists():
            blob=cached_path.read_bytes()
            for offset in range(0,len(blob),size):
                row=blob[offset:offset+size];rows[struct.unpack_from('<ii',row)]=row
        missing=[k for k in site_keys if k not in rows]
        for begin in range(0,len(missing),256):
            group=missing[begin:begin+256];blob=encode(group,profiles(group,data['objects']))[8:]
            for i,k in enumerate(group):rows[k]=blob[i*size:(i+1)*size]
        computed+=len(missing);cached+=len(site_keys)-len(missing)
        if computed and computed%20000<len(missing):print('Building profiles',computed,'cached',cached,flush=True)
        if missing:
            temp=cached_path.with_suffix('.tmp');temp.write_bytes(b''.join(rows[k] for k in sorted(rows)));temp.replace(cached_path)
        raw=b'SFB1'+struct.pack('<I',len(site_keys))+b''.join(rows[k] for k in site_keys)
        digest=hashlib.sha256(raw).hexdigest()[:16];path=f"building-horizon/{t.replace(':','_')}.{digest}.bin.gz"
        compressed=gzip.compress(raw,mtime=0);(directory/path).write_bytes(compressed);published+=len(compressed)
        manifest['chunks'][t]={'bounds':bounds,'status':'profiles','path':path,'bytes':len(raw),'gzipBytes':len(compressed),'profiles':len(site_keys)}
    manifest['build']={'seconds':round(time.perf_counter()-started,3),'computed':computed,'cached':cached,'empty':empty,'gzipBytes':published,'peakRssKiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}
    (directory/'building-index.json').write_text(json.dumps(manifest,separators=(',',':')))
    (directory/'building-license.txt').write_text('Building horizon database: copyright OpenStreetMap contributors, ODbL 1.0.\nhttps://www.openstreetmap.org/copyright\nSource extract: https://download.geofabrik.de/europe/czech-republic.html\nDerived by scripts/build_buildings.py in https://github.com/anlexcz/sotofoto\n')
    print('Buildings',json.dumps(manifest['build']),stats,flush=True)
    return manifest

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source');p.add_argument('--cache',type=Path,default=Path('.cache/buildings'));p.add_argument('--directory',type=Path,default=Path('dist/data'));a=p.parse_args();build(a.directory,a.cache,a.source)
