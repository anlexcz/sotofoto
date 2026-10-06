import {civilClock} from './point-utils.js';
import {clock} from './core.js';
import {operationLabel} from './operation-types.js';
export function passageCsv(r,meta){
 return [civilClock(r.time)+(r.time>=86400?' +1 den':''),r.estimated?'ano':'ne',meta.routes[r.route][1],r.headsign,meta.agencies[r.agency][1],r.direction,Math.round(r.bearing),r.previousStop,clock(r.previousTime)+(r.previousTime<0?' předchozí den':''),r.sun?Math.round(r.sun.azimuth):'',r.sun?Math.round(r.sun.altitude):'',r.light.label,r.trip,operationLabel(r.operationType)||'Pravidelný'];
}
