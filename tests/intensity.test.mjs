import test from 'node:test';
import assert from 'node:assert/strict';
import {frequency,circularPeriod,FREQUENCY_WIDTHS,FREQUENCY_LABELS} from '../src/intensity.js';
import {matchesOperation,operationValue,toggleOperation} from '../src/filter-utils.js';
import {operationLabel} from '../src/operation-types.js';
import {Engine} from '../src/engine.js';
const base={date:'2026-10-05',start:0,end:86400,allDay:true,operation:'all',routes:[],agencies:[],modes:[],directions:[]};
function fixture(rows){
  const meta={startDate:'20261004',endDate:'20261006',routes:[['day','901','Denní',3,'',0],['night','A','Noční',3,'',1]],agencies:[['a','A'],['b','B']],services:[['20261004','20261006',1,1,1,1,1,1,1]],exceptions:{},headsigns:['Cíl']};
  const geometry={points:[[50,14],[50.01,14]],edges:[[0,1]],shapes:[[[1],[[0,1]]],[[-1],[[0,1]]]]};
  const patterns=rows.map(([, ,reverse=0,,type=1])=>[reverse,[0,1],['A','B'],0,[type,type]]);
  const schedule={patterns,trips:rows.map(([route,time,,agency=0],i)=>[route,agency,0,i,0,[time,time,time,time],'',String(i)])};
  return new Engine(meta,geometry,schedule);
}
const at=(h,m=0)=>h*3600+m*60;
const period=times=>circularPeriod(times.toSorted((a,b)=>a-b));
test('Seven fixed categories include exact boundaries and exclude just above them',()=>{
  for(const [i,min] of [2,5,10,20,40,90].entries()){
    assert.equal(frequency(2,min*120).category,i);
    assert.equal(frequency(2,min*120+.01).category,i+1);
    assert.equal(frequency(2,min*120-.01).category,i);
  }
  assert.equal(FREQUENCY_LABELS.length,7);assert.equal(new Set(FREQUENCY_WIDTHS).size,7);
  assert.equal(frequency(2,20000).category,6);
});
test('Zero and one regular passage never imply an interval; one is always thinnest',()=>{
  assert.deepEqual(frequency(0,0),{interval:null,category:6});
  assert.deepEqual(frequency(1,60),{interval:null,category:6});
  assert.equal(fixture([]).counts(base).counts[0],0);
  assert.equal(fixture([[0,at(12)]]).counts(base).categories[0],6);
});
test('Circular whole day covers daytime 04:30–00:30 and night 23:30–05:00',()=>{
  const day=[at(0,30),at(4,30),at(8),at(12),at(16),at(20),at(22)];
  assert.equal(period(day),20*3600);
  const night=[at(23,30),at(0,15),at(2),at(5)];
  assert.equal(period(night),5.5*3600);
  assert.equal(fixture(night.map(t=>[1,t])).counts({...base,operation:'night'}).categories[0],5); // 330 / 4 = 82.5
  assert.equal(period([at(23,55),at(0,5)]),600);
});
test('Only largest gap is removed; a six-hour interior gap remains in split service',()=>{
  const times=[at(5),at(7),at(9),at(15),at(17),at(19)];
  assert.equal(period(times),14*3600);
  assert.equal(frequency(times.length,period(times)).interval,140);
  assert.equal(fixture(times.map(t=>[0,t])).counts(base).categories[0],6);
  assert.equal(period([at(4),at(4,10),at(20)]),at(8,10)); // largest gap is inside: exact circular rule
});
test('Duplicates and equal largest gaps have deterministic circular periods',()=>{
  assert.equal(period([300,300]),0);
  assert.equal(period([0,at(6),at(12),at(18)]),at(18));
  assert.equal(circularPeriod([300,900],[600,1200]),900);
});
test('Manual window uses exact length; shared regular lines combine after every filter',()=>{
  const engine=fixture([[0,at(14)],[1,at(14,10)],[0,at(14,20)],[1,at(14,30),0,1],[0,at(14,35),0,0,8],[0,at(14,40)]]);
  const filter={...base,allDay:false,start:at(14),end:at(14,40)};
  const r=engine.counts(filter);
  assert.equal(r.counts[0],5);assert.equal(r.regularCounts[0],4);assert.equal(r.categories[0],2); // 40 / 4 = 10, excludes end
  assert.equal(engine.counts({...filter,routes:[0]}).categories[0],3); // 40 / 2 = 20
  assert.equal(engine.counts({...filter,agencies:[1]}).categories[0],6);
  assert.equal(engine.counts({...filter,modes:[2]}).counts[0],0);
  assert.equal(engine.counts({...filter,date:'2026-10-07'}).counts[0],0);
});
test('Manual 24h stays different from whole day, and overnight interval stays unfolded',()=>{
  const dense=fixture([[0,at(10)],[0,at(10,4)]]);
  assert.equal(dense.counts(base).categories[0],0);
  assert.equal(dense.counts({...base,allDay:false}).categories[0],6);
  const engine=fixture([[0,1800],[0,at(23)]]),filter={...base,allDay:false,start:at(23),end:at(25)};
  assert.equal(engine.counts(filter).counts[0],2);assert.equal(engine.counts(filter).categories[0],5);
  assert.equal(frequency(2,filter.end-filter.start).interval,60);
});
test('Split and merged directions use their own circular period; special direction never inflates it',()=>{
  const engine=fixture([[0,at(23,55)],[0,at(0,5)],[1,at(1),1],[1,at(2),1],[1,at(1,5),1,0,8]]),result=engine.counts(base);
  assert.equal(result.categories[0],4); // 125 min / 4 = 31.25
  assert.equal(result.forwardCategories[0],1); // 10 / 2 = 5
  assert.equal(result.backwardCategories[0],4); // 60 / 2 = 30
  const south=engine.counts({...base,directions:['J']});assert.equal(south.counts[0],3);assert.equal(south.regularCounts[0],2);assert.equal(south.categories[0],4);
  const north=engine.counts({...base,directions:['S']});assert.equal(north.categories[0],1);
});
test('Only type 1 contributes to frequency; all special passages remain visible and in detail',()=>{
  const specials=[7,8,9,10].map((type,i)=>[0,at(12,i*2),0,0,type]);
  const engine=fixture(specials),r=engine.counts(base);
  assert.equal(r.counts[0],4);assert.equal(r.regularCounts[0],0);assert.equal(r.categories[0],6);assert.equal(r.forwardCategories[0],6);
  assert.deepEqual(engine.passages([50.005,14],40,base,true).passages.map(p=>p.operationType),[7,8,9,10]);
  const regular=[[0,at(11)],[0,at(11,20)]];
  const before=fixture(regular).counts(base),after=fixture([...regular,...specials]).counts(base);
  assert.equal(after.counts[0],6);assert.equal(after.regularCounts[0],2);assert.equal(after.categories[0],before.categories[0]);
  assert.equal(fixture([[0,at(12)],...specials]).counts(base).categories[0],6);
});
test('One mixed trip is classified per outgoing stop-to-stop section, including exact stops',()=>{
  const e=fixture([]);
  const g={points:[[50,14],[50.01,14],[50.02,14],[50.03,14]],edges:[[0,1],[1,2],[2,3]],shapes:[[[1,2,3],[[0,1],[1,2],[2,3]]]]};
  const schedule={patterns:[[0,[0,1,2,3],['Depot','A','B','Depot'],0,[7,1,8,8]]],trips:[[0,0,0,0,0,[3600,3600,3660,3660,3720,3720,3780,3780],'','mixed']]};
  const engine=new Engine(e.meta,g,schedule),r=engine.counts(base);
  assert.deepEqual([...r.counts],[1,1,1]);assert.deepEqual([...r.regularCounts],[0,1,0]);
  for(const [lat,edge,type] of [[50.005,0,7],[50.015,1,1],[50.025,2,8],[50.01,1,1],[50.02,2,8]]){
    assert.equal(engine.passages([lat,14],40,base,true,edge).passages[0].operationType,type);
  }
  assert.deepEqual([7,8,9,10].map(operationLabel),['Výjezd','Zátah','Přejezd na lince','Přejezd na jinou linku']);
});
test('PID night classification, midnight service-day carryovers, counts and detail agree',()=>{
  const engine=fixture([[0,90000],[1,at(23,30)],[0,at(12)],[1,at(5)],[1,at(2),0,0,7]]);
  for(const [operation,count,regular] of [['all',5,4],['day',2,2],['night',3,2],['none',0,0]]){
    const filter={...base,operation},result=engine.counts(filter),detail=engine.passages([50.005,14],40,filter,true).passages;
    assert.equal(result.counts[0],count);assert.equal(result.regularCounts[0],regular);assert.equal(result.journeys,count);assert.equal(detail.length,count);
    assert.ok(detail.every(row=>matchesOperation(engine.meta.routes[row.route],operation)));
  }
  assert.equal(engine.counts({...base,operation:'night'}).categories[0],6); // 330 / 2 = 165
  assert.ok(engine.passages([50.005,14],40,{...base,operation:'day'},true).passages.some(p=>p.time===3600&&p.serviceDay==='20261004'));
});
test('Operation survives URL format; independent buttons retain all four states',()=>{
  for(const operation of ['all','day','night','none'])assert.equal(operationValue(JSON.parse(decodeURIComponent(encodeURIComponent(JSON.stringify({operation})))).operation),operation);
  assert.equal(operationValue(undefined),'all');assert.equal(operationValue('bogus'),'all');
  const transitions={all:{day:'night',night:'day'},day:{day:'none',night:'all'},night:{day:'all',night:'none'},none:{day:'day',night:'night'}};
  for(const [state,types] of Object.entries(transitions))for(const [type,expected] of Object.entries(types))assert.equal(toggleOperation(state,type),expected);
});
