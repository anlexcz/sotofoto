import test from 'node:test';
import assert from 'node:assert/strict';
import {frequency,FREQUENCY_WIDTHS} from '../src/intensity.js';
import {matchesOperation,operationValue} from '../src/filter-utils.js';
import {Engine} from '../src/engine.js';
const base={date:'2026-10-05',start:0,end:86400,allDay:true,operation:'all',routes:[],agencies:[],modes:[],directions:[]};
function fixture(rows){
  const meta={startDate:'20261004',endDate:'20261006',routes:[['day','901','Denní',3,'',0],['night','A','Noční',3,'',1]],agencies:[['a','A'],['b','B']],services:[['20261004','20261006',1,1,1,1,1,1,1]],exceptions:{},headsigns:['Cíl']};
  const geometry={points:[[50,14],[50.01,14]],edges:[[0,1]],shapes:[[[1],[[0,1]]],[[-1],[[0,1]]]]};
  const schedule={patterns:[[0,[0,1],['A','B'],0],[1,[0,1],['B','A'],0]],trips:rows.map(([route,time,reverse=0,agency=0],i)=>[route,agency,0,reverse,0,[time,time,time,time],'',String(i)])};
  return new Engine(meta,geometry,schedule);
}
test('Six fixed categories include exact boundaries and exclude just above them',()=>{
  for(const [i,min] of [5,10,30,60,120].entries()){
    assert.equal(frequency(2,0,0,{start:0,end:min*120,allDay:false}).category,i);
    assert.equal(frequency(2,0,0,{start:0,end:min*120+.01,allDay:false}).category,i+1);
    assert.equal(frequency(2,0,0,{start:0,end:min*120-.01,allDay:false}).category,i);
  }
  assert.equal(new Set(FREQUENCY_WIDTHS).size,6);
  assert.equal(frequency(2,0,0,{start:0,end:20000}).category,5);
});
test('Zero and one passage never imply an interval; one is always thinnest',()=>{
  assert.deepEqual(frequency(1,300,300,base),{interval:null,category:5});
  assert.deepEqual(frequency(1,300,300,{start:0,end:60}),{interval:null,category:5});
  assert.equal(fixture([]).counts(base).counts[0],0);
});
test('Whole civil day uses first and last filtered passages and includes a long interior gap',()=>{
  const engine=fixture([[0,4*3600],[0,4*3600+600],[0,20*3600]]);
  const result=engine.counts(base);
  assert.equal(result.counts[0],3);assert.equal(result.categories[0],5);
  assert.equal(frequency(3,4*3600,20*3600,base).interval,320);
  const dense=fixture([[0,10*3600],[0,10*3600+600]]);
  assert.equal(dense.counts(base).categories[0],0);
  assert.equal(dense.counts({...base,allDay:false,start:0,end:86400}).categories[0],5);
});
test('Manual window uses its exact length and shared lines combine after all filters',()=>{
  const engine=fixture([[0,14*3600],[1,14*3600+600],[0,14*3600+1200],[1,14*3600+1800,0,1]]);
  const filter={...base,allDay:false,start:14*3600,end:14*3600+2400};
  assert.equal(engine.counts(filter).categories[0],1); // 40 / 4 = 10 min
  assert.equal(engine.counts({...filter,routes:[0]}).categories[0],2); // 40 / 2 = 20 min
  assert.equal(engine.counts({...filter,agencies:[1]}).categories[0],5);
  assert.equal(engine.counts({...filter,modes:[2]}).counts[0],0);
  assert.equal(engine.counts({...filter,date:'2026-10-07'}).counts[0],0);
});
test('Merged directions, split directions and compass selection retain separate ranges',()=>{
  const engine=fixture([[0,36000],[0,36600],[1,36000,1]]),result=engine.counts(base);
  assert.equal(result.categories[0],0);assert.equal(result.forwardCategories[0],0);assert.equal(result.backwardCategories[0],5);
  const south=engine.counts({...base,directions:['J']});assert.equal(south.counts[0],1);assert.equal(south.categories[0],5);
  assert.equal(engine.passages([50.005,14],40,{...base,directions:['J']},true).passages.length,1);
});
test('PID classification drives counts, detail and statistics, even for daily routes after midnight',()=>{
  const engine=fixture([[0,90000],[1,1800],[0,12*3600],[1,12*3600+60]]);
  for(const [operation,count] of [['all',4],['day',2],['night',2]]){
    const filter={...base,operation},result=engine.counts(filter),detail=engine.passages([50.005,14],40,filter,true).passages;
    assert.equal(result.counts[0],count);assert.equal(result.journeys,count);assert.equal(detail.length,count);
    assert.ok(detail.every(row=>matchesOperation(engine.meta.routes[row.route],operation)));
  }
  assert.ok(engine.passages([50.005,14],40,{...base,operation:'day'},true).passages.some(p=>p.time===3600));
  assert.equal(engine.counts({...base,operation:'night',allDay:false,start:0,end:3600}).counts[0],1);
});
test('Operation survives the JSON URL format and old or invalid state defaults to all',()=>{
  for(const operation of ['all','day','night'])assert.equal(operationValue(JSON.parse(decodeURIComponent(encodeURIComponent(JSON.stringify({operation})))).operation),operation);
  assert.equal(operationValue(undefined),'all');assert.equal(operationValue('bogus'),'all');
});
test('Manual period crossing midnight includes next civil day without folding passage times',()=>{
  const engine=fixture([[0,1800],[0,23*3600]]),filter={...base,allDay:false,start:23*3600,end:25*3600};
  assert.equal(engine.counts(filter).counts[0],2);assert.equal(engine.counts(filter).categories[0],3);
  assert.equal(frequency(2,23*3600,86400+1800,filter).interval,60);
});
