import {bearing} from './core.js';
import {matchesOperation} from './filter-utils.js';
export const COUNT_FIELDS=['surfaceForward','surfaceBackward','regularCounts','regularForward','regularBackward','categories','forwardCategories','backwardCategories','counts','forward','backward','colors','agencyColors'];
const swap={surfaceForward:'surfaceBackward',surfaceBackward:'surfaceForward',regularForward:'regularBackward',regularBackward:'regularForward',forwardCategories:'backwardCategories',backwardCategories:'forwardCategories',forward:'backward',backward:'forward'};
export const geometryLevel=zoom=>zoom<=9?'regional':zoom<=11?'overview':zoom<=14?'medium':'detail';
export const intersects=(a,b,[s,w,n,e])=>Math.max(a[0],b[0])>=s&&Math.min(a[0],b[0])<=n&&Math.max(a[1],b[1])>=w&&Math.min(a[1],b[1])<=e;
const typed=(f,n)=>f.includes('Categories')||f==='categories'?new Uint8Array(n):f==='colors'||f==='agencyColors'?new Int32Array(n):new Uint32Array(n);

// Merge only equal dynamic results; keep every count boundary and source sample.
export function renderView(raw,zoom,bounds=null){
 const level=geometryLevel(zoom),g=raw.geometry,lookup=new Map(g.ids.map((id,i)=>[id,i])),used=new Set(),rows=[];
 const value=(i,f,sign)=>raw[sign<0?(swap[f]||f):f][i];
 const key=(i,sign)=>COUNT_FIELDS.map(f=>value(i,f,sign)).join(',')+'|'+JSON.stringify(raw.routeCounts[i]||{})+'|'+JSON.stringify(raw.edgeRoutes[i]||[])+'|'+JSON.stringify(raw.edgeAgencies[i]||[]);
 const source=(i,sign)=>{const [a,b]=g.edges[i],p=g.points[a],q=g.points[b];return [(p[0]+q[0])/2,(p[1]+q[1])/2,(bearing(p,q)+(sign<0?180:0))%360];};
 const emit=(a,b,members)=>{
   if(bounds&&!intersects(a,b,bounds))return;
   const [i,sign]=members[0];if(!raw.counts[i])return;
   rows.push({a,b,i,sign,samples:members.map(([i,s])=>source(i,s)),members:members.map(([i])=>g.ids[i])});
 };
 for(const [a,b,refs] of g.display||[]){
   const members=refs.map(ref=>[lookup.get(Math.abs(ref)-1),Math.sign(ref)]);
   if(members.some(([i])=>i===undefined))continue;
   const first=key(...members[0]);
   if(members.every(([i,s])=>!used.has(i)&&key(i,s)===first)){
     members.forEach(([i])=>used.add(i));emit(a,b,members);
   }else {
     // Split only at changed values or already-covered edges. Preserve source
     // samples, but simplify each remaining equal-valued run independently.
     let run=[],signature;
     const flush=()=>{
       if(!run.length)return;
       const points=run.map(([i,s])=>g.points[g.edges[i][s>0?0:1]]);
       const [i,s]=run.at(-1);points.push(g.points[g.edges[i][s>0?1:0]]);
       const tolerance=level==='detail'?0:1.5*156543.03392*Math.cos(points[0][0]*Math.PI/180)/2**zoom;
       const keep=new Set(level==='detail'?points.map((_,i)=>i):[0,points.length-1]),stack=[[0,points.length-1]];
       while(stack.length){const [a,b]=stack.pop();if(b<=a+1)continue;const c=Math.cos(points[a][0]*Math.PI/180),dx=(points[b][1]-points[a][1])*c,dy=points[b][0]-points[a][0],den=dx*dx+dy*dy;let max=0,k=a;
         for(let j=a+1;j<b;j++){const x=(points[j][1]-points[a][1])*c,y=points[j][0]-points[a][0],f=den?Math.max(0,Math.min(1,(x*dx+y*dy)/den)):0,d=Math.hypot(x-f*dx,y-f*dy)*111195;if(d>max){max=d;k=j;}}
         if(max>tolerance){keep.add(k);stack.push([a,k],[k,b]);}
       }
       const indices=[...keep].sort((a,b)=>a-b);for(let j=1;j<indices.length;j++)emit(points[indices[j-1]],points[indices[j]],run.slice(indices[j-1],indices[j]));run=[];
     };
     for(const member of members){const [i,s]=member,next=key(i,s);if(used.has(i)){flush();signature=undefined;continue;}if(run.length&&next!==signature)flush();signature=next;used.add(i);run.push(member);}flush();
   }
 }
 for(let i=0;i<g.edges.length;i++)if(!used.has(i)){const [a,b]=g.edges[i];emit(g.points[a],g.points[b],[[i,1]]);}
 const result={journeys:raw.journeys,routeCounts:{},edgeRoutes:{},edgeAgencies:{},preliminary:false,level},points=[],edges=[],pointIds=new Map(),samples=[],sampleOffsets=[0],memberIds=[];
 const point=p=>{const k=p.join(',');if(!pointIds.has(k)){pointIds.set(k,points.length);points.push(p);}return pointIds.get(k);};
 for(const f of COUNT_FIELDS)result[f]=typed(f,rows.length);
 rows.forEach((r,k)=>{edges.push([point(r.a),point(r.b)]);for(const f of COUNT_FIELDS)result[f][k]=value(r.i,f,r.sign);for(const f of ['routeCounts','edgeRoutes','edgeAgencies'])if(raw[f][r.i])result[f][k]=raw[f][r.i];samples.push(...r.samples.flat());sampleOffsets.push(samples.length/3);memberIds.push(r.members);});
 result.geometry={points,edges,samples:new Float64Array(samples),sampleOffsets:new Uint32Array(sampleOffsets)};
 // Test/report provenance; not transferred to UI.
 Object.defineProperty(result,'memberIds',{value:memberIds});
 return result;
}

