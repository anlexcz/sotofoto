// Times stay civil-day offsets; neither paging nor anchoring filters the data.
export const PASSAGE_BATCH=30,MAX_PASSAGE_ROWS=120;
export function passageIndex(rows,time){let lo=0,hi=rows.length;while(lo<hi){const mid=(lo+hi)>>>1;if(rows[mid].time<time)lo=mid+1;else hi=mid;}return lo;}
export function passageWindow(rows,time){const index=passageIndex(rows,time),start=Math.max(0,Math.min(index-10,rows.length-PASSAGE_BATCH));return [start,Math.min(rows.length,start+PASSAGE_BATCH)];}
export function shiftPassageWindow(length,start,end,direction){if(direction<0){start=Math.max(0,start-PASSAGE_BATCH);end=Math.min(end,start+MAX_PASSAGE_ROWS);}else{end=Math.min(length,end+PASSAGE_BATCH);start=Math.max(start,end-MAX_PASSAGE_ROWS);}return [start,end];}
