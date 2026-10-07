"""Build/verify/install a pinned geographical terrain release (stdlib installer)."""
import argparse,gzip,hashlib,json,os,re,shutil,tempfile,time,urllib.request,zipfile
from datetime import datetime,timezone
from pathlib import Path
from build_terrain import build,geographic_keys

MAX_ARCHIVE=128*1024*1024
MAX_DECODED=512*1024*1024
PARAMETERS={'algorithm':'sotofoto-horizon-v1','cell':[.002,.004],'azimuthStepDegrees':5,'targetHeightMeters':1.5,'rasterResolutionDegrees':1/1200,'earthRadiusMeters':6371000,'distanceSampling':{'near':[90,2000,90],'far':[2100,20000,45],'farScale':'geomspace'},'angleUnit':'0.1 degree','negativeHorizonClampedToZero':True}
SOURCE={'name':'Copernicus DEM GLO-30 (DSM)','distribution':'AWS Copernicus DEM 2021 release','url':'https://registry.opendata.aws/copernicus-dem/','tileBaseUrl':'https://copernicus-dem-30m.s3.amazonaws.com/','licenseUrl':'https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model','attribution':'Produced using Copernicus WorldDEM-30 © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018 provided under COPERNICUS by the European Union and ESA; all rights reserved. Modified geographical horizon profiles for Šotofoto.'}

def sha(data):return hashlib.sha256(data).hexdigest()
def encode(value):return json.dumps(value,separators=(',',':'),ensure_ascii=False).encode()
def valid_tag(tag):
    if not re.fullmatch(r'terrain-v[0-9]+-[A-Za-z0-9._-]+',tag):raise ValueError('Invalid terrain release tag')
    return tag

def expand_keys(keys,reserve):
    if type(reserve) is not int or not 0<=reserve<=10:raise ValueError('reserveCells must be an integer 0..10')
    return sorted({(y+dy,x+dx) for y,x in keys for dy in range(-reserve,reserve+1) for dx in range(-reserve,reserve+1)})

def package(directory,output,tag,reserve,provenance,elapsed):
    tag=valid_tag(tag);index=json.loads((directory/'terrain-index.json').read_text())
    files={'terrain-index.json':(directory/'terrain-index.json').read_bytes()}
    profiles=0;invalid=0;keys=[]
    for c in index['chunks'].values():
        blob=(directory/c['path']).read_bytes();files[c['path']]=blob
        rows=json.loads(gzip.decompress(blob));profiles+=len(rows);invalid+=sum(not r[2] for r in rows);keys.extend(r[0] for r in rows)
    dataset={'schema':1,'id':tag,'builtAt':datetime.now(timezone.utc).isoformat(),'parameters':PARAMETERS,'source':{**SOURCE,**provenance},'coverage':{'profiles':profiles,'invalidProfiles':invalid,'reserveCells':reserve,'boundsOfProfileCenters':[min(k[0] for k in keys)*.002,min(k[1] for k in keys)*.004,max(k[0] for k in keys)*.002,max(k[1] for k in keys)*.004],'continuousRectangle':False},'metrics':{'buildSeconds':round(elapsed,3),'chunks':len(index['chunks']),'compressedChunkBytes':sum(len(v) for k,v in files.items() if k.startswith('terrain/')),'decodedChunkBytes':sum(c['bytes'] for c in index['chunks'].values())},'files':{k:{'sha256':sha(v),'bytes':len(v)} for k,v in files.items()}}
    output.mkdir(parents=True,exist_ok=True);manifest=encode(dataset);(output/'dataset.json').write_bytes(manifest)
    with zipfile.ZipFile(output/'terrain.zip','w',compression=zipfile.ZIP_STORED) as z:
        for name,data in sorted({**files,'dataset.json':manifest}.items()):z.writestr(name,data)
    archive_sha=sha((output/'terrain.zip').read_bytes());(output/'terrain.sha256').write_text(archive_sha+'  terrain.zip\n')
    print(json.dumps({'id':tag,'archiveBytes':(output/'terrain.zip').stat().st_size,'sha256':archive_sha,**dataset['coverage'],**dataset['metrics']},indent=2),flush=True)
    return archive_sha

