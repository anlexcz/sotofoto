import {Engine} from './engine.js?v=convenience-1';
let engine;
async function zipped(url){const response=await fetch(url);if(!response.ok)throw Error(`Data: HTTP ${response.status}`);if(!globalThis.DecompressionStream)throw Error('Tento prohlížeč neumí rozbalit data. Použij aktuální Chrome, Firefox nebo Safari.');return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();}
self.onmessage=async ({data})=>{
  try{
    if(data.type==='init'){
      const [meta,g,s]=await Promise.all([fetch('../data/meta.json').then(r=>{if(!r.ok)throw Error(`Metadata: HTTP ${r.status}`);return r.json();}),zipped('../data/geometry.json.gz'),zipped('../data/schedule.json.gz')]);
      engine=new Engine(meta,g,s);self.postMessage({type:'ready',meta,geometry:{points:g.points,edges:g.edges}});
    }else if(data.type==='counts'){
      const result=engine.counts(data.filter);self.postMessage({type:'counts',id:data.id,...result},[result.counts.buffer,result.forward.buffer,result.backward.buffer,result.colors.buffer,result.agencyColors.buffer]);
    }else if(data.type==='point')self.postMessage({type:'point',id:data.id,...engine.passages(data.point,data.radius,data.filter,data.allDay,data.edge??null)});
  }catch(error){self.postMessage({type:'error',message:error.message,id:data.id});}
};
