// Categories run from most frequent (0) to least frequent (5).
const LIMITS=[5,10,30,60,120];
export const FREQUENCY_LABELS=['do 5 min','5–10 min','10–30 min','30–60 min','1–2 h','méně často'];
export const FREQUENCY_WIDTHS=[6,4.8,3.6,2.6,1.7,.9];
export const frequencyColor=category=>`hsl(${category*32} 70% 42%)`;
export function frequency(count,first,last,filter){
  if(!count)return {interval:null,category:5};
  if(count===1)return {interval:null,category:5};
  const period=filter.allDay?last-first:filter.end-filter.start;
  const interval=period/60/count;
  const category=LIMITS.findIndex(limit=>interval<=limit);
  return {interval,category:category<0?5:category};
}
