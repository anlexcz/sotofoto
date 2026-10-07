import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {ChunkCache,zipped,dataCacheMode} from '../src/chunks.js';

test('Only immutable geometry, schedule, LOD and terrain hashes bypass HTTP revalidation',()=>{
 for(const kind of ['geometry.json','schedule.bin','overview.json','medium.json','detail.json','json'])assert.equal(dataCacheMode(`data/chunks/100_200.0123456789abcdef.${kind}.gz`),'force-cache');
 for(const name of ['meta.json','chunks.json.gz','chunks.json','terrain-index.json','geometry.json.gz','100.deadbeef.json.gz'])assert.equal(dataCacheMode(name),'no-cache');
});

test('RAM eviction decodes again through HTTP cache; concurrent loads and cancelled consumers retain data',async()=>{
 const original=globalThis.fetch,http=new Map(),reads=[];let transfers=0,decodes=0;
 globalThis.fetch=async(url,options)=>{reads.push(options.cache);if(!http.has(url)){transfers++;http.set(url,gzipSync(JSON.stringify({url})));}return new Response(http.get(url));};
 const cache=new ChunkCache(async id=>{decodes++;return zipped(`https://test.invalid/terrain/${id}.0123456789abcdef.json.gz`);},{maxBytes:1,maxEntries:1});
 try{
  await Promise.all([cache.get('A'),cache.get('A')]);assert.equal(transfers,1);assert.equal(decodes,1);
  await cache.get('A');assert.equal(decodes,1);
  await cache.get('B');assert.equal(cache.items.has('A'),false);
  await cache.get('A');assert.equal(transfers,2);assert.equal(decodes,3);
  const abandoned=cache.get('C');await abandoned;await cache.get('C');assert.equal(decodes,4);
  assert.ok(reads.every(x=>x==='force-cache'));assert.ok(cache.bytes<=1);assert.equal(cache.pending.size,0);
 }finally{globalThis.fetch=original;}
});

test('Mutable deployment manifests revalidate in actual worker and terrain initialization',()=>{
 const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8'),app=readFileSync(new URL('../src/terrain-store.js',import.meta.url),'utf8');
 assert.match(worker,/fetch\(new URL\(name,root\),\{cache:'no-cache'\}\)/);
 assert.match(worker,/json\('chunks.json.gz',true\)/);
 assert.match(app,/fetch\('data\/terrain-index.json',\{cache:'no-cache'\}\)/);
});
