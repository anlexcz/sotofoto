/* Optional external Playwright validation; no dependency added to the app.
 * PLAYWRIGHT_PATH=/absolute/path/to/playwright CHROME_PATH=/path/to/chrome \
 * node scripts/browser-p3.cjs [dist-or-reference-directory] [output.json]
 */
const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
(async()=>{
 const server=spawn('python',['-m','http.server','8002','--directory',process.argv[2]||'dist'],{stdio:'ignore'});
 await new Promise(r=>setTimeout(r,800));
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--no-sandbox']});
 const results=[];
 try{
 for(const viewport of [{width:390,height:844},{width:1440,height:900}]){
  const context=await browser.newContext({viewport}),page=await context.newPage(),cdp=await context.newCDPSession(page),responses=[],requests=[],errors=[];
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  context.on('request',r=>requests.push(r.url()));context.on('response',async r=>{if(r.url().includes('/data/'))responses.push({url:r.url(),bytes:Number((await r.allHeaders())['content-length']||0),status:r.status()});});page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.__messages=[];const Base=window.Worker;window.Worker=class extends Base{constructor(...a){super(...a);this.addEventListener('message',e=>window.__messages.push({type:e.data.type,at:performance.now()}));}}});
  await page.goto('http://127.0.0.1:8002/');await page.waitForFunction(()=>window.__messages.some(x=>x.type==='counts'));await page.waitForTimeout(500);
  const start=await page.evaluate(()=>window.__messages),initial=responses.slice(),heapBefore=await cdp.send('Runtime.getHeapUsage');
  if(initial.some(x=>x.url.includes('building')))throw Error('Normal start fetched building data');
  await page.click('#photo-mode');await page.waitForTimeout(8000);const photo=responses.filter(x=>x.url.includes('building'));
  const countBefore=await page.evaluate(()=>window.__messages.filter(x=>x.type==='counts').length),before=requests.length;
  const sliderMs=await page.evaluate(async()=>{const times=[],slider=document.getElementById('photo-slider');for(let i=0;i<30;i++){const t=performance.now();slider.value=String(8*3600+i*300);slider.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));times.push(performance.now()-t);}return times;});
  await page.waitForTimeout(500);
  const sliderRequests=requests.slice(before).filter(x=>/\/data\/|open-meteo/.test(x)),countAfter=await page.evaluate(()=>window.__messages.filter(x=>x.type==='counts').length);
  if(sliderRequests.length||countBefore!==countAfter)throw Error('Slider fetched data / recounted GTFS');
  await page.mouse.click(Math.floor(viewport.width*.55),Math.floor(viewport.height*.45));await page.waitForTimeout(5000);
  const detail=await page.locator('#direct-sun-status').count()?await page.locator('#direct-sun-status').textContent():'P2 reference',detailBuilding=responses.filter(x=>x.url.includes('building')).slice(photo.length),heapAfter=await cdp.send('Runtime.getHeapUsage');
  const share=page.url(),passages=await page.locator('#passage-count').textContent();
  let csvBytes=0;
  if(await page.locator('#export').isEnabled()){
   const downloadPromise=page.waitForEvent('download');await page.click('#export');const d=await downloadPromise;csvBytes=fs.statSync(await d.path()).size;
  }
  await page.goto(share);await page.waitForFunction(()=>window.__messages.some(x=>x.type==='counts'));await page.waitForTimeout(5000);
  const restored=await page.locator('#photo-mode').getAttribute('aria-pressed');
  results.push({viewport,cpuThrottle:4,start,initial,photo,detailBuilding,detail,passages,csvBytes,shareRestored:restored,sliderRequests,sliderMs,heapBefore,heapAfter,errors});
  await context.close();
 }
 fs.writeFileSync(process.argv[3]||'/tmp/p3-browser-metrics.json',JSON.stringify({browser:browser.version(),date:new Date().toISOString(),results},null,2));
 console.log(JSON.stringify(results.map(x=>({viewport:x.viewport,start:x.start,buildingBytes:x.photo.reduce((n,r)=>n+r.bytes,0),detail:x.detail,sliderRequests:x.sliderRequests.length,errors:x.errors})),null,2));
 }finally{await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
