import {geometryLevel} from './render-view.js?v=preview-2';
import {mapEdgeLight,MapLightCache} from './map-light.js?v=block2-2';
import {passageCsv} from './passage-export.js';
import {passageLight} from './photo-light.js';
import {encodeLink,decodeLink,mapyLink} from './share.js';
import {TerrainStore,terrainStatus} from './terrain-store.js?v=terrain-3c';
import {operationLabel} from './operation-types.js';
import {FREQUENCY_LABELS,FREQUENCY_WIDTHS,frequencyColor} from './intensity.js?v=block1';
import {timeFilterKey,roundedNow,filterLightTime,shiftLightTime} from './photo-time.js?v=block1';
import {mainRoutes,labelChains,chainSamples} from './route-labels.js?v=labels-1';
import {normalize,queryTokens,matchesQuery,interval,operationValue,matchesOperation,toggleOperation} from './filter-utils.js?v=operation-2';
import {civilClock,pageEnd,photoWindows,visibilityLabel} from './point-utils.js?v=block1';
import {createWeatherLayer} from './weather-layer.js?v=overlay-2';
import {horizonHeight,terrainLight,weatherAt,fetchWeather} from './environment.js?v=block1';
import {MODES,MODE_COLORS,DIRECTIONS,timeRange,clock,dateKey,pragueInstant,sunPosition,photographyLight,daylightTimes,bearing,compass,project} from './core.js';
const $=id=>document.getElementById(id),escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let meta,geometry={points:[],edges:[]},result,worker,point,pointRows=[],rendered=0,countsRequest=0,pointRequest=0,timer,ready=false;
let lastTimeFilter=null,intensities=false,snapRequest=0;
let confirmedCoverage=null,countsTarget=null;
const lightCache=new MapLightCache();
let weatherOverlay=true,mapAllDay=true,highlightAgency=null;const showAll={route:false,agency:false};
let photoMode=false,photoSeconds=43200,solarDay=null,lightFrame=null;
let weatherData=null,weatherKey='',weatherError='',weatherGeneration=0,weatherTimer;
const weatherCache=new Map();
const weatherIcon=name=>`<svg class="weather-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">${{eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',cloud:'<path d="M6 18a4 4 0 0 1-1-8 6 6 0 0 1 11-2 5 5 0 0 1 2 10Z"/>',thermo:'<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0Z"/><path d="M12 8v10"/>'}[name]}</svg>`;
const selected={routes:new Set(),agencies:new Set(),modes:new Set(),directions:new Set()};
const map=L.map('map',{zoomControl:false,preferCanvas:true}).setView([50.075,14.44],13);
L.control.zoom({position:'topright'}).addTo(map);
const tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · GTFS: <a href="https://pid.cz/o-systemu/opendata/">ROPID / PID</a>, upraveno pro Šotofoto'}).addTo(map);
let tileError=false;tiles.on('tileerror',()=>{if(!tileError){tileError=true;$('map-help').textContent='Mapový podklad se nepodařilo načíst. Trasy a průjezdy zůstávají dostupné.';}});
let marker,halo,gpsMarker,gpsAccuracy,snapHighlight,pendingPoint,pointStart=0,pointMode="day",restoredPointState=null,listRows=[],dayRows=[],windows=[],pointRadius=40,expanded=false;
const width=category=>{const zoom=map.getZoom(),scale=Math.max(.45,Math.min(1.5,.65+(zoom-11)*.14));return (intensities&&!result?.preliminary?FREQUENCY_WIDTHS[category]:3.4)*scale*Number($("thickness").value);};
const palette=i=>`hsl(${(i*137.508)%360} 61% 43%)`;
function edgeColor(i,category=result.categories[i]) {
  const r=meta.routes[result.colors[i]],mode=$('color').value;
  if(mode==='single')return $('accent').value;
  if(mode==='route')return palette(result.colors[i]);
  if(mode==='agency')return palette(highlightAgency!==null&&(result.edgeAgencies?.[i]||[]).includes(highlightAgency)?highlightAgency:result.agencyColors[i]);
  if(mode==='intensity')return result.preliminary?'#88999b':frequencyColor(category);
  return MODE_COLORS[r?.[3]]||'#586f78';
}
const RoutesLayer=L.Layer.extend({
  onAdd(m){this._map=m;this.canvas=L.DomUtil.create('canvas','route-canvas');m.getPanes().overlayPane.appendChild(this.canvas);m.on('moveend resize',this.draw,this);m.on('zoomstart',this.hide,this);this.draw();},
  onRemove(m){m.off('moveend resize',this.draw,this);m.off('zoomstart',this.hide,this);this.canvas.remove();},
  hide(){if(this.frame!==undefined)cancelAnimationFrame(this.frame);this.drawToken=(this.drawToken||0)+1;this.canvas.style.display='none';},
  draw(){
    if(this.frame!==undefined)cancelAnimationFrame(this.frame);
    const token=this.drawToken=(this.drawToken||0)+1,paint=this.paint();
    if(photoMode&&(this.visibleEdges?.length||0)>20000){const step=()=>{if(token!==this.drawToken)return;const next=paint.next();if(!next.done)this.frame=requestAnimationFrame(step);else this.frame=undefined;};step();}
    else {while(!paint.next().done){}this.frame=undefined;}
  },
  *paint(){
    if(!geometry||!result)return;
    const m=this._map,size=m.getSize(),ratio=window.devicePixelRatio||1,c=this.canvas;
    c.style.display='block';L.DomUtil.setPosition(c,m.containerPointToLayerPoint([0,0]));c.width=size.x*ratio;c.height=size.y*ratio;c.style.width=`${size.x}px`;c.style.height=`${size.y}px`;
    const ctx=c.getContext('2d');ctx.scale(ratio,ratio);ctx.lineCap='round';ctx.lineJoin='round';ctx.globalAlpha=+$('opacity').value;this.labels=[];
    const bounds=m.getBounds().pad(.08),split=$('split').checked;
    const projected=[];
    const instant=photoMode?pragueInstant(dateKey($('date').value),photoSeconds):null;
    let sliceStart=performance.now(),visited=0;
    for(const i of this.visibleEdges||[]){
      if(++visited%128===0&&performance.now()-sliceStart>=12){yield;sliceStart=performance.now();}
      const [a,b]=geometry.edges[i],p=geometry.points[a],q=geometry.points[b];
      if(Math.max(p[0],q[0])<bounds.getSouth()||Math.min(p[0],q[0])>bounds.getNorth()||Math.max(p[1],q[1])<bounds.getWest()||Math.min(p[1],q[1])>bounds.getEast())continue;
      const u=projected[a]??(projected[a]=m.latLngToContainerPoint(p)),v=projected[b]??(projected[b]=m.latLngToContainerPoint(q));
      ctx.globalAlpha=+$('opacity').value*(highlightAgency!==null&&!(result.edgeAgencies?.[i]||[]).includes(highlightAgency)?.16:1);const normalColor=photoMode?null:edgeColor(i);
      let forwardColor=normalColor,backwardColor=normalColor,combinedColor=normalColor;
      if(photoMode){
        const light=mapEdgeLight(geometry,result,i,instant,(...args)=>lightCache.sun(...args),profileAt);
        forwardColor=light.forward;backwardColor=light.backward;combinedColor=light.combined;
      }
      const line=(count,category,offset,color)=>{if(!count)return;ctx.strokeStyle=color;ctx.lineWidth=width(category);const dx=v.x-u.x,dy=v.y-u.y,len=Math.hypot(dx,dy)||1;ctx.beginPath();ctx.moveTo(u.x-dy/len*offset,u.y+dx/len*offset);ctx.lineTo(v.x-dy/len*offset,v.y+dx/len*offset);ctx.stroke();};
      if(split){const f=result.forward[i],b=result.backward[i],fc=result.forwardCategories[i],bc=result.backwardCategories[i],offset=(width(fc)+width(bc))/4+.6;line(f,fc,offset,photoMode?forwardColor:edgeColor(i,fc));line(b,bc,-offset,photoMode?backwardColor:edgeColor(i,bc));}else line(result.counts[i],result.categories[i],0,combinedColor);
    }
    const labelMode=$('color').value==='route',minZoom=selected.routes.size===1?12:14;
    if(labelMode&&m.getZoom()>=minZoom){if(!this.chains)this.buildChains();ctx.globalAlpha=1;ctx.font='600 11px system-ui';const boxes=[];
      const candidates=[];
      for(const chain of this.chains||[]){const [south,west,north,east]=chain.bounds;if(north<bounds.getSouth()||south>bounds.getNorth()||east<bounds.getWest()||west>bounds.getEast())continue;const points=chain.nodes.map(n=>m.latLngToContainerPoint(geometry.points[n]));for(const sample of chainSamples(points)){const {x,y,segment,f}=sample;if(x<35||y<75||x>size.x-65||y>size.y-40)continue;const i=chain.edges[segment],rows=mainRoutes(result.routeCounts?.[i],meta,selected.routes.size>0),names=[...new Set(rows.map(r=>meta.routes[r.id][1]))];if(!names.length)continue;const text=names.slice(0,3).join(' · ')+(names.length>3?` · +${names.length-3}`:''),p=geometry.points[chain.nodes[segment]],q=geometry.points[chain.nodes[segment+1]];candidates.push({x,y,i,text,key:chain.key,priority:rows[0].count,lat:p[0]+(q[0]-p[0])*f,lon:p[1]+(q[1]-p[1])*f});}}
      candidates.sort((a,b)=>b.priority-a.priority||a.i-b.i);
      for(const label of candidates){const {x,y,i,text}=label,w=ctx.measureText(text).width+14,h=22;if(boxes.some(b=>b.key===label.key&&Math.hypot(x-b.x,y-b.y)<250||Math.abs(x-b.x)<(w+b.w)/2+18&&Math.abs(y-b.y)<38))continue;
       ctx.fillStyle='#fffffff2';ctx.strokeStyle=photoMode?'#637b7f':edgeColor(i);ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(x-w/2,y-h/2,w,h,4);ctx.fill();ctx.stroke();ctx.fillStyle='#152f36';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,x,y);boxes.push({x,y,w,key:label.key});this.labels.push({...label,w,h});if(boxes.length>=45)break;
      }
    }
  },
  buildChains(){this.chains=labelChains(geometry.edges,result.routeCounts,meta,selected.routes.size>0).map(chain=>{const bounds=[Infinity,Infinity,-Infinity,-Infinity];for(const n of chain.nodes){const p=geometry.points[n];bounds[0]=Math.min(bounds[0],p[0]);bounds[1]=Math.min(bounds[1],p[1]);bounds[2]=Math.max(bounds[2],p[0]);bounds[3]=Math.max(bounds[3],p[1]);}return {...chain,bounds};});},
  update(){this.chains=null;this.visibleEdges=Array.from(result.counts,(_,i)=>i).filter(i=>result.counts[i]).sort((a,b)=>result.counts[a]-result.counts[b]);this.draw();}
});
const routesLayer=new RoutesLayer().addTo(map);
// Tile pane 200 < veil 250 < weather 350 < routes/highlight 400 < markers 600.
const veil=map.createPane('basemap-veil');veil.style.zIndex=250;veil.style.pointerEvents='none';
const veilCover=L.DomUtil.create('div','basemap-veil',veil);
function syncVeil(){const size=map.getSize();L.DomUtil.setPosition(veilCover,map.containerPointToLayerPoint([0,0]));veilCover.style.width=`${size.x}px`;veilCover.style.height=`${size.y}px`;}
map.on('move resize zoomend',syncVeil);syncVeil();

