"""Precompute approximate terrain horizons; no live elevation API needed."""
import gzip,json,math,urllib.request,shutil,time,hashlib
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


def build(directory=Path('dist/data'), profile_cache=Path('.cache/terrain-v1.json'), keys=None, provenance=None):
    g=json.load(gzip.open(directory/'geometry.json.gz'))
    # Geographical cells are independent of feed-specific edge and shape IDs.
    all_keys=geographic_keys(g) if keys is None else sorted(set(keys))
    profile_cache.parent.mkdir(parents=True,exist_ok=True)
    saved=json.loads(profile_cache.read_text()) if profile_cache.exists() else {}
    missing=[k for k in all_keys if ','.join(map(str,k)) not in saved]
    if not missing:
        publish(directory,all_keys,saved);print('Terrain computed 0 cached',len(all_keys),flush=True);return
    import numpy as np
    import rasterio
    from rasterio.merge import merge
    keys=np.asarray(missing,dtype=int).reshape(-1,2)
    sites=keys*[.002,.004]
    south,west=sites.min(axis=0)-.35;north,east=sites.max(axis=0)+.35
    cache=Path('/tmp/sotofoto-dem');cache.mkdir(exist_ok=True);datasets=[]
    tiles=[(lat,lon) for lat in range(math.floor(south),math.floor(north)+1) for lon in range(math.floor(west),math.floor(east)+1)]
    def download(tile):
        lat,lon=tile
        stem=f'Copernicus_DSM_COG_10_N{lat:02d}_00_E{lon:03d}_00_DEM'
        path=cache/(stem+'.tif')
        if not path.exists():
            for attempt in range(3):
                try:
                    print('Downloading',stem,flush=True)
                    with urllib.request.urlopen(f'https://copernicus-dem-30m.s3.amazonaws.com/{stem}/{stem}.tif',timeout=60) as response,open(str(path)+'.part','wb') as output:
                        shutil.copyfileobj(response,output)
                    Path(str(path)+'.part').replace(path)
                    break
                except Exception:
                    if attempt==2:raise
                    time.sleep(2)
        return path
    with ThreadPoolExecutor(max_workers=4) as pool:
        paths=list(pool.map(download,tiles))
    if provenance is not None:
        provenance['demTiles']=[{'name':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(paths)]
    datasets=[rasterio.open(path) for path in paths]
    dem,transform=merge(datasets,bounds=(west,south,east,north),res=1/1200,nodata=-9999)
    dem=dem[0];[d.close() for d in datasets]
    def sample(lat,lon):
        rows=np.clip(((transform.f-lat)/abs(transform.e)).astype(int),0,dem.shape[0]-1)
        cols=np.clip(((lon-transform.c)/transform.a).astype(int),0,dem.shape[1]-1)
        return dem[rows,cols]
    distance=np.unique(np.r_[np.arange(90,2001,90),np.geomspace(2100,20000,45)])
    horizons=np.zeros((len(sites),72),dtype=np.int16)
    valid=np.ones(len(sites),dtype=bool)
    for begin in range(0,len(sites),1000):
        lat=sites[begin:begin+1000,0,None];lon=sites[begin:begin+1000,1,None]
        base=sample(lat,lon)+1.5
        ok=(base[:,0]>-9000)
        for k in range(72):
            a=math.radians(k*5)
            h=sample(lat+math.cos(a)*distance/111320,lon+math.sin(a)*distance/(111320*np.cos(np.radians(lat))))
            ok &= (h>-9000).all(axis=1)
            # Earth curvature matters near a low horizon.
            angles=np.degrees(np.arctan2(h-base-distance**2/(2*6371000),distance))
            horizons[begin:begin+len(lat),k]=np.round(np.maximum(0,angles.max(axis=1))*10)
        valid[begin:begin+len(lat)]=ok
        print('Horizons',begin+len(lat),'/',len(sites),flush=True)
    for key,horizon,ok in zip(keys,horizons,valid):
        saved[','.join(map(str,key))]=[horizon.tolist(),int(ok)]
    temporary=profile_cache.with_suffix('.tmp');temporary.write_text(json.dumps(saved,separators=(',',':')));temporary.replace(profile_cache)
    publish(directory,all_keys,saved)
    print('Terrain computed',len(sites),'cached',len(all_keys)-len(sites),flush=True)


def geographic_keys(g):
    return sorted({(math.floor((g['points'][a][0]+g['points'][b][0])/2/.002+.5),math.floor((g['points'][a][1]+g['points'][b][1])/2/.004+.5)) for a,b in g['edges']})


def publish(directory,keys,saved):
    chunks={}
    for key in keys:
        lat,lon=key[0]*.002,key[1]*.004;tile=f'{math.floor(lat/.05)}:{math.floor(lon/.05)}'
        chunks.setdefault(tile,[]).append([list(key),*saved[','.join(map(str,key))]])
    manifest={'version':1,'cell':[.002,.004],'chunks':{}}
    target=directory/'terrain'
    if target.exists():shutil.rmtree(target)
    target.mkdir()
    for tile,profiles in chunks.items():
        y,x=map(int,tile.split(':'))
        raw=json.dumps(profiles,separators=(',',':')).encode()
        digest=hashlib.sha256(raw).hexdigest()[:16];path=f"terrain/{tile.replace(':','_')}.{digest}.json.gz"
        (directory/path).write_bytes(gzip.compress(raw,mtime=0))
        manifest['chunks'][tile]={'bounds':[y*.05,x*.05,(y+1)*.05,(x+1)*.05],'path':path,'bytes':len(raw)}
    (directory/'terrain-index.json').write_text(json.dumps(manifest,separators=(',',':')))

if __name__=='__main__':build()
