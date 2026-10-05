export const normalize=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(s\.?\s*r\.?\s*o\.?|a\.?\s*s\.?)\s*$/,'').trim();
export function queryTokens(query,numeric=false){const q=query.trim();return numeric&&/^[\d\s,;]+$/.test(q)?q.split(/[\s,;]+/).filter(Boolean):q.split(/[,;\n]+/).map(normalize).filter(Boolean);}
export function matchesQuery(short,long,tokens,numeric=false){return !tokens.length||tokens.some(t=>numeric&&/^\d+$/.test(t)?normalize(short)===t:normalize(`${short} ${long}`).includes(t));}
export function interval(from,to,allDay){if(allDay)return [0,86400];const sec=v=>v.split(':').reduce((h,m)=>+h*3600 + +m*60);const start=sec(from),end=sec(to);return [start,end<=start?end+86400:end];}
