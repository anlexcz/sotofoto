import {MODES,MODE_COLORS,DIRECTIONS,timeRange,clock,dateKey,pragueInstant,sunPosition,photographyLight,daylightTimes,bearing,compass} from './core.js';
const $=id=>document.getElementById(id),escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let meta,geometry,result,worker,point,pointRows=[],rendered=0,countsRequest=0,pointRequest=0,allDay=false,timer,ready=false;
let photoMode=false,photoSeconds=43200,solarDay=null,edgeBearings,lightFrame=null;
const selected={routes:new Set(),agencies:new Set(),modes:new Set(),directions:new Set()};
const map=L.map('map',{zoomControl:false,preferCanvas:true}).setView([50.075,14.44],11);
L.control.zoom({position:'topright'}).addTo(map);
const tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · GTFS: <a href="https://pid.cz/o-systemu/opendata/">ROPID / PID</a>, upraveno pro Šotofoto'}).addTo(map);
let tileError=false;tiles.on('tileerror',()=>{if(!tileError){tileError=true;$('map-help').textContent='Mapový podklad se nepodařilo načíst. Trasy a průjezdy zůstávají dostupné.';}});
let marker,halo;
const width=count=>{const zoom=map.getZoom(),scale=Math.max(.45,Math.min(1.5,.65+(zoom-11)*.14));return Math.min(zoom<12?4:zoom<15?6:10,(.8+Math.log2(1+count)*.6)*scale);};
const palette=i=>`hsl(${(i*137.508)%360} 61% 43%)`;
function edgeColor(i) {
  const r=meta.routes[result.colors[i]],mode=$('color').value;
  if(mode==='single')return $('accent').value;
  if(mode==='route')return palette(result.colors[i]);
  if(mode==='agency')return palette(result.agencyColors[i]);
  if(mode==='intensity')return `hsl(${Math.max(0,160-Math.log2(1+result.counts[i])*20)} 70% 42%)`;
  return MODE_COLORS[r?.[3]]||'#586f78';
}
const RoutesLayer=L.Layer.extend({
  onAdd(m){this._map=m;this.canvas=L.DomUtil.create('canvas','route-canvas');m.getPanes().overlayPane.appendChild(this.canvas);m.on('moveend resize zoomend',this.draw,this);m.on('zoomstart',this.hide,this);this.draw();},
  onRemove(m){m.off('moveend resize zoomend',this.draw,this);m.off('zoomstart',this.hide,this);this.canvas.remove();},
  hide(){this.canvas.style.display='none';},
  draw(){
    if(!geometry||!result)return;
    const m=this._map,size=m.getSize(),ratio=window.devicePixelRatio||1,c=this.canvas;
    c.style.display='block';L.DomUtil.setPosition(c,m.containerPointToLayerPoint([0,0]));c.width=size.x*ratio;c.height=size.y*ratio;c.style.width=`${size.x}px`;c.style.height=`${size.y}px`;
    const ctx=c.getContext('2d');ctx.scale(ratio,ratio);ctx.lineCap='round';ctx.lineJoin='round';ctx.globalAlpha=+$('opacity').value;
    const bounds=m.getBounds().pad(.08),split=$('split').checked;
    const instant=photoMode?pragueInstant(dateKey($('date').value),photoSeconds):null;
    for(const i of this.visibleEdges||[]){
      const [a,b]=geometry.edges[i],p=geometry.points[a],q=geometry.points[b];
      if(Math.max(p[0],q[0])<bounds.getSouth()||Math.min(p[0],q[0])>bounds.getNorth()||Math.max(p[1],q[1])<bounds.getWest()||Math.min(p[1],q[1])>bounds.getEast())continue;
      const u=m.latLngToContainerPoint(p),v=m.latLngToContainerPoint(q);
      const normalColor=photoMode?null:edgeColor(i);
      let forwardColor=normalColor,backwardColor=normalColor,combinedColor=normalColor;
      if(photoMode){
        const sun=sunPosition(instant,(p[0]+q[0])/2,(p[1]+q[1])/2),forward=photographyLight(sun,edgeBearings[i]),backward=photographyLight(sun,(edgeBearings[i]+180)%360);
        forwardColor=forward.color;backwardColor=backward.color;
        const hasForward=result.forward[i]>0,hasBackward=result.backward[i]>0;
        combinedColor=hasForward&&hasBackward?(forward.score>=backward.score?forward.color:backward.color):hasForward?forward.color:backward.color;
      }
      const line=(count,offset,color)=>{if(!count)return;ctx.strokeStyle=color;ctx.lineWidth=width(count);const dx=v.x-u.x,dy=v.y-u.y,len=Math.hypot(dx,dy)||1;ctx.beginPath();ctx.moveTo(u.x-dy/len*offset,u.y+dx/len*offset);ctx.lineTo(v.x-dy/len*offset,v.y+dx/len*offset);ctx.stroke();};
      if(split){const f=result.forward[i],b=result.backward[i],offset=(width(f)+width(b))/4+.6;line(f,offset,forwardColor);line(b,-offset,backwardColor);}else line(result.counts[i],0,combinedColor);
    }
  },
  update(){this.visibleEdges=Array.from(result.counts,(_,i)=>i).filter(i=>result.counts[i]).sort((a,b)=>result.counts[a]-result.counts[b]);this.draw();}
});
const routesLayer=new RoutesLayer().addTo(map);
function updateLightControls(){
  if(!solarDay)return;
  const min=Math.min(solarDay.min,photoSeconds),max=Math.max(solarDay.max,photoSeconds);
  $('photo-slider').min=min;$('photo-slider').max=max;$('photo-slider').value=photoSeconds;
  $('photo-time').value=clock(photoSeconds);$('photo-time-label').textContent=clock(photoSeconds);
  $('sun-events').innerHTML=[['Východ',solarDay.sunrise],['Západ',solarDay.sunset]].filter(([,s])=>s!==null).map(([name,s])=>`<span class="sun-event" style="left:${(s-min)/(max-min)*100}%"><i></i>${name} ${clock(s)}</span>`).join('');
  $('photo-mode-note').textContent=$('split').checked?'Každý směr má vlastní barvu. Filtry a počty spojů se nemění.':'Barva ukazuje lepší z přítomných směrů. Filtry a počty spojů se nemění.';
}
function updateDaylight(){if(!ready)return;const c=map.getCenter();solarDay=daylightTimes(dateKey($('date').value),c.lat,c.lng);updateLightControls();}
function setPhotoMode(value){photoMode=value;document.body.classList.toggle('photo-active',value);$('photo-mode').setAttribute('aria-pressed',value);$('photo-mode').classList.toggle('active',value);$('photo-timeline').hidden=!value;$('traffic-legend').hidden=value;updateDaylight();routesLayer.draw();saveHash();}
function setLightTime(seconds){photoSeconds=Math.max(0,Math.min(86399,seconds));updateLightControls();if(lightFrame!==null)cancelAnimationFrame(lightFrame);lightFrame=requestAnimationFrame(()=>{lightFrame=null;routesLayer.draw();});}
$('photo-mode').onclick=()=>setPhotoMode(!photoMode);
$('photo-slider').oninput=()=>setLightTime(Number($('photo-slider').value));
$('photo-slider').onchange=saveHash;
$('photo-time').onchange=()=>{if(!$('photo-time').value)return;const [h,m]=$('photo-time').value.split(':').map(Number);setLightTime(h*3600+m*60);saveHash();};
map.on('moveend zoomend',()=>{if(ready){if(photoMode)updateDaylight();drawLegend();}});
function showStatus(text,busy=false,error=false){$('map-status').innerHTML=(busy?'<span class="spinner"></span>':'')+escape(text);$('map-status').classList.toggle('error',error);}
function filter(){const [start,end]=timeRange($('from').value||'00:00',$('to').value||'00:00');return {date:$('date').value,start,end,...Object.fromEntries(Object.entries(selected).map(([k,v])=>[k,[...v]]))};}
function recalc(){if(!ready)return;clearTimeout(timer);timer=setTimeout(()=>{const f=filter();$('range-label').textContent=f.start===0&&f.end===86400?'Celý den · 00:00–24:00':`${clock(f.start)}–${clock(f.end)}${f.end>86400?' (+1 den)':''}`;let note=`Platnost ${meta.startDate.slice(6)}. ${meta.startDate.slice(4,6)}. – ${meta.endDate.slice(6)}. ${meta.endDate.slice(4,6)}. ${meta.stats.trips.toLocaleString('cs')} spojů. Bez pravidelné aktualizace.`;if(dateKey(f.date)===meta.startDate)note+=' Na prvním dni chybí případné dojezdy z předchozího dne.';if(dateKey(f.date)===meta.endDate&&f.end>86400)note+=' Část po půlnoci je mimo platnost: nové služby dalšího dne nejsou dostupné.';$('data-note').textContent=note;showStatus('Počítám intenzitu…',true);worker.postMessage({type:'counts',id:++countsRequest,filter:f});requestPoint();},120);}
function drawLegend(){let max=1;for(const n of result?.counts||[])if(n>max)max=n;const values=[1,Math.max(2,Math.round(Math.sqrt(max))),max].filter((v,i,a)=>a.indexOf(v)===i);$('legend-scale').innerHTML=values.map(n=>`<span class="legend-step"><span class="legend-stroke" style="height:${width(n)}px"></span>${n}</span>`).join('');}
function renderChips(container,items,key){$(container).innerHTML=items.map(([id,name,color])=>`<button type="button" data-id="${id}" class="${selected[key].has(id)?'active':''}" aria-pressed="${selected[key].has(id)}" ${color?`style="--mode:${color}"`:''}>${color?'<span class="mode-dot"></span>':''}${escape(name)}</button>`).join('');$(container).onclick=e=>{const b=e.target.closest('button');if(!b)return;const id=key==='directions'?b.dataset.id:Number(b.dataset.id);selected[key].has(id)?selected[key].delete(id):selected[key].add(id);renderChips(container,items,key);if(key==='modes')renderRoutes();recalc();};}
function visibleRoutes(){const q=$('route-search').value.toLocaleLowerCase('cs').trim();return meta.routes.map((r,i)=>({r,i})).filter(({r})=>(!selected.modes.size||selected.modes.has(r[3]))&&`${r[1]} ${r[2]}`.toLocaleLowerCase('cs').includes(q)).sort((a,b)=>a.r[1].localeCompare(b.r[1],'cs',{numeric:true})||a.r[0].localeCompare(b.r[0]));}
function renderRoutes(){const list=visibleRoutes();$('routes').innerHTML=list.map(({r,i})=>`<button type="button" data-id="${i}" title="${escape(r[2])} · ${MODES[r[3]]||r[3]}" aria-pressed="${selected.routes.has(i)}" class="${selected.routes.has(i)?'active':''}">${escape(r[1])}${r[5]?' ☾':''}</button>`).join('')||'<p class="hint">Žádná linka neodpovídá hledání.</p>';$('route-summary').textContent=selected.routes.size?`${selected.routes.size} vybráno`:'všechny';}
function visibleAgencies(){const q=$('agency-search').value.toLocaleLowerCase('cs').trim();return meta.agencies.map((a,i)=>({a,i})).filter(({a})=>a[1].toLocaleLowerCase('cs').includes(q));}
function renderAgencies(){$('agencies').innerHTML=visibleAgencies().map(({a,i})=>`<button type="button" data-id="${i}" aria-pressed="${selected.agencies.has(i)}" class="${selected.agencies.has(i)?'active':''}">${escape(a[1])}</button>`).join('');$('agency-summary').textContent=selected.agencies.size?`${selected.agencies.size} vybráno`:'všichni';}
function requestPoint(){if(!point||!ready)return;const id=++pointRequest;$('passages').innerHTML='<p class="empty">Počítám průjezdy…</p>';worker.postMessage({type:'point',id,point,radius:Number($('radius').value),filter:filter(),allDay});}
function choosePoint(lat,lon){point=[lat,lon];$('point-panel').hidden=false;document.body.classList.add('point-open');$('map-help').hidden=true;$('point-coordinates').innerHTML=`${lat.toFixed(5)}, ${lon.toFixed(5)} · <a href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}" target="_blank" rel="noopener">Otevřít místo ↗</a>`;if(marker)marker.remove();if(halo)halo.remove();marker=L.marker(point,{icon:L.divIcon({className:'map-point',iconSize:[18,18],iconAnchor:[9,9]})}).addTo(map);halo=L.circle(point,{radius:Number($('radius').value),color:'#16877d',weight:1,fillOpacity:.08,interactive:false}).addTo(map);map.invalidateSize();requestPoint();saveHash();}
map.on('click',e=>{if(ready)choosePoint(e.latlng.lat,e.latlng.lng);});
function sunFor(row){return sunPosition(pragueInstant(dateKey($('date').value),row.time),row.lat,row.lon);}
function renderPoint(){
  for(const row of pointRows){row.sun=sunFor(row);row.light=photographyLight(row.sun,row.bearing);}
  $('point-title').textContent=pointRows.length?'Tady to projede':'Žádné průjezdy';
  $('passage-count').textContent=`${pointRows.length.toLocaleString('cs')} průjezdů`;
  $('export').disabled=!pointRows.length;
  const hours=Array.from({length:24},(_,h)=>({h,all:0,good:0})),periods=[{label:'Ráno',start:5,end:10,all:0,good:0},{label:'Poledne',start:10,end:14,all:0,good:0},{label:'Odpoledne',start:14,end:20,all:0,good:0}];
  for(const row of pointRows){const h=Math.floor(row.time/3600)%24;hours[h].all++;if(row.light.level==='good')hours[h].good++;for(const p of periods)if(h>=p.start&&h<p.end){p.all++;if(row.light.level==='good')p.good++;}}
  const best=hours.filter(h=>h.good).sort((a,b)=>b.good-a.good||a.h-b.h)[0];
  $('recommendation').innerHTML=`<h3>☀ ${best?`Nejvíc vhodných průjezdů: ${String(best.h).padStart(2,'0')}:00–${String(best.h+1).padStart(2,'0')}:00`:'Vyhlídky na světlo'}</h3><p>${best?`${best.good} průjezdů má v této hodině příznivý směr slunce pro čelo vozu.`:pointRows.length?'V tomto výběru nevychází příznivé přímé nasvícení. Zkus celý den nebo jiný směr jízdy.':'Klikni blíž k trase, zvětši okolí nebo uprav filtry.'}</p><div class="recommend-grid">${periods.map(p=>`<div>${p.label}<strong>${p.good}<span style="font-size:10px;color:var(--muted)"> / ${p.all}</span></strong>vhodné / všechny</div>`).join('')}</div><p class="hint">Ráno 5–10 · poledne 10–14 · odpoledne 14–20. Přehled respektuje aktuální filtry i časový režim.</p>`;
  const max=Math.max(1,...hours.map(h=>h.all));$('hour-chart').innerHTML=hours.map(h=>`<button title="${h.h}:00 – ${h.all} průjezdů, ${h.good} s příznivým světlem" aria-label="Vybrat hodinu ${h.h}:00, ${h.all} průjezdů" data-hour="${h.h}" class="${h.good?'good':''}" style="--height:${Math.max(3,h.all/max*57)}px">${h.h%3===0?`<span>${h.h}</span>`:''}</button>`).join('');
  rendered=0;$('passages').innerHTML='';appendRows();
}
function appendRows(){
  $('load-more')?.remove();
  if(!pointRows.length){$('passages').innerHTML='<p class="empty">V tomto okolí a výběru nic nejede. Zkus jiné místo, větší okolí nebo celý den.</p>';return;}
  const next=pointRows.slice(rendered,rendered+100);
  $('passages').insertAdjacentHTML('beforeend',next.map(row=>{
    const r=meta.routes[row.route],sun=row.sun,light=row.light,nextDay=row.time>=86400?' +1d':'';
    return `<article class="passage"><div class="passage-top"><span class="passage-time">${row.estimated?'≈ ':''}${clock(row.time)}${nextDay}</span><span class="route-badge" style="--badge:${MODE_COLORS[r[3]]||'#586f78'}">${escape(r[1])}</span><span class="direction-badge" title="Místní azimut ${Math.round(row.bearing)}°">${row.direction} ${Math.round(row.bearing)}°</span></div><p class="passage-headsign">→ ${escape(row.headsign)}</p><div class="passage-sub">${escape(meta.agencies[row.agency][1])}<br>Od ${escape(row.previousStop)} · ${clock(row.previousTime)}${row.previousTime<0?' (předchozí den)':''}${row.previousTime>=86400?' (+1 den)':''} ${row.shortName?`· spoj ${escape(row.shortName)}`:''}<br>Slunce ${compass(sun.azimuth)} ${Math.round(sun.azimuth)}° · výška ${Math.round(sun.altitude)}°${row.fallback?'<br>⚠ Trasa není v GTFS; přímá spojnice zastávek.':''}</div><span class="light-tag ${light.level}">${light.label}</span></article>`;
  }).join(''));
  rendered+=next.length;
  if(rendered<pointRows.length){$('passages').insertAdjacentHTML('beforeend',`<button class="load-more" id="load-more">Další průjezdy (${pointRows.length-rendered})</button>`);$('load-more').onclick=appendRows;}
}
$('hour-chart').onclick=e=>{const b=e.target.closest('[data-hour]');if(!b)return;const h=+b.dataset.hour;$('from').value=`${String(h).padStart(2,'0')}:00`;$('to').value=`${String((h+1)%24).padStart(2,'0')}:00`;allDay=false;setPointMode();recalc();};
function setPointMode(){$('point-filtered').classList.toggle('active',!allDay);$('point-day').classList.toggle('active',allDay);}
$('point-filtered').onclick=()=>{allDay=false;setPointMode();requestPoint();};$('point-day').onclick=()=>{allDay=true;setPointMode();requestPoint();};
$('radius').onchange=()=>{halo?.setRadius(Number($('radius').value));requestPoint();};
$('close-point').onclick=()=>{point=null;pointRows=[];$('point-panel').hidden=true;document.body.classList.remove('point-open');marker?.remove();halo?.remove();map.invalidateSize();++pointRequest;saveHash();};
$('toggle-filters').onclick=()=>{const open=$('filters').classList.toggle('open');$('toggle-filters').setAttribute('aria-expanded',open);};
$('filter-form').onsubmit=e=>e.preventDefault();
for(const id of ['date','from','to'])$(id).onchange=()=>{if(!$('date').value||$('date').value<$('date').min||$('date').value>$('date').max){$('date').reportValidity();return;}updateDaylight();recalc();};
$('whole-day').onclick=()=>{$('from').value='00:00';$('to').value='00:00';recalc();};document.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{[$('from').value,$('to').value]=b.dataset.range.split(',');recalc();});
$('route-search').oninput=()=>ready&&renderRoutes();$('agency-search').oninput=()=>ready&&renderAgencies();
$('routes').onclick=e=>{const b=e.target.closest('[data-id]');if(!b)return;const id=+b.dataset.id;selected.routes.has(id)?selected.routes.delete(id):selected.routes.add(id);renderRoutes();recalc();};
$('agencies').onclick=e=>{const b=e.target.closest('[data-id]');if(!b)return;const id=+b.dataset.id;selected.agencies.has(id)?selected.agencies.delete(id):selected.agencies.add(id);renderAgencies();recalc();};
for(const [kind,visible,render] of [['route',visibleRoutes,renderRoutes],['agency',visibleAgencies,renderAgencies]]){
  const key=kind==='route'?'routes':'agencies';$(kind+'-all').onclick=()=>{selected[key].clear();render();recalc();};$(kind+'-visible').onclick=()=>{for(const {i} of visible())selected[key].add(i);render();recalc();};
}
for(const id of ['color','accent','opacity','split'])$(id).oninput=()=>{updateLightControls();routesLayer.draw();saveHash();};
$('reset').onclick=()=>{for(const s of Object.values(selected))s.clear();$('route-search').value='';$('agency-search').value='';$('from').value='00:00';$('to').value='00:00';renderFilters();recalc();};
$('export').onclick=()=>{
  const q=s=>'"'+String(s).replaceAll('"','""')+'"';const lines=[['Čas průjezdu','Odhad','Linka','Cíl','Dopravce','Směr','Azimut jízdy','Předchozí zastávka','Odjezd z předchozí','Azimut slunce','Výška slunce','Světlo','ID spoje']];
  for(const r of pointRows)lines.push([clock(r.time)+(r.time>=86400?' +1 den':''),r.estimated?'ano':'ne',meta.routes[r.route][1],r.headsign,meta.agencies[r.agency][1],r.direction,Math.round(r.bearing),r.previousStop,clock(r.previousTime)+(r.previousTime<0?' předchozí den':''),Math.round(r.sun.azimuth),Math.round(r.sun.altitude),r.light.label,r.trip]);
  const blob=new Blob(['\uFEFF'+lines.map(l=>l.map(q).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`sotofoto-${$('date').value}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
function renderFilters(){renderChips('modes',Object.entries(MODES).filter(([id])=>meta.routes.some(r=>r[3]===+id)).map(([id,n])=>[+id,n,MODE_COLORS[id]]),'modes');renderChips('directions',DIRECTIONS.map(d=>[d,d]),'directions');renderRoutes();renderAgencies();}
function saveHash(){if(!ready)return;const f=filter(),c=map.getCenter();const state={...f,routes:f.routes.map(i=>meta.routes[i][0]),agencies:f.agencies.map(i=>meta.agencies[i][0]),from:$('from').value,to:$('to').value,center:[+c.lat.toFixed(5),+c.lng.toFixed(5)],zoom:map.getZoom(),point,photoMode,photoSeconds,color:$('color').value};history.replaceState(null,'','#'+encodeURIComponent(JSON.stringify(state)));}
function loadHash(){try{const s=JSON.parse(decodeURIComponent(location.hash.slice(1)));if(s.date>=$('date').min&&s.date<=$('date').max)$('date').value=s.date;if(/^\d\d:\d\d$/.test(s.from))$('from').value=s.from;if(/^\d\d:\d\d$/.test(s.to))$('to').value=s.to;for(const id of s.routes||[]){const i=meta.routes.findIndex(r=>r[0]===id);if(i>=0)selected.routes.add(i);}for(const id of s.agencies||[]){const i=meta.agencies.findIndex(a=>a[0]===id);if(i>=0)selected.agencies.add(i);}for(const m of s.modes||[])if(m in MODES)selected.modes.add(m);for(const d of s.directions||[])if(DIRECTIONS.includes(d))selected.directions.add(d);if(Number.isFinite(s.photoSeconds))photoSeconds=Math.max(0,Math.min(86399,s.photoSeconds));photoMode=s.photoMode===true;if(['mode','route','agency','intensity','single'].includes(s.color))$('color').value=s.color;if(s.center?.every(Number.isFinite))map.setView(s.center,Math.max(5,Math.min(19,s.zoom||11)));return s.point?.length===2&&s.point.every(Number.isFinite)?s.point:null;}catch{return null;}}
map.on('moveend',saveHash);
function readyData(data){meta=data.meta;geometry=data.geometry;edgeBearings=Float32Array.from(geometry.edges,([a,b])=>bearing(geometry.points[a],geometry.points[b]));const iso=d=>`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;$('date').min=iso(meta.startDate);$('date').max=iso(meta.endDate);const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());$('date').value=today>=$('date').min&&today<=$('date').max?today:$('date').min;$('date').disabled=false;$('feed-label').textContent=`GTFS ${iso(meta.startDate)} – ${iso(meta.endDate)}`;$('data-note').textContent=`Platnost ${iso(meta.startDate)} až ${iso(meta.endDate)}. ${meta.stats.trips.toLocaleString('cs')} spojů. Připraveno ${new Date(meta.builtAt).toLocaleDateString('cs')}. Bez pravidelné aktualizace.`;const restored=loadHash();renderFilters();ready=true;$('photo-mode').disabled=false;setPhotoMode(photoMode);recalc();if(restored)choosePoint(...restored);}
try{worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});worker.onmessage=({data})=>{
  if(data.type==='ready')readyData(data);
  else if(data.type==='counts'&&data.id===countsRequest){result=data;routesLayer.update();drawLegend();showStatus(`${data.journeys.toLocaleString('cs')} spojů · ${routesLayer.visibleEdges.length.toLocaleString('cs')} úseků`);saveHash();}
  else if(data.type==='point'&&data.id===pointRequest){pointRows=data.passages;renderPoint();}
  else if(data.type==='error')showStatus(data.message,false,true);
};worker.onerror=e=>showStatus(`Chyba aplikace: ${e.message}`,false,true);worker.postMessage({type:'init'});}catch(e){showStatus(e.message,false,true);}