// Static identities are only a preview: service-day/time/direction activity must
// be confirmed by the precise worker. Never invent frequency from this stage.
export function previewView(chunks,meta,filter,zoom,bounds){
 const rows=[],used=new Set();
 for(const chunk of chunks)for(const [a,b,refs,attrs] of chunk.segments){
   if(!intersects(a,b,bounds)||refs.every(r=>used.has(Math.abs(r)-1)))continue;
   const matching=attrs.filter(([r,agency])=>(!filter.routes.length||filter.routes.includes(r))&&(!filter.agencies.length||filter.agencies.includes(agency))&&(!filter.modes.length||filter.modes.includes(meta.routes[r][3]))&&matchesOperation(meta.routes[r],filter.operation));
   if(!matching.length)continue;
   refs.forEach(r=>used.add(Math.abs(r)-1));rows.push({a,b,matching});
 }
 const raw={geometry:{points:[],edges:[]},preliminary:true,level:geometryLevel(zoom),journeys:null,routeCounts:{},edgeRoutes:{},edgeAgencies:{}};
 for(const f of COUNT_FIELDS)raw[f]=typed(f,rows.length);
 rows.forEach(({a,b,matching},i)=>{
   raw.geometry.points.push(a,b);raw.geometry.edges.push([i*2,i*2+1]);raw.counts[i]=1;raw.categories[i]=6;raw.forwardCategories[i]=raw.backwardCategories[i]=6;
   raw.colors[i]=matching[0][0];raw.agencyColors[i]=matching[0][1];raw.edgeRoutes[i]=[...new Set(matching.map(v=>v[0]))];raw.edgeAgencies[i]=[...new Set(matching.map(v=>v[1]))];raw.routeCounts[i]=Object.fromEntries(raw.edgeRoutes[i].map(r=>[r,1]));
   raw.forward[i]=Number(matching.some(v=>v[2]>0));raw.backward[i]=Number(matching.some(v=>v[2]<0));
 });
 return raw;
}
