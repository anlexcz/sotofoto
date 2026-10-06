// Node measurements of the real published binary chunks. Not a mobile RAM claim.
import fs from 'node:fs/promises';import zlib from 'node:zlib';import {performance} from 'node:perf_hooks';
import {BuildingLoader,decodeBuildings,buildingAt} from '../src/buildings.js';import {horizonHeight,directSun} from '../src/environment.js';import {sunPosition,pragueInstant,project} from '../src/core.js';
const root='dist/data/',index=JSON.parse(await fs.readFile(root+'building-index.json'));
let requests=0,bytes=0,decodeMs=0;
const load=async url=>{requests++;const raw=await fs.readFile(root+url.replace('data/',''));bytes+=raw.length;const begin=performance.now(),d=zlib.gunzipSync(raw);const result=decodeBuildings(d.buffer.slice(d.byteOffset,d.byteOffset+d.byteLength));decodeMs+=performance.now()-begin;return result;};
const viewport=[50.06,14.39,50.10,14.49],loader=new BuildingLoader({manifest:async()=>index,load,maxBytes:2*1024*1024,maxActiveBytes:4*1024*1024});
const begin=performance.now();await loader.update(viewport,{enabled:true});const loadedMs=performance.now()-begin;
const before=requests,start=performance.now();for(let i=0;i<100000;i++)buildingAt({azimuth:i%360,altitude:i%70},loader.at(50.075,14.44));const compareMs=performance.now()-start;
const files=[...Object.values(index.chunks),...Object.values(index.detail?.chunks||{})].filter(c=>c.path),sizes=files.map(c=>c.gzipBytes).sort((a,b)=>a-b);
const output={source:index.source,build:index.build,stats:index.stats,manifestBytes:(await fs.stat(root+'building-index.json')).size,manifestGzipBytes:(await fs.stat(root+'building-index.json.gz')).size,datasetGzipBytes:sizes.reduce((a,b)=>a+b,0),chunks:files.length,chunkMedian:sizes[Math.floor(sizes.length*.5)],chunkP95:sizes[Math.floor(sizes.length*.95)],chunkMax:sizes.at(-1),viewport:{bounds:viewport,requests,gzipBytes:bytes,activeDecodedBytes:[...loader.active.keys()].reduce((n,id)=>n+(index.chunks[id].bytes||0),0),loadedMs,decodeMs},compare100000Ms:compareMs,sliderRequests:requests-before,heap:process.memoryUsage(),references:[]};
const cases=[['Otevřená trať – Belárie',50.0105,14.4032],['Úzká ulice – Národní',50.08149,14.41080],['Vysoký dům – Pankrác',50.0504,14.4396],['Mezi bloky – Karlín',50.094567,14.453766],['Most – Palackého',50.0722,14.4127],['Terén bez domů – Prokopské údolí',50.0393,14.3553],['Svah a město – Trojská',50.1167,14.4322],['Autobus v obci – Český Brod, Liblice, obec',50.074505,14.883168]];
const terrainIndex=JSON.parse(await fs.readFile(root+'terrain-index.json'));const terrain=new Map();
const geometry=JSON.parse(zlib.gunzipSync(await fs.readFile(root+'geometry.json.gz')));
const meta=JSON.parse(await fs.readFile(root+'meta.json')),schedule=JSON.parse(zlib.gunzipSync(await fs.readFile(root+'schedule.json.gz'))),surfaceEdges=new Set();
// Only the reference selection excludes underground metro; application filters are unchanged.
for(const t of schedule.trips)if(meta.routes[t[0]][3]!==1)for(const edge of geometry.shapes[schedule.patterns[t[3]][0]][0])surfaceEdges.add(Math.abs(edge)-1);
for(const [name,targetLat,targetLon] of cases){
 let nearest=null;for(const edge of surfaceEdges){const [a,b]=geometry.edges[edge];const p=project([targetLat,targetLon],geometry.points[a],geometry.points[b]);if(!nearest||p.distance<nearest.distance)nearest=p;}const lat=nearest.lat,lon=nearest.lon;
 const local=new BuildingLoader({manifest:async()=>index,load}),fine=new BuildingLoader({manifest:async()=>index,load,layer:'detail'});await local.update([lat,lon,lat,lon],{point:[lat,lon]});await fine.update([lat,lon,lat,lon],{point:[lat,lon]});
 const key=`${Math.round(lat/.002)},${Math.round(lon/.004)}`;
 for(const c of Object.values(terrainIndex.chunks)){if(c.bounds[0]-.004<=lat&&lat<=c.bounds[2]+.004&&c.bounds[1]-.005<=lon&&lon<=c.bounds[3]+.005){const rows=JSON.parse(zlib.gunzipSync(await fs.readFile(root+c.path)));for(const [k,p,valid]of rows)if(valid)terrain.set(k.join(','),p);}}
 for(const time of [9*3600,12*3600,16*3600]){const sun=sunPosition(pragueInstant('20261007',time),lat,lon),b=buildingAt(sun,fine.at(lat,lon)||local.at(lat,lon)),p=terrain.get(key)||null;output.references.push({name,selection:'nearest non-metro GTFS edge',target:[targetLat,targetLon],distanceToRoute:nearest.distance,lat,lon,date:'2026-10-07',time:`${time/3600}:00 Europe/Prague`,sun,terrainHorizon:p?horizonHeight(p,sun.azimuth):null,buildingResolution:fine.at(lat,lon)?index.detail.cell:index.cell,building:b,result:directSun(sun,p,b)});}
}
console.log(JSON.stringify(output,null,2));
