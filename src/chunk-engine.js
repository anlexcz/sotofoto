import {Engine} from './engine.js?v=block1';
import {selectChunks,mergeChunks,ChunkCache} from './chunks.js';
const fields=['surfaceForward','surfaceBackward','regularCounts','regularForward','regularBackward','categories','forwardCategories','backwardCategories','counts','forward','backward','colors','agencyColors'];
export class ViewportEngine {
  constructor(meta,index,load,renderLoad=null){this.renderLoad=renderLoad;this.meta=meta;this.index=index;this.cache=new ChunkCache(load,{maxBytes:4*1024*1024,maxEntries:8});this.countCache=new ChunkCache(()=>{throw Error('Unexpected count miss');},{maxBytes:8*1024*1024,maxEntries:24});}
  async counts(bounds,filter,cancelled=()=>false,onPreview=null,zoom=19){
  const {meta,index,cache,countCache}=this;
  const ids=selectChunks(index,bounds,filter),edges=new Map(),journeys=new Set(),display=[];
  for(const id of ids){
    if(cancelled())return null;
    const c=index.chunks[id],key=id+'|'+JSON.stringify(filter);
    // Kick both requests off together; the small render-only file can win.
    const renderPromise=this.renderLoad?this.renderLoad(id,zoom):null;
    let loadPromise=countCache.items.has(key)?null:cache.get(id,c.geometryDecodedBytes+c.scheduleDecodedBytes);
    loadPromise?.catch(()=>{});
    if(renderPromise){const render=await renderPromise.catch(()=>null);if(cancelled())return null;if(render){for(const segment of render.segments)display.push(segment);onPreview?.(render,id);}}
    let entry=countCache.items.get(key)?.value;
    if(entry){await countCache.get(key);}
    else {
      const chunk=await loadPromise;
      if(cancelled())return null;
      const local=mergeChunks([chunk]),e=new Engine(meta,local.geometry,local.schedule,{pointIndex:false}),counts=e.counts(filter,true);
      entry={edges:chunk.geometry.edges,counts};
      const bytes=entry.edges.length*256+counts.journeyKeys.reduce((n,k)=>n+k.length*2+24,0)+Object.values(counts.routeCounts).reduce((n,r)=>n+Object.keys(r).length*32,0);
      countCache.items.set(key,{value:entry,bytes});countCache.bytes+=bytes;countCache.trim();
    }
    for(const j of entry.counts.journeyKeys)journeys.add(j);
    for(let i=0;i<entry.edges.length;i++){const [eid,a,b]=entry.edges[i];if(!edges.has(eid))edges.set(eid,{a,b,values:fields.map(f=>entry.counts[f][i]),routeCounts:entry.counts.routeCounts[i],edgeRoutes:entry.counts.edgeRoutes[i],edgeAgencies:entry.counts.edgeAgencies[i]});}
    // Let pending messages cancel a large overview between chunks.
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(cancelled())return null;
  const result={journeys:journeys.size,routeCounts:{},edgeRoutes:{},edgeAgencies:{}},points=[],refs=[],pointIds=new Map();
  for(const f of fields)result[f]=f.includes('Categories')||f==='categories'?new Uint8Array(edges.size):f==='colors'||f==='agencyColors'?new Int32Array(edges.size):new Uint32Array(edges.size);
  const point=p=>{const key=p.join(',');if(!pointIds.has(key)){pointIds.set(key,points.length);points.push(p);}return pointIds.get(key);};
  let k=0;
  for(const [,entry] of [...edges].sort((a,b)=>a[0]-b[0])){
    refs.push([point(entry.a),point(entry.b)]);
    fields.forEach((f,i)=>result[f][k]=entry.values[i]);
    for(const f of ['routeCounts','edgeRoutes','edgeAgencies'])if(entry[f])result[f][k]=entry[f];k++;
  }
  return {geometry:{points,edges:refs,ids:[...edges.keys()].sort((a,b)=>a-b),display},...result};
}
}