function updateLightControls(){
  syncLightPickers();
  if(!solarDay)return;
  const min=Math.min(solarDay.min,photoSeconds),max=Math.max(solarDay.max,photoSeconds);
  $('photo-slider').min=min;$('photo-slider').max=max;$('photo-slider').value=photoSeconds;
  $('photo-time').value=clock(photoSeconds);$('photo-time-label').textContent=clock(photoSeconds);
  $('sun-events').innerHTML=[['Východ',solarDay.sunrise],['Západ',solarDay.sunset]].filter(([,s])=>s!==null).map(([name,s])=>`<span class="sun-event" style="left:${(s-min)/(max-min)*100}%"><i></i>${name} ${clock(s)}</span>`).join('');
  $('photo-mode-note').textContent=$('split').checked?'Každý směr má vlastní barvu. Filtry a počty spojů se nemění.':'Barva ukazuje lepší z přítomných směrů. Filtry a počty spojů se nemění.';
}
function updateDaylight(){if(!ready)return;const c=map.getCenter();solarDay=daylightTimes(dateKey($('date').value),c.lat,c.lng);updateLightControls();}
const weatherLayer=createWeatherLayer(map,()=>({instant:pragueInstant(dateKey($('date').value),photoSeconds),dayAt:(lat,lon)=>sunPosition(pragueInstant(dateKey($('date').value),photoSeconds),lat,lon).altitude>0,label:clock(photoSeconds)}),(text,state)=>{$('weather-layer-status').textContent=text;$('weather-layer-status').dataset.coverage=state.coverage;$('weather-layer-status').dataset.loading=state.loading;});
$('weather-overlay-toggle').onchange=()=>{weatherOverlay=$('weather-overlay-toggle').checked;weatherLayer.setEnabled(photoMode&&weatherOverlay);saveHash();};
function setPhotoMode(value,followFilter=true){const opening=value&&!photoMode;photoMode=value;if(opening&&followFilter&&ready)applyFilterLight();document.body.classList.toggle('photo-active',value);$('photo-mode').setAttribute('aria-pressed',value);$('photo-mode').classList.toggle('active',value);$('photo-timeline').hidden=!value;$('weather-overlay-toggle').checked=weatherOverlay;$('weather-map-legend').hidden=!value;weatherLayer.setEnabled(value&&weatherOverlay);updateDaylight();drawAgencyLegend();drawLegend();routesLayer.draw();if(value){loadTerrain(opening);requestWeather();}else loadTerrain();saveHash();}
function setLightTime(seconds){if(!Number.isFinite(seconds))return;photoSeconds=Math.max(0,Math.min(86399,seconds));updateLightControls();renderEnvironment();weatherLayer.draw();if(lightFrame!==null)cancelAnimationFrame(lightFrame);lightFrame=requestAnimationFrame(()=>{lightFrame=null;routesLayer.draw();});}
$('photo-mode').onclick=()=>setPhotoMode(!photoMode);
$('photo-slider').oninput=()=>setLightTime(Number($('photo-slider').value));
$('photo-slider').onchange=saveHash;
$('photo-time').onchange=()=>{if(!$('photo-time').value)return;const [h,m]=$('photo-time').value.split(':').map(Number);setLightTime(h*3600+m*60);saveHash();};
map.on('moveend',()=>{if(ready){recalc(true);if(photoMode){updateDaylight();loadTerrain();requestWeather();}drawLegend();}});
function viewport(){const b=map.getBounds().pad(.08);return [b.getSouth(),b.getWest(),b.getNorth(),b.getEast()];}
function showStatus(text,busy=false,error=false){$('map-status').hidden=!busy&&!error;$('map-status').innerHTML=(busy?'<span class="spinner"></span>':'')+escape(text);$('map-status').classList.toggle('error',error);}
function filter(){const [start,end]=interval($('from').value||'00:00',$('to').value||'00:00',mapAllDay);return {date:$('date').value,start,end,allDay:mapAllDay,operation:operationValue($('operation').value),...Object.fromEntries(Object.entries(selected).map(([k,v])=>[k,[...v]]))};}
function recalc(movement=false){if(!ready)return;
if(movement&&confirmedCoverage&&!result?.preliminary){const b=viewport(),c=confirmedCoverage;if(c.filter===JSON.stringify(filter())&&c.level===geometryLevel(map.getZoom())&&b[0]>=c.bounds[0]&&b[1]>=c.bounds[1]&&b[2]<=c.bounds[2]&&b[3]<=c.bounds[3]){clearTimeout(timer);++countsRequest;worker.postMessage({type:'cancel'});showStatus('');return;}}
clearTimeout(timer);++countsRequest;++snapRequest;++pointRequest;worker.postMessage({type:'cancel'});timer=setTimeout(()=>{const f=filter(),key=timeFilterKey(f);if(photoMode&&lastTimeFilter!==null&&key!==lastTimeFilter)applyFilterLight();lastTimeFilter=key;$('range-label').textContent=f.allDay?'Celý den':`${clock(f.start)}–${clock(f.end)}${f.end>86400?' (do dalšího dne)':''}`;let note=`Platnost ${meta.startDate.slice(6)}. ${meta.startDate.slice(4,6)}. – ${meta.endDate.slice(6)}. ${meta.endDate.slice(4,6)}. ${meta.stats.trips.toLocaleString('cs')} spojů. ${meta.automaticUpdate?`Aktualizace denně kolem 4:00 · sestaveno ${new Date(meta.builtAt).toLocaleString('cs',{timeZone:'Europe/Prague'})}.`:'Bez pravidelné aktualizace.'}`;if(dateKey(f.date)===meta.startDate&&!meta.continuity?.complete)note+=' Na prvním dni chybí případné dojezdy z předchozího dne.';if(dateKey(f.date)===meta.endDate&&f.end>86400)note+=' Část po půlnoci je mimo platnost: nové služby dalšího dne nejsou dostupné.';$('data-note').textContent=note;showStatus('Počítám intenzitu…',true);const b=map.getBounds().pad(.16);countsTarget={bounds:[b.getSouth(),b.getWest(),b.getNorth(),b.getEast()],filter:JSON.stringify(f),level:geometryLevel(map.getZoom())};worker.postMessage({type:'counts',id:countsRequest,filter:f,bounds:countsTarget.bounds,zoom:map.getZoom()});if(!movement)requestPoint();},120);}
let legendResult=null,legendRouteIds=[];
$('intensity-toggle').onchange=()=>{intensities=$('intensity-toggle').checked;routesLayer.draw();drawLegend();};
function drawLegend(){
  $('legend-scale').hidden=!intensities;
  $('intensity-status').textContent=result?.preliminary?'Předběžné trasy — datum, čas a směry se ověřují. Nasvícení a četnost zatím nejsou vyhodnoceny.':intensities?'Tloušťka odpovídá četnosti pravidelného provozu.':'Jednotná tloušťka tras. Počty a průjezdy se počítají nezávisle.';
  $('legend-scale').innerHTML=FREQUENCY_LABELS.map((label,category)=>`<span class="legend-step"><span class="legend-stroke" style="height:${width(category)}px;${!photoMode&&$('color').value==='intensity'?`background:${frequencyColor(category)}`:''}"></span>${label}</span>`).join('');
  const swatch=(color,label)=>`<span class="color-legend-row"><i style="background:${color}"></i>${escape(label)}</span>`,mode=$('color').value;
  let title='',content='';
  if(photoMode){title='Nasvícení';content=[['#23a455','Čelo'],['#f4841f','Bok'],['#db3d31','Zezadu'],['#8c959d','Noc / stín'],['#8c959d','Metro — nasvícení se nehodnotí']].map(([color,label])=>swatch(color,label)).join('')+'<p class="hint">Sloučená čára ukazuje lepší z přítomných směrů. Rozdělené směry mají vlastní barvu. V oddáleném přehledu delší čára ukazuje horší nasvícení svých částí; detail místa hodnotí skutečný místní směr.</p>';}
  else if(mode==='mode'){title='Druh dopravy';content=Object.entries(MODES).filter(([id])=>meta?.routes.some(r=>r[3]===+id)).map(([id,name])=>swatch(MODE_COLORS[id],name)).join('');}
  else if(mode==='route'){
    if(legendResult!==result){legendResult=result;legendRouteIds=[...new Set(Object.values(result?.edgeRoutes||{}).flat())].sort((a,b)=>meta.routes[a][1].localeCompare(meta.routes[b][1],'cs',{numeric:true}));}
    title='Linky';content=legendRouteIds.map(i=>swatch(palette(i),meta.routes[i][1])).join('')||'<p class="hint">Žádné linky v tomto výběru.</p>';
  }else if(mode==='single'){title='Barva tras';content=swatch($('accent').value,'Všechny vybrané trasy');}
  $('color-legend').innerHTML=title?`<h3>${title}</h3><div class="color-legend-items">${content}</div>`:'';
}
function setLegend(open,restoreFocus=false){$('map-legend').hidden=!open;$('legend-toggle').setAttribute('aria-expanded',String(open));if(!open&&restoreFocus)$('legend-toggle').focus();}
$('legend-toggle').onclick=()=>setLegend($('map-legend').hidden);
$('legend-close').onclick=()=>setLegend(false,true);
document.addEventListener('pointerdown',e=>{if(!$('map-legend').hidden&&!e.target.closest('#map-legend,#legend-toggle'))setLegend(false);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('map-legend').hidden){setLegend(false,true);e.preventDefault();}});
drawLegend();

