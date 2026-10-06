// Real browser HTTP cache test, with immediately stale immutable responses.
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const http=require('node:http'),fs=require('node:fs'),assert=require('node:assert/strict'),{gzipSync}=require('node:zlib');
(async()=>{
 let version=1;const hits={};
 const server=http.createServer((req,res)=>{
  hits[req.url]=(hits[req.url]||0)+1;res.setHeader('Cache-Control','max-age=0');
  if(req.url==='/advance'){version++;res.end('ok');return;}
  if(req.url==='/src/chunks.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync('src/chunks.js'));return;}
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<title>HTTP cache acceptance</title>');return;}
  if(req.url==='/data/meta.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({version}));return;}
  if(req.url==='/data/chunks.json.gz'){res.end(gzipSync(JSON.stringify({version,path:`data/${version}.0123456789abcdef.json.gz`})));return;}
  res.end(gzipSync(JSON.stringify({path:req.url})));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result=await page.evaluate(async()=>{
   const {ChunkCache,zipped}=await import('/src/chunks.js'),cache=new ChunkCache(id=>zipped(`/data/${id}.0123456789abcdef.json.gz`),{maxEntries:1,maxBytes:1});
   await Promise.all([cache.get('A'),cache.get('A')]);await cache.get('B');await cache.get('A');
   const before=await zipped('/data/chunks.json.gz');const metaBefore=await(await fetch('/data/meta.json',{cache:'no-cache'})).json();
   await fetch('/advance');const after=await zipped('/data/chunks.json.gz');const metaAfter=await(await fetch('/data/meta.json',{cache:'no-cache'})).json();await zipped('/'+after.path);
   return {before,after,metaBefore,metaAfter,entries:cache.items.size,resources:performance.getEntriesByType('resource').map(x=>({name:x.name,transferSize:x.transferSize,encodedBodySize:x.encodedBodySize}))};
  });
  assert.equal(hits['/data/A.0123456789abcdef.json.gz'],1);assert.equal(hits['/data/B.0123456789abcdef.json.gz'],1);assert.equal(hits['/data/chunks.json.gz'],2);assert.equal(hits['/data/meta.json'],2);assert.equal(result.after.version,2);assert.equal(result.metaAfter.version,2);assert.equal(hits['/'+result.after.path],1);
  console.log(JSON.stringify({passed:true,hits,result},null,2));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
