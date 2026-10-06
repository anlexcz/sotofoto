// Categories run from most frequent (0) to least frequent (6).
const LIMITS=[2,5,10,20,40,90];
export const FREQUENCY_LABELS=['do 2 min','2–5 min','5–10 min','10–20 min','20–40 min','40–90 min','méně často'];
export const FREQUENCY_WIDTHS=[6,5.1,4.2,3.3,2.5,1.6,.9];
export const frequencyColor=category=>`hsl(${category*160/6} 70% 42%)`;

// A comparison baseline, not a 05:00 cutoff: count the entire civil day.
export const DAYTIME_REFERENCE_SECONDS=19*3600;

export function frequency(count,period){
  if(count<2)return {interval:null,category:6};
  const interval=period/60/count;
  const category=LIMITS.findIndex(limit=>interval<=limit);
  return {interval,category:category<0?6:category};
}
