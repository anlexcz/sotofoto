import json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts.chunk_data import write_chunks
root=Path(sys.argv[1]);root.mkdir(exist_ok=True)
meta={'version':2,'startDate':'20261004','endDate':'20261008','routes':[['day','1','Day',3,'',0],['night','91','Night',3,'',1]],'agencies':[['a','A'],['b','B']],'headsigns':['End'],'services':[['20261004','20261008',1,1,1,1,1,1,1]],'exceptions':{},'stats':{}}
g={'points':[[50.025,14.44],[50.025,14.45],[50.025,14.46],[50.025,14.47]],'edges':[[0,1],[1,2],[2,3]],'shapes':[[[1,2,3],[[0,1],[1,2],[2,3]]],[[-3,-2,-1],[[0,1],[1,2],[2,3]]],[[1,2,-2,-1],[[0,1],[1,2],[2,3],[3,4]]]]}
s={'patterns':[[0,[0,1,2,3],['A','B','C','D'],0],[1,[0,1,2,3],['D','C','B','A'],0,[7,1,8,8]],[2,[0,1,2,3,4],['A','B','C','B','A'],0]],'trips':[]}
for i,(route,agency,pattern,start) in enumerate([(0,0,0,3600),(0,1,1,3600),(1,0,0,90000),(1,1,0,1800),(0,0,2,7200)]):
 n=len(s['patterns'][pattern][1]);s['trips'].append([route,agency,0,pattern,0,[start+j*60 for j in range(n) for _ in range(2)],'',str(i)])
(root/'meta.json').write_text(json.dumps(meta));(root/'fixture.json').write_text(json.dumps({'meta':meta,'geometry':g,'schedule':s}));write_chunks(root,g,s)
