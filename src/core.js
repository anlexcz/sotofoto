export const MODES = {0:'Tramvaj',1:'Metro',2:'Vlak',3:'Autobus',4:'Přívoz',7:'Lanovka',11:'Trolejbus'};
export const MODE_COLORS = {0:'#b42f4b',1:'#7460b7',2:'#2976ba',3:'#db8521',4:'#17999b',7:'#768633',11:'#26936a'};
export const DIRECTIONS = ['S','SV','V','JV','J','JZ','Z','SZ'];
export const norm = x => (x % 360 + 360) % 360;
export const angle = (a,b) => Math.abs((a-b+540)%360-180);
export const compass = b => DIRECTIONS[Math.round(norm(b)/45)%8];
export const clock = s => {s=Math.round(s);const n=((s%86400)+86400)%86400;return `${String(Math.floor(n/3600)).padStart(2,'0')}:${String(Math.floor(n%3600/60)).padStart(2,'0')}`;};
export const dateKey = date => date.replaceAll('-','');
export function addDays(key,n) {const d=new Date(`${key.slice(0,4)}-${key.slice(4,6)}-${key.slice(6,8)}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10).replaceAll('-','');}
export function activeServices(meta,key) {
  const d=new Date(`${key.slice(0,4)}-${key.slice(4,6)}-${key.slice(6,8)}T12:00:00Z`);
  const weekday=(d.getUTCDay()+6)%7;
  const active=new Set();
  meta.services.forEach((s,i)=>{if(s[0]<=key&&s[1]>=key&&s[weekday+2])active.add(i);});
  for(const [i,type] of meta.exceptions[key]||[]) {if(type===1)active.add(i);else active.delete(i);}
  return active;
}
export function dayContexts(meta,key,end=86400) {
  const result=[];
  for(const offset of [-1,0,...(end>86400?[1]:[])]) {
    const day=addDays(key,offset);
    if(day>=meta.startDate&&day<=meta.endDate)result.push({day,offset:offset*86400,active:activeServices(meta,day)});
  }
  return result;
}
export function timeRange(from,to) {const parse=v=>v.split(':').reduce((h,m)=>h*60+Number(m))*60;const a=parse(from),b=parse(to);return [a,b<=a?b+86400:b];}
export function bearing(a,b) {
  const rad=Math.PI/180,p=a[0]*rad,q=b[0]*rad,l=(b[1]-a[1])*rad;
  return norm(Math.atan2(Math.sin(l)*Math.cos(q),Math.cos(p)*Math.sin(q)-Math.sin(p)*Math.cos(q)*Math.cos(l))/rad);
}
export function project(point,a,b) {
  const c=Math.cos(point[0]*Math.PI/180),dx=(b[1]-a[1])*c,dy=b[0]-a[0],x=(point[1]-a[1])*c,y=point[0]-a[0];
  const f=Math.max(0,Math.min(1,(x*dx+y*dy)/(dx*dx+dy*dy||1)));
  return {f,distance:Math.hypot(x-f*dx,y-f*dy)*111195,lat:a[0]+f*(b[0]-a[0]),lon:a[1]+f*(b[1]-a[1])};
}
// Departure at the previous stop → arrival at the next stop; dwell is excluded.
export function interpolation(distances,d) {
  if(d<distances[0]-1e-5||d>distances.at(-1)+1e-5)return null;
  let lo=0,hi=distances.length-1;
  while(lo<hi){const m=Math.ceil((lo+hi)/2);if(distances[m]<=d)lo=m;else hi=m-1;}
  if(lo===distances.length-1)return {i:lo,f:0,atStop:true};
  const span=distances[lo+1]-distances[lo];
  return {i:lo,f:span>0?Math.max(0,Math.min(1,(d-distances[lo])/span)):0,atStop:Math.abs(d-distances[lo])<1e-6};
}
export function passageTime(times,pos) {
  if(pos.atStop||pos.i===times.length/2-1)return times[pos.i*2+1];
  return times[pos.i*2+1]+(times[(pos.i+1)*2]-times[pos.i*2+1])*pos.f;
}
// Convert a Prague wall clock to an instant, including CET/CEST changes.
const pragueFormatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export function pragueInstant(key,seconds) {
  const base=Date.UTC(+key.slice(0,4),+key.slice(4,6)-1,+key.slice(6,8))+seconds*1000;
  let result=base;
  const fmt=pragueFormatter;
  for(let i=0;i<3;i++){
    const p=Object.fromEntries(fmt.formatToParts(new Date(result)).map(x=>[x.type,x.value]));
    const wall=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
    result+=base-wall;
  }
  return new Date(result);
}
// Solar coordinates following the standard low-order solar ephemeris.
export function sunPosition(date,lat,lon) {
  const rad=Math.PI/180,d=date.getTime()/86400000-10957.5;
  const M=rad*(357.5291+0.98560028*d);
  const C=rad*(1.9148*Math.sin(M)+0.02*Math.sin(2*M)+0.0003*Math.sin(3*M));
  const L=M+C+rad*102.9372+Math.PI,e=rad*23.4397;
  const dec=Math.asin(Math.sin(L)*Math.sin(e)),ra=Math.atan2(Math.sin(L)*Math.cos(e),Math.cos(L));
  const H=rad*(280.16+360.9856235*d+lon)-ra,p=rad*lat;
  const altitude=Math.asin(Math.sin(p)*Math.sin(dec)+Math.cos(p)*Math.cos(dec)*Math.cos(H))/rad;
  const azimuth=norm(Math.atan2(Math.sin(H),Math.cos(H)*Math.sin(p)-Math.tan(dec)*Math.cos(p))/rad+180);
  return {azimuth,altitude};
}
export function photoLight(sun,travel,view='front') {
  if(sun.altitude<=0)return {score:0,label:'Slunce pod obzorem',level:'night'};
  const front=Math.cos(angle(sun.azimuth,travel)*Math.PI/180);
  const side=view==='left'?norm(travel-90):norm(travel+90);
  let score=view==='front'?Math.max(0,front):Math.max(0,Math.min(front,Math.cos(angle(sun.azimuth,side)*Math.PI/180)))*Math.SQRT2;
  if(sun.altitude<5)score*=0.6;
  if(sun.altitude>55)score*=0.75;
  return {score,label:score>=0.65?'Příznivý směr světla':score>=0.3?'Boční / šikmé světlo':'Protislunce nebo neosvětlená strana',level:score>=0.65?'good':score>=0.3?'okay':'bad'};
}

// Fixed photographic scale: front-lit → side-lit → back-lit. No side selector.
export function photographyLight(sun,travel) {
  if(sun.altitude<=0)return {score:0,color:'#8c959d',level:'night',label:'Slunce pod obzorem',difference:null};
  const difference=angle(sun.azimuth,travel);
  const stops=[[0,[35,164,85]],[45,[206,181,37]],[85,[244,132,31]],[90,[240,117,31]],[98,[219,61,49]],[180,[190,43,48]]];
  let i=1;while(i<stops.length-1&&difference>stops[i][0])i++;
  const [a,ca]=stops[i-1],[b,cb]=stops[i],f=(difference-a)/(b-a);
  const color='#'+ca.map((v,j)=>Math.round(v+(cb[j]-v)*f).toString(16).padStart(2,'0')).join('');
  return {score:Math.max(0,1-difference/100),color,difference,level:difference<=50?'good':difference<=90?'okay':'bad',label:difference<=50?'Světlo na čelo':difference<=90?'Šikmé / boční světlo':'Světlo zezadu / protislunce'};
}

// Apparent sunrise/sunset (centre altitude -0.833°), in Prague wall-clock seconds.
export function daylightTimes(key,lat,lon) {
  const threshold=-.833;
  const altitude=s=>sunPosition(pragueInstant(key,s),lat,lon).altitude-threshold;
  let sunrise=null,sunset=null,previous=altitude(0);
  for(let seconds=600;seconds<=86400;seconds+=600){
    const current=altitude(seconds);
    if((previous<0&&current>=0)||(previous>=0&&current<0)){
      const rising=current>previous;let a=seconds-600,b=seconds;
      for(let i=0;i<18;i++){const mid=(a+b)/2;if((altitude(mid)>=0)===rising)b=mid;else a=mid;}
      if(rising)sunrise=(a+b)/2;else sunset=(a+b)/2;
    }
    previous=current;
  }
  return {sunrise,sunset,min:sunrise===null?0:Math.max(0,Math.floor((sunrise-3600)/300)*300),max:sunset===null?86400:Math.min(86400,Math.ceil((sunset+3600)/300)*300)};
}
