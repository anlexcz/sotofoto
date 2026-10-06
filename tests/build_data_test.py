"""Small real ZIP fixture exercises the same parser used for production builds."""
import csv
import gzip
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.build_data import build


class BuildOperationsTest(unittest.TestCase):
    def fixture(self, directory, missing=False):
        source = Path(directory) / 'fixture.zip'
        with zipfile.ZipFile(source, 'w') as z:
            def table(name, header, rows):
                stream = io.StringIO()
                writer = csv.writer(stream)
                writer.writerow(header.split(','))
                writer.writerows(rows)
                z.writestr(name + '.txt', stream.getvalue())
            table('routes', 'route_id,route_short_name,route_long_name,route_type,is_night', [['r', '1', 'Test', 0, 0]])
            table('calendar', 'service_id,start_date,end_date,monday,tuesday,wednesday,thursday,friday,saturday,sunday', [['s', '20261004', '20261006', *[1]*7]])
            table('shapes', 'shape_id,shape_pt_sequence,shape_pt_lat,shape_pt_lon,shape_dist_traveled', [['g', i, 50+i*.001, 14, i] for i in range(4)])
            table('stops', 'stop_id,stop_name,stop_lat,stop_lon', [[str(i), f'Stop {i}', 50+i*.001, 14] for i in range(4)])
            table('trips', 'route_id,service_id,trip_id,shape_id,trip_headsign', [['r', 's', t, 'g', 'End'] for t in ['regular', 'mixed', 'mixed-copy', 'different']])
            operations={'regular':[1,1,1,1], 'mixed':[7,1,8,8], 'mixed-copy':[7,1,8,8], 'different':[9,1,10,10]}
            header='trip_id,stop_sequence,stop_id,shape_dist_traveled,arrival_time,departure_time'
            if not missing: header+=',trip_operation_type'
            table('stop_times', header, [[trip,i,str(i),i,f'12:0{i}:00',f'12:0{i}:00',*([op] if not missing else [])] for trip, ops in operations.items() for i,op in enumerate(ops)])
            table('feed_info', 'feed_start_date,feed_end_date', [['20261004','20261006']])
        return source

    def test_patterns_and_boundaries(self):
        with tempfile.TemporaryDirectory() as d:
            out=Path(d)/'data'
            build(self.fixture(d),out)
            schedule=json.loads(gzip.decompress((out/'schedule.json.gz').read_bytes()))
            geometry=json.loads(gzip.decompress((out/'geometry.json.gz').read_bytes()))
            trips={t[7]:t for t in schedule['trips']}
            patterns=schedule['patterns']
            self.assertEqual(len(patterns),3)
            self.assertEqual(trips['mixed'][3],trips['mixed-copy'][3])
            self.assertNotEqual(trips['mixed'][3],trips['different'][3])
            self.assertEqual(len(patterns[trips['regular'][3]]),4)
            self.assertEqual(patterns[trips['mixed'][3]][4],[7,1,8,8])
            self.assertEqual(patterns[trips['different'][3]][4],[9,1,10,10])
            # Collinear stops would be removed by simplification without protection.
            self.assertEqual(len(geometry['edges']),3)
            self.assertEqual(geometry['shapes'][0][1],[[0,1],[1,2],[2,3]])
            self.assertEqual(json.loads((out/'meta.json').read_text())['version'],2)

    def test_missing_classification_cannot_silently_become_regular(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(KeyError):
                build(self.fixture(d,missing=True),Path(d)/'data')


if __name__=='__main__': unittest.main()
