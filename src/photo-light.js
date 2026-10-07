import {photographyLight} from './core.js';
import {terrainLight} from './environment.js';
export const METRO_LIGHT=Object.freeze({score:0,color:'#8c959d',level:'unrated',label:'Metro — nasvícení se nehodnotí'});
// Lazy suppliers ensure metro never computes sun or terrain profiles.
export function passageLight(mode,getSun,getProfile,bearing){
 if(mode===1)return {sun:null,light:METRO_LIGHT};
 const sun=getSun();let light=photographyLight(sun,bearing);
 if(terrainLight(sun,getProfile()))light={...light,score:0,color:'#8c959d',level:'night',label:'Stín terénu'};
 return {sun,light};
}
export function edgeLight(forwardCount,backwardCount,getSun,getProfile,bearing){
 if(!forwardCount&&!backwardCount)return {forward:METRO_LIGHT.color,backward:METRO_LIGHT.color,combined:METRO_LIGHT.color,forwardScore:0,backwardScore:0};
 const sun=getSun(),profile=getProfile(),shadow=terrainLight(sun,profile);
 const forward=photographyLight(sun,bearing),backward=photographyLight(sun,(bearing+180)%360);
 if(shadow)forward.color=backward.color='#8c959d';
 return {forwardScore:forward.score,backwardScore:backward.score,forward:forwardCount?forward.color:METRO_LIGHT.color,backward:backwardCount?backward.color:METRO_LIGHT.color,combined:forwardCount&&backwardCount?(forward.score>=backward.score?forward.color:backward.color):forwardCount?forward.color:backward.color};
}

// Missing/neutral/noc and known terrain shadow never qualify as good light.
export function goodPassageLight(row){
 return row.light?.level!=='night'&&row.light?.level!=='unrated'&&Number.isFinite(row.light?.difference)&&Math.abs(row.light.difference)<90;
}
export function preferredDirection(f,b,forwardScore,backwardScore){
 if(!f&&!b)return null;
 return f&&(!b||forwardScore>=backwardScore)?'forward':'backward';
}
export const PHOTO_ARROWS=Object.freeze({minZoom:15,spacing:110,size:7,maxCount:120});
export function arrowDirection(photoMode,zoom,preliminary,f,b,light,config=PHOTO_ARROWS){
 return photoMode&&zoom>=config.minZoom&&!preliminary?preferredDirection(f,b,light.forwardScore,light.backwardScore):null;
}
