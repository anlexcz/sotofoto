export const timeFilterKey=f=>`${f.date}|${f.start}|${f.end}`;
export const roundedNow=seconds=>Math.max(0,Math.min(86100,Math.round(seconds/300)*300));
export function filterLightTime(filter,now){return filter.start===0&&filter.end===86400?filter.date===now.date?roundedNow(now.seconds):43200:filter.start;}
