// Public place links have their own small, versioned schema, not serialized UI.
const locationFields=['center','zoom','point','routes','agencies','modes','directions','operation'];
const planFields=['date','from','to','mapAllDay','pointMode','pointStart','photoMode','photoSeconds'];
export function encodeLink(state,kind='place'){
 const p=new URLSearchParams({v:'2',kind});
 for(const key of [...locationFields,...(kind==='plan'?planFields:[])]){
  const value=state[key];if(value==null||Array.isArray(value)&&!value.length||key==='operation'&&value==='all')continue;
  p.set(key,JSON.stringify(value));
 }
 return '#'+p.toString();
}
export function decodeLink(hash){
 try{
  const raw=hash.replace(/^#/,''),p=new URLSearchParams(raw);
  if(p.get('v')!=='2')return JSON.parse(decodeURIComponent(raw));
  const s={mapAllDay:true};
  for(const key of [...locationFields,...(p.get('kind')==='plan'?planFields:[])])if(p.has(key)){try{s[key]=JSON.parse(p.get(key));}catch{/* ignore a malformed optional field */}}
  return s;
 }catch{return {};}
}
export function mapyLink(point,zoom=16){const [lat,lon]=point;return `https://mapy.com/fnc/v1/showmap?center=${lon},${lat}&zoom=${Math.max(1,Math.min(19,zoom))}&marker=true`;}
