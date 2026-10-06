"""Reproducible synthetic angular-resolution comparison, no external download."""
import json,math,sys,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts.build_buildings import profiles,site_key,CELL,X,Y
import numpy as np
key=site_key(50,15);x,y=key[1]*CELL[1]*X,key[0]*CELL[0]*Y
# Representative widths/distances, rotated between profile azimuths.
objects=[]
for i,(d,r,h) in enumerate([(20,8,12),(30,15,25),(60,20,30),(200,30,20),(400,15,12)]):
 a=math.radians(i*71+2.3);c=[x+math.sin(a)*d,y+math.cos(a)*d,r]
 objects.append([str(i),c,c,h,'exact',False])
output={}
for step in [5,2.5,1]:
 started=time.perf_counter();values=profiles([key],objects,step);elapsed=time.perf_counter()-started
 # Evaluate 3600 independent azimuths x solar heights. The uncertainty band is
 # the metric: coarser bins never interpolate away a narrow blocker.
 az=np.arange(0,360,.1);k=np.floor(az/step).astype(int);states={}
 for altitude in [5,15,30,45]:
  low=values[0][0,k]/10;high=values[2][0,k]/10
  states[str(altitude)]={'blocked':int((altitude<=low).sum()),'clear':int((altitude>high).sum()),'uncertain':int(((altitude>low)&(altitude<=high)).sum())}
 output[str(step)]={'samples':int(360/step),'bytesPerProfile':8+int(360/step)*7,'seconds':elapsed,'states':states}
print(json.dumps(output,indent=2))
