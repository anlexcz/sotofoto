import {dayContexts,dateKey,interpolation,passageTime,bearing,compass,project,addDays} from './core.js';

export class Engine {
  constructor(meta,geometry,schedule) {
    this.meta=meta;this.g=geometry;this.s=schedule;
    this.patternTrips=schedule.patterns.map(()=>[]);
    schedule.trips.forEach((t,i)=>this.patternTrips[t[3]].push(i));
    this.edgeBearings=Float32Array.from(geometry.edges,([a,b])=>bearing(geometry.points[a],geometry.points[b]));
    const edgeLengths=new Uint32Array(geometry.edges.length);
    this.patternSegments=schedule.patterns.map((p,pi)=>{
      const [refs,ds]=geometry.shapes[p[0]],indices=new Int16Array(refs.length).fill(-1),fractions=new Float32Array(refs.length),atStop=new Uint8Array(refs.length);
      refs.forEach((ref,k)=>{
        const [start,end]=ds[k];
        if(end<p[1][0]||start>p[1].at(-1))return;
        const d=(Math.max(start,p[1][0])+Math.min(end,p[1].at(-1)))/2;
        const pos=interpolation(p[1],d);
        if(!pos)return;
        const edge=Math.abs(ref)-1;
        indices[k]=pos.i;fractions[k]=pos.f;atStop[k]=+pos.atStop;edgeLengths[edge]++;
      });return {indices,fractions,atStop};
    });
    this.edgeStarts=new Uint32Array(geometry.edges.length+1);
    for(let i=0;i<edgeLengths.length;i++)this.edgeStarts[i+1]=this.edgeStarts[i]+edgeLengths[i];
    this.edgePatternIds=new Uint32Array(this.edgeStarts.at(-1));this.edgeSegmentIds=new Uint32Array(this.edgeStarts.at(-1));
    const cursors=this.edgeStarts.slice();
    schedule.patterns.forEach((p,pi)=>geometry.shapes[p[0]][0].forEach((ref,k)=>{
      if(this.patternSegments[pi].indices[k]<0)return;
      const edge=Math.abs(ref)-1,index=cursors[edge]++;
      this.edgePatternIds[index]=pi;this.edgeSegmentIds[index]=k;
    }));
    this.grid=new Map();const cell=.01;
    geometry.edges.forEach(([a,b],i)=>{
      const p=geometry.points[a],q=geometry.points[b];
      for(let x=Math.floor(Math.min(p[1],q[1])/cell);x<=Math.floor(Math.max(p[1],q[1])/cell);x++)
        for(let y=Math.floor(Math.min(p[0],q[0])/cell);y<=Math.floor(Math.max(p[0],q[0])/cell);y++){
          const key=`${x}:${y}`;if(!this.grid.has(key))this.grid.set(key,[]);this.grid.get(key).push(i);
        }
    });
  }
  segment(pi,k){
    const p=this.s.patterns[pi],ref=this.g.shapes[p[0]][0][k],[start,end]=this.g.shapes[p[0]][1][k],edge=Math.abs(ref)-1,s=this.patternSegments[pi];
    return {edge,ref,k,start,end,pos:{i:s.indices[k],f:s.fractions[k],atStop:!!s.atStop[k]},bearing:(this.edgeBearings[edge]+(ref<0?180:0))%360};
  }
  matching(t,filter) {
    return (!filter.routes.length||filter.routes.includes(t[0]))&&(!filter.agencies.length||filter.agencies.includes(t[1]))&&(!filter.modes.length||filter.modes.includes(this.meta.routes[t[0]][3]));
  }
  instances(filter,allDay=false) {
    const key=dateKey(filter.date),end=allDay?86400:filter.end;
    const contexts=dayContexts(this.meta,key,end),result=[];
    for(let i=0;i<this.s.trips.length;i++) {
      const t=this.s.trips[i];if(!this.matching(t,filter))continue;
      for(const ctx of contexts)if(ctx.active.has(t[2])){
        const first=t[5][1]+ctx.offset,last=t[5].at(-1)+ctx.offset;
        const from=allDay?0:filter.start;
        if(last>=from&&first<end)result.push({t,index:i,offset:ctx.offset,day:ctx.day});
      }
    }
    return result;
  }
  counts(filter) {
    const n=this.g.edges.length,counts=new Uint32Array(n),forward=new Uint32Array(n),backward=new Uint32Array(n),colors=new Int32Array(n).fill(-1),agencyColors=new Int32Array(n).fill(-1);
    let journeys=0;
    for(const {t,offset} of this.instances(filter)) {
      let contributed=false;
      const p=this.s.patterns[t[3]],refs=this.g.shapes[p[0]][0],s=this.patternSegments[t[3]];
      for(let k=0;k<refs.length;k++) {
        const index=s.indices[k];if(index<0)continue;
        const ref=refs[k],e=Math.abs(ref)-1;
        const direction=(this.edgeBearings[e]+(ref<0?180:0))%360;
        if(filter.directions.length&&!filter.directions.includes(compass(direction)))continue;
        const time=(s.atStop[k]?t[5][index*2+1]:t[5][index*2+1]+(t[5][(index+1)*2]-t[5][index*2+1])*s.fractions[k])+offset;
        if(time<filter.start||time>=filter.end)continue;
        counts[e]++;if(ref>0)forward[e]++;else backward[e]++;
        if(colors[e]<0){colors[e]=t[0];agencyColors[e]=t[1];}contributed=true;
      }
      if(contributed)journeys++;
    }
    return {counts,forward,backward,colors,agencyColors,journeys};
  }
  near(point,radius) {
    const degrees=radius/111195,lonDegrees=degrees/Math.cos(point[0]*Math.PI/180),ids=new Set();
    for(let x=Math.floor((point[1]-lonDegrees)/.01);x<=Math.floor((point[1]+lonDegrees)/.01);x++)
      for(let y=Math.floor((point[0]-degrees)/.01);y<=Math.floor((point[0]+degrees)/.01);y++)
        for(const e of this.grid.get(`${x}:${y}`)||[])ids.add(e);
    const near=[];
    for(const e of ids){const [a,b]=this.g.edges[e],p=project(point,this.g.points[a],this.g.points[b]);if(p.distance<=radius)near.push({edge:e,...p});}
    return near.sort((a,b)=>a.distance-b.distance);
  }
  passages(point,radius,filter,allDay=false,edge=null) {
    const near=this.near(point,radius).filter(p=>edge===null||p.edge===edge),candidates=new Map();
    for(const p of near)for(let j=this.edgeStarts[p.edge];j<this.edgeStarts[p.edge+1];j++){
      const pi=this.edgePatternIds[j],si=this.edgeSegmentIds[j];
      if(!candidates.has(pi))candidates.set(pi,[]);
      const seg=this.segment(pi,si),f=seg.ref>0?p.f:1-p.f;
      const d=seg.start+(seg.end-seg.start)*f,pos=interpolation(this.s.patterns[pi][1],d);
      if(pos)candidates.get(pi).push({seg,pos,distance:p.distance,lat:p.lat,lon:p.lon});
    }
    // Consecutive edges near the click describe one passage; loops can yield more.
    for(const [pi,list] of candidates){
      list.sort((a,b)=>a.seg.k-b.seg.k);const groups=[];
      for(const c of list){const last=groups.at(-1);if(!last||c.seg.k>last.at(-1).seg.k+1)groups.push([c]);else last.push(c);}
      candidates.set(pi,groups.map(g=>g.reduce((a,b)=>a.distance<=b.distance?a:b)));
    }
    const result=[];
    for(const {t,index,offset,day} of this.instances(filter,allDay)){
      for(const c of candidates.get(t[3])||[]){
        const direction=compass(c.seg.bearing);
        if(filter.directions.length&&!filter.directions.includes(direction))continue;
        const time=passageTime(t[5],c.pos)+offset,from=allDay?0:filter.start,to=allDay?86400:filter.end;
        if(time<from||time>=to)continue;
        const p=this.s.patterns[t[3]],previousTime=t[5][c.pos.i*2+1]+offset;
        result.push({time,previousTime,previousStop:p[2][c.pos.i],route:t[0],agency:t[1],headsign:this.meta.headsigns[t[4]],bearing:c.seg.bearing,direction,estimated:!c.pos.atStop,fallback:!!p[3],distance:c.distance,lat:c.lat,lon:c.lon,edge:c.seg.edge,trip:t[7],shortName:t[6],serviceDay:day,key:`${index}:${day}:${c.seg.k}`});
      }
    }
    const surface=result.some(r=>this.meta.routes[r.route][3]!==1),explicitMetro=filter.modes.length===1&&filter.modes[0]===1;
    const passages=(surface&&!explicitMetro?result.filter(r=>this.meta.routes[r.route][3]!==1):result).sort((a,b)=>a.time-b.time);
    return {passages,metroOmitted:surface&&!explicitMetro&&result.length!==passages.length,edges:[...new Set(passages.map(r=>r.edge))],nearest:near[0]||null};
  }
}
