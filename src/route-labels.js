// Frequencies belong to one edge, never to the sum of adjacent shape segments.
export function mainRoutes(frequencies,meta,explicit=false){
 const rows=Object.entries(frequencies||{}).map(([id,count])=>({id:+id,count})).filter(r=>r.count>0);
 const max=Math.max(0,...rows.map(r=>r.count));
 return rows.filter(r=>explicit||max<10||r.count>=max*.1).sort((a,b)=>b.count-a.count||meta.routes[a.id][1].localeCompare(meta.routes[b.id][1],'cs',{numeric:true})||a.id-b.id);
}
export function labelChains(edges,frequencies,meta,explicit=false){
 const groups=new Map();
 for(const [id,f] of Object.entries(frequencies||{})){const rows=mainRoutes(f,meta,explicit);if(!rows.length)continue;const key=rows.map(r=>r.id).sort((a,b)=>a-b).join(',');let g=groups.get(key);if(!g)groups.set(key,g={members:[],nodes:new Map()});const e=+id;g.members.push(e);for(const n of edges[e]){if(!g.nodes.has(n))g.nodes.set(n,[]);g.nodes.get(n).push(e);}}
 const chains=[];
 for(const g of groups.values()){
  const used=new Set();
  const walk=(first,node)=>{const path=[node],ids=[];let e=first;while(e!==undefined&&!used.has(e)){used.add(e);ids.push(e);node=edges[e][0]===node?edges[e][1]:edges[e][0];path.push(node);const next=g.nodes.get(node);if(next.length!==2)break;e=next.find(i=>!used.has(i));}if(ids.length)chains.push({nodes:path,edges:ids});};
  for(const [n,ids] of g.nodes)if(ids.length!==2)for(const e of ids)if(!used.has(e))walk(e,n);
  for(const e of g.members)if(!used.has(e))walk(e,edges[e][0]);
 }
 return chains;
}
// Locate evenly spaced labels along the actual projected path, including bends.
export function chainSamples(points,spacing=280){
 const lengths=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y)),total=lengths.reduce((a,b)=>a+b,0);if(!total)return [];
 const targets=[total/2];for(let d=spacing;d<total/2;d+=spacing)targets.push(total/2-d,total/2+d);
 return targets.map(t=>{let segment=0;while(segment<lengths.length-1&&t>lengths[segment])t-=lengths[segment++];const f=lengths[segment]?t/lengths[segment]:0,a=points[segment],b=points[segment+1];return {x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,segment,f};});
}