function renderChips(container,items,key){$(container).innerHTML=items.map(([id,name,color])=>`<button type="button" data-id="${id}" class="${selected[key].has(id)?'active':''}" aria-pressed="${selected[key].has(id)}" ${color?`style="--mode:${color}"`:''}>${color?'<span class="mode-dot"></span>':''}${escape(name)}</button>`).join('');$(container).onclick=e=>{const b=e.target.closest('button');if(!b)return;const id=key==='directions'?b.dataset.id:Number(b.dataset.id);selected[key].has(id)?selected[key].delete(id):selected[key].add(id);renderChips(container,items,key);if(key==='modes')renderRoutes();recalc();};}
function routeAvailable(r,i){return matchesOperation(r,$('operation').value)&&(!selected.modes.size||selected.modes.has(r[3]))&&(!selected.agencies.size||(meta.routeAgencies[i]||[]).some(a=>selected.agencies.has(a)));}
function visibleRoutes(){const tokens=queryTokens($('route-search').value,true);return meta.routes.map((r,i)=>({r,i})).filter(({r,i})=>routeAvailable(r,i)&&matchesQuery(r[1],r[2],tokens,true)).sort((a,b)=>a.r[1].localeCompare(b.r[1],'cs',{numeric:true}));}
function visibleAgencies(){const tokens=queryTokens($('agency-search').value);return meta.agencies.map((a,i)=>({a,i})).filter(({a})=>matchesQuery('',a[1],tokens));}
function renderPicker(kind,list){const key=kind==='route'?'routes':'agencies',query=$(kind+'-search').value,tokens=queryTokens(query,kind==='route'),all=kind==='route'?meta.routes:meta.agencies;
 $(kind+'-selected').innerHTML=[...selected[key]].map(i=>`<button type="button" data-remove="${i}" class="${kind==='route'&&!routeAvailable(all[i],i)?'incompatible':''}" title="Odebrat z výběru">${escape(all[i][1])} ×</button>`).join('');
 const missing=tokens.filter(t=>!list.some(v=>matchesQuery(kind==='route'?v.r[1]:'',kind==='route'?v.r[2]:v.a[1],[t],kind==='route')));
 const incompatible=kind==='route'?[...selected.routes].filter(i=>!routeAvailable(meta.routes[i],i)).length:0;
 $(kind+'-feedback').textContent=[missing.length?`Nenalezeno v dostupném výběru: ${missing.join(', ')}`:'',incompatible?`${incompatible} vybraných linek neodpovídá provozu, druhu dopravy nebo dopravci.`:'',kind==='agency'&&tokens.some(t=>list.filter(v=>matchesQuery('',v.a[1],[t])).length>1)?'Některý název odpovídá více dopravcům; před přidáním zkontroluj výsledky.':''].filter(Boolean).join(' ');
 const limited=!query&&!showAll[kind],shown=limited?list.slice(0,kind==='route'?24:8):list;
 $(key).innerHTML=shown.map(v=>{const i=v.i,r=v.r||v.a;return `<button type="button" data-id="${i}" aria-pressed="${selected[key].has(i)}" class="${selected[key].has(i)?'active':''}" title="${escape(r[2]||r[1])}">${escape(r[1])}</button>`;}).join('')||'<p class="hint">Žádné výsledky.</p>';
 $(kind+'-show-all').hidden=!!query||list.length<=(kind==='route'?24:8);$(kind+'-show-all').textContent=showAll[kind]?'Zkrátit seznam':`Zobrazit všechny (${list.length})`;
 $(kind+'-summary').textContent=selected[key].size?`${selected[key].size} vybráno`:kind==='route'?'všechny':'všichni';
 $(kind+'-visible').disabled=!list.length;
}
function renderRoutes(){renderPicker('route',visibleRoutes());}
function renderAgencies(){renderPicker('agency',visibleAgencies());}
function requestPoint(){if(!point||!ready)return;setPointMode();const id=++pointRequest;$('passages').classList.add('updating');$('passages').innerHTML='<p class="hint">Načítám průjezdy v okolí…</p>';$('export').disabled=true;$('point-now-status').textContent='Aktualizuji průjezdy…';worker.postMessage({type:'point',id,point,radius:pointRadius,filter:{...filter(),start:Math.min(0,pointStart),end:172800},allDay:false});}
function choosePoint(lat,lon){point=[lat,lon];$('open-mapy').href=mapyLink(point);$('point-panel').hidden=false;document.body.classList.add('point-open');$('map-help').hidden=true;$('point-coordinates').textContent=`${lat.toFixed(5)}, ${lon.toFixed(5)} ⧉`;marker?.remove();halo?.remove();marker=L.marker(point,{icon:L.divIcon({className:'map-point',iconSize:[18,18],iconAnchor:[9,9]})}).addTo(map);halo=L.circle(point,{radius:pointRadius,color:'#16877d',weight:1,fillOpacity:.06,interactive:false}).addTo(map);map.invalidateSize();ensurePointVisible();requestPoint();loadTerrain();requestWeather();renderEnvironment();saveHash();}
function snapPoint(lat,lon){
 const f=filter();pointMode=f.start===0&&f.end===86400?'day':'from';pointStart=f.start;
 worker.postMessage({type:'snap',id:++snapRequest,point:[lat,lon],filter:f});
}
$('point-coordinates').onclick=async()=>{if(!point)return;const text=point.map(v=>v.toFixed(5)).join(', ');try{await navigator.clipboard.writeText(text);$('point-coordinates').textContent='Zkopírováno ✓';setTimeout(()=>{if(point)$('point-coordinates').textContent=point.map(v=>v.toFixed(5)).join(', ')+' ⧉';},1500);}catch{$('point-coordinates').textContent=text;}};
map.on('click',e=>{if(ready){const label=routesLayer.labels?.find(l=>Math.abs(e.containerPoint.x-l.x)<=l.w/2&&Math.abs(e.containerPoint.y-l.y)<=l.h/2);snapPoint(label?.lat??e.latlng.lat,label?.lon??e.latlng.lng);}});
function sunFor(row){return sunPosition(pragueInstant(dateKey($('date').value),row.time),row.lat,row.lon);}
function renderPoint(){
 for(const row of pointRows)Object.assign(row,passageLight(meta.routes[row.route][3],()=>sunFor(row),()=>profileAt(row.lat,row.lon),row.bearing));
 dayRows=pointRows.filter(r=>r.time>=0&&r.time<86400);windows=photoWindows(dayRows);
 $('point-title').textContent='Tady to projede';
 const hours=Array.from({length:24},(_,h)=>({h,all:0,good:0}));for(const r of dayRows){const h=hours[Math.floor(r.time/3600)];h.all++;if(r.light.level==='good')h.good++;}
 const best=windows[0];$('photo-quick').textContent=best?`☀ ${civilClock(best.start)}–${civilClock(best.end)}`:'Bez vhodného okna';
 $('recommendation').innerHTML=best?`<h3>${civilClock(best.start)}–${civilClock(best.end)}</h3><p>${best.good} z ${best.all} povrchových průjezdů má vhodné světlo.</p>`:'<p class="hint">V tomto dni a výběru není vhodně nasvícený průjezd.</p>';
 $('photo-windows').innerHTML=windows.slice(0,5).map((w,i)=>`<button data-window="${i}">${civilClock(w.start)}–${civilClock(w.end)} · ${w.good}/${w.all} povrchových vhodných · Ukázat průjezdy</button>`).join('');
 const periods=[['Ráno',5,10],['Poledne',10,14],['Odpoledne',14,20]];$('recommendation').insertAdjacentHTML('beforeend',`<div class="recommend-grid">${periods.map(([name,start,end])=>{const rows=dayRows.filter(r=>r.light.level!=='unrated'&&r.time>=start*3600&&r.time<end*3600);return `<div>${name}<strong>${rows.filter(r=>r.light.level==='good').length} / ${rows.length}</strong>vhodné / povrchové</div>`;}).join('')}</div>`);const max=Math.max(1,...hours.map(h=>h.all));$('hour-chart').innerHTML=hours.map(h=>`<button title="${h.h}:00 · ${h.all} průjezdů, ${h.good} vhodných" aria-label="Vybrat hodinu ${h.h}:00, ${h.all} průjezdů, ${h.good} vhodných" data-hour="${h.h}" style="--height:${Math.max(3,h.all/max*57)}px"><i style="height:${h.all?h.good/h.all*100:0}%"></i>${h.h%3===0?`<span>${h.h}</span>`:''}</button>`).join('');
 renderList();
}
function renderList(){$('passages').classList.remove('updating');$('point-scroll').scrollTop=0;listRows=pointRows.filter(r=>r.time>=(pointMode==='day'?0:pointStart)&&(pointMode!=='day'||r.time<86400));rendered=0;$('passages').innerHTML='';$('point-end').textContent='';$('export').disabled=!listRows.length;$('passage-count').textContent=pointMode==='day'?`${listRows.length.toLocaleString('cs')} průjezdů za den`:'Průjezdy';setPointMode();appendRows();}
function appendRows(){
 $('load-more')?.remove();if(!listRows.length){$('passages').innerHTML=`<p class="empty">${pointRows.length?'Od tohoto času už nejsou průjezdy. Zkus celý den nebo jiný den.':'V blízkosti bodu nejsou průjezdy podle aktuálních filtrů. Zkus jiné místo nebo rozšiř filtry.'}</p>`;endNote();return;}
 const start=rendered,end=pageEnd(listRows,start,start?listRows[start]?.time:pointMode==='day'?0:pointStart),next=listRows.slice(start,end);
 let lastDay=start?Math.floor(listRows[start-1].time/86400):null;
 $('passages').insertAdjacentHTML('beforeend',next.map(row=>{const d=Math.floor(row.time/86400),dayHead=d!==lastDay?`<div class="day-divider">${dateForOffset(d)}</div>`:'';lastDay=d;const r=meta.routes[row.route],l=row.light;return dayHead+`<details class="passage compact-passage"><summary><div class="passage-top"><span class="passage-time">${row.estimated?'≈ ':''}${civilClock(row.time)}</span><span class="route-badge" style="--badge:${MODE_COLORS[r[3]]||'#586f78'}">${escape(r[1])}</span><span class="passage-destination">${escape(row.headsign)}</span><button type="button" class="light-icon" style="--light:${l.color}" title="${escape(l.label)}" aria-label="${escape(l.label)}">${l.level==='unrated'?'—':l.level==='night'?'◐':'☀'}</button></div><div class="passage-origin">Od ${escape(row.previousStop)} · ${civilClock(row.previousTime)}${Math.floor(row.previousTime/86400)!==d?' (předchozí den)':''}</div></summary><div class="passage-sub">${escape(meta.agencies[row.agency][1])} · směr ${row.direction}, ${Math.round(row.bearing)}°<br>${escape(l.label)}${row.sun?` · slunce ${compass(row.sun.azimuth)} ${Math.round(row.sun.azimuth)}°, výška ${Math.round(row.sun.altitude)}°`:''}${row.shortName?` · spoj ${escape(row.shortName)}`:''}${row.operationType!==1?`<br>${escape(operationLabel(row.operationType))}`:''}${row.fallback?'<br>Trasa chybí v GTFS, přímá spojnice zastávek.':''}</div></details>`;}).join(''));
 rendered=end;if(rendered<listRows.length){$('passages').insertAdjacentHTML('beforeend',`<button class="load-more" id="load-more">Zobrazeno do ${dateForOffset(Math.floor(listRows[rendered-1].time/86400))} ${civilClock(listRows[rendered-1].time)} · Další průjezdy</button>`);$('load-more').onclick=appendRows;}else endNote();
}
function dateForOffset(d){const date=new Date($('date').value+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+d);return date.toLocaleDateString('cs',{weekday:'short',day:'numeric',month:'numeric',timeZone:'UTC'});}
function endNote(){$('point-end').textContent=dateKey($('date').value)>=meta.endDate?'Tady končí platnost stažených jízdních řádů.':'Další průjezdy do konce následujícího dne nejsou v tomto výběru. Zvol jiný den nebo čas.';}
let paging=false;new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&$('page-sentinel').getBoundingClientRect().top<=$('point-scroll').getBoundingClientRect().bottom+100&&rendered>0&&rendered<listRows.length&&!paging){paging=true;requestAnimationFrame(()=>{appendRows();paging=false;});}},{root:$('point-scroll'),rootMargin:'0px 0px 100px 0px'}).observe($('page-sentinel'));
function closeTimeEditor(){$('point-time-editor').hidden=true;$('point-filtered').setAttribute('aria-expanded','false');}
function setPointMode(){const today=currentPrague().date,label=$('date').value===today?'dnes':$('date').value.split('-').reverse().join('.');const text=`Průjezdy · ${label} ${pointMode==='day'?'celý den':`od ${civilClock(pointStart)}${pointStart<0?' (včera)':''}`}`;$('point-filtered').textContent=text+' ⌄';$('point-now-status').textContent=text;}
$('point-filtered').onclick=()=>{if(!$('point-time-editor').hidden){closeTimeEditor();return;}$('point-time-editor').hidden=false;$('point-filtered').setAttribute('aria-expanded','true');$('point-date').min=$('date').min;$('point-date').max=$('date').max;$('point-date').value=$('date').value;$('point-day').checked=pointMode==='day';$('point-from-wrap').hidden=$('point-day').checked;$('point-from').value=civilClock(pointMode==='day'?photoSeconds:pointStart);};
$('point-day').onchange=()=>{$('point-from-wrap').hidden=$('point-day').checked;};
$('point-time-cancel').onclick=closeTimeEditor;
$('point-time-apply').onclick=()=>{if(!$('point-date').value||!$('point-date').checkValidity()||(!$('point-day').checked&&!$('point-from').value)){$('point-date').reportValidity();return;}const [h,m]=$('point-from').value.split(':').map(Number);pointMode=$('point-day').checked?'day':'from';pointStart=pointMode==='day'?0:h*3600+m*60;$('date').value=$('point-date').value;closeTimeEditor();refreshDate();};
function showFrom(seconds){closeTimeEditor();pointMode='from';pointStart=seconds;setLightTime(seconds);renderList();$('point-scroll').scrollTop=0;saveHash();}
$('hour-chart').onclick=e=>{const b=e.target.closest('[data-hour]');if(b)showFrom(+b.dataset.hour*3600);};$('photo-windows').onclick=e=>{const b=e.target.closest('[data-window]');if(b)showFrom(windows[+b.dataset.window].start);};
function setExpanded(value){expanded=value;$('point-panel').classList.toggle('expanded',value);$('point-expand').setAttribute('aria-expanded',value);$('point-expand').setAttribute('aria-label',value?'Zmenšit panel':'Zvětšit panel');$('point-expand').textContent=value?'↧':'↥';map.invalidateSize();if(!value)ensurePointVisible();}
$('point-expand').onclick=()=>setExpanded(!expanded);let dragY=null;$('point-drag').addEventListener('pointerdown',e=>{if(e.target.closest('button,a'))return;dragY=e.clientY;$('point-drag').setPointerCapture(e.pointerId);});$('point-drag').addEventListener('pointerup',e=>{if(dragY!==null&&Math.abs(e.clientY-dragY)>35)setExpanded(e.clientY<dragY);dragY=null;});$('point-drag').addEventListener('pointercancel',()=>dragY=null);
for(const id of ['weather-fold','photo-fold'])$(id).addEventListener('toggle',()=>{if($(id).open)setExpanded(true);});
$('close-point').onclick=()=>{point=null;pointRows=[];listRows=[];$('point-panel').hidden=true;document.body.classList.remove('point-open');marker?.remove();halo?.remove();snapHighlight?.remove();map.invalidateSize();++pointRequest;loadTerrain();if(photoMode)requestWeather();saveHash();};
$('toggle-filters').onclick=()=>{const open=$('filters').classList.toggle('open');$('toggle-filters').setAttribute('aria-expanded',open);};
function renderOperation(){const value=operationValue($('operation').value);for(const b of $('operation-chips').querySelectorAll('button')){const active=value==='all'||b.dataset.operation===value;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}}
function setOperation(value){$('operation').value=operationValue(value);renderOperation();if(ready){renderRoutes();recalc();}}
$('operation-chips').onclick=e=>{const b=e.target.closest('[data-operation]');if(b)setOperation(toggleOperation($('operation').value,b.dataset.operation));};
$('filter-form').onsubmit=e=>e.preventDefault();
for(const id of ['date','from','to'])$(id).onchange=()=>{if(id==='date'&&pointMode==='now')pointMode='from';if(!$('date').value||$('date').value<$('date').min||$('date').value>$('date').max){$('date').reportValidity();return;}updateDaylight();renderEnvironment();weatherLayer.draw();requestWeather();recalc();};
function setMapTime(all){mapAllDay=all;$('map-time-editor').hidden=all;$('whole-day').classList.toggle('active',all);$('time-interval').classList.toggle('active',!all);recalc();}
$('whole-day').onclick=()=>setMapTime(true);$('time-interval').onclick=()=>{if($('from').value==='00:00'&&$('to').value==='00:00'){$('from').value='06:00';$('to').value='19:00';}setMapTime(false);};$('range-now').onclick=()=>{const n=useToday();if(!n)return;$('from').value=civilClock(n.seconds);$('to').value=civilClock(n.seconds+7200);setMapTime(false);refreshDate();};document.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{[$('from').value,$('to').value]=b.dataset.range.split(',');setMapTime(false);});
$('route-search').oninput=()=>ready&&renderRoutes();$('agency-search').oninput=()=>ready&&renderAgencies();
$('routes').onclick=e=>{const b=e.target.closest('[data-id]');if(!b)return;const id=+b.dataset.id;selected.routes.has(id)?selected.routes.delete(id):selected.routes.add(id);renderRoutes();recalc();};
$('agencies').onclick=e=>{const b=e.target.closest('[data-id]');if(!b)return;const id=+b.dataset.id;selected.agencies.has(id)?selected.agencies.delete(id):selected.agencies.add(id);renderAgencies();renderRoutes();recalc();};
for(const [kind,visible,render] of [['route',visibleRoutes,renderRoutes],['agency',visibleAgencies,renderAgencies]]){
  const key=kind==='route'?'routes':'agencies';$(kind+'-all').onclick=()=>{selected[key].clear();render();if(kind==='agency')renderRoutes();recalc();};$(kind+'-visible').onclick=()=>{for(const {i} of visible())selected[key].add(i);render();if(kind==='agency')renderRoutes();recalc();};
}
for(const id of ['color','accent','opacity','split','thickness'])$(id).oninput=()=>{updateLightControls();$('custom-color').hidden=$('color').value!=='single';highlightAgency=null;drawAgencyLegend();routesLayer.draw();drawLegend();saveHash();};
$('reset').onclick=()=>{for(const s of Object.values(selected))s.clear();$('operation').value='all';$('route-search').value='';$('agency-search').value='';$('from').value='00:00';$('to').value='00:00';setMapTime(true);renderFilters();recalc();};
$('export').onclick=()=>{
  const q=s=>'"'+String(s).replaceAll('"','""')+'"';const lines=[['Čas průjezdu','Odhad','Linka','Cíl','Dopravce','Směr','Azimut jízdy','Předchozí zastávka','Odjezd z předchozí','Azimut slunce','Výška slunce','Světlo','ID spoje','Typ provozu']];
  for(const r of listRows)lines.push(passageCsv(r,meta));
  const blob=new Blob(['\uFEFF'+lines.map(l=>l.map(q).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`sotofoto-${$('date').value}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
function renderFilters(){renderOperation();renderChips('modes',Object.entries(MODES).filter(([id])=>meta.routes.some(r=>r[3]===+id)).map(([id,n])=>[+id,n,MODE_COLORS[id]]),'modes');renderChips('directions',DIRECTIONS.map(d=>[d,d]),'directions');renderRoutes();renderAgencies();}
function shareState(){const f=filter(),c=map.getCenter();const state={...f,routes:f.routes.map(i=>meta.routes[i][0]),agencies:f.agencies.map(i=>meta.agencies[i][0]),from:$('from').value,to:$('to').value,center:[+c.lat.toFixed(5),+c.lng.toFixed(5)],zoom:map.getZoom(),point,pointMode,pointStart,mapAllDay,thickness:Number($('thickness').value),photoMode,photoSeconds,weatherOverlay,color:$('color').value};return state;}
function saveHash(){if(ready)history.replaceState(null,'',encodeLink(shareState()));}
for(const kind of ['place','plan'])$('share-'+kind).onclick=()=>{const url=new URL(location.href);url.hash=encodeLink(shareState(),kind);$('share-result').hidden=false;$('share-url').value=url.href;$('share-url').select();navigator.clipboard?.writeText(url.href).catch(()=>{});};
function loadHash(){try{const s=decodeLink(location.hash);$('operation').value=operationValue(s.operation);mapAllDay=s.mapAllDay??(s.start===undefined||s.start===0&&s.end===86400);if(s.date>=$('date').min&&s.date<=$('date').max)$('date').value=s.date;if(/^\d\d:\d\d$/.test(s.from))$('from').value=s.from;if(/^\d\d:\d\d$/.test(s.to))$('to').value=s.to;for(const id of s.routes||[]){const i=meta.routes.findIndex(r=>r[0]===id);if(i>=0)selected.routes.add(i);}for(const id of s.agencies||[]){const i=meta.agencies.findIndex(a=>a[0]===id);if(i>=0)selected.agencies.add(i);}for(const m of s.modes||[])if(m in MODES)selected.modes.add(m);for(const d of s.directions||[])if(DIRECTIONS.includes(d))selected.directions.add(d);if(['day','from','now'].includes(s.pointMode)&&Number.isFinite(s.pointStart))restoredPointState={mode:s.pointMode,start:s.pointStart};if(Number.isFinite(s.thickness))$('thickness').value=Math.max(.4,Math.min(2,s.thickness));if(Number.isFinite(s.photoSeconds))photoSeconds=Math.max(0,Math.min(86399,s.photoSeconds));photoMode=s.photoMode===true;weatherOverlay=s.weatherOverlay!==false;if(['mode','route','agency','intensity','single'].includes(s.color))$('color').value=s.color;if(Array.isArray(s.center)&&s.center.length===2&&s.center.every(Number.isFinite))map.setView(s.center,Math.max(5,Math.min(19,s.zoom||11)));return s.point?.length===2&&s.point.every(Number.isFinite)?s.point:null;}catch{return null;}}
map.on('moveend',saveHash);
function readyData(data){meta=data.meta;const iso=d=>`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;$('date').min=iso(meta.startDate);$('date').max=iso(meta.endDate);const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());$('date').value=today>=$('date').min&&today<=$('date').max?today:$('date').min;$('date').disabled=false;$('feed-label').textContent=`GTFS ${iso(meta.startDate)} – ${iso(meta.endDate)}`;$('data-note').textContent=`Platnost ${iso(meta.startDate)} až ${iso(meta.endDate)}. ${meta.stats.trips.toLocaleString('cs')} spojů. Připraveno ${new Date(meta.builtAt).toLocaleDateString('cs')}. ${meta.automaticUpdate?`Aktualizace denně kolem 4:00 · sestaveno ${new Date(meta.builtAt).toLocaleString('cs',{timeZone:'Europe/Prague'})}.`:'Bez pravidelné aktualizace.'}`;const restored=loadHash();setMapTime(mapAllDay);$('custom-color').hidden=$('color').value!=='single';renderFilters();ready=true;lastTimeFilter=timeFilterKey(filter());$('photo-mode').disabled=false;setPhotoMode(photoMode,false);recalc();if(restored)pendingPoint=restored;}
try{worker=new Worker(new URL('./worker.js?v=preview-2',import.meta.url),{type:'module'});worker.onmessage=({data})=>{
  if(data.type==='ready')readyData(data);
  else if((data.type==='counts'||data.type==='preview')&&data.id===countsRequest){if(data.type==='counts')confirmedCoverage=countsTarget;geometry=data.geometry;result=data;lightCache.clear();routesLayer.update();if(pendingPoint&&data.type==='counts'){const p=pendingPoint;pendingPoint=null;snapPoint(...p);}drawLegend();drawAgencyLegend();showStatus(data.type==='preview'?'Předběžné trasy — ověřuji provoz…':routesLayer.visibleEdges.length?'':'V této oblasti a výběru nejsou žádné průjezdy.',data.type==='preview',data.type!=='preview'&&!routesLayer.visibleEdges.length);saveHash();}
  else if(data.type==='snap'&&data.id===snapRequest){pointRadius=data.radius;if(restoredPointState){pointMode=restoredPointState.mode;pointStart=restoredPointState.start;restoredPointState=null;}$('point-scroll').scrollTop=0;choosePoint(...data.point);}
  else if(data.type==='point'&&data.id===pointRequest){pointRows=data.passages;$('export').disabled=false;snapHighlight?.remove();snapHighlight=L.polyline(data.lines||[],{color:'#163138',weight:6,opacity:.3,interactive:false}).addTo(map);renderPoint();}
  else if(data.type==='error'&&((data.request==='counts'&&data.id===countsRequest)||(data.request==='point'&&data.id===pointRequest)||(data.request==='snap'&&data.id===snapRequest)||!data.id)){showStatus('Data se nepodařilo načíst: '+data.message,false,true);if(data.request==='point'){$('point-now-status').textContent='Průjezdy se nepodařilo načíst.';$('passages').classList.remove('updating');$('passages').innerHTML='<p class="hint">Průjezdy se nepodařilo načíst. Zkus místo vybrat znovu.</p>';}}
};worker.onerror=e=>showStatus(`Chyba aplikace: ${e.message}`,false,true);worker.postMessage({type:'init'});}catch(e){showStatus(e.message,false,true);}

const terrainStore=new TerrainStore({onChange:()=>{routesLayer.draw();if(pointRows.length)renderPoint();renderEnvironment();}});
function profileAt(lat,lon){return terrainStore.at(lat,lon).profile;}
async function loadTerrain(revalidate=false){
  if(!photoMode&&!point){terrainStore.cancel();return;}
  const b=photoMode?viewport():[point[0],point[1],point[0],point[1]];
  await terrainStore.load([b[0]-.003,b[1]-.005,b[2]+.003,b[3]+.005],point,{revalidate});
}
// Revalidate on return to the app, not on every map move or light-time change.
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&(photoMode||point))loadTerrain(true);});
window.addEventListener('pageshow',e=>{if(e.persisted&&(photoMode||point))loadTerrain(true);});
function requestWeather(){
  clearTimeout(weatherTimer);weatherTimer=setTimeout(async()=>{
    if(!point&&!photoMode)return;
    const c=point||[map.getCenter().lat,map.getCenter().lng],key=`${c[0].toFixed(2)},${c[1].toFixed(2)}`,id=++weatherGeneration;
    if(key===weatherKey&&weatherData&&Date.now()-(weatherCache.get(key)?.loaded||0)<1800000){renderEnvironment();return;}
    weatherKey=key;weatherData=null;weatherError='';renderEnvironment();
    try{let cached=weatherCache.get(key);if(!cached||Date.now()-cached.loaded>1800000){cached={data:await fetchWeather(...c),loaded:Date.now()};weatherCache.set(key,cached);if(weatherCache.size>30)weatherCache.delete(weatherCache.keys().next().value);}if(id!==weatherGeneration)return;weatherData=cached.data;renderEnvironment();}
    catch{if(id!==weatherGeneration)return;weatherError='Počasí není dostupné. Nasvícení tras funguje dál.';renderEnvironment();}
  },400);
}
function renderEnvironment(){
  if(!ready)return;
  const loc=point||[map.getCenter().lat,map.getCenter().lng],sun=sunPosition(pragueInstant(dateKey($('date').value),photoSeconds),...loc),profile=profileAt(...loc),shadow=terrainLight(sun,profile);
  $('point-light-time').value=civilClock(photoSeconds);if(point)renderWeatherChart();
  const terrainAt=terrainStore.at(...loc);
  $('terrain-status').textContent=terrainStatus(terrainAt.state,profile,sun,profile?horizonHeight(profile,sun.azimuth):0,shadow);
  $('map-terrain').textContent=terrainStore.state==='error'?'Část terénu se nepodařilo načíst — chybějící stíny nejsou ověřené.':terrainStore.state==='loading'?'Načítám terénní obzory — chybějící stíny zatím nejsou ověřené.':'Šedá = noc nebo odhad stínu kopců. Místa bez profilu jsou neověřená; přesné stíny domů a stromů nejsou zahrnuté.';
  const w=weatherAt(weatherData,pragueInstant(dateKey($('date').value),photoSeconds));
  const summary=weatherError||(!weatherData?'Načítám počasí…':!w?'Pro tento den / čas není předpověď dostupná.':`${w.visibility===null?'Dohlednost neznámá':`Dohlednost ${(w.visibility/1000).toLocaleString('cs',{maximumFractionDigits:1})} km`} · oblačnost ${w.cloud??'—'} %${w.visibility!==null&&w.visibility<1000?' · ⚠ Možná mlha':''}`);
  $('weather-quick').innerHTML=w?`<span title="Dohlednost">${weatherIcon('eye')} ${visibilityLabel(w.visibility)}</span><span title="Oblačnost">${weatherIcon('cloud')} ${w.cloud??'—'} %</span><span title="Teplota">${weatherIcon('thermo')} ${w.temperature==null?'—':Math.round(w.temperature)+' °C'}</span><span class="weather-time">${civilClock(photoSeconds)}</span>`:weatherError?'Nedostupné':weatherData?'Bez předpovědi':'Načítám…';$('weather-summary').textContent=`Počasí v ${civilClock(photoSeconds)} · ${summary}`;$('map-weather').textContent=summary;
  $('weather-detail').textContent=w?`Nízká oblačnost ${w.lowCloud??'—'} % · srážky ${w.rain??'—'} mm/h · přímé záření ${w.direct===null?'—':Math.round(w.direct)} W/m². Čas ${clock(photoSeconds)}, ${$('date').value}.`:'';
  $('weather-source-note').textContent=weatherData?`Modelová předpověď ALADIN přes Open-Meteo. Místní mlhu může minout. Bod modelu ${weatherData.latitude.toFixed(3)}, ${weatherData.longitude.toFixed(3)}. Počasí nemění barvy tras.`:'Modelová předpověď, nikoli měření na místě. Počasí nemění barvy tras.';
}
$('point-light-time').onchange=()=>{const [h,m]=$('point-light-time').value.split(':').map(Number);if(Number.isFinite(h+m)){setLightTime(h*3600+m*60);saveHash();}};

