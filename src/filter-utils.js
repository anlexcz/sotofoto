export const normalize=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(s\.?\s*r\.?\s*o\.?|a\.?\s*s\.?)\s*$/,'').trim();
export function queryTokens(query,numeric=false){const q=query.trim();return numeric&&/^[\d\s,;]+$/.test(q)?q.split(/[\s,;]+/).filter(Boolean):q.split(/[,;\n]+/).map(normalize).filter(Boolean);}
export function matchesQuery(short,long,tokens,numeric=false){return !tokens.length||tokens.some(t=>numeric&&/^\d+$/.test(t)?normalize(short)===t:normalize(`${short} ${long}`).includes(t));}
export function interval(from,to,allDay){if(allDay)return [0,86400];const sec=v=>v.split(':').reduce((h,m)=>+h*3600 + +m*60);const start=sec(from),end=sec(to);return [start,end<=start?end+86400:end];}

export const operationValue=value=>['day','night','none'].includes(value)?value:'all';
export function matchesOperation(route,value){const operation=operationValue(value);return operation==='all'||operation!=='none'&&(operation==='night'?route[5]===1:route[5]===0);}

export function toggleOperation(value,type){const current=operationValue(value);const day=current==='all'||current==='day',night=current==='all'||current==='night';const nextDay=type==='day'?!day:day,nextNight=type==='night'?!night:night;return nextDay?(nextNight?'all':'day'):(nextNight?'night':'none');}
