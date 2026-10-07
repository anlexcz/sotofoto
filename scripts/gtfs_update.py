"""Pin raw GTFS snapshots and merge only a missing preceding service day."""
import csv,hashlib,io,json,os,re,urllib.request,zipfile,argparse
from datetime import datetime,timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
URL='https://data.pid.cz/PID_GTFS.zip'
SITE='https://anlexcz.github.io/sotofoto/data/meta.json'
REPO='anlexcz/sotofoto'
WEEK=['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
REQUIRED=['feed_info.txt','routes.txt','trips.txt','stop_times.txt','stops.txt']
MAX_ZIP=256*1024*1024

def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(z,name):
    if name not in z.namelist():return iter(())
    return csv.DictReader(io.TextIOWrapper(z.open(name),encoding='utf-8-sig'))
def download(url,path):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'Cache-Control':'no-cache'}),timeout=120) as r,open(path,'wb') as f:
        total=0
        while b:=r.read(1024*1024):
            total+=len(b)
            if total>MAX_ZIP:raise ValueError('GTFS archive exceeds size limit')
            f.write(b)
def inspect(path):
    with zipfile.ZipFile(path) as z:
        if len(z.namelist())!=len(set(z.namelist())):raise ValueError('Duplicate GTFS members')
        for name in REQUIRED:
            if name not in z.namelist() or not next(read(z,name),None):raise ValueError('Empty/missing '+name)
        if not list(read(z,'calendar.txt')) and not list(read(z,'calendar_dates.txt')):raise ValueError('Missing GTFS calendar')
        f=next(read(z,'feed_info.txt'));start=f['feed_start_date'];end=f['feed_end_date']
        datetime.strptime(start,'%Y%m%d');datetime.strptime(end,'%Y%m%d')
        if start>end:raise ValueError('Invalid GTFS validity')
        if z.testzip():raise ValueError('Damaged GTFS ZIP')
    sha=digest(path)
    return {'repository':REPO,'tag':f'gtfs-v1-{start}-{sha}','sha256':sha,'startDate':start,'endDate':end}

def active(z,day):
    weekday=WEEK[datetime.strptime(day,'%Y%m%d').weekday()]
    ids={r['service_id'] for r in read(z,'calendar.txt') if r['start_date']<=day<=r['end_date'] and r[weekday]=='1'}
    for r in read(z,'calendar_dates.txt'):
        if r['date']==day:
            if r['exception_type']=='1':ids.add(r['service_id'])
            else:ids.discard(r['service_id'])
    return ids

def write_table(z,name,fields,rows):
    with z.open(name,'w',force_zip64=True) as binary:
        with io.TextIOWrapper(binary,encoding='utf-8',newline='') as text:
            w=csv.DictWriter(text,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(rows)

def merge(current,previous,output,previous_day):
    """Separate old trips/services/shapes/stops; never attach old times to new shapes."""
    with zipfile.ZipFile(current) as new,zipfile.ZipFile(previous) as old,zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=1) as out:
        new_start=next(read(new,'feed_info.txt'))['feed_start_date']
        services=active(old,previous_day)
        selected={r['trip_id']:r for r in read(old,'trips.txt') if r['service_id'] in services}
        shapes={r.get('shape_id','') for r in selected.values()}
        stops={r['stop_id'] for r in read(old,'stop_times.txt') if r['trip_id'] in selected}
        routes={r['route_id'] for r in selected.values()}
        prefix='previous_'+digest(previous)+'_'
        # Route/operator identities remain shared only when metadata agrees.
        route_new={r['route_id']:r for r in read(new,'routes.txt')};route_map={}
        for r in read(old,'routes.txt'):
            if r['route_id'] in routes:
                route_map[r['route_id']]=r['route_id'] if route_new.get(r['route_id'])==r else prefix+r['route_id']
        operator_new={r['sub_agency_id']:r for r in read(new,'route_sub_agencies.txt')};operator_map={}
        for r in read(old,'route_sub_agencies.txt'):
            operator_map[r['sub_agency_id']]=r['sub_agency_id'] if operator_new.get(r['sub_agency_id'])==r else prefix+r['sub_agency_id']
        tables=set(new.namelist())|{'calendar_dates.txt'}|({'routes.txt','trips.txt','stop_times.txt','stops.txt','shapes.txt','route_sub_agencies.txt'}&set(old.namelist()))
        old_filters={'trips.txt':lambda r:r['trip_id'] in selected,'stop_times.txt':lambda r:r['trip_id'] in selected,'shapes.txt':lambda r:r['shape_id'] in shapes,'stops.txt':lambda r:r['stop_id'] in stops,'routes.txt':lambda r:r['route_id'] in routes,'route_sub_agencies.txt':lambda r:operator_map[r['sub_agency_id']]!=r['sub_agency_id']}
        for name in sorted(tables):
            if not name.endswith('.txt'):continue
            nr=read(new,name);oldr=read(old,name)
            fields=list(dict.fromkeys(list(getattr(nr,'fieldnames',[]) or [])+list(getattr(oldr,'fieldnames',[]) or [])))
            if name=='calendar_dates.txt':fields=['service_id','date','exception_type']
            if not fields:continue
            def combined():
                for r in nr:
                    if name=='calendar.txt':r['start_date']=max(r['start_date'],new_start)
                    if name=='calendar_dates.txt' and r['date']<new_start:continue
                    yield r
                if name=='calendar_dates.txt':
                    for sid in sorted(services):yield {'service_id':prefix+sid,'date':previous_day,'exception_type':'1'}
                if name not in old_filters:return
                for r in oldr:
                    if not old_filters[name](r):continue
                    if name=='routes.txt' and route_map[r['route_id']]==r['route_id']:continue
                    for key in ['trip_id','service_id','shape_id','stop_id','parent_station']:
                        if r.get(key):r[key]=prefix+r[key]
                    if r.get('route_id'):r['route_id']=route_map[r['route_id']]
                    if r.get('sub_agency_id'):r['sub_agency_id']=operator_map.get(r['sub_agency_id'],r['sub_agency_id'])
                    yield r
            write_table(out,name,fields,combined())
    return len(selected)

