// Compare first-day midnight passages with the exact archived October 6 build.
import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';import assert from 'node:assert/strict';import {Engine} from '../src/engine.js';
const [current='dist/data',previous='gtfs-update/compiled-previous']=process.argv.slice(2);
const engine=root=>{const load=n=>JSON.parse(n.endsWith('.gz')?gunzipSync(readFileSync(root+'/'+n)):readFileSync(root+'/'+n));return new Engine(load('meta.json'),load('geometry.json.gz'),load('schedule.json.gz'));};
const old=engine(previous),merged=engine(current);
const base={date:merged.meta.startDate.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3'),start:0,end:86400,allDay:true,operation:'all',routes:[],agencies:[],modes:[],directions:[]};
const strip=v=>v.replace(/^previous_(?:compiled|[a-f0-9]{64})_/,''),record=v=>[strip(v[0]),...v.slice(1)];
const signature=(rows,e)=>rows.map(({edge,key,route,agency,trip,...r})=>({...r,trip:strip(trip),route:record(e.meta.routes[route]),agency:record(e.meta.agencies[agency])})).sort((a,b)=>a.trip.localeCompare(b.trip)||a.time-b.time||a.bearing-b.bearing);
let checked=0;
for(const [lat,lon] of [[50.075,14.418],[50.128,14.471],[50.355,14.475],[50.041,14.323],[50.195,14.582],[50.135,14.465],[50.082,14.423]]){
 for(const f of [base,{...base,operation:'night'},{...base,modes:[3]},{...base,modes:[0]},{...base,modes:[2]},{...base,directions:['S','V']}]){
  const expected=old.passages([lat,lon],150,f).passages.filter(r=>r.serviceDay===merged.meta.continuity.day);
  const actual=merged.passages([lat,lon],150,f).passages.filter(r=>/^previous_(?:compiled|[a-f0-9]{64})_/.test(r.trip));
  assert.deepEqual(signature(actual,merged),signature(expected,old));checked+=actual.length;global.gc?.();
 }
}
assert.ok(checked>0,'Recovery regression must compare real midnight passages, not empty results');
console.log('Preceding-day production regression: 42 comparisons;',checked,'actual midnight passages verified');
