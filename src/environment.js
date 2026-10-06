export function horizonHeight(profile,azimuth,step=5){const index=((azimuth%360)+360)%360/step,a=Math.floor(index),f=index-a;return (profile[a]*(1-f)+profile[(a+1)%profile.length]*f)/10;}
export function terrainLight(sun,profile){return profile&&sun.altitude>0&&sun.altitude<horizonHeight(profile,sun.azimuth);}
export function weatherAt(data,instant){if(!data?.hourly)return null;const h=data.hourly,t=instant.getTime()/1000;let i=-1;for(let j=0;j<h.time.length;j++)if(h.time[j]<=t&&t<h.time[j]+3600){i=j;break;}if(i<0)return null;const get=k=>Number.isFinite(h[k]?.[i])?h[k][i]:null;return {temperature:get('temperature_2m'),time:h.time[i],visibility:get('visibility'),cloud:get('cloud_cover'),lowCloud:get('cloud_cover_low'),rain:get('precipitation'),direct:get('direct_normal_irradiance_instant')};}
export async function fetchWeather(lat,lon){const url=new URL('https://api.open-meteo.com/v1/forecast');url.search=new URLSearchParams({latitude:lat.toFixed(3),longitude:lon.toFixed(3),hourly:'temperature_2m,visibility,cloud_cover,cloud_cover_low,precipitation,direct_normal_irradiance_instant',models:'chmi_aladin_seamless',forecast_days:'3',past_days:'1',timeformat:'unixtime',timezone:'Europe/Prague'});const response=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Počasí se nepodařilo načíst');return response.json();}

// Bounded, globally aligned sampling grid: finer samples as the map zooms in.
export function weatherGrid(bounds){
 const factor=Math.max(1,Math.ceil((bounds.north-bounds.south)/(.009*6)),Math.ceil((bounds.east-bounds.west)/(.014*6))),dy=.009*factor,dx=.014*factor;
 const south=Math.floor(bounds.south/dy)*dy,west=Math.floor(bounds.west/dx)*dx,rows=Math.ceil((bounds.north-south)/dy)+1,cols=Math.ceil((bounds.east-west)/dx)+1;
 const sites=[];for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)sites.push([+(south+y*dy).toFixed(6),+(west+x*dx).toFixed(6)]);
 return {south,west,dy,dx,rows,cols,sites,spacing:factor};
}
export function weatherTint(w,day=true){
 if(!w||w.visibility===null&&w.cloud===null)return null;
 const fog=w.visibility===null?0:Math.max(0,Math.min(1,(10000-w.visibility)/10000));
 const cloud=day?(w.cloud??0)/100*(w.direct===null?1:Math.max(0,1-w.direct/500)):0;
 const fogAlpha=fog*.57,cloudAlpha=cloud*.27,alpha=1-(1-fogAlpha)*(1-cloudAlpha);
 const mix=fogAlpha/(fogAlpha+cloudAlpha||1);
 return {r:Math.round(145-57*mix),g:Math.round(150-25*mix),b:Math.round(158-8*mix),alpha};
}
export function interpolateTint(values,cols,rows,x,y){
 if(x<0||y<0||x>cols-1||y>rows-1)return null;
 const a=Math.min(cols-2,Math.floor(x)),b=Math.min(rows-2,Math.floor(y)),fx=x-a,fy=y-b;
 const corners=[values[b*cols+a],values[b*cols+a+1],values[(b+1)*cols+a],values[(b+1)*cols+a+1]];
 if(corners.some(v=>!v))return null;
 const weights=[(1-fx)*(1-fy),fx*(1-fy),(1-fx)*fy,fx*fy],out={r:0,g:0,b:0,alpha:0};
 for(let i=0;i<4;i++){out.alpha+=corners[i].alpha*weights[i];for(const k of ['r','g','b'])out[k]+=corners[i][k]*corners[i].alpha*weights[i];}
 if(out.alpha)for(const k of ['r','g','b'])out[k]/=out.alpha;
 return out;
}
export async function fetchWeatherBatch(sites){
 const url=new URL('https://api.open-meteo.com/v1/forecast');url.search=new URLSearchParams({latitude:sites.map(p=>p[0].toFixed(6)).join(','),longitude:sites.map(p=>p[1].toFixed(6)).join(','),hourly:'temperature_2m,visibility,cloud_cover,cloud_cover_low,precipitation,direct_normal_irradiance_instant',models:'chmi_aladin_seamless',forecast_days:'3',past_days:'1',timeformat:'unixtime',timezone:'Europe/Prague'});
 const response=await fetch(url,{signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error('Vrstva počasí není dostupná');const data=await response.json(),list=Array.isArray(data)?data:[data];if(list.length!==sites.length)throw Error('Neúplná data počasí');return list;
}
