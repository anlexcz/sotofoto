import {readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {performance} from 'node:perf_hooks';
import {Engine} from '../src/engine.js';
import {ViewportEngine} from '../src/chunk-engine.js';
import {selectChunks,mergeChunks,decodeSchedule} from '../src/chunks.js';
const mode=process.argv[2]||'chunks',directory=process.argv[3]||'dist/data';
const report={mode,environment:'Node '+process.version+'; local files, no network or browser timings',files:{},bounds:[50.06,14.39,50.10,14.49]};
let downloaded=0,decoded=0,parseMs=0,decompressMs=0;
function load(path){const raw=readFileSync(directory+'/'+path);downloaded+=raw.length;let t=performance.now();const content=path.endsWith('.gz')?gunzipSync(raw):raw;decompressMs+=performance.now()-t;decoded+=content.length;t=performance.now();const value=path.endsWith('.bin.gz')?decodeSchedule(content.buffer.slice(content.byteOffset,content.byteOffset+content.byteLength)):JSON.parse(content);parseMs+=performance.now()-t;return value;}
const t0=performance.now(),meta=load('meta.json');let data,chunkStats,result,view,countsMs;
if(mode==='legacy')data={geometry:load('geometry.json.gz'),schedule:load('schedule.json.gz')};
else {const index=load('chunks.json'),ids=selectChunks(index,report.bounds);report.chunkCount=ids.length;let t=performance.now();view=new ViewportEngine(meta,index,async id=>{const c=index.chunks[id];return {geometry:load(c.geometry),schedule:load(c.schedule)};});report.engineMs=performance.now()-t;t=performance.now();result=await view.counts(report.bounds,{date:'2026-10-06',start:0,end:86400,allDay:true,operation:'all',routes:[],agencies:[],modes:[],directions:[]});countsMs=performance.now()-t;data={geometry:result.geometry,schedule:null};report.cache={bytes:view.cache.bytes,entries:view.cache.items.size};const entries=Object.values(index.chunks);const stats=name=>{const a=entries.map(c=>c[name]).sort((a,b)=>a-b);return {p50:a[Math.floor(a.length/2)],p95:a[Math.floor(a.length*.95)],max:a.at(-1),sum:a.reduce((x,y)=>x+y,0)};};chunkStats={count:entries.length,geometry:stats('geometryBytes'),schedule:stats('scheduleBytes')};report.indexBytes=statSync(directory+'/chunks.json').size;}
let t;if(mode==='legacy'){t=performance.now();const engine=new Engine(meta,data.geometry,data.schedule);report.engineMs=performance.now()-t;t=performance.now();result=engine.counts({date:'2026-10-06',start:0,end:86400,allDay:true,operation:'all',routes:[],agencies:[],modes:[],directions:[]});countsMs=performance.now()-t;}report.countsMs=countsMs;report.totalMs=performance.now()-t0;
report.payloadBytes=downloaded;report.decodedBytes=decoded;report.parseMs=parseMs;report.decompressMs=decompressMs;report.structures={points:data.geometry.points.length,edges:data.geometry.edges.length,patterns:data.schedule?.patterns.length??null,trips:data.schedule?.trips.length??null,activeEdges:[...result.counts].filter(Boolean).length};report.memory=process.memoryUsage();report.maxRssKiB=process.resourceUsage().maxRSS;report.chunkStats=chunkStats;
t=performance.now();structuredClone({points:data.geometry.points,edges:data.geometry.edges});report.geometryCloneMs=performance.now()-t;
console.log(JSON.stringify(report,null,2));writeFileSync(`docs/p2-${mode}-metrics.json`,JSON.stringify(report,null,2)+'\n');
