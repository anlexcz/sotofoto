import sys,unittest,tempfile,json,gzip
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts.build_buildings import *
from shapely.geometry import box
class BuildingsTest(unittest.TestCase):
 def test_heights(self):
  self.assertEqual(height_model({'height':'12','roof:height':'3'}),(12,'exact'))
  self.assertEqual(height_model({'building:levels':'4','roof:height':'2'}),(14,'estimated'))
  self.assertEqual(height_model({'building:levels':'2'}),(6,'estimated'))
  self.assertEqual(height_model({}),(None,'unknown'))
  self.assertEqual(height_model({'height':'nonsense'}),(None,'unknown'))
  self.assertAlmostEqual(number('10 ft'),3.048)
 def test_envelopes(self):
  key=site_key(50,15);x,y=key[1]*CELL[1]*X,key[0]*CELL[0]*Y
  outer,inner=circles(box(x-30,y+30,x+30,y+80))
  row=['a',outer,inner,30,'exact',False]
  exact,estimated,upper,flags=profiles([key],[row])
  self.assertGreater(exact[0,0],0);self.assertEqual(exact[0,36],0)
  self.assertTrue((exact<=upper).all())
  e=profiles([key],[['a',outer,inner,30,'estimated',False]])
  self.assertGreater(e[1][0,0],0);self.assertEqual(e[0][0,0],0)
  u=profiles([key],[['a',outer,inner,None,'unknown',False]])
  self.assertEqual(u[2][0,0],0);self.assertEqual(u[3][0,0]&1,1)
  # Duplicate footprints do not add heights or profiles.
  self.assertTrue(np.array_equal(profiles([key],[row,row])[0],exact))
 def test_geometry_circle_hole_and_cell_bounds(self):
  from shapely.geometry import Polygon,Point
  poly=Polygon([(0,0),(50,0),(50,50),(0,50)],holes=[[(10,10),(40,10),(40,40),(10,40)]])
  outer,inner=circles(poly)
  self.assertTrue(poly.covers(Point(*inner[:2]).buffer(inner[2]*.999)))
 def test_real_osm_parser_crossing_halo_parts_and_covered(self):
  xml="""<osm version="0.6">
  <node id="1" lat="50.0001" lon="15.0098"/><node id="2" lat="50.0001" lon="15.0102"/>
  <node id="3" lat="50.0005" lon="15.0102"/><node id="4" lat="50.0005" lon="15.0098"/>
  <way id="10"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="1"/><tag k="building" v="yes"/><tag k="height" v="12"/></way>
  <way id="11"><nd ref="1"/><nd ref="2"/><tag k="railway" v="tram"/><tag k="covered" v="yes"/></way>
  </osm>"""
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);source=root/'test.osm';source.write_text(xml);out=root/'tiles'
   stats=extract(source,{'5000:1500','5000:1501'},out)
   self.assertEqual(stats['failed'],0)
   rows=[json.load(gzip.open(out/(t+'.json.gz'))) for t in ['5000_1500','5000_1501']]
   for row in rows:
    self.assertTrue(row['complete']);self.assertEqual(len(row['objects']),2)
    self.assertEqual(len({o[0] for o in row['objects']}),2)
    self.assertTrue(any(o[0].startswith('covered:') and o[4]=='unknown' for o in row['objects']))
 def test_incremental_build_and_boundaries(self):
  g={'points':[[50,15],[50.0001,15.0101]],'edges':[[0,1]]}
  self.assertEqual(geographic_keys(g),geographic_keys({'points':list(reversed(g['points'])),'edges':[[1,0]]}))
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);data=root/'data';data.mkdir();cache=root/'cache';pbf=root/'test.pbf';pbf.write_bytes(b'fixture')
   (data/'geometry.json.gz').write_bytes(gzip.compress(json.dumps(g).encode()))
   def source(_,tiles,directory):
    directory.mkdir(exist_ok=True);row=['cross-boundary',[15.01*X,50*Y,30],[15.01*X,50*Y,20],10,'exact',False]
    for t in tiles:(directory/(t.replace(':','_')+'.json.gz')).write_bytes(gzip.compress(json.dumps({'objects':[row],'complete':True}).encode(),mtime=0))
    return {'objects':1}
   with patch('scripts.build_buildings.extract',side_effect=source),patch('scripts.build_buildings.source_coverage',return_value=box(0,0,180,90)):m=build(data,cache,pbf)
   self.assertGreater(m['build']['computed'],0)
   with patch('scripts.build_buildings.extract',side_effect=AssertionError('source reread')),patch('scripts.build_buildings.profiles',side_effect=AssertionError('recompute')),patch('scripts.build_buildings.source_coverage',return_value=box(0,0,180,90)):n=build(data,cache,pbf)
   self.assertEqual(n['build']['computed'],0);self.assertEqual(n['build']['cached'],m['build']['computed'])
   self.assertEqual([c.get('path') for c in m['chunks'].values()],[c.get('path') for c in n['chunks'].values()])
if __name__=='__main__':unittest.main()