function currentPrague(){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));return {date:`${parts.year}-${parts.month}-${parts.day}`,seconds:+parts.hour*3600 + +parts.minute*60};}
function useToday(){const n=currentPrague();if(n.date<$('date').min||n.date>$('date').max){alert('Dnešek není v platnosti stažených jízdních řádů.');return null;}$('date').value=n.date;return n;}
function refreshDate(){updateDaylight();requestWeather();renderEnvironment();weatherLayer.draw();recalc();saveHash();}
function applyFilterLight(){setLightTime(filterLightTime(filter(),currentPrague()));}
$('photo-filter').onclick=()=>{applyFilterLight();saveHash();};
$('photo-now').onclick=()=>{setLightTime(roundedNow(currentPrague().seconds));saveHash();};
$('point-now').onclick=()=>{const n=useToday();if(!n)return;pointMode='now';pointStart=n.seconds-300;setLightTime(Math.min(86100,Math.round(n.seconds/300)*300));closeTimeEditor();$('point-scroll').scrollTop=0;refreshDate();};
const gpsIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/></svg>';
const Locate=L.Control.extend({options:{position:'topright'},onAdd(){const box=L.DomUtil.create('div','leaflet-bar gps-control'),b=L.DomUtil.create('button','locate-button',box);b.innerHTML=gpsIcon;b.title='Moje poloha';b.setAttribute('aria-label','Najít moji GPS polohu');L.DomEvent.disableClickPropagation(box);b.onclick=()=>{if(!navigator.geolocation){alert('Prohlížeč nepodporuje lokalizaci.');return;}b.disabled=true;b.classList.add('loading');navigator.geolocation.getCurrentPosition(pos=>{b.disabled=false;b.classList.remove('loading');b.classList.add('located');const loc=[pos.coords.latitude,pos.coords.longitude];gpsMarker?.remove();gpsAccuracy?.remove();gpsMarker=L.circleMarker(loc,{radius:7,color:'#fff',weight:3,fillColor:'#2479c9',fillOpacity:1}).addTo(map);gpsAccuracy=L.circle(loc,{radius:pos.coords.accuracy,color:'#2479c9',weight:1,fillOpacity:.08,interactive:false}).addTo(map);map.setView(loc,16);},err=>{b.disabled=false;b.classList.remove('loading');alert(err.code===1?'Povol přístup k poloze v nastavení prohlížeče.':'Polohu se nepodařilo zjistit. Zkus to znovu.');},{enableHighAccuracy:true,timeout:15000,maximumAge:30000});};return box;}});new Locate().addTo(map);
function renderWeatherChart(){
 const values=Array.from({length:24},(_,h)=>weatherAt(weatherData,pragueInstant(dateKey($('date').value),h*3600))),valid=values.filter(w=>w?.visibility!=null),max=Math.max(1,...valid.map(w=>w.visibility/1000));
 if(!valid.length){$('weather-chart').innerHTML='<p class="hint">Pro tento den není graf dohlednosti dostupný.</p>';return;}
 const x=h=>40+h/23*280,y=v=>100-v/max*80;let paths=[],part=[];values.forEach((w,h)=>{if(w?.visibility==null){if(part.length)paths.push(part);part=[];}else part.push(`${x(h)},${y(w.visibility/1000)}`);});if(part.length)paths.push(part);
 $('weather-chart').innerHTML=`<svg class="weather-plot" viewBox="0 0 340 140" role="img" aria-label="Dohlednost během dne, stupnice v kilometrech"><text x="4" y="12">km</text>${[0,max/2,max].map(v=>`<line x1="40" x2="320" y1="${y(v)}" y2="${y(v)}" stroke="#dce5e5"/><text x="3" y="${y(v)+4}">${v.toLocaleString('cs',{maximumFractionDigits:1})}</text>`).join('')}<line x1="40" x2="320" y1="${y(1)}" y2="${y(1)}" stroke="#587d96" stroke-dasharray="4 3"/><text x="43" y="${y(1)-4}">1 km · možná mlha</text>${paths.map(p=>`<polyline points="${p.join(' ')}" fill="none" stroke="#168a9c" stroke-width="2.5"/>`).join('')}<line x1="${x(photoSeconds/3600)}" x2="${x(photoSeconds/3600)}" y1="15" y2="120" stroke="#163138" stroke-width="1.5"/>${[0,3,6,9,12,15,18,21,23].map(h=>`<text x="${x(h)}" y="135" text-anchor="middle">${h}</text>`).join('')}${values.map((w,h)=>{const sun=sunPosition(pragueInstant(dateKey($('date').value),h*3600),...point),band=!w?'unknown':sun.altitude<=0?'night':w.direct==null?'unknown':w.direct>120?'sun':'cloud',color={unknown:'#eee',night:'#647484',sun:'#edbd57',cloud:'#b5bac1'}[band];return `<rect x="${x(h)-5}" y="108" width="11" height="10" fill="${color}"/>`;}).join('')}${values.map((w,h)=>`<a href="#" data-weather-hour="${h}" aria-label="${h}:00 · ${visibilityLabel(w?.visibility)}"><rect x="${x(h)-6}" y="15" width="12" height="105" fill="transparent"/><title>${h}:00 · ${visibilityLabel(w?.visibility)}</title></a>`).join('')}</svg><div class="weather-hours">${values.map((w,h)=>`<button data-weather-hour="${h}" aria-label="Vybrat ${h}:00, dohlednost ${visibilityLabel(w?.visibility)}" title="${h}:00 · ${visibilityLabel(w?.visibility)}">${h}</button>`).join('')}</div><p class="hint weather-chart-legend"><span>━ Dohlednost</span><span>🟨 Přímé slunce</span><span>◻ Slabé slunce</span><span>◼ Noc</span><span>▧ Bez dat</span></p>`;
}
$('weather-chart').onclick=e=>{const b=e.target.closest('[data-weather-hour]');if(b){e.preventDefault();setLightTime(+b.dataset.weatherHour*3600);saveHash();}};

