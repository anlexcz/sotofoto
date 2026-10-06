import test from 'node:test';
import assert from 'node:assert/strict';
import {frequency,DAYTIME_REFERENCE_SECONDS,FREQUENCY_WIDTHS,FREQUENCY_LABELS} from '../src/intensity.js';
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
test('Whole day uses 19 hours, not first/last passage or removal of gaps',()=>{
  assert.equal(DAYTIME_REFERENCE_SECONDS,68400);
  for(const times of [[at(7),at(7,5),at(7,10)],[at(5),at(12),at(23)],[at(0,30),at(4),at(20)],[at(7),at(7),at(7)]]){
    const result=fixture(times.map(t=>[0,t])).counts(base);
    assert.equal(result.regularCounts[0],3);assert.equal(result.categories[0],6); // 1140 / 3 = 380
  }
  assert.equal(frequency(2,DAYTIME_REFERENCE_SECONDS).interval,570); // sparse 259 branch
  assert.equal(frequency(3,DAYTIME_REFERENCE_SECONDS).interval,380); // morning school cluster
});
test('Whole-day category boundaries combine daily routes and respect filters',()=>{
  for(const [n,expected] of [[570,0],[569,1],[228,1],[227,2],[114,2],[113,3],[57,3],[56,4],[29,4],[28,5],[13,5],[12,6]]){
    const e=fixture(Array.from({length:n},(_,i)=>[0,at(8)+i,0,i%2]));
    assert.equal(e.counts(base).categories[0],expected);
    const selected=e.counts({...base,agencies:[1]});
    assert.equal(selected.regularCounts[0],Math.floor(n/2));
    assert.equal(selected.categories[0],frequency(Math.floor(n/2),68400).category);
  }
  const e=fixture(Array.from({length:60},(_,i)=>[0,at(8)+i]));
  e.meta.routes.push(['second','B','Další denní',3,'',0]);
  for(let i=30;i<60;i++)e.s.trips[i][0]=2;
  assert.equal(e.counts(base).categories[0],3); // 1140 / 60 = 19
  assert.equal(e.counts({...base,routes:[0]}).categories[0],4); // 1140 / 30 = 38
});
test('Night-only whole day is uniformly thinnest regardless of volume; manual window uses night counts',()=>{
  const e=fixture(Array.from({length:300},(_,i)=>[1,at(1)+i]));
  const night={...base,operation:'night'},r=e.counts(night);
  assert.equal(r.counts[0],300);assert.equal(r.regularCounts[0],300);assert.equal(r.journeys,300);
  assert.equal(r.categories[0],6);assert.equal(r.forwardCategories[0],6);
  assert.equal(e.passages([50.005,14],40,night,true).passages.length,300);
  assert.equal(e.counts({...night,allDay:false,start:at(1),end:at(2)}).categories[0],0);
});
test('Mixed whole-day intensity ignores night traffic without hiding it or changing regular statistics',()=>{
  const daily=Array.from({length:30},(_,i)=>[0,at(8)+i]);
  const nights=Array.from({length:600},(_,i)=>[1,at(1)+i]);
  const e=fixture([...daily,...nights]),r=e.counts(base),day=e.counts({...base,operation:'day'});
  assert.equal(r.counts[0],630);assert.equal(r.regularCounts[0],630);assert.equal(r.journeys,630);
  assert.equal(r.categories[0],4);assert.equal(r.categories[0],day.categories[0]);
  assert.equal(e.counts({...base,operation:'night'}).categories[0],6);
  assert.equal(e.counts({...base,allDay:false}).categories[0],1); // explicit 24h / 630
  assert.equal(e.counts({...base,operation:'none'}).counts[0],0);
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
  const dense=fixture(Array.from({length:13},(_,i)=>[0,at(10)+i]));
  assert.equal(dense.counts(base).categories[0],5); // 1140 / 13 < 90, manual 1440 / 13 > 90
  assert.equal(dense.counts({...base,allDay:false}).categories[0],6);
  const engine=fixture([[0,1800],[0,at(23)]]),filter={...base,allDay:false,start:at(23),end:at(25)};
  assert.equal(engine.counts(filter).counts[0],2);assert.equal(engine.counts(filter).categories[0],5);
  assert.equal(frequency(2,filter.end-filter.start).interval,60);
});
test('Split and filtered directions count daily passages independently in whole day',()=>{
  const rows=[...Array.from({length:20},(_,i)=>[0,at(8)+i]),...Array.from({length:10},(_,i)=>[0,at(9)+i,1]),...Array.from({length:300},(_,i)=>[1,at(1)+i,1]),[0,at(9),1,0,8]];
  const e=fixture(rows),r=e.counts(base);
  assert.equal(r.categories[0],4); // 1140 / 30 = 38
  assert.equal(r.forwardCategories[0],5); // 1140 / 20 = 57
  assert.equal(r.backwardCategories[0],6); // 1140 / 10 = 114, night and specials ignored
  const south=e.counts({...base,directions:['J']});
  assert.equal(south.counts[0],311);assert.equal(south.regularCounts[0],310);assert.equal(south.categories[0],6);
  assert.equal(e.counts({...base,directions:['S']}).categories[0],5);
  const manual=e.counts({...base,allDay:false,start:at(8),end:at(10)});
  assert.equal(manual.categories[0],1);assert.equal(manual.forwardCategories[0],2);assert.equal(manual.backwardCategories[0],3);
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
  assert.equal(engine.counts({...base,operation:'night'}).categories[0],6); // uniform whole-day night width
  assert.equal(engine.counts({...base,operation:'day'}).categories[0],6); // includes previous-day 25:00, 1140 / 2
  assert.ok(engine.passages([50.005,14],40,{...base,operation:'day'},true).passages.some(p=>p.time===3600&&p.serviceDay==='20261004'));
});
test('Operation survives URL format; independent buttons retain all four states',()=>{
  for(const operation of ['all','day','night','none'])assert.equal(operationValue(JSON.parse(decodeURIComponent(encodeURIComponent(JSON.stringify({operation})))).operation),operation);
  assert.equal(operationValue(undefined),'all');assert.equal(operationValue('bogus'),'all');
  const transitions={all:{day:'night',night:'day'},day:{day:'none',night:'all'},night:{day:'all',night:'none'},none:{day:'day',night:'night'}};
  for(const [state,types] of Object.entries(transitions))for(const [type,expected] of Object.entries(types))assert.equal(toggleOperation(state,type),expected);
});
