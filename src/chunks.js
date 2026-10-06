// All IDs in files are build-global; Engine IDs are local to one bounded view.
export function selectChunks(index,bounds,filter=null){
  return Object.entries(index.chunks).filter(([,c])=>{
    const [s,w,n,e]=c.bounds,[bs,bw,bn,be]=bounds;
    if(n+1e-10<bs||s-1e-10>bn||e+1e-10<bw||w-1e-10>be)return false;
    if(filter?.routes?.length&&!filter.routes.some(r=>c.routes.includes(r)))return false;
    if(filter?.agencies?.length&&!filter.agencies.some(a=>c.agencies.includes(a)))return false;
    return true;
  }).map(([id])=>id).sort();
}
// Pages sets max-age=600; immutable content hashes can reuse even stale HTTP entries.
// Unversioned URLs must still revalidate, including compatibility manifests.
export function dataCacheMode(url){
  return /\.[a-f0-9]{16}\.(?:(?:geometry|schedule|regional|overview|medium|detail)\.)?(?:json|bin)\.gz$/.test(new URL(url,'https://data.invalid/').pathname)?'force-cache':'no-cache';
}
export async function zipped(url){
  const r=await fetch(url,{cache:dataCacheMode(url)});if(!r.ok)throw Error(`Data: HTTP ${r.status}`);
  if(!globalThis.DecompressionStream)throw Error('Použij aktuální Chrome, Firefox nebo Safari.');
  return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json();
}
export function decodeSchedule(buffer){
  const size=new DataView(buffer).getUint32(0,true);
  if(size%4||size+4>buffer.byteLength||(buffer.byteLength-size-4)%4)throw Error('Poškozený schedule chunk');
  const data=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,4,size))),times=new Uint32Array(buffer,size+4);
  if(data.version!==1)throw Error('Nepodporovaný schedule chunk');
  for(const [,t] of data.trips){const [offset,length]=t[5];if(offset+length>times.length)throw Error('Poškozené časy');t[5]=times.subarray(offset,offset+length);}
  return data;
}
export async function scheduleFile(url){const r=await fetch(url,{cache:dataCacheMode(url)});if(!r.ok)throw Error(`Data: HTTP ${r.status}`);return decodeSchedule(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());}
export class ChunkCache {
  constructor(load,{maxBytes=24*1024*1024,maxEntries=24}={}){this.load=load;this.maxBytes=maxBytes;this.maxEntries=maxEntries;this.items=new Map();this.pending=new Map();this.bytes=0;}
  async get(id,bytes=1){
    if(this.items.has(id)){const entry=this.items.get(id);this.items.delete(id);this.items.set(id,entry);return entry.value;}
    if(this.pending.has(id))return this.pending.get(id);
    const p=this.load(id).then(value=>{this.items.set(id,{value,bytes});this.bytes+=bytes;this.trim();return value;}).finally(()=>this.pending.delete(id));
    this.pending.set(id,p);return p;
  }
  trim(){while(this.bytes>this.maxBytes||this.items.size>this.maxEntries){const id=this.items.keys().next().value;this.bytes-=this.items.get(id).bytes;this.items.delete(id);}}
  clear(){this.items.clear();this.bytes=0;}
}
export function mergeChunks(chunks){
  const es=new Map(),ss=new Map(),ps=new Map(),ts=new Map();
  for(const {geometry:g,schedule:s} of chunks){
    for(const [id,a,b] of g.edges)es.set(id,[a,b]);
    for(const [id,segments] of g.shapes){if(!ss.has(id))ss.set(id,new Map());for(const [k,ref,ds] of segments)ss.get(id).set(k,[ref,ds]);}
    const starts=new Map();
    for(const [id,p,first=0] of s.patterns){
      starts.set(id,first);
      if(!ps.has(id))ps.set(id,{p,stops:new Map()});
      for(let i=0;i<p[1].length;i++)ps.get(id).stops.set(first+i,[p[1][i],p[2][i],p[4]?.[i]??1]);
    }
    for(const [id,t] of s.trips){
      if(!ts.has(id))ts.set(id,{t,parts:[]});
      ts.get(id).parts.push([starts.get(t[3]),t[5]]);
    }
  }
  const points=[],edges=[],shapes=[],pointIds=new Map(),edgeIds=new Map(),shapeIds=new Map(),patternIds=new Map();
  const point=p=>{const key=p.join(',');if(!pointIds.has(key)){pointIds.set(key,points.length);points.push(p);}return pointIds.get(key);};
  for(const [id,[a,b]] of [...es].sort((a,b)=>a[0]-b[0])){edgeIds.set(id,edges.length);edges.push([point(a),point(b)]);}
  for(const [id,segs] of [...ss].sort((a,b)=>a[0]-b[0])){shapeIds.set(id,shapes.length);const entries=[...segs].sort((a,b)=>a[0]-b[0]);shapes.push([entries.map(([,v])=>(edgeIds.get(Math.abs(v[0])-1)+1)*Math.sign(v[0])),entries.map(([,v])=>v[1]),entries.map(([k])=>k)]);}
  const patterns=[...ps].sort((a,b)=>a[0]-b[0]).map(([id,{p,stops}])=>{patternIds.set(id,patternIds.size);const rows=[...stops].sort((a,b)=>a[0]-b[0]).map(([,v])=>v);const local=[shapeIds.get(p[0]),rows.map(v=>v[0]),rows.map(v=>v[1]),p[3]];if(rows.some(v=>v[2]!==1))local.push(rows.map(v=>v[2]));return local;});
  const trips=[...ts].sort((a,b)=>a[0]-b[0]).map(([,{t,parts}])=>{
    const stops=[...ps.get(t[3]).stops.keys()].sort((a,b)=>a-b),times=new Uint32Array(stops.length*2);
    for(const [first,values] of parts)for(let i=0;i<stops.length;i++){const j=stops[i]-first;if(j>=0&&j*2<values.length){times[i*2]=values[j*2];times[i*2+1]=values[j*2+1];}}
    return [...t.slice(0,3),patternIds.get(t[3]),t[4],times,...t.slice(6)];
  });
  return {geometry:{points,edges,shapes},schedule:{patterns,trips}};
}
