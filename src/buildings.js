import {ChunkCache,selectChunks} from './chunks.js';
const SAMPLES=72,RECORD=8+SAMPLES*7;
export function decodeBuildings(buffer){
 const view=new DataView(buffer);if(buffer.byteLength<8||new TextDecoder().decode(new Uint8Array(buffer,0,4))!=='SFB1')throw Error('Poškozený building chunk');
 const count=view.getUint32(4,true);if(buffer.byteLength!==8+count*RECORD)throw Error('Poškozená délka building chunku');
 const rows=new Map();
 for(let i=0;i<count;i++){
  const offset=8+i*RECORD,key=`${view.getInt32(offset,true)},${view.getInt32(offset+4,true)}`;
  if(rows.has(key))throw Error('Duplicitní building profil');
  // Record length is aligned to two bytes. Typed views retain a single buffer.
  const exact=new Uint16Array(buffer,offset+8,SAMPLES),estimated=new Uint16Array(buffer,offset+8+SAMPLES*2,SAMPLES),upper=new Uint16Array(buffer,offset+8+SAMPLES*4,SAMPLES),flags=new Uint8Array(buffer,offset+8+SAMPLES*6,SAMPLES);
  if(exact.some((v,k)=>v>900||v>upper[k])||estimated.some((v,k)=>v>900||v>upper[k])||upper.some(v=>v>900)||flags.some(v=>v>7))throw Error('Neplatný building horizont');
  rows.set(key,{exact,estimated,upper,flags});
 }
 return {rows,buffer};
}
export async function buildingFile(url){const r=await fetch(url);if(!r.ok)throw Error(`Budovy: HTTP ${r.status}`);return decodeBuildings(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());}
const EMPTY=Object.freeze({empty:true});
export async function fetchBuildingIndex(){const r=await fetch('data/building-index.json.gz',{cache:'no-cache'});if(!r.ok)throw Error('Zástavba není dostupná');return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json();}
export class BuildingLoader{
 constructor({layer='map',manifest=fetchBuildingIndex,load=buildingFile,maxBytes=4*1024*1024,maxEntries=16,maxActiveBytes=8*1024*1024}={}){
  this.layer=layer;this.manifestLoad=manifest;this.fileLoad=load;this.maxActiveBytes=maxActiveBytes;this.active=new Map();this.generation=0;this.error=false;
  this.cache=new ChunkCache(id=>this.fileLoad('data/'+this.index.chunks[id].path),{maxBytes,maxEntries});
 }
 async ensureIndex(){
  if(!this.pending)this.pending=this.manifestLoad().then(root=>{const index=this.layer==='detail'?root.detail:root;if(!index)throw Error('Jemný detail zástavby není dostupný');if(index.version!==1||index.step!==5||index.cell?.length!==2||!index.cell.every(v=>Number.isFinite(v)&&v>0)||!Number.isFinite(index.model?.tile)||index.model.tile<=0||!index.chunks)throw Error('Nepodporovaný building index');this.index=index;return index;}).catch(e=>{this.pending=null;throw e;});
  return this.pending;
 }
 async update(bounds,{enabled=false,point=null}={}){
  const token=++this.generation;
  if(!enabled&&!point){this.active.clear();return false;}
  this.error=false;
  try{
   await this.ensureIndex();if(token!==this.generation)return false;
   const ids=new Set();if(point){const cell=this.index.cell,y=Math.floor(point[0]/cell[0]+.5),x=Math.floor(point[1]/cell[1]+.5),tile=this.index.model.tile,id=`${Math.floor(y*cell[0]/tile+1e-9)}:${Math.floor(x*cell[1]/tile+1e-9)}`;if(this.index.chunks[id])ids.add(id);for(const id of selectChunks(this.index,[point[0]-.0007,point[1]-.001,point[0]+.0007,point[1]+.001]))ids.add(id);}
   if(enabled){const cy=(bounds[0]+bounds[2])/2,cx=(bounds[1]+bounds[3])/2,distance=id=>{const b=this.index.chunks[id].bounds;return ((b[0]+b[2])/2-cy)**2+(((b[1]+b[3])/2-cx)*.64)**2;};for(const id of selectChunks(this.index,bounds).sort((a,b)=>distance(a)-distance(b)))ids.add(id);}
   const next=new Map();let bytes=0;this.omitted=0;this.selected=ids.size;
   // Detail is prioritised; wide view gracefully shows unverified omitted cells.
   for(const id of ids){
    if(token!==this.generation)return false;const c=this.index.chunks[id];
    if(c.status==='empty'){next.set(id,EMPTY);continue;}
    if(c.status!=='profiles'||!Number.isFinite(c.bytes)||c.bytes<=0||bytes+c.bytes>this.maxActiveBytes){this.omitted++;continue;}
    try{const value=await this.cache.get(id,c.bytes);next.set(id,value);bytes+=c.bytes;}
    catch{this.error=true;}
   }
   if(token!==this.generation)return false;this.active=next;return true;
  }catch{if(token===this.generation){this.active.clear();this.error=true;}return token===this.generation;}
 }
 at(lat,lon){
  if(!this.index)return null;
  const cell=this.index.cell,y=Math.floor(lat/cell[0]+.5),x=Math.floor(lon/cell[1]+.5);
  const tile=this.index.model.tile,id=`${Math.floor(y*cell[0]/tile+1e-9)}:${Math.floor(x*cell[1]/tile+1e-9)}`,chunk=this.active.get(id);
  if(!chunk)return null;if(chunk.empty)return EMPTY;return chunk.rows.get(`${y},${x}`)??null;
 }
}
// Profiles are sector envelopes, not point samples. Interpolating a thin building
// away would create false clear sunlight. Terrain remains linearly interpolated.
export function buildingAt(sun,profile){
 if(!profile)return {state:'unknown',quality:'unknown',reason:'missing'};
 if(profile.empty)return {state:'clear',quality:'exact',horizon:0,upper:0};
 const k=Math.floor(((sun.azimuth%360)+360)%360/5),exact=profile.exact[k]/10,estimated=profile.estimated[k]/10,upper=profile.upper[k]/10,flags=profile.flags[k];
 if(sun.altitude<=exact&&exact>0)return {state:'blocked',quality:'exact',horizon:exact,upper};
 if(sun.altitude<=estimated&&estimated>0)return {state:'blocked',quality:'estimated',horizon:estimated,upper};
 if(flags&4)return {state:'unknown',quality:'unknown',horizon:Math.max(exact,estimated),upper,reason:'structure'};
 if(flags&1)return {state:'unknown',quality:'unknown',horizon:Math.max(exact,estimated),upper,reason:'height'};
 if(sun.altitude<=upper)return {state:'unknown',quality:flags&2?'estimated':'exact',horizon:Math.max(exact,estimated),upper,reason:'position'};
 return {state:'clear',quality:flags&2?'estimated':'exact',horizon:Math.max(exact,estimated),upper};
}
