import test from 'node:test';import assert from 'node:assert/strict';import {Worker} from 'node:worker_threads';import {mkdtempSync,rmSync,readFileSync} from 'node:fs';import {spawnSync} from 'node:child_process';import {tmpdir} from 'node:os';import {pathToFileURL} from 'node:url';
test('Actual worker sends transferable preview/final views, latest filter, exact snap and passages',async()=>{
 const dir=mkdtempSync(tmpdir()+'/sotofoto-worker-');const built=spawnSync('python',['tests/chunk_fixture.py',dir],{encoding:'utf8'});assert.equal(built.status,0,built.stderr);
 const workerUrl=pathToFileURL(process.cwd()+'/src/worker.js').href;
 const w=new Worker(`const {parentPort}=require('node:worker_threads'),fs=require('node:fs');globalThis.self={postMessage:(data,transfer)=>parentPort.postMessage(data,transfer)};globalThis.fetch=async url=>{const path=new URL(url).pathname.split('/data/')[1];parentPort.postMessage({type:'read',path});return new Response(fs.readFileSync(${JSON.stringify(dir)}+'/'+path));};import(${JSON.stringify(workerUrl)}).then(()=>parentPort.on('message',data=>self.onmessage({data})));`,{eval:true});
 const messages=[],waiters=[];w.on('message',m=>{messages.push(m);for(const resolve of waiters)resolve();});let error;w.on('error',e=>{error=e;for(const resolve of waiters)resolve();});
 const wait=async pred=>{for(let i=0;i<100;i++){if(error)throw error;const found=messages.find(pred);if(found)return found;await new Promise(r=>{waiters.push(r);setTimeout(r,50);});}throw Error(JSON.stringify(messages));};
 try{
 w.postMessage({type:'init'});await wait(m=>m.type==='ready');const filter={date:'2026-10-06',start:0,end:86400,allDay:true,operation:'all',routes:[],agencies:[],modes:[],directions:[]},bounds=[50.024,14.439,50.026,14.471];
 w.postMessage({type:'counts',id:1,filter,bounds,zoom:10});const preview=await wait(m=>m.type==='preview'&&m.id===1);assert.equal(preview.preliminary,true);const final=await wait(m=>m.type==='counts'&&m.id===1);assert.equal(final.preliminary,false);assert.ok(final.geometry.samples instanceof Float64Array);assert.ok(final.counts.some(Boolean));
 w.postMessage({type:'counts',id:99,filter,bounds,zoom:10});w.postMessage({type:'cancel'});w.postMessage({type:'counts',id:2,filter:{...filter,operation:'none'},bounds,zoom:13});const empty=await wait(m=>m.type==='counts'&&m.id===2);assert.equal(empty.counts.length,0);assert.equal(messages.some(m=>m.type==='counts'&&m.id===99),false);
 const before=messages.filter(m=>m.type==='read'&&/detail/.test(m.path)).length;
 w.postMessage({type:'snap',id:3,point:[50.025,14.45],filter});const snap=await wait(m=>m.type==='snap'&&m.id===3);assert.ok([40,55].includes(snap.radius));assert.equal(messages.filter(m=>m.type==='read'&&/detail/.test(m.path)).length,before);
 w.postMessage({type:'point',id:4,point:snap.point,radius:snap.radius,filter,allDay:false});const point=await wait(m=>m.type==='point'&&m.id===4);assert.ok(point.passages.length);assert.ok(point.lines.length);
 assert.equal(messages.filter(m=>m.type==='error').length,0);
 }finally{await w.terminate();rmSync(dir,{recursive:true,force:true});}
});