def prepare(directory,site=SITE,current=None,production=None,today=None):
    directory.mkdir(parents=True,exist_ok=True)
    raw=directory/'PID_GTFS.zip'
    if current:raw.write_bytes(current.read_bytes())
    else:download(URL,raw)
    snap=inspect(raw);today=today or datetime.now(ZoneInfo('Europe/Prague')).strftime('%Y%m%d')
    if not snap['startDate']<=today<=snap['endDate']:raise ValueError('New GTFS does not cover today in Prague')
    preceding=(datetime.strptime(snap['startDate'],'%Y%m%d')-timedelta(days=1)).strftime('%Y%m%d')
    continuity={'day':preceding,'complete':False,'reason':'Previous snapshot unavailable','previousSnapshot':None,'importedTrips':0}
    if production is None:
        try:production=json.load(urllib.request.urlopen(urllib.request.Request(site,headers={'Cache-Control':'no-cache'}),timeout=60))
        except urllib.error.HTTPError as e:
            if e.code!=404:raise
            production={}
    for candidate in [production.get('sourceSnapshot'),production.get('continuity',{}).get('previousSnapshot')]:
        if not candidate or not candidate['startDate']<=preceding<=candidate['endDate']:continue
        if candidate.get('repository')!=REPO or not re.fullmatch(r'gtfs-v1-\d{8}-[a-f0-9]{64}',candidate.get('tag','')) or not re.fullmatch(r'[a-f0-9]{64}',candidate.get('sha256','')):raise ValueError('Invalid previous GTFS snapshot reference')
        prev=directory/'previous.zip';download(f'https://github.com/{REPO}/releases/download/{candidate["tag"]}/PID_GTFS.zip',prev)
        verified=inspect(prev)
        if verified!=candidate:raise ValueError('Previous GTFS snapshot checksum/metadata mismatch')
        count=merge(raw,prev,directory/'merged.zip',preceding)
        continuity.update(complete=True,reason=None,previousSnapshot=candidate,importedTrips=count);break
    info={'sourceSnapshot':snap,'continuity':continuity,'automaticUpdate':{'timezone':'Europe/Prague','time':'04:07','frequency':'daily'}}
    (directory/'provenance.json').write_text(json.dumps(info,indent=2))
    (directory/'snapshot.json').write_text(json.dumps(snap,indent=2))
    (directory/'PID_GTFS.sha256').write_text(snap['sha256']+'  PID_GTFS.zip\n')
    with open(os.environ.get('GITHUB_OUTPUT',directory/'outputs'),'a') as f:
        f.write('input='+str(directory/('merged.zip' if continuity['complete'] else 'PID_GTFS.zip'))+'\n')
        f.write('tag='+snap['tag']+'\n')
    print(json.dumps(info,indent=2))
    return info

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--directory',type=Path,default=Path('gtfs-update'));a=p.parse_args();prepare(a.directory)
