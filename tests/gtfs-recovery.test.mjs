import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {mkdtempSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {gunzipSync} from 'node:zlib';import {Engine} from '../src/engine.js';
test('Compiled recovery preserves actual midnight passages and leaves new-day service authoritative',()=>{
 const dir=mkdtempSync(join(tmpdir(),'sotofoto-compiled-'));
 try{
  const r=spawnSync('python',['tests/compiled_fixture.py',dir],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
  const engine=name=>{const load=f=>JSON.parse(f.endsWith('.gz')?gunzipSync(readFileSync(join(dir,name,f))):readFileSync(join(dir,name,f)));return new Engine(load('meta.json'),load('geometry.json.gz'),load('schedule.json.gz'));};
  const old=engine('old'),fresh=engine('new'),merged=engine('merged');
  const signature=rows=>rows.map(({edge,key,trip,...r})=>({...r,trip:trip.replace(/^previous_compiled_/, '')}));
  const base={date:'2026-10-05',start:0,end:14400,allDay:false,operation:'all',routes:[],agencies:[],modes:[],directions:[]};
  for(const f of [base,{...base,directions:['S']},{...base,modes:[0]},{...base,operation:'night'},{...base,agencies:[0]}]){
   assert.deepEqual(signature(merged.passages([50.0015,14],150,f).passages),signature(old.passages([50.0015,14],150,f).passages));
   assert.deepEqual([...merged.counts(f).counts],[...old.counts(f).counts]);
  }
  const daytime={...base,start:8*3600,end:20*3600};assert.deepEqual(signature(merged.passages([50.0015,14],150,daytime).passages),signature(fresh.passages([50.0015,14],150,daytime).passages));
  assert.equal(merged.meta.continuity.complete,true);assert.equal(merged.s.trips.length,8);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('Transient network errors retry; permanent failures and invalid data do not',()=>{
 const code=`import sys,urllib.error,io,tempfile\nfrom pathlib import Path\nfrom unittest.mock import patch\nsys.path.insert(0,'scripts')\nfrom gtfs_update import retry,download\nwith patch('gtfs_update.time.sleep') as sleep:\n with patch('gtfs_update.urllib.request.urlopen',side_effect=[urllib.error.HTTPError('https://example.test',503,'busy',{},None),io.BytesIO(b'ok')]) as get:\n  with tempfile.TemporaryDirectory() as d:\n   p=Path(d)/'data';download('https://example.test',p);assert p.read_bytes()==b'ok'\n  assert get.call_count==2 and sleep.call_count==1\n with patch('gtfs_update.urllib.request.urlopen',side_effect=urllib.error.HTTPError('https://example.test',404,'missing',{},None)) as get:\n  try:retry(lambda:get())\n  except urllib.error.HTTPError:pass\n  else:raise AssertionError('expected 404')\n  assert get.call_count==1\n with patch('gtfs_update.urllib.request.urlopen',side_effect=TimeoutError('offline')) as get:\n  try:retry(lambda:get())\n  except TimeoutError:pass\n  else:raise AssertionError('expected timeout')\n  assert get.call_count==3\n`;
 const r=spawnSync('python',['-c',code],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
});
test('Recovery runs skip only a successful production update from this Prague morning',()=>{
 const code=`import sys\nfrom datetime import datetime\nfrom zoneinfo import ZoneInfo\nsys.path.insert(0,'scripts')\nfrom gtfs_check import needed\nnow=datetime(2026,10,7,6,7,tzinfo=ZoneInfo('Europe/Prague'))\nm={'builtAt':'2026-10-07T02:30:00+00:00','automaticUpdate':{},'sourceSnapshot':{'startDate':'20261007','endDate':'20261020'}}\nm['automaticUpdate']={'frequency':'daily'}\nassert not needed(m,now)\nassert needed({**m,'builtAt':'2026-10-07T01:30:00+00:00'},now)\nassert needed({**m,'builtAt':'2026-10-06T02:30:00+00:00'},now)\nassert needed({**m,'sourceSnapshot':{'startDate':'20261001','endDate':'20261006'}},now)\nassert needed({},now)\n`;
 const r=spawnSync('python',['-c',code],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
});