def verify_archive(archive,expected_sha=None,expected_id=None):
    if archive.stat().st_size>MAX_ARCHIVE:raise ValueError('Terrain archive too large')
    if expected_sha and sha(archive.read_bytes())!=expected_sha:raise ValueError('Terrain archive checksum mismatch')
    with zipfile.ZipFile(archive) as z:
        names=z.namelist()
        if len(names)!=len(set(names)) or len(names)>20000:raise ValueError('Duplicate/excessive archive members')
        if sum(i.file_size for i in z.infolist())>MAX_DECODED:raise ValueError('Terrain archive decoded size limit')
        if any(not re.fullmatch(r'(dataset.json|terrain-index.json|terrain/[0-9]+_[0-9]+\.[a-f0-9]{16}\.json\.gz)',n) for n in names):raise ValueError('Unsafe terrain archive member')
        dataset=json.loads(z.read('dataset.json'))
        if dataset.get('schema')!=1 or dataset.get('parameters')!=PARAMETERS:raise ValueError('Unsupported terrain dataset parameters')
        valid_tag(dataset['id'])
        if expected_id and dataset['id']!=expected_id:raise ValueError('Terrain dataset ID mismatch')
        if set(names)!=set(dataset['files'])|{'dataset.json'}:raise ValueError('Terrain archive file list mismatch')
        data={}
        for name,entry in dataset['files'].items():
            blob=z.read(name)
            if len(blob)!=entry['bytes'] or sha(blob)!=entry['sha256']:raise ValueError('Terrain member checksum mismatch: '+name)
            data[name]=blob
    index=json.loads(data['terrain-index.json'])
    if index.get('version')!=1 or index.get('cell')!=PARAMETERS['cell']:raise ValueError('Unsupported terrain index')
    if set(data)!={'terrain-index.json'}|{c['path'] for c in index['chunks'].values()}:raise ValueError('Terrain index references differ from archive')
    profiles=set();decoded=0;invalid=0
    for c in index['chunks'].values():
        with gzip.GzipFile(fileobj=__import__('io').BytesIO(data[c['path']])) as g:raw=g.read(MAX_DECODED-decoded+1)
        decoded+=len(raw)
        if decoded>MAX_DECODED or len(raw)!=c['bytes'] or sha(raw)[:16] not in c['path']:raise ValueError('Terrain chunk content mismatch')
        for key,horizon,valid in json.loads(raw):
            if len(key)!=2 or any(type(k) is not int for k in key) or len(horizon)!=72 or any(type(h) is not int or not 0<=h<=900 for h in horizon) or type(valid) is not int or valid not in (0,1):raise ValueError('Invalid terrain profile')
            key=tuple(key)
            if key in profiles:raise ValueError('Duplicate geographical profile')
            profiles.add(key);invalid+=not valid
    if len(profiles)!=dataset['coverage']['profiles'] or invalid!=dataset['coverage']['invalidProfiles']:raise ValueError('Terrain coverage count mismatch')
    return dataset,index,data,profiles

def install(archive,directory,expected_sha,expected_id):
    dataset,index,data,profiles=verify_archive(archive,expected_sha,expected_id)
    needed=set(geographic_keys(json.load(gzip.open(directory/'geometry.json.gz'))));missing=sorted(needed-profiles)
    # A new route outside the declared coverage remains explicitly unverified.
    index['dataset']={k:dataset[k] for k in ['id','builtAt','parameters','source','coverage']}
    index['coverageCheck']={'requiredProfiles':len(needed),'missingProfiles':len(missing),'missingExamples':[list(k) for k in missing[:20]]}
    data['terrain-index.json']=encode(index)
    dataset={**dataset,'archiveSha256':expected_sha,'sourceIndexSha256':dataset['files']['terrain-index.json']['sha256'],'files':{**dataset['files'],'terrain-index.json':{'sha256':sha(data['terrain-index.json']),'bytes':len(data['terrain-index.json'])}}}
    with tempfile.TemporaryDirectory(dir=directory.parent) as tmp:
        stage=Path(tmp)
        for name,blob in data.items():p=stage/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(blob)
        (stage/'terrain-dataset.json').write_bytes(encode(dataset))
        target=directory/'terrain'
        if target.exists():shutil.rmtree(target)
        shutil.move(str(stage/'terrain'),target)
        for name in ['terrain-index.json','terrain-dataset.json']:shutil.move(str(stage/name),directory/name)
    print(f'Terrain dataset {dataset["id"]}: copied {len(profiles)} profiles; missing {len(missing)}; DEM computed 0',flush=True)
    return missing

def download(url,target):
    with urllib.request.urlopen(url,timeout=120) as response,open(target,'wb') as out:
        total=0
        while part:=response.read(1024*1024):
            total+=len(part)
            if total>MAX_ARCHIVE:raise ValueError('Terrain download too large')
            out.write(part)

def install_release(lock,directory):
    cfg=json.loads(lock.read_text());valid_tag(cfg['tag'])
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',cfg['repository']) or not re.fullmatch(r'[a-f0-9]{64}',cfg['sha256']):raise ValueError('Invalid pinned terrain release')
    url=f'https://github.com/{cfg["repository"]}/releases/download/{cfg["tag"]}/terrain.zip'
    with tempfile.TemporaryDirectory() as tmp:
        archive=Path(tmp)/'terrain.zip';download(url,archive);return install(archive,directory,cfg['sha256'],cfg['tag'])

def create(directory,output,tag,reserve):
    start=time.monotonic();g=json.load(gzip.open(directory/'geometry.json.gz'));keys=expand_keys(geographic_keys(g),reserve)
    provenance={'buildCommit':os.environ.get('GITHUB_SHA'),'algorithmSourceSha256':sha(Path(__file__).with_name('build_terrain.py').read_bytes())}
    # A fresh release is rebuilt with one DEM snapshot; Actions cache is not authoritative.
    with tempfile.TemporaryDirectory() as tmp:build(directory,Path(tmp)/'profiles.json',keys,provenance)
    digest=package(directory,output,tag,reserve,provenance,time.monotonic()-start)
    verify_archive(output/'terrain.zip',digest,tag)

if __name__=='__main__':
    p=argparse.ArgumentParser();sub=p.add_subparsers(dest='command',required=True)
    c=sub.add_parser('create');c.add_argument('--directory',type=Path,default=Path('dist/data'));c.add_argument('--output',type=Path,default=Path('terrain-release'));c.add_argument('--tag',required=True);c.add_argument('--reserve-cells',type=int,default=2)
    i=sub.add_parser('install');i.add_argument('--directory',type=Path,default=Path('dist/data'));i.add_argument('--lock',type=Path,default=Path('config/terrain.json'))
    v=sub.add_parser('verify');v.add_argument('archive',type=Path);v.add_argument('--sha256');v.add_argument('--id')
    a=p.parse_args()
    if a.command=='create':create(a.directory,a.output,a.tag,a.reserve_cells)
    elif a.command=='install':install_release(a.lock,a.directory)
    else:verify_archive(a.archive,a.sha256,a.id);print('Terrain archive verified')
