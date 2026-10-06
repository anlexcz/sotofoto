export const passageOperation=(pattern,index)=>pattern[4]?.[index]??1;
const LABELS={7:'Výjezd',8:'Zátah',9:'Přejezd na lince',10:'Přejezd na jinou linku'};
export const operationLabel=type=>type===1?'':LABELS[type]||`Jiný provoz (typ ${type})`;
