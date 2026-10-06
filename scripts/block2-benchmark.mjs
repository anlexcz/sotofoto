// Repeatable offline profile. Real Engine and Canvas-layer code; not browser/RAM/network measurement.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {runInNewContext} from 'node:vm';
import {performance} from 'node:perf_hooks';
const source=resolve(process.argv[2]||'src'),root=process.argv[3]||'dist/data',output=process.argv[4]||'docs/block2-after.json';
const {ViewportEngine}=await import(pathToFileURL(source+'/chunk-engine.js'));
const {decodeSchedule,mergeChunks,selectChunks,ChunkCache}=await import(pathToFileURL(source+'/chunks.js'));
const {Engine}=await import(pathToFileURL(source+'/engine.js'));
const core=await import(pathToFileURL(source+'/core.js'));
const light=await import(pathToFileURL(source+'/photo-light.js'));
const labels=await import(pathToFileURL(source+'/route-labels.js'));
const intensity=await import(pathToFileURL(source+'/intensity.js'));
let transferred=0,reads=0;
const load=p=>{const raw=readFileSync(root+'/'+p);transferred+=raw.length;reads++;const data=p.endsWith('.gz')?gunzipSync(raw):raw;return p.endsWith('.bin.gz')?decodeSchedule(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)):JSON.parse(data);};
const meta=load('meta.json'),index=load('chunks.json'),metadataBytes=transferred;
const base={date:meta.startDate.slice(0,4)+'-'+meta.startDate.slice(4,6)+'-'+meta.startDate.slice(6),start:0,end:86400,allDay:true,operation:'all',routes:[],agencies:[],modes:[],directions:[]};
const app=readFileSync(source+'/app.js','utf8'),layer=app.slice(app.indexOf('const RoutesLayer=L.Layer.extend('),app.indexOf('const routesLayer=new RoutesLayer()'));
const report={environment:{node:process.version,platform:process.platform,note:'Local compressed files, same feed and unthrottled CPU. Viewports are projected models, not emulated browsers. Canvas context records real layer draw operations without rasterization. No internet, tile paint, browser first-map timing or phone RAM measured.'},feed:meta.builtAt,metadataBytes,samples:[]};
function renderer(data,bounds,size,zoom,photo){
 const element=id=>({value:{opacity:'.8',color:'mode',thickness:'1',date:base.date}[id]||'',checked:false,hidden:false});
 const elements=new Map(),$=id=>{if(!elements.has(id))elements.set(id,element(id));return elements.get(id);};
 const stats={strokes:0,sunCalls:0,drawMs:[]};
 const ctx=new Proxy({stroke(){stats.strokes++;},measureText:t=>({width:t.length*6})},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
 const b={getSouth:()=>bounds[0],getWest:()=>bounds[1],getNorth:()=>bounds[2],getEast:()=>bounds[3],pad(){return this;}};
 const project=p=>({x:(p[1]-bounds[1])/(bounds[3]-bounds[1])*size.x,y:(bounds[2]-p[0])/(bounds[2]-bounds[0])*size.y});
 const map={getSize:()=>size,getBounds:()=>b,getZoom:()=>zoom,latLngToContainerPoint:project,containerPointToLayerPoint:p=>p};
 const context={performance,...core,...light,...labels,...intensity,$,geometry:data.geometry,result:data,meta,map,window:{devicePixelRatio:1},photoMode:photo,photoSeconds:43200,highlightAgency:null,intensities:false,selected:{routes:new Set()},profileAt:()=>null,width:category=>(app.includes("intensity-toggle")?3.4:intensity.FREQUENCY_WIDTHS[category])*(.65+(zoom-11)*.14),edgeColor:()=> '#16877d',edgeBearings:Float32Array.from(data.geometry.edges,([a,b])=>core.bearing(data.geometry.points[a],data.geometry.points[b])),L:{Layer:{extend:o=>o},DomUtil:{setPosition(){}}},sunPosition:(...args)=>{stats.sunCalls++;return core.sunPosition(...args);}};
 // New renderer's pure helper dependencies, if present.
 return {stats,context,map,ctx};
}
for(let repeat=0;repeat<3;repeat++)for(const [name,bounds,size,zoom] of [
 ['desktop-start',[50.055,14.35,50.12,14.52],{x:1050,y:860},13],
 ['mobile-start',[50.052,14.412,50.098,14.468],{x:390,y:768},13],
 ['wide-PID',[49.65,13.85,50.65,15.35],{x:1050,y:860},9],
 ['dense-close',[50.073,14.422,50.08,14.44],{x:1050,y:860},16]]){
 transferred=0;reads=0;const newRender=index.version===2&&app.includes('intensity-toggle');const renderCache=new ChunkCache(async key=>{const [id,level]=key.split('|');return load(index.chunks[id].render[level].path);},{maxBytes:4*1024*1024,maxEntries:16});const view=new ViewportEngine(meta,index,async id=>{const c=index.chunks[id];return {geometry:load(c.geometry),schedule:load(c.schedule)};},newRender?async(id,zoom)=>{const level=zoom<=11?"overview":zoom<=14?"medium":"detail";return renderCache.get(id+"|"+level,index.chunks[id].render[level].decodedBytes);}:null);
 let firstPreviewMs=null;const start=performance.now();
 let data=await view.counts(bounds,base,()=>false,p=>{firstPreviewMs??=performance.now()-start;},zoom);
 const firstCountsMs=performance.now()-start,trafficBytes=transferred;
 let display=data;const transformStart=performance.now();
 if(data.geometry.display){const {renderView}=await import(pathToFileURL(source+'/render-view.js'));display=renderView(data,zoom);}
 const renderTransformMs=performance.now()-transformStart;
 const r=renderer(display,bounds,size,zoom,true);
 if(source.endsWith('/src')&&app.includes("from './map-light.js'"))Object.assign(r.context,await import(pathToFileURL(source+'/render-view.js')),await import(pathToFileURL(source+'/map-light.js')));
 if(r.context.MapLightCache)r.context.lightCache={sun:(...args)=>{r.stats.sunCalls++;return core.sunPosition(...args);}};
 runInNewContext(layer+';globalThis.layer=RoutesLayer;',r.context);
 const l=r.context.layer;l._map=r.map;l.canvas={style:{},getContext:()=>r.ctx};if(l.paint)l.draw=()=>{for(const _ of l.paint()){}};
 let t=performance.now();l.update();const updateMs=performance.now()-t;
 for(let i=0;i<8;i++){r.context.photoSeconds=43200+i*300;t=performance.now();l.draw();r.stats.drawMs.push(performance.now()-t);}
 const before=transferred;t=performance.now();await view.counts(bounds,base,()=>false,null,zoom);const warmMs=performance.now()-t;
 const pan=bounds.map((v,i)=>v+(i%2?.003:.002));t=performance.now();await view.counts(pan,base,()=>false,null,zoom);const panMs=performance.now()-t;
 t=performance.now();await view.counts(bounds,{...base,modes:[0,1,3]},()=>false,null,zoom);const filterMs=performance.now()-t;
 const lat=(bounds[0]+bounds[2])/2,lon=(bounds[1]+bounds[3])/2,ids=selectChunks(index,[lat-.0015,lon-.0023,lat+.0015,lon+.0023]);
 t=performance.now();const chunks=[];for(const id of ids){const c=index.chunks[id];chunks.push(await view.cache.get(id,c.geometryDecodedBytes+c.scheduleDecodedBytes));}const exact=mergeChunks(chunks),engine=new Engine(meta,exact.geometry,exact.schedule);const passages=engine.passages([lat,lon],150,base).passages;const pointMs=performance.now()-t;
 report.samples.push({repeat,name,viewport:size,zoom,bounds,firstPreviewMs,firstCountsMs,trafficBytes,loadedEdges:data.geometry.edges.length,drawEdges:display.geometry.edges.length,renderTransformMs,sourceSamples:display.geometry.samples?.length/3??data.geometry.edges.length,updateMs,...r.stats,warmMs,panMs,filterMs,pointMs,passages:passages.length,additionalBytes:transferred-before,cache:{dataBytes:view.cache.bytes,dataEntries:view.cache.items.size,countBytes:view.countCache.bytes,countEntries:view.countCache.items.size,renderBytes:renderCache.bytes,renderEntries:renderCache.items.size},memory:process.memoryUsage(),rssPeakKiB:process.resourceUsage().maxRSS});
 console.error(repeat,name,Math.round(firstCountsMs)+'ms',data.geometry.edges.length,'edges');global.gc?.();
}
mkdirSync('docs',{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(output);
