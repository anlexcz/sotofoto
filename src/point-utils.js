// Helpers shared by the point panel and meaningful regression tests.
export const civilClock=s=>{const m=Math.floor(((s%86400)+86400)%86400/60);return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;};
export function pageEnd(rows,start,from){
 if(start>=rows.length)return start;
 const windowEnd=from+7200,extendedEnd=from+21600;
 let end=start;while(end<rows.length&&end-start<50&&rows[end].time<windowEnd)end++;
 if(end-start<10)while(end<rows.length&&end-start<50&&rows[end].time<extendedEnd)end++;
 return Math.max(end,Math.min(rows.length,start+1));
}
// Merge occupied five-minute bins, permitting at most a fifteen-minute gap.
// Rank by actual useful passages, then by useful share and shorter duration.
export function photoWindows(rows){
 rows=rows.filter(r=>r.light.level!=='unrated');
 const bins=new Map();for(const r of rows){if(r.time<0||r.time>=86400||r.light.level!=='good')continue;const b=Math.floor(r.time/300);bins.set(b,(bins.get(b)||0)+1);}
 const groups=[];for(const b of [...bins.keys()].sort((a,b)=>a-b)){const last=groups.at(-1);if(last&&b-last.at(-1)<=3)last.push(b);else groups.push([b]);}
 return groups.map(g=>{const start=g[0]*300,end=(g.at(-1)+1)*300,good=g.reduce((n,b)=>n+bins.get(b),0),all=rows.filter(r=>r.time>=start&&r.time<end).length;return {start,end,good,all};}).sort((a,b)=>b.good-a.good||b.good/b.all-a.good/a.all||(a.end-a.start)-(b.end-b.start));
}
export const visibilityLabel=v=>v==null?'—':v<1000?`${Math.round(v/10)*10} m`:`${(v/1000).toLocaleString('cs',{maximumFractionDigits:1})} km`;
