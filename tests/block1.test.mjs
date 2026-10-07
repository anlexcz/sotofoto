import test from 'node:test';
import assert from 'node:assert/strict';
import {edgeLight,passageLight,METRO_LIGHT} from '../src/photo-light.js';
import {photoWindows} from '../src/point-utils.js';
import {shiftLightTime} from '../src/photo-time.js';
import {encodeLink,decodeLink,mapyLink} from '../src/share.js';
import {Engine} from '../src/engine.js';
const noCall=()=>{throw Error('Metro must not evaluate sunlight or terrain');};
test('Metro bypasses sun and terrain calculations with an explicit unrated result',()=>{
 assert.deepEqual(passageLight(1,noCall,noCall,0),{sun:null,light:METRO_LIGHT});
 assert.deepEqual(edgeLight(0,0,noCall,noCall,0),{forward:METRO_LIGHT.color,backward:METRO_LIGHT.color,combined:METRO_LIGHT.color,forwardScore:0,backwardScore:0});
});
test('Mixed edge uses only surface directions, including metro-only reverse direction',()=>{
 const sun=()=>({azimuth:0,altitude:40}),profile=()=>null;
 const single=edgeLight(1,0,sun,profile,0),both=edgeLight(1,1,sun,profile,0);
 assert.equal(single.forward,'#23a455');assert.equal(single.backward,METRO_LIGHT.color);assert.equal(single.combined,single.forward);assert.equal(both.combined,single.forward);
});
test('Recommendations exclude unrated metro from numerator and denominator',()=>{
 const rows=[{time:3600,light:{level:'good'}},{time:3610,light:{level:'bad'}},{time:3620,light:METRO_LIGHT}];
 assert.deepEqual(photoWindows(rows),[{start:3600,end:3900,good:1,all:2}]);assert.deepEqual(photoWindows([rows[2]]),[]);
});
test('Light buttons clamp to the selected civil day while preserving exact minute offset',()=>{
 assert.equal(shiftLightTime(0,-300),0);assert.equal(shiftLightTime(60,-300),0);assert.equal(shiftLightTime(86340,300),86340);assert.equal(shiftLightTime(85800,300),86100);assert.equal(shiftLightTime(43260,300),43560);
});
const state={center:[50.075,14.44],zoom:16,point:[50.08,14.43],routes:['L1'],agencies:['DPP'],modes:[0,1],directions:['S'],operation:'night',date:'2026-10-07',from:'23:00',to:'01:00',mapAllDay:false,pointMode:'from',pointStart:82800,photoMode:true,photoSeconds:85500,color:'agency',thickness:2,opacity:.5,highlightAgency:5,weatherOverlay:false};
test('Place links restore location/semantic filters without date, time or appearance',()=>{
 const hash=encodeLink(state),restored=decodeLink(hash);assert.ok(hash.length<500);assert.deepEqual(restored.center,state.center);assert.deepEqual(restored.point,state.point);assert.deepEqual(restored.routes,state.routes);assert.equal(restored.operation,'night');assert.equal(restored.mapAllDay,true);
 for(const k of ['date','from','to','pointMode','photoSeconds','photoMode','color','thickness','opacity','highlightAgency','weatherOverlay'])assert.equal(restored[k],undefined,k);
});
test('Explicit plan preserves midnight interval, day and independent light time without appearance',()=>{
 const restored=decodeLink(encodeLink(state,'plan'));
 for(const k of ['date','from','to','mapAllDay','pointMode','pointStart','photoMode','photoSeconds'])assert.deepEqual(restored[k],state[k],k);
 assert.equal(restored.color,undefined);assert.equal(restored.thickness,undefined);
});
test('Legacy serialized links, missing or malformed optional parameters remain loadable',()=>{
 assert.deepEqual(decodeLink('#'+encodeURIComponent(JSON.stringify(state))),state);
 assert.deepEqual(decodeLink('#v=2&kind=place&zoom=16&center=%5B50%2C14%5D&color=broken&point=invalid'),{mapAllDay:true,zoom:16,center:[50,14]});assert.deepEqual(decodeLink('#broken'),{});
});
test('Mapy link uses the official showmap interface and precise lon,lat marker',()=>{
 const u=new URL(mapyLink([50.07512345,14.43123456]));assert.equal(u.origin+u.pathname,'https://mapy.com/fnc/v1/showmap');assert.equal(u.searchParams.get('center'),'14.43123456,50.07512345');assert.equal(u.searchParams.get('marker'),'true');
});
test('Surface flags follow each active direction on a shared metro/surface edge; counts unchanged',()=>{
 const meta={startDate:'20261004',endDate:'20261017',routes:[['b','1','Bus',3,0,0],['m','C','Metro',1,0,0]],agencies:[['1','A']],services:[['20261004','20261017',1,1,1,1,1,1,1]],exceptions:{},headsigns:['North']};
 const g={points:[[50,14],[50.01,14]],edges:[[0,1]],shapes:[[[1],[[0,1]]],[[-1],[[0,1]]]]};
 const s={patterns:[[0,[0,1],['A','B'],0],[1,[0,1],['B','A'],0]],trips:[[0,0,0,0,0,[3600,3600,4800,4800],'','b'],[1,0,0,1,0,[3600,3600,4800,4800],'','m']]};
 const e=new Engine(meta,g,s),f={date:'2026-10-05',start:0,end:86400,allDay:true,routes:[],agencies:[],modes:[],directions:[]};
 const r=e.counts(f);assert.deepEqual([...r.counts],[2]);assert.deepEqual([...r.surfaceForward],[1]);assert.deepEqual([...r.surfaceBackward],[0]);
 assert.deepEqual([...e.counts({...f,modes:[1]}).surfaceForward],[0]);assert.equal(e.passages([50.005,14],40,f).passages.length,2);assert.equal(e.passages([50.005,14],40,{...f,modes:[3]}).passages.length,1);
});

