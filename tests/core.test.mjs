import test from 'node:test';
import assert from 'node:assert/strict';
import {activeServices,timeRange,dayContexts,interpolation,passageTime,bearing,compass,project,sunPosition,pragueInstant,photoLight} from '../src/core.js';
import {Engine} from '../src/engine.js';
test('Calendar additions and removals override weekday flags',()=>{
  const meta={services:[['20261001','20261017',1,1,1,1,1,0,0],['20261001','20261017',0,0,0,0,0,1,1]],exceptions:{'20261005':[[0,2],[1,1]]}};
  assert.deepEqual([...activeServices(meta,'20261005')],[1]);
  assert.deepEqual([...activeServices(meta,'20261006')],[0]);
});
test('Overnight intervals use the following civil day',()=>{
  assert.deepEqual(timeRange('23:00','02:00'),[82800,93600]);
  assert.deepEqual(timeRange('00:00','00:00'),[0,86400]);
  const meta={startDate:'20261004',endDate:'20261017',services:[],exceptions:{}};
  assert.deepEqual(dayContexts(meta,'20261005',93600).map(c=>[c.day,c.offset]),[['20261004',-86400],['20261005',0],['20261006',86400]]);
});
test('Passage interpolation excludes stop dwell and unserved shape ends',()=>{
  const d=[0,10,20],times=[0,60,600,660,1200,1260];
  assert.equal(passageTime(times,interpolation(d,5)),330);
  assert.equal(passageTime(times,interpolation(d,10)),660);
  assert.equal(interpolation(d,21),null);
});
test('Geometry bearings and projections describe the local travel direction',()=>{
  assert.equal(compass(bearing([50,14],[50.01,14])),'S');
  assert.equal(compass(bearing([50,14],[49.99,14])),'J');
  assert.equal(compass(bearing([50,14],[50,14.01])),'V');
  assert.ok(project([50,14.005],[50,14],[50,14.01]).distance<.001);
});
test('Solar geometry and time conversion use Prague daylight saving time',()=>{
  assert.equal(pragueInstant('20261005',12*3600).toISOString(),'2026-10-05T10:00:00.000Z');
  assert.equal(pragueInstant('20261205',12*3600).toISOString(),'2026-12-05T11:00:00.000Z');
  const sun=sunPosition(pragueInstant('20261005',13*3600),50.08,14.43);
  assert.ok(sun.azimuth>170&&sun.azimuth<200);
  assert.ok(sun.altitude>30&&sun.altitude<40);
  assert.equal(photoLight({altitude:30,azimuth:180},180).level,'good');
  assert.equal(photoLight({altitude:30,azimuth:180},0).level,'bad');
  assert.equal(photoLight({altitude:30,azimuth:225},180,'right').level,'good');
  assert.equal(photoLight({altitude:-5,azimuth:180},180).level,'night');
});
function fixture(){
  const meta={startDate:'20261004',endDate:'20261017',routes:[['L1','1','A–B',3]],agencies:[['1','A'],['2','B']],services:[['20261004','20261017',1,1,1,1,1,1,1]],exceptions:{},headsigns:['B','A']};
  const g={points:[[50,14],[50.01,14],[50.02,14]],edges:[[0,1],[1,2]],shapes:[[[1,2],[[0,1],[1,2]]],[[-2,-1],[[0,1],[1,2]]]]};
  const s={patterns:[[0,[0,2],['A','B'],0],[1,[0,2],['B','A'],0]],trips:[[0,0,0,0,0,[3600,3600,4800,4800],'','t1'],[0,1,0,1,1,[3600,3600,4800,4800],'','t2'],[0,0,0,0,0,[90000,90000,91200,91200],'','night']]};
  return new Engine(meta,g,s);
}
const f={date:'2026-10-05',start:0,end:86400,routes:[],agencies:[],modes:[],directions:[]};
test('Intensity aggregates operators on common edges and includes yesterday after midnight',()=>{
  const e=fixture();assert.deepEqual([...e.counts(f).counts],[3,3]);
  assert.deepEqual([...e.counts({...f,agencies:[1]}).counts],[1,1]);
  assert.deepEqual([...e.counts({...f,directions:['S']}).counts],[2,2]);
});
test('Point query deduplicates consecutive edges, preserves reverse directions and estimates time',()=>{
  const e=fixture(),r=e.passages([50.01,14],40,f,true).passages;
  assert.equal(r.length,3);assert.equal(r[0].time,4200);assert.equal(r[0].direction,'S');assert.equal(r[1].direction,'J');assert.ok(r[0].estimated);
  assert.equal(e.passages([50.01,14],40,{...f,start:4500,end:4600}).passages.length,0);
});
