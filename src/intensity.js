// Categories run from most frequent (0) to least frequent (6).
const LIMITS=[2,5,10,20,40,90];
export const FREQUENCY_LABELS=['do 2 min','2–5 min','5–10 min','10–20 min','20–40 min','40–90 min','méně často'];
export const FREQUENCY_WIDTHS=[6,5.1,4.2,3.3,2.5,1.6,.9];
export const frequencyColor=category=>`hsl(${category*160/6} 70% 42%)`;

// Inputs are sorted civil-day seconds. Merge directions without sorting a third
// copy. Duplicates remain passages but do not lengthen the operating period.
export function circularPeriod(a,b=[]){
  if(a.length+b.length<2)return 0;
  let i=0,j=0,first,last,gap=0;
  while(i<a.length||j<b.length){
    const time=j>=b.length||i<a.length&&a[i]<=b[j]?a[i++]:b[j++];
    if(first===undefined)first=time;
    else gap=Math.max(gap,time-last);
    last=time;
  }
  return 86400-Math.max(gap,first+86400-last);
}
export function frequency(count,period){
  if(count<2)return {interval:null,category:6};
  const interval=period/60/count;
  const category=LIMITS.findIndex(limit=>interval<=limit);
  return {interval,category:category<0?6:category};
}
