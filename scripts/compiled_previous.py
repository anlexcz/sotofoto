"""One-time, verified recovery from the October 6 compiled Pages artifact.

This is not an original GTFS ZIP. Preserve exact compiled geometry and times.
Once the source feed advances, ordinary raw GTFS snapshots take over.
"""
import gzip,hashlib,json,subprocess,tarfile,zipfile,io,urllib.error
from pathlib import Path
from datetime import datetime
from gtfs_update import download,REPO
FILES=['meta.json','geometry.json.gz','schedule.json.gz']
META_KEYS=['version','startDate','endDate','routes','agencies','services','exceptions','headsigns','stats']

def load(directory):
    return [json.loads(gzip.decompress((directory/n).read_bytes()) if n.endswith('.gz') else (directory/n).read_bytes()) for n in FILES]
def checksums(directory):
    m,g,s=load(directory)
    # Node recovery can assign different point IDs; exact oriented coordinates,
    # global edge order, shape refs/distances and schedules must still agree.
    geometry={'edges':[[g['points'][a],g['points'][b]] for a,b in g['edges']], 'shapes':[v[:2] for v in g['shapes']]}
    return {n:hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest() for n,value in zip(FILES,[{k:m[k] for k in META_KEYS},geometry,s])}
def verify(directory,spec):
    if (actual:=checksums(directory))!=spec['checksums']:raise ValueError('Compiled previous snapshot checksum mismatch: '+json.dumps(actual))
    m,_,_=load(directory)
    if not m['startDate']<=spec['day']<=m['endDate']:raise ValueError('Compiled snapshot does not cover preceding day')
def pack(directory,path):
    with zipfile.ZipFile(path,'w') as z:
        for n in FILES:z.writestr(zipfile.ZipInfo(n,date_time=(1980,1,1,0,0,0)),(directory/n).read_bytes())
def acquire(spec,directory):
    if spec['repository']!=REPO:raise ValueError('Invalid compiled repository')
    archive=directory/'compiled-previous.zip';out=directory/'compiled-previous';out.mkdir(exist_ok=True)
    try:download(f'https://github.com/{REPO}/releases/download/{spec["tag"]}/compiled-previous.zip',archive)
    except urllib.error.HTTPError as e:
        if e.code!=404:raise
        artifact=directory/'previous-pages.zip'
        with artifact.open('wb') as f:subprocess.run(['gh','api',f'repos/{REPO}/actions/artifacts/{int(spec["artifactId"])}/zip'],stdout=f,check=True)
        if hashlib.sha256(artifact.read_bytes()).hexdigest()!=spec['artifactSha256']:raise ValueError('Original Pages artifact checksum mismatch')
        with zipfile.ZipFile(artifact) as z,tarfile.open(fileobj=io.BytesIO(z.read('artifact.tar'))) as t:
            members={m.name.removeprefix('./'):m for m in t.getmembers() if m.isfile()}
            for n in ['meta.json','chunks.json']:
                (out/n).write_bytes(t.extractfile(members['data/'+n]).read())
            index=json.loads((out/'chunks.json').read_text());(out/'chunks').mkdir(exist_ok=True)
            for chunk in index['chunks'].values():
                for kind in ['geometry','schedule']:
                    name=chunk[kind]
                    if not name.startswith('chunks/') or '/' in name[7:]:raise ValueError('Invalid artifact chunk path')
                    (out/name).write_bytes(t.extractfile(members['data/'+name]).read())
        subprocess.run(['node','--max-old-space-size=6144','scripts/recover_compiled.mjs',str(out)],check=True)
        verify(out,spec);pack(out,archive)
    else:
        with zipfile.ZipFile(archive) as z:
            if sorted(z.namelist())!=sorted(FILES):raise ValueError('Invalid compiled archive members')
            for n in FILES:(out/n).write_bytes(z.read(n))
    verify(out,spec)
    return out

def merge(directory,previous,day):
    m,g,s=load(directory);old,og,os=load(previous)
    if not old['startDate']<=day<=old['endDate']:raise ValueError('Missing previous service day')
    weekday=datetime.strptime(day,'%Y%m%d').weekday()
    active={i for i,r in enumerate(old['services']) if r[0]<=day<=r[1] and r[2+weekday]}
    for i,kind in old['exceptions'].get(day,[]):
        if kind==1:active.add(i)
        else:active.discard(i)
    # Only trips reaching the first new civil day can affect its results.
    trips=[t for t in os['trips'] if t[2] in active and max(t[5])>=86400]
    points={tuple(p):i for i,p in enumerate(g['points'])};edges={tuple(sorted(e)):i for i,e in enumerate(g['edges'])}
    def point(i):
        p=tuple(og['points'][i])
        if p not in points:points[p]=len(g['points']);g['points'].append(list(p))
        return points[p]
    edge_map={};shape_map={};pattern_map={}
    def shape(i):
        if i in shape_map:return shape_map[i]
        refs,distances,*extra=og['shapes'][i];mapped=[]
        for ref in refs:
            e=abs(ref)-1
            if e not in edge_map:
                a,b=map(point,og['edges'][e]);key=tuple(sorted([a,b]))
                if key not in edges:edges[key]=len(g['edges']);g['edges'].append([a,b])
                index=edges[key];edge_map[e]=(index+1)*(1 if g['edges'][index]==[a,b] else -1)
            mapped.append(edge_map[e]*(1 if ref>0 else -1))
        shape_map[i]=len(g['shapes']);g['shapes'].append([mapped,distances,*extra]);return shape_map[i]
    def metadata(key,index):
        value=old[key][index]
        if value in m[key]:return m[key].index(value)
        value=list(value) if key!='headsigns' else value
        if key in ['routes','agencies']:value[0]='previous_compiled_'+value[0]
        m[key].append(value);return len(m[key])-1
    maps={key:{i:metadata(key,i) for i in {t[column] for t in trips}} for key,column in [('routes',0),('agencies',1),('headsigns',4)]}
    for r in m['services']:r[0]=max(r[0],m['startDate'])
    m['exceptions']={d:v for d,v in m['exceptions'].items() if d>=m['startDate']}
    service=len(m['services']);m['services'].append([day,day,*([0]*7)]);m['exceptions'][day]=[[service,1]]
    for t in trips:
        p=t[3]
        if p not in pattern_map:
            pattern_map[p]=len(s['patterns']);s['patterns'].append([shape(os['patterns'][p][0]),*os['patterns'][p][1:]])
        s['trips'].append([maps['routes'][t[0]],maps['agencies'][t[1]],service,pattern_map[p],maps['headsigns'][t[4]],t[5],t[6],'previous_compiled_'+t[7]])
    m['serviceStartDate']=day;m['continuity'].update(complete=True,reason=None,importedTrips=len(trips))
    m['stats'].update(trips=len(s['trips']),shapes=len(g['shapes']),edges=len(g['edges']))
    from build_data import write_json
    for name,value in zip(FILES,[m,g,s]):write_json(directory/name,value,name.endswith('.gz'))
    print(f'Previous compiled day {day}: preserved {len(trips)} midnight trips with original geometry and flags',flush=True)
    return len(trips)