function ensurePointVisible(){if(!point||expanded)return;requestAnimationFrame(()=>{const p=map.latLngToContainerPoint(point),size=map.getSize(),sheet=$('point-panel').getBoundingClientRect(),rect=map.getContainer().getBoundingClientRect();const mobile=window.matchMedia('(max-width:700px)').matches;const right=mobile?size.x-30:Math.min(size.x-30,sheet.left-rect.left-30),bottom=mobile?Math.min(size.y-35,sheet.top-rect.top-40):size.y-40;const x=Math.max(30,Math.min(right,p.x)),y=Math.max(60,Math.min(bottom,p.y));if(x!==p.x||y!==p.y)map.panBy([p.x-x,p.y-y],{animate:true});});}
$('filters-close').onclick=()=>{$('filters-done').click();};
$('filters-done').onclick=()=>{$('filters').classList.remove('open');$('toggle-filters').setAttribute('aria-expanded','false');map.invalidateSize();ensurePointVisible();};
for(const kind of ['route','agency']){$(kind+'-show-all').onclick=()=>{showAll[kind]=!showAll[kind];kind==='route'?renderRoutes():renderAgencies();};$(kind+'-selected').onclick=e=>{const b=e.target.closest('[data-remove]');if(!b)return;selected[kind==='route'?'routes':'agencies'].delete(+b.dataset.remove);renderRoutes();renderAgencies();recalc();};}
function drawAgencyLegend(){const visible=ready&&!photoMode&&$('color').value==='agency';$('agency-legend').hidden=!visible;if(!visible)return;const ids=new Set(Object.values(result?.edgeAgencies||{}).flat()),q=normalize($('legend-search').value);$('legend-agencies').innerHTML=[...ids].filter(i=>normalize(meta.agencies[i][1]).includes(q)).sort((a,b)=>meta.agencies[a][1].localeCompare(meta.agencies[b][1],'cs')).map(i=>`<button data-agency="${i}" aria-pressed="${highlightAgency===i}" class="${highlightAgency===i?'active':''}"><i style="background:${palette(i)}"></i>${escape(meta.agencies[i][1])}</button>`).join('')||'<p class="hint">Žádní dopravci v tomto výběru.</p>';}
$('legend-search').oninput=drawAgencyLegend;$('legend-agencies').onclick=e=>{const b=e.target.closest('[data-agency]');if(!b)return;highlightAgency=highlightAgency===+b.dataset.agency?null:+b.dataset.agency;drawAgencyLegend();routesLayer.draw();};
$('passages').addEventListener('click',e=>{const b=e.target.closest('.light-icon');if(!b)return;e.preventDefault();e.stopPropagation();const existing=b.closest('details').querySelector('.light-tip');if(existing){existing.remove();return;}document.querySelectorAll('.light-tip').forEach(n=>n.remove());const tip=document.createElement('p');tip.className='light-tip';tip.textContent=b.title;b.closest('details').append(tip);});

