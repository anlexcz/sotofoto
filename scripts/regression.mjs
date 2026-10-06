// Compare production chunk output with the unchanged full-dataset Engine.
import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';import assert from 'node:assert/strict';
import {Engine} from '../src/engine.js';import {selectChunks,mergeChunks,decodeSchedule} from '../src/chunks.js';
const root=process.argv[2]||'dist/data',load=p=>{const c=p.endsWith('.gz')?gunzipSync(readFileSync(root+'/'+p)):readFileSync(root+'/'+p);return p.endsWith('.bin.gz')?decodeSchedule(c.buffer.slice(c.byteOffset,c.byteOffset+c.byteLength)):JSON.parse(c);};
const meta=load('meta.json'),g=load('geometry.json.gz'),s=load('schedule.json.gz'),index=load('chunks.json'),full=new Engine(meta,g,s);
const base={date:'2026-10-06',start:0,end:86400,allDay:true,operation:'all',routes:[],agencies:[],modes:[],directions:[]};
const areas=[['centrum',50.075,14.418],['okraj',50.128,14.471],['primestsky',50.355,14.475],['zeleznice',50.041,14.323],['ridky',50.195,14.582],['vozovna',50.135,14.465],['noc',50.082,14.423]];
const signature=rows=>rows.map(({edge,key,...r})=>r).sort((a,b)=>a.trip.localeCompare(b.trip)||a.serviceDay.localeCompare(b.serviceDay)||a.time-b.time||a.bearing-b.bearing);
for(const [name,lat,lon] of areas){
 const ids=selectChunks(index,[lat-.002,lon-.003,lat+.002,lon+.003]),chunks=ids.map(id=>({geometry:load(index.chunks[id].geometry),schedule:load(index.chunks[id].schedule)}));
 const local=mergeChunks(chunks),e=new Engine(meta,local.geometry,local.schedule),coord=new Map(g.edges.map(([a,b],i)=>[g.points[a].join(',')+'|'+g.points[b].join(','),i]));
 for(const f of [base,{...base,operation:'night'},{...base,allDay:false,start:23*3600,end:26*3600},{...base,agencies:[0]},{...base,directions:['S','V']},{...base,modes:[3]},{...base,modes:[1]},{...base,modes:[0,1,3]}]){
   const a=full.counts(f),b=e.counts(f);
   for(let i=0;i<local.geometry.edges.length;i++){const [u,v]=local.geometry.edges[i],id=coord.get(local.geometry.points[u].join(',')+'|'+local.geometry.points[v].join(','));for(const field of ['surfaceForward','surfaceBackward','counts','forward','backward','regularCounts','regularForward','regularBackward','categories','forwardCategories','backwardCategories','colors','agencyColors'])assert.equal(b[field][i],a[field][id],`${name}: ${field} edge ${id}`);}
   assert.deepEqual(signature(e.passages([lat,lon],150,f).passages),signature(full.passages([lat,lon],150,f).passages),`${name}: passages`);
   global.gc?.();
 }
 console.log(name,'OK',ids.length,'chunks',e.g.edges.length,'edges');
}
// Validate all display levels against precise counts, including every source member.
const {ViewportEngine}=await import('../src/chunk-engine.js');const {renderView,COUNT_FIELDS}=await import('../src/render-view.js');
const swapped={forward:'backward',backward:'forward',surfaceForward:'surfaceBackward',surfaceBackward:'surfaceForward',regularForward:'regularBackward',regularBackward:'regularForward',forwardCategories:'backwardCategories',backwardCategories:'forwardCategories'};
for(const [name,lat,lon] of areas){const bounds=[lat-.002,lon-.003,lat+.002,lon+.003];for(const zoom of [10,13,16]){
 const v=new ViewportEngine(meta,index,async id=>({geometry:load(index.chunks[id].geometry),schedule:load(index.chunks[id].schedule)}),async id=>load(index.chunks[id].render[zoom<=11?'overview':zoom<=14?'medium':'detail'].path));
 for(const f of [base,{...base,modes:[1]},{...base,modes:[0,1,3],allDay:false,start:82800,end:93600}]){const raw=await v.counts(bounds,f,()=>false,null,zoom),d=renderView(raw,zoom),lookup=new Map(raw.geometry.ids.map((id,i)=>[id,i]));const seen=new Set();
 d.memberIds.forEach((members,k)=>{for(const id of members){assert.ok(!seen.has(id));seen.add(id);const i=lookup.get(id),[u,w]=raw.geometry.edges[i],p=raw.geometry.points[u],q=raw.geometry.points[w],samples=d.geometry.samples,start=d.geometry.sampleOffsets[k],j=start+members.indexOf(id),sourceBearing=(awaitBearing(p,q)),reverse=Math.abs(((samples[j*3+2]-sourceBearing+540)%360)-180)>90;for(const field of COUNT_FIELDS)assert.equal(d[field][k],raw[reverse?(swapped[field]||field):field][i],`${name} z${zoom} ${field}`);}});
 assert.equal(seen.size,Array.from(raw.counts).filter(Boolean).length);global.gc?.();
 }
}console.log(name,'display levels OK');}
function awaitBearing(a,b){const rad=Math.PI/180,p=a[0]*rad,q=b[0]*rad,d=(b[1]-a[1])*rad;return (Math.atan2(Math.sin(d)*Math.cos(q),Math.cos(p)*Math.sin(q)-Math.sin(p)*Math.cos(q)*Math.cos(d))/rad+360)%360;}
