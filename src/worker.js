import {ViewportEngine} from './chunk-engine.js?v=block1';
import {Engine} from './engine.js?v=block1';
import {selectChunks,mergeChunks,ChunkCache,zipped,scheduleFile} from './chunks.js';
let meta,index,cache,view,generation=0;
const root=new URL('../data/',import.meta.url);
const json=async name=>{const r=await fetch(new URL(name,root),{cache:'no-cache'});if(!r.ok)throw Error(`Metadata: HTTP ${r.status}`);return r.json();};
self.onmessage=async ({data})=>{
  try{
    if(data.type==='init'){
      [meta,index]=await Promise.all([json('meta.json'),json('chunks.json')]);
      if(!meta.chunked)throw Error('Nová aplikace potřebuje chunkovaný dataset. Obnov stránku po nasazení.');
      cache=new ChunkCache(async id=>{const c=index.chunks[id];const [geometry,schedule]=await Promise.all([zipped(new URL(c.geometry,root)),scheduleFile(new URL(c.schedule,root))]);return {geometry,schedule};},{maxBytes:4*1024*1024,maxEntries:8});
      view=new ViewportEngine(meta,index,id=>cache.get(id,index.chunks[id].geometryDecodedBytes+index.chunks[id].scheduleDecodedBytes));
      view.cache=cache;
      self.postMessage({type:'ready',meta});
    }else if(data.type==='counts'){
      const token=++generation,result=await view.counts(data.bounds,data.filter,()=>token!==generation);if(!result||token!==generation)return;
      self.postMessage({type:'counts',id:data.id,...result},[...new Set(Object.values(result).filter(v=>ArrayBuffer.isView(v)).map(v=>v.buffer))]);
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
