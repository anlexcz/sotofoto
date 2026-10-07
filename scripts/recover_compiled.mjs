// Reverse spatial partitioning using build-global IDs. No new geometry or times.
import {readFileSync,writeFileSync} from 'node:fs';import {gunzipSync,gzipSync} from 'node:zlib';import {mergeChunks,decodeSchedule} from '../src/chunks.js';
const root=process.argv[2],index=JSON.parse(readFileSync(root+'/chunks.json'));
const chunks=Object.values(index.chunks).map(c=>{const g=JSON.parse(gunzipSync(readFileSync(root+'/'+c.geometry))),bytes=gunzipSync(readFileSync(root+'/'+c.schedule));return {geometry:g,schedule:decodeSchedule(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))};});
const {geometry,schedule}=mergeChunks(chunks);geometry.shapes=geometry.shapes.map(s=>s.slice(0,2));schedule.trips=schedule.trips.map(t=>[...t.slice(0,5),[...t[5]],...t.slice(6)]);
writeFileSync(root+'/geometry.json.gz',gzipSync(JSON.stringify(geometry)));writeFileSync(root+'/schedule.json.gz',gzipSync(JSON.stringify(schedule)));
console.log('Recovered compiled artifact:',geometry.edges.length,'edges,',schedule.trips.length,'trips');
