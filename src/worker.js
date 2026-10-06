import {renderView,previewView,geometryLevel} from './render-view.js';
import {project} from './core.js';
import {ViewportEngine} from './chunk-engine.js?v=block2';
import {Engine} from './engine.js?v=block1';
import {selectChunks,mergeChunks,ChunkCache,zipped,scheduleFile} from './chunks.js';
let meta,index,cache,renderCache,view,exactView,generation=0;
const buffers=r=>[...new Set([...Object.values(r),...Object.values(r.geometry||{})].filter(v=>ArrayBuffer.isView(v)).map(v=>v.buffer))];
const root=new URL('../data/',import.meta.url);
const json=async name=>{const r=await fetch(new URL(name,root),{cache:'no-cache'});if(!r.ok)throw Error(`Metadata: HTTP ${r.status}`);return r.json();};
self.onmessage=async ({data})=>{
  try{
    if(data.type==='init'){
      [meta,index]=await Promise.all([json('meta.json'),json('chunks.json')]);
      if(!meta.chunked)throw Error('Nová aplikace potřebuje chunkovaný dataset. Obnov stránku po nasazení.');
      cache=new ChunkCache(async id=>{const c=index.chunks[id];const [geometry,schedule]=await Promise.all([zipped(new URL(c.geometry,root)),scheduleFile(new URL(c.schedule,root))]);return {geometry,schedule};},{maxBytes:4*1024*1024,maxEntries:8});
      renderCache=new ChunkCache(async key=>{const [id,level]=key.split('|');return zipped(new URL(index.chunks[id].render[level].path,root));},{maxBytes:4*1024*1024,maxEntries:16});
      view=new ViewportEngine(meta,index,id=>cache.get(id,index.chunks[id].geometryDecodedBytes+index.chunks[id].scheduleDecodedBytes),(id,zoom)=>{const level=geometryLevel(zoom),c=index.chunks[id].render?.[level];return c?renderCache.get(id+'|'+level,c.decodedBytes):Promise.resolve(null);});
      view.cache=cache;
      exactView=new ViewportEngine(meta,index,id=>cache.get(id,index.chunks[id].geometryDecodedBytes+index.chunks[id].scheduleDecodedBytes));exactView.cache=cache;exactView.countCache=view.countCache;
      self.postMessage({type:'ready',meta});
    }else if(data.type==='cancel'){
      generation++;
    }else if(data.type==='counts'){
      const token=++generation,previews=[];let last=0;
      const raw=await view.counts(data.bounds,data.filter,()=>token!==generation,render=>{
        previews.push(render);const now=Date.now();if(now-last<100)return;last=now;
        const result=previewView(previews,meta,data.filter,data.zoom,data.bounds);
        if(token===generation)self.postMessage({type:'preview',id:data.id,...result},buffers(result));
      },data.zoom);
      if(!raw||token!==generation)return;
      const result=renderView(raw,data.zoom,data.bounds);
      self.postMessage({type:'counts',id:data.id,...result},buffers(result));
    }else if(data.type==='snap'){
      const [lat,lon]=data.point,d=152/111195,dx=d/Math.cos(lat*Math.PI/180);
      const result=await exactView.counts([lat-d,lon-dx,lat+d,lon+dx],data.filter);
      const candidates=result.geometry.edges.flatMap(([a,b],i)=>result.counts[i]?[project(data.point,result.geometry.points[a],result.geometry.points[b])]:[]).filter(p=>p.distance<=150).sort((a,b)=>a.distance-b.distance);
      const nearest=candidates[0],point=nearest&&nearest.distance>25?[nearest.lat,nearest.lon]:data.point;
      self.postMessage({type:'snap',id:data.id,point,radius:candidates.filter(p=>p.distance<=60).length>3?55:40});
    }else if(data.type==='point'){
      // A point query is independent of the visible map and includes all touching tiles.
      const d=(data.radius+2)/111195,dx=d/Math.cos(data.point[0]*Math.PI/180),[lat,lon]=data.point;
      const ids=selectChunks(index,[lat-d,lon-dx,lat+d,lon+dx],data.filter),chunks=[];
      for(const id of ids){const c=index.chunks[id];chunks.push(await cache.get(id,c.geometryDecodedBytes+c.scheduleDecodedBytes));}
      const local=mergeChunks(chunks),e=new Engine(meta,local.geometry,local.schedule),result=e.passages(data.point,data.radius,data.filter,data.allDay);
      self.postMessage({type:'point',id:data.id,...result,lines:result.edges.map(id=>e.g.edges[id].map(i=>e.g.points[i]))});
    }
  }catch(error){self.postMessage({type:'error',message:error.message,id:data.id,request:data.type});}
};