test('CSV keeps a metro passage and midnight time but never invents its sun assessment',async()=>{
 const {passageCsv}=await import('../src/passage-export.js');
 const row={time:90000,previousTime:89900,estimated:true,route:0,agency:0,bearing:90,direction:'V',previousStop:'A',headsign:'B',trip:'metro',operationType:1,...passageLight(1,noCall,noCall,90)};
 const csv=passageCsv(row,{routes:[['m','C']],agencies:[['d','DPP']]});
 assert.equal(csv[0],'01:00 +1 den');assert.equal(csv[2],'C');assert.equal(csv[9],'');assert.equal(csv[10],'');assert.equal(csv[11],METRO_LIGHT.label);assert.equal(csv[12],'metro');
});

test('Real UI light handlers leave date, schedule, passage selection and network loaders untouched',async()=>{
 const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm');
 const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 const elements=new Map(),$=id=>{if(!elements.has(id))elements.set(id,{value:'',disabled:false,innerHTML:''});return elements.get(id);};
 Object.assign($('date'),{value:'2026-10-07'});$('from').value='23:00';$('to').value='01:00';
 const rows=[{trip:'bus',time:82800},{trip:'metro',time:90000}],messages=[],requests=[];
 const ctx={$ ,shiftLightTime,Number,Array,String,Math,photoSeconds:43260,lightFrame:null,pointRows:rows,pointStart:82800,mapAllDay:false,worker:{postMessage:m=>messages.push(m)},loadTerrain:()=>requests.push('terrain'),requestWeather:()=>requests.push('weather'),recalc:()=>messages.push('counts'),updateLightControls:()=>{},renderEnvironment:()=>{},weatherLayer:{draw(){}},routesLayer:{draw(){}},requestAnimationFrame:f=>{f();return 1;},cancelAnimationFrame:()=>{},saveHash:()=>{}};
 runInNewContext(source.match(/^function setLightTime\(seconds\).*$/m)[0]+'\n'+source.slice(source.indexOf('// Native precise input')),ctx);
 $('photo-plus').onclick();assert.equal(ctx.photoSeconds,43560);
 $('point-minus').onclick();assert.equal(ctx.photoSeconds,43260);
 $('photo-light-hour').value='23';$('photo-light-minute').value='55';$('photo-light-minute').onchange();assert.equal(ctx.photoSeconds,86100);
 $('point-plus').onclick();assert.equal(ctx.photoSeconds,86340);$('point-plus').onclick();assert.equal(ctx.photoSeconds,86340);
 assert.equal($('date').value,'2026-10-07');assert.equal($('from').value,'23:00');assert.equal($('to').value,'01:00');assert.equal(ctx.pointStart,82800);assert.equal(ctx.pointRows,rows);assert.equal(ctx.mapAllDay,false);assert.deepEqual(messages,[]);assert.deepEqual(requests,[]);
});
