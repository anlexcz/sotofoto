// Optional live acceptance runner: Playwright + Chromium, no production instrumentation.
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const fs=require('fs'),assert=require('node:assert/strict');
const url=process.argv[2]||'https://anlexcz.github.io/sotofoto/';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,proxy:process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY}:undefined,args:['--no-sandbox','--proxy-bypass-list=<-loopback>']});
 const server=url.startsWith('http://127.0.0.1:')?require('node:child_process').spawn('python',['-m','http.server',new URL(url).port,'--directory','dist'],{stdio:'ignore'}):null;
 if(server)await new Promise(r=>setTimeout(r,600));
 const report={url,at:new Date().toISOString(),scenarios:[]};
 try{for(const mobile of [false,true]){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});
 const page=await context.newPage(),errors=[],requests=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});context.on('request',r=>{if(r.url().includes('/data/'))requests.push(r.url());});
 await page.addInitScript(()=>{window.__accept={messages:[]};const Base=window.Worker;window.Worker=class extends Base{constructor(...args){super(...args);this.addEventListener('message',({data:d})=>{window.__accept.messages.push({type:d.type,id:d.id,level:d.level,at:performance.now(),edges:d.geometry?.edges.length,journeys:d.journeys,message:d.message,counts:d.counts?Array.from(d.counts):undefined,passages:d.passages?.length});});}};});
 // Capture Leaflet's map through its public factory before the application module starts.
 await page.addInitScript(()=>{Object.defineProperty(window,'L',{configurable:true,set(value){Object.defineProperty(window,'L',{value,writable:true,configurable:true});const factory=value.map;value.map=(...args)=>window.__accept.map=factory(...args);}});});
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
 const wait=async(since=0)=>{await page.waitForFunction(n=>window.__accept.messages.slice(n).some(x=>x.type==='counts'),since,{timeout:90000});return page.evaluate(n=>window.__accept.messages.slice(n).filter(x=>x.type==='counts').at(-1),since);};
 console.log('DOM ready',mobile,await page.title());let last=await wait();console.log('initial counts',last.level);await page.workers()[0].evaluate(()=>performance.setResourceTimingBufferSize(10000));const start=await page.evaluate(()=>window.__accept.messages.map(({counts,...m})=>m));
 const network=()=>page.workers()[0].evaluate(()=>performance.getEntriesByType('resource').map(x=>({name:x.name,transferSize:x.transferSize,encodedBodySize:x.encodedBodySize})));
 const step=async(name,action)=>{console.log(mobile?'mobile':'desktop',name);const previous=await network(),known=new Set(previous.map(x=>x.name));const since=await page.evaluate(()=>window.__accept.messages.length),before=requests.length;await action();last=await wait(since);const resources=(await network()).slice(previous.length),repeated=resources.filter(x=>known.has(x.name)&&/\.[a-f0-9]{16}\./.test(x.name));assert.ok(repeated.every(x=>x.transferSize===0),'Known hashes must not transfer again: '+JSON.stringify(repeated.filter(x=>x.transferSize)));report.scenarios.push({mobile,name,resources,repeatedHashes:repeated.length,level:last.level,edges:last.edges,journeys:last.journeys,requests:requests.slice(before),messages:await page.evaluate(n=>window.__accept.messages.slice(n).map(({counts,...m})=>m),since)});};
 const center=await page.evaluate(()=>{const c=window.__accept.map.getCenter();return [c.lat,c.lng]});
 await step('same viewport',()=>page.evaluate(()=>window.__accept.map.fire('moveend')));
 await step('A to B',()=>page.evaluate(()=>window.__accept.map.setView([50.355,14.475],13,{animate:false})));
 await step('B to A',()=>page.evaluate(c=>window.__accept.map.setView(c,13,{animate:false}),center));
 await step('detail zoom',()=>page.evaluate(()=>window.__accept.map.setZoom(15,{animate:false})));
 await step('overview zoom',()=>page.evaluate(()=>window.__accept.map.setZoom(11,{animate:false})));
 await step('medium zoom',()=>page.evaluate(()=>window.__accept.map.setZoom(13,{animate:false})));
 await step('night filter',()=>page.evaluate(()=>{document.querySelector('[data-operation=day]').click()}));
 await step('day filter',()=>page.evaluate(()=>{document.querySelector('[data-operation=night]').click();document.querySelector('[data-operation=day]').click()}));
 await step('all filter',()=>page.evaluate(()=>{document.querySelector('[data-operation=night]').click()}));
 const traffic=requests.length;await page.evaluate(()=>document.getElementById('photo-mode').click());await page.waitForTimeout(1200);
 const lightStart=requests.length,messageStart=await page.evaluate(()=>window.__accept.messages.length);
 await page.evaluate(()=>{const s=document.getElementById('photo-slider');for(let i=0;i<8;i++){s.value=36000+i*300;s.dispatchEvent(new Event('input'));}const toggle=document.getElementById('intensity-toggle');toggle.checked=true;toggle.dispatchEvent(new Event('change'));});
 await page.waitForTimeout(700);const lightGTFS=requests.slice(lightStart).filter(x=>/chunks\//.test(x)).length;assert.equal(lightGTFS,0);assert.equal(await page.evaluate(n=>window.__accept.messages.slice(n).filter(x=>x.type==='counts').length,messageStart),0);
 await step('rapid pan zoom latest wins',()=>page.evaluate(c=>{const m=window.__accept.map;for(let i=0;i<6;i++)m.setView([c[0]+i*.005,c[1]+i*.005],i%2?14:13,{animate:false});m.setView(c,15,{animate:false});},center));
 await page.evaluate(()=>window.__accept.map.fire('click',{latlng:window.L.latLng(50.0752,14.4377)}));await page.waitForFunction(()=>window.__accept.messages.some(x=>x.type==='point'),{timeout:90000});
 const worker=page.workers()[0],resources=await worker.evaluate(()=>performance.getEntriesByType('resource').map(x=>({name:x.name,transferSize:x.transferSize,encodedBodySize:x.encodedBodySize,duration:x.duration})));
 // Exercise real production HTTP cache after tiny RAM eviction, separately from count-result reuse.
 const eviction=await worker.evaluate(async()=>{const {ChunkCache,zipped}=await import(new URL('chunks.js?v=http-cache-1',location.href));const index=await (await fetch(new URL('../data/chunks.json.gz',location.href),{cache:'no-cache'})).body.pipeThrough(new DecompressionStream('gzip'));const data=await new Response(index).json();const ids=Object.keys(data.chunks).slice(0,2),cache=new ChunkCache(id=>zipped(new URL('../data/'+data.chunks[id].geometry,location.href)),{maxEntries:1,maxBytes:4*1024*1024});performance.clearResourceTimings();await cache.get(ids[0]);await cache.get(ids[1]);await cache.get(ids[0]);return {ids,entries:cache.items.size,resources:performance.getEntriesByType('resource').map(x=>({name:x.name,transferSize:x.transferSize,encodedBodySize:x.encodedBodySize}))};});
 const a=eviction.resources.filter(x=>x.name===eviction.resources[0].name);assert.equal(a.length,2);assert.equal(a[1].transferSize,0);
 await page.screenshot({path:'/tmp/block2-acceptance-'+(mobile?'mobile':'desktop')+'.png'});
 const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,canvas:document.querySelector('.route-canvas')?.getBoundingClientRect().toJSON(),detail:document.getElementById('passages').innerText.slice(0,300),messages:window.__accept.messages.filter(x=>x.type==='error')}));assert.equal(state.overflow,false);assert.equal(errors.length,0);assert.equal(state.messages.length,0);
 report.scenarios.push({mobile,name:'startup / light / detail / eviction',start,lightGTFS,resources,eviction,state,errors});
 await context.close();
 }}finally{fs.writeFileSync(process.argv[3]||'/tmp/block2-browser.json',JSON.stringify(report,null,2));await browser.close();server?.kill();}
 console.log('Live desktop/mobile acceptance and real HTTP cache eviction passed');
})().catch(e=>{console.error(e);process.exitCode=1});
