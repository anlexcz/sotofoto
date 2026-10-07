import {ChunkCache,selectChunks,zipped} from './chunks.js?v=http-cache-2';

export async function terrainManifest(){
  const r=await fetch('data/terrain-index.json',{cache:'no-cache'});
  if(!r.ok)throw Error(`Terrain manifest: HTTP ${r.status}`);
  const m=await r.json();
  if(m.version!==1||m.cell?.[0]!==.002||m.cell?.[1]!==.004||!m.chunks)throw Error('Unsupported terrain manifest');
  for(const c of Object.values(m.chunks))if(!/^terrain\/\d+_\d+\.[a-f0-9]{16}\.json\.gz$/.test(c.path)||!Array.isArray(c.bounds)||c.bounds.length!==4||!c.bounds.every(Number.isFinite)||!Number.isFinite(c.bytes)||c.bytes<0)throw Error('Invalid terrain chunk');
  return m;
}

// Current-view references are separate from the small decoded LRU. Paths, never
// square IDs, identify immutable contents, including requests still in flight.
export class TerrainStore {
  constructor({manifest=terrainManifest,chunk=path=>zipped('data/'+path),onChange=()=>{},maxBytes=4*1024*1024,maxEntries=16}={}){
    this.fetchManifest=manifest;this.onChange=onChange;
    this.cache=new ChunkCache(async path=>{
      const rows=await chunk(path);
      if(!Array.isArray(rows)||rows.some(r=>!Array.isArray(r)||r.length!==3||!Array.isArray(r[0])||r[0].length!==2||!r[0].every(Number.isInteger)||!Array.isArray(r[1])||r[1].length!==72||!r[1].every(h=>Number.isInteger(h)&&h>=0&&h<=900)||![0,1].includes(r[2])))throw Error('Invalid terrain profiles');
      return rows;
    },{maxBytes,maxEntries});
    this.manifest=null;this.signature='';this.pendingManifest=null;
    this.active=new Map();this.profiles=new Map();this.errors=new Set();this.loading=new Set();
    this.generation=0;this.manifestError=false;this.request=null;this.inflight=0;this.waiters=[];
  }
  notify(){this.onChange();}
  release(){if(this.waiters.length)this.waiters.shift()();else --this.inflight;}
  async refresh(){
    if(this.pendingManifest)return this.pendingManifest;
    this.pendingManifest=(async()=>{
      try{
        const m=await this.fetchManifest();
        const signature=JSON.stringify([m.dataset?.id,Object.entries(m.chunks).map(([id,c])=>[id,c.path,c.bounds,c.bytes])]);
        const changed=signature!==this.signature;
        if(changed){++this.generation;this.active.clear();this.profiles.clear();this.errors.clear();this.loading.clear();this.manifest=m;this.signature=signature;}
        this.manifestError=false;this.notify();return changed;
      }catch(e){this.manifestError=true;this.notify();throw e;}
    })().finally(()=>{this.pendingManifest=null;});
    return this.pendingManifest;
  }
  cancel(){++this.generation;this.request=null;this.loading.clear();this.active.clear();this.profiles.clear();this.errors.clear();}
  selection(bounds,point){
    const ids=new Set(selectChunks(this.manifest,bounds));
    if(point)for(const id of selectChunks(this.manifest,[point[0]-.003,point[1]-.005,point[0]+.003,point[1]+.005]))ids.add(id);
    return [...ids].map(id=>this.manifest.chunks[id]);
  }
  async load(bounds,point=null,{revalidate=false,recover=true}={}){
    this.request={bounds,point};
    const request=this.request;
    if(!this.manifest||revalidate){try{await this.refresh();}catch{return;}if(request!==this.request)return;}
    const token=++this.generation,selected=this.selection(bounds,point),paths=new Set(selected.map(c=>c.path));
    for(const [path,rows] of this.active)if(!paths.has(path)){for(const [key] of rows)this.profiles.delete(key.join(','));this.active.delete(path);}
    this.errors.clear();this.loading=new Set(selected.filter(c=>!this.active.has(c.path)).map(c=>c.path));this.notify();
    let cursor=0,failed=false;
    // Two decoders at most; obsolete consumers stop scheduling, not caching.
    const run=async()=>{while(cursor<selected.length&&token===this.generation){
      const c=selected[cursor++];if(this.active.has(c.path))continue;
      if(this.inflight>=2)await new Promise(resolve=>this.waiters.push(resolve));else ++this.inflight;
      if(token!==this.generation){this.release();return;}
      try{const rows=await this.cache.get(c.path,c.bytes);if(token!==this.generation)return;this.active.set(c.path,rows);for(const row of rows)this.profiles.set(row[0].join(','),row);}
      catch{if(token!==this.generation)return;this.errors.add(c.path);failed=true;}
      finally{this.release();}
      this.loading.delete(c.path);
    }};
    await Promise.all([run(),run()]);if(token!==this.generation)return;
    this.notify();
    if(failed&&recover){
      try{const changed=await this.refresh();if(request!==this.request)return;if(changed)await this.load(bounds,point,{recover:false});}catch{/* Keep explicit failure; next activation can retry. */}
    }
  }
  at(lat,lon){
    const key=`${Math.round(lat/.002)},${Math.round(lon/.004)}`;
    const row=this.profiles.get(key);if(row)return {state:row[2]?'ready':'unverified',profile:row[2]?row[1]:null};
    if(this.manifestError)return {state:'error',profile:null};
    if(!this.manifest)return {state:'loading',profile:null};
    const y=Math.round(lat/.002)*.002,x=Math.round(lon/.004)*.004;
    const chunks=selectChunks(this.manifest,[y,x,y,x]).map(id=>this.manifest.chunks[id]);
    const state=chunks.some(c=>this.errors.has(c.path))?'error':chunks.some(c=>this.loading.has(c.path))?'loading':'unverified';
    return {state,profile:null};
  }
  get state(){return this.manifestError||this.errors.size?'error':!this.manifest||this.loading.size?'loading':'ready';}
}

export function terrainStatus(state,profile,sun,horizon,shadow){
  if(state==='error')return 'Terén se nepodařilo načíst — stíny nejsou ověřené.';
  if(state==='loading')return 'Načítám terénní obzory…';
  if(!profile)return 'Terén v tomto bodě není ověřený.';
  if(sun.altitude<=0)return 'Slunce pod obzorem.';
  return shadow?`Stín terénu · slunce ${sun.altitude.toFixed(1)}°, obzor ${horizon.toFixed(1)}°.`:`Slunce nad terénem · obzor ${horizon.toFixed(1)}°.`;
}
