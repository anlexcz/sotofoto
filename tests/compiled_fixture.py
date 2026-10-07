import sys,json,gzip,csv,io,zipfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from build_data_test import BuildOperationsTest
from build_data import build,write_json
from compiled_previous import merge
root=Path(sys.argv[1]);raw=BuildOperationsTest().fixture(root)
for kind,start,hour in [('old','20261004',25),('new','20261005',12)]:
    path=root/(kind+'.zip')
    with zipfile.ZipFile(raw) as source,zipfile.ZipFile(path,'w') as out:
        for name in source.namelist():
            rows=list(csv.DictReader(io.TextIOWrapper(source.open(name),encoding='utf8')));fields=list(rows[0])
            for r in rows:
                if name=='feed_info.txt':r['feed_start_date']=start
                if name=='calendar.txt':r['start_date']=start
                if name=='stop_times.txt':
                    for field in ['arrival_time','departure_time']:r[field]=str(hour)+r[field][2:]
            f=io.StringIO();w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(rows);out.writestr(name,f.getvalue())
    build(path,root/kind)
import shutil
if len(sys.argv)>2 and sys.argv[2]=='--raw':
    from gtfs_update import merge as merge_zip
    assert merge_zip(root/'new.zip',root/'old.zip',root/'merged.zip','20261004')==4
    build(root/'merged.zip',root/'merged')
    m=json.loads((root/'merged/meta.json').read_text());m['serviceStartDate']='20261004';m['continuity']={'complete':True};write_json(root/'merged/meta.json',m)
    sys.exit(0)
shutil.copytree(root/'new',root/'merged')
m=json.loads((root/'merged/meta.json').read_text());m['continuity']={'complete':False};write_json(root/'merged/meta.json',m)
assert merge(root/'merged',root/'old','20261004')==4
