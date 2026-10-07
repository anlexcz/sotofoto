import {sunPosition,bearing,photographyLight} from './core.js';
import {terrainLight} from './environment.js';
import {METRO_LIGHT,edgeLight} from './photo-light.js';
// Exact coordinate keys; one instant only. Bounded by current view's source samples.
export class MapLightCache {
 constructor(){this.instant=null;this.suns=new Map();}
 sun(instant,lat,lon){const stamp=instant.getTime();if(stamp!==this.instant){this.instant=stamp;this.suns.clear();}const key=lat+','+lon;if(!this.suns.has(key))this.suns.set(key,sunPosition(instant,lat,lon));return this.suns.get(key);}
 clear(){this.instant=null;this.suns.clear();}
}
export function mapEdgeLight(g,result,i,instant,getSun,getProfile){
 if(result.preliminary)return {forward:'#88999b',backward:'#88999b',combined:'#88999b'};
 const f=result.surfaceForward[i],b=result.surfaceBackward[i];
 if(!f&&!b)return {forward:METRO_LIGHT.color,backward:METRO_LIGHT.color,combined:METRO_LIGHT.color};
 const start=g.samples?g.sampleOffsets[i]:0,end=g.samples?g.sampleOffsets[i+1]:1;
 let fallback;
 if(!g.samples){const [u,v]=g.edges[i],a=g.points[u],c=g.points[v];fallback=[(a[0]+c[0])/2,(a[1]+c[1])/2,bearing(a,c)];}
 if(end-start===1){const lat=g.samples?g.samples[start*3]:fallback[0],lon=g.samples?g.samples[start*3+1]:fallback[1],angle=g.samples?g.samples[start*3+2]:fallback[2];return edgeLight(f,b,()=>getSun(instant,lat,lon),()=>getProfile(lat,lon),angle);}
 let forward,backward,combined;
 const worse=(a,b)=>!a||b.score<a.score||b.score===a.score&&b.shadow&&!a.shadow?b:a;
 for(let k=start;k<end;k++){
   const lat=g.samples[k*3],lon=g.samples[k*3+1],angle=g.samples[k*3+2];
   const sun=getSun(instant,lat,lon),shadow=terrainLight(sun,getProfile(lat,lon));
   const assess=angle=>{const light=photographyLight(sun,angle);return shadow?{...light,score:0,color:'#8c959d',shadow:true}:light;};
   const fl=f?assess(angle):METRO_LIGHT,bl=b?assess((angle+180)%360):METRO_LIGHT;
   forward=worse(forward,fl);backward=worse(backward,bl);
   combined=worse(combined,f&&b?(fl.score>=bl.score?fl:bl):f?fl:bl);
 }
 return {forward:forward.color,backward:backward.color,combined:combined.color,forwardScore:forward.score,backwardScore:backward.score};
}
