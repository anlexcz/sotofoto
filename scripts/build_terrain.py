"""Precompute approximate terrain horizons; no live elevation API needed."""
import gzip,json,math,urllib.request,shutil,time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import numpy as np
import rasterio
from rasterio.merge import merge


def build(directory=Path('dist/data')):
    g=json.load(gzip.open(directory/'geometry.json.gz'))
    points=np.asarray(g['points']);edges=np.asarray(g['edges'])
    mids=(points[edges[:,0]]+points[edges[:,1]])/2
    # Shared cells approximately 220 x 280 m near Prague.
    keys,inv=np.unique(np.floor(mids/[.002,.004]+.5).astype(int),axis=0,return_inverse=True)
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
    data={'version':1,'source':'Copernicus DEM GLO-30, resampled to ~90 m','cell':[.002,.004],'radius':20000,'step':5,'keys':keys.tolist(),'horizons':horizons.tolist(),'valid':valid.astype(int).tolist()}
    with gzip.open(directory/'terrain.json.gz','wt',encoding='utf-8',compresslevel=9) as f:json.dump(data,f,separators=(',',':'))
    print('Terrain complete',len(sites),int(valid.sum()),flush=True)

if __name__=='__main__':build()
