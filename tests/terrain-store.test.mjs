import test from 'node:test';
import assert from 'node:assert/strict';
import {TerrainStore,terrainManifest,terrainStatus} from '../src/terrain-store.js';
const A=[49.99,13.99,50.01,14.01],B=[50.99,14.99,51.01,15.01],ALL=[49,13,52,16];
const path=(id,v='a')=>`terrain/${id}.${v.repeat(16)}.json.gz`;
const manifest=(v='a')=>({version:1,cell:[.002,.004],dataset:{id:v},chunks:{A:{path:path('100_100',v),bounds:A,bytes:100},B:{path:path('200_200',v),bounds:B,bytes:100}}});
const rows=p=>[[p.includes('100_100')?[25000,3500]:[25500,3750],Array(72).fill(p.includes('aaaaaaaa')?10:20),1]];
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

test('Repeated viewport, A B A, zoom/filter/light reuse immutable paths and bounded LRU',async()=>{
 const calls=[];let manifests=0;const s=new TerrainStore({manifest:async()=>{manifests++;return manifest();},chunk:async p=>{calls.push(p);return rows(p);},maxEntries:1,maxBytes:100});
 await s.load(A);await s.load(A);assert.equal(calls.length,1);
 await s.load(B);await s.load(A);assert.equal(calls.length,3);assert.equal(manifests,1);
 await s.load([49.995,13.995,50.005,14.005]);await s.load(A);
 assert.equal(calls.length,3);assert.equal(s.at(50,14).state,'ready');
 for(let i=0;i<20;i++)terrainStatus(s.at(50,14).state,s.at(50,14).profile,{altitude:5},1,false);
 assert.equal(calls.length,3);assert.equal(s.cache.items.size,1);assert.ok(s.cache.bytes<=100);
});

test('Concurrent same chunk shares pending request and superseded data is cached',async()=>{
 const d=defer();let calls=0;const s=new TerrainStore({manifest:async()=>manifest(),chunk:async p=>{calls++;await d.promise;return rows(p);}});
 await s.refresh();const first=s.load(A),second=s.load(A);assert.equal(calls,1);d.resolve();await Promise.all([first,second]);assert.equal(s.at(50,14).state,'ready');assert.equal(calls,1);
});

test('Version change clears old active profiles and late responses cannot overwrite new version',async()=>{
 let m=manifest();const old=defer();const calls=[];
 const s=new TerrainStore({manifest:async()=>m,chunk:async p=>{calls.push(p);if(p.includes('aaaaaaaa'))await old.promise;return rows(p);}});
 await s.refresh();const stale=s.load(A);m=manifest('b');await s.load(A,null,{revalidate:true});
 assert.equal(s.at(50,14).profile[0],20);old.resolve();await stale;assert.equal(s.at(50,14).profile[0],20);
 assert.equal(calls.length,2);m=manifest('a');await s.load(A,null,{revalidate:true});assert.equal(s.at(50,14).profile[0],10);assert.equal(calls.length,2);
});

test('Deployment removing old chunk triggers one manifest recovery and loads new hash',async()=>{
 let n=0;const s=new TerrainStore({manifest:async()=>manifest(n++?'b':'a'),chunk:async p=>{if(p.includes('aaaaaaaa'))throw Error('404');return rows(p);}});
 await s.load(A);assert.equal(n,2);assert.equal(s.at(50,14).profile[0],20);assert.equal(s.state,'ready');
});

test('Failure keeps successful overlapping terrain; error survives light time and retries',async()=>{
 let fail=true;const s=new TerrainStore({manifest:async()=>manifest(),chunk:async p=>{if(p.includes('200_200')&&fail)throw Error('offline');return rows(p);}});
 await s.load(A);const loading=s.load(ALL);assert.equal(s.at(50,14).state,'ready');assert.equal(s.at(51,15).state,'loading');await loading;
 assert.equal(s.at(50,14).profile[0],10);assert.equal(s.at(51,15).state,'error');
 for(const altitude of [1,5,-1])assert.match(terrainStatus(s.at(51,15).state,null,{altitude},0,false),/nepodařilo/);
 fail=false;await s.load(ALL);assert.equal(s.at(51,15).state,'ready');
});

test('No coverage and invalid profiles are unverified, never a zero horizon',async()=>{
 const s=new TerrainStore({manifest:async()=>manifest(),chunk:async p=>rows(p).map(([k,h])=>[k,h,0])});
 await s.load(A);assert.deepEqual(s.at(50,14),{state:'unverified',profile:null});assert.deepEqual(s.at(52,17),{state:'unverified',profile:null});
 await s.load([52,17,53,18]);assert.equal(s.active.size,0);assert.equal(s.state,'ready');
});

test('Failed manifest is explicit, retry shares promise and cancellation releases current view',async()=>{
 let fail=true,n=0;const s=new TerrainStore({manifest:async()=>{n++;if(fail)throw Error('offline');return manifest();},chunk:async p=>rows(p)});
 await s.load(A);assert.equal(s.at(50,14).state,'error');fail=false;
 await Promise.all([s.load(A),s.load(A)]);assert.equal(n,2);assert.equal(s.at(50,14).state,'ready');s.cancel();assert.equal(s.loading.size,0);assert.equal(s.active.size,0);
});

test('Actual manifest fetch revalidates and rejects unsafe/incompatible paths',async()=>{
 const original=globalThis.fetch;const calls=[];let m=manifest();
 globalThis.fetch=async(url,options)=>{calls.push([url,options.cache]);return Response.json(m);};
 try{await terrainManifest();assert.deepEqual(calls,[['data/terrain-index.json','no-cache']]);m={...manifest(),cell:[1,1]};await assert.rejects(terrainManifest);m=manifest();m.chunks.A.path='../bad';await assert.rejects(terrainManifest);}finally{globalThis.fetch=original;}
});

test('Cancellation retains successful pending data and malformed profile is an error',async()=>{
 const d=defer();let n=0;const s=new TerrainStore({manifest:async()=>manifest(),chunk:async p=>{n++;await d.promise;return rows(p);}});
 await s.refresh();const abandoned=s.load(A);s.cancel();d.resolve();await abandoned;assert.equal(s.active.size,0);await s.load(A);assert.equal(n,1);assert.equal(s.at(50,14).state,'ready');
 const bad=new TerrainStore({manifest:async()=>manifest(),chunk:async()=>[[[25000,3500],[0],1]]});await bad.load(A);assert.equal(bad.at(50,14).state,'error');assert.equal(bad.cache.items.size,0);
});

test('Rapid viewport requests share a global two-slot limit and skip obsolete waiting chunks',async()=>{
 const d=defer();let running=0,peak=0;const calls=[];
 const s=new TerrainStore({manifest:async()=>manifest(),chunk:async p=>{calls.push(p);peak=Math.max(peak,++running);await d.promise;--running;return rows(p);}});
 await s.refresh();const first=s.load(ALL),obsolete=s.load(B),latest=s.load(A);assert.equal(peak,2);
 d.resolve();await Promise.all([first,obsolete,latest]);assert.equal(peak,2);assert.equal(s.inflight,0);assert.equal(s.waiters.length,0);assert.equal(calls.length,2);assert.equal(s.at(50,14).state,'ready');assert.equal(s.active.size,1);
});