// Native precise input plus independent hour / five-minute choices on every browser.
function syncLightPickers(){
 for(const prefix of ['photo','point']){
  const hour=$(prefix+'-light-hour'),minute=$(prefix+'-light-minute'),h=Math.floor(photoSeconds/3600),m=Math.floor(photoSeconds%3600/60);
  hour.value=h;
  const values=Array.from({length:12},(_,i)=>i*5);if(!values.includes(m))values.push(m);values.sort((a,b)=>a-b);
  minute.innerHTML=values.map(v=>`<option value="${v}">${String(v).padStart(2,'0')}</option>`).join('');minute.value=m;
  $(prefix+'-minus').disabled=photoSeconds<=0;$(prefix+'-plus').disabled=photoSeconds>=86340;
 }
}
for(const prefix of ['photo','point']){
 const h=$(prefix+'-light-hour'),m=$(prefix+'-light-minute');
 h.innerHTML=Array.from({length:24},(_,v)=>`<option value="${v}">${String(v).padStart(2,'0')}</option>`).join('');
 h.onchange=m.onchange=()=>{setLightTime(+h.value*3600+ +m.value*60);saveHash();};
 for(const [id,delta] of [['minus',-300],['plus',300]])$(prefix+'-'+id).onclick=()=>{setLightTime(shiftLightTime(photoSeconds,delta));saveHash();};
}
