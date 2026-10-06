import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {spawnSync} from 'node:child_process';import {gunzipSync} from 'node:zlib';
import {Engine} from '../src/engine.js';import {ViewportEngine} from '../src/chunk-engine.js';import {selectChunks,mergeChunks,decodeSchedule,ChunkCache} from '../src/chunks.js';
const dir=mkdtempSync(tmpdir()+'/sotofoto-chunks-');const py=spawnSync('python',['tests/chunk_fixture.py',dir],{encoding:'utf8'});assert.equal(py.status,0,py.stderr);
const load=p=>{const c=p.endsWith('.gz')?gunzipSync(readFileSync(dir+'/'+p)):readFileSync(dir+'/'+p);return p.endsWith('.bin.gz')?decodeSchedule(c.buffer.slice(c.byteOffset,c.byteOffset+c.byteLength)):JSON.parse(c);};
const index=load('chunks.json'),fixture=load('fixture.json'),full=new Engine(fixture.meta,fixture.geometry,fixture.schedule),read=id=>({geometry:load(index.chunks[id].geometry),schedule:load(index.chunks[id].schedule)});
const f={date:'2026-10-06',start:0,end:86400,allDay:true,operation:'all',routes:[],agencies:[],modes:[],directions:[]};
const bounds=[50.024,14.439,50.026,14.471];
test.after(()=>rmSync(dir,{recursive:true,force:true}));
test('viewport selects touching boundaries and covers a crossing edge without losing shared sections',()=>{
 const ids=selectChunks(index,[50.025,14.45,50.025,14.45]);assert.ok(ids.length>=2);
 const merged=mergeChunks(ids.map(read));assert.equal(merged.geometry.edges.length,3);assert.equal(merged.schedule.trips.length,5);
 assert.deepEqual(merged.schedule.trips.map(t=>[t[7],[...t[5]]]),fixture.schedule.trips.map(t=>[t[7],t[5]]));
 assert.deepEqual(selectChunks(index,[0,0,1,1]),[]);
});
test('binary schedule encoder/decoder keeps exact GTFS >24h, names and operation flags',()=>{
 const schedule=read(selectChunks(index,bounds)[0]).schedule;
 assert.ok(schedule.trips[0][1][5] instanceof Uint32Array);
 assert.ok(schedule.trips.some(([,t])=>t[5].some(v=>v>86400)));
 assert.ok(schedule.patterns.some(([,p])=>p[4]?.includes(8)));
 assert.throws(()=>decodeSchedule(new ArrayBuffer(6)));
});
test('chunked engine gives identical counts, colors and frequency after combined filters',async()=>{
 const view=new ViewportEngine(fixture.meta,index,async id=>read(id));
 for(const filter of [f,{...f,operation:'night'},{...f,operation:'none'},{...f,routes:[0],agencies:[1]},{...f,modes:[3],directions:['V']},{...f,allDay:false,start:82800,end:93600}]){
   const expected=full.counts(filter),actual=await view.counts(bounds,filter);
   for(const field of ['surfaceForward','surfaceBackward','counts','forward','backward','regularCounts','categories','forwardCategories','backwardCategories','colors','agencyColors'])assert.deepEqual(actual[field],expected[field],field);
   assert.equal(actual.journeys,expected.journeys);
 }
});
test('point on boundary keeps all passages once, loops, night carryovers and special movements',()=>{
 const data=mergeChunks(selectChunks(index,bounds).map(read)),local=new Engine(fixture.meta,data.geometry,data.schedule);
 for(const filter of [f,{...f,operation:'night'},{...f,allDay:false,start:82800,end:93600}]){
   const signature=e=>e.passages([50.025,14.45],150,filter).passages.map(({key,edge,...r})=>r);
   assert.deepEqual(signature(local),signature(full));
 }
});
test('lazy cache shares in-flight requests, touches LRU and evicts bounded entries; errors retry',async()=>{
 let calls=0,fail=true;const cache=new ChunkCache(async id=>{calls++;if(id==='error'&&fail)throw Error('offline');return {id};},{maxBytes:2,maxEntries:2});
 assert.equal(calls,0);await Promise.all([cache.get('a'),cache.get('a')]);assert.equal(calls,1);
 await cache.get('b');await cache.get('a');await cache.get('c');assert.deepEqual([...cache.items.keys()],['a','c']);
 await cache.get('b');assert.equal(calls,4);await assert.rejects(cache.get('error'));fail=false;await cache.get('error');assert.equal(cache.pending.size,0);
 cache.clear();assert.equal(cache.bytes,0);
});
test('pan and unchanged filters reuse per-chunk counts; cancelled load publishes no incomplete view',async()=>{
 let calls=0;const view=new ViewportEngine(fixture.meta,index,async id=>{calls++;return read(id);});
 await view.counts(bounds,f);const before=calls;await view.counts(bounds,f);assert.equal(calls,before);
 assert.equal(await view.counts(bounds,f,()=>true),null);
});
