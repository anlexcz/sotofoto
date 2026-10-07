import unittest,tempfile,sys,json,zipfile,csv,io
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from gtfs_update import inspect,merge,prepare,read,active

def fixture(p,start,end,variant='old'):
    tables={'feed_info.txt':[{'feed_start_date':start,'feed_end_date':end}], 'calendar.txt':[{'service_id':'s','start_date':start,'end_date':end,**{k:'1' for k in ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']}}], 'calendar_dates.txt':[{'service_id':'s','date':start,'exception_type':'1'}], 'routes.txt':[{'route_id':'r','route_short_name':'1','route_long_name':'same','route_type':'0'}], 'trips.txt':[{'trip_id':'t','route_id':'r','service_id':'s','shape_id':'shape','sub_agency_id':'op'}], 'route_sub_agencies.txt':[{'sub_agency_id':'op','sub_agency_name':'same'}], 'stops.txt':[{'stop_id':'a','stop_name':variant,'stop_lat':'50','stop_lon':'14'}], 'shapes.txt':[{'shape_id':'shape','shape_pt_lat':'50' if variant=='old' else '51','shape_pt_lon':'14','shape_pt_sequence':'1','shape_dist_traveled':'0'}], 'stop_times.txt':[{'trip_id':'t','stop_id':'a','arrival_time':'25:15:00','departure_time':'25:15:00','stop_sequence':'1','trip_operation_type':'7'}]}
    with zipfile.ZipFile(p,'w') as z:
        for name,rows in tables.items():
            f=io.StringIO();w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows);z.writestr(name,f.getvalue())

class TestUpdate(unittest.TestCase):
 def setUp(self):
    self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.old=self.root/'old.zip';self.new=self.root/'new.zip';fixture(self.old,'20261006','20261019');fixture(self.new,'20261007','20261020','new')
 def tearDown(self):self.tmp.cleanup()
 def test_merge_isolated_ids_preserves_old_geometry_flags_and_times(self):
    merged=self.root/'merged.zip';self.assertEqual(merge(self.new,self.old,merged,'20261006'),1)
    with zipfile.ZipFile(merged) as z:
        trips=list(read(z,'trips.txt'));self.assertEqual(len(trips),2);self.assertNotEqual(trips[0]['trip_id'],trips[1]['trip_id']);self.assertEqual(trips[0]['route_id'],trips[1]['route_id'])
        shapes=list(read(z,'shapes.txt'));self.assertEqual({r['shape_pt_lat'] for r in shapes},{'50','51'})
        st=list(read(z,'stop_times.txt'));self.assertEqual([r['departure_time'] for r in st],['25:15:00','25:15:00']);self.assertEqual(st[1]['trip_operation_type'],'7')
        self.assertEqual(len(active(z,'20261006')),1);self.assertEqual(active(z,'20261007'),{'s'})
 def test_snapshot_checksum_changes_and_invalid_feed_rejected(self):
    self.assertNotEqual(inspect(self.new)['sha256'],inspect(self.old)['sha256'])
    bad=self.root/'bad.zip';bad.write_bytes(b'bad')
    with self.assertRaises(zipfile.BadZipFile):inspect(bad)
 def test_bootstrap_missing_previous_is_explicit_and_expired_source_fails(self):
    p=prepare(self.root/'out',current=self.new,production={},today='20261007');self.assertFalse(p['continuity']['complete'])
    with self.assertRaises(ValueError):prepare(self.root/'expired',current=self.new,production={},today='20261021')
 def test_previous_verified_download_and_same_start_retains_previous_snapshot(self):
    snapshot=inspect(self.old)
    def download(url,path):path.write_bytes(self.old.read_bytes())
    for production in [{'sourceSnapshot':snapshot},{'sourceSnapshot':inspect(self.new),'continuity':{'previousSnapshot':snapshot}}]:
        with patch('gtfs_update.download',side_effect=download):p=prepare(self.root/'out',current=self.new,production=production,today='20261007')
        self.assertTrue(p['continuity']['complete']);self.assertEqual(p['continuity']['importedTrips'],1)
 def test_corrupt_previous_stops_update(self):
    def download(url,path):path.write_bytes(self.new.read_bytes())
    with patch('gtfs_update.download',side_effect=download):
        with self.assertRaises(ValueError):prepare(self.root/'out',current=self.new,production={'sourceSnapshot':inspect(self.old)},today='20261007')
 def test_calendar_exception_removes_old_trip(self):
    with zipfile.ZipFile(self.old,'a') as z:
        # Use a separate unique file archive, not duplicate members.
        pass
    source=self.root/'except.zip'
    with zipfile.ZipFile(self.old) as z,zipfile.ZipFile(source,'w') as out:
        for name in z.namelist():out.writestr(name,b'service_id,date,exception_type\ns,20261006,2\n' if name=='calendar_dates.txt' else z.read(name))
    self.assertEqual(merge(self.new,source,self.root/'merged.zip','20261006'),0)
if __name__=='__main__':unittest.main()
