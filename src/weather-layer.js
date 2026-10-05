import {weatherGrid,weatherTint,interpolateTint,weatherAt,fetchWeatherBatch} from './environment.js?v=overlay-1';
export function createWeatherLayer(map,getState,onStatus){
 const cache=new Map();let grid=null,data=[],enabled=false,loading=false,generation=0,timer,error='';
 const pane=map.createPane('weather');pane.style.zIndex=350;pane.style.pointerEvents='none';
 const Layer=L.Layer.extend({
  onAdd(m){this.canvas=L.DomUtil.create('canvas','weather-canvas');pane.appendChild(this.canvas);m.on('moveend resize zoomend',this.draw,this);m.on('zoomstart',this.hide,this);},
  onRemove(m){m.off('moveend resize zoomend',this.draw,this);m.off('zoomstart',this.hide,this);this.canvas.remove();},
  hide(){if(this.canvas)this.canvas.style.display='none';},
  draw(){
   const c=this.canvas;if(!c)return;const size=map.getSize();L.DomUtil.setPosition(c,map.containerPointToLayerPoint([0,0]));c.style.width=size.x+'px';c.style.height=size.y+'px';c.width=Math.ceil(size.x/6);c.height=Math.ceil(size.y/6);c.style.display=enabled?'block':'none';
   if(!enabled){status(0,0);return;}
   const state=getState(),ctx=c.getContext('2d');if(!grid){status(0,0);return;}
   const values=data.map((d,i)=>weatherTint(weatherAt(d,state.instant),state.dayAt(...grid.sites[i]))),image=ctx.createImageData(c.width,c.height);let painted=0,total=0;
   for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
    const loc=map.containerPointToLatLng([(x+.5)*size.x/c.width,(y+.5)*size.y/c.height]),value=interpolateTint(values,grid.cols,grid.rows,(loc.lng-grid.west)/grid.dx,(loc.lat-grid.south)/grid.dy);total++;
    const i=(y*c.width+x)*4;
    if(value){painted++;image.data[i]=value.r;image.data[i+1]=value.g;image.data[i+2]=value.b;image.data[i+3]=value.alpha*255;}
    else if((x+y)%8<2){image.data[i]=130;image.data[i+1]=136;image.data[i+2]=144;image.data[i+3]=48;}
   }
   ctx.putImageData(image,0,0);status(painted,total);
  }
 });
 const layer=new Layer().addTo(map);
 function status(painted,total){
  const coverage=total?Math.round(painted/total*100):0;
  onStatus(!enabled?'Vrstva vypnutá':loading?'Načítám počasí pro mapu…':error?error:!coverage?'Pro tento čas nejsou data · šrafování = neověřeno':`${getState().label} · vzorky ≈ ${grid.spacing} km${coverage<100?` · pokrytí ${coverage} %`:''}`,{coverage,loading,enabled,sites:grid?.sites.length||0});
 }
 function request(){
  clearTimeout(timer);if(!enabled)return;
  // Invalidate before debounce, so an old area cannot overwrite the new viewport.
  const id=++generation;timer=setTimeout(async()=>{
   const b=map.getBounds(),next=weatherGrid({south:b.getSouth(),north:b.getNorth(),west:b.getWest(),east:b.getEast()});
   const values=next.sites.map(p=>{const hit=cache.get(p.join(','));return hit&&Date.now()-hit.loaded<1800000?hit.data:null;}),missing=values.map((v,i)=>v?null:i).filter(i=>i!==null);
   grid=next;data=values;loading=missing.length>0;error='';layer.draw();
   try{if(missing.length){const fetched=await fetchWeatherBatch(missing.map(i=>next.sites[i]));fetched.forEach((d,j)=>cache.set(next.sites[missing[j]].join(','),{data:d,loaded:Date.now()}));while(cache.size>256)cache.delete(cache.keys().next().value);if(id!==generation||!enabled)return;missing.forEach((i,j)=>values[i]=fetched[j]);}loading=false;layer.draw();}
   catch{if(id!==generation||!enabled)return;loading=false;error='Počasí se nepodařilo načíst · šrafování = neověřeno';layer.draw();}
  },600);
 }
 map.on('moveend resize',request);
 return {setEnabled(value){enabled=value;if(!value){++generation;clearTimeout(timer);loading=false;}layer.draw();if(value)request();},draw(){layer.draw();},request};
}
