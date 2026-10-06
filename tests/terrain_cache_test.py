import unittest,tempfile,json,gzip,sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts.build_terrain import build,geographic_keys
class TerrainCacheTest(unittest.TestCase):
    def test_geo_keys_and_cached_build_do_not_access_dem(self):
        g={'points':[[50,14],[50.001,14.002]],'edges':[[0,1]]}
        self.assertEqual(geographic_keys(g),geographic_keys({'points':list(reversed(g['points'])),'edges':[[1,0]]}))
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'geometry.json.gz').write_bytes(gzip.compress(json.dumps(g).encode()))
            saved={','.join(map(str,k)):[[10]*72,1] for k in geographic_keys(g)};cache=root/'cache.json';cache.write_text(json.dumps(saved))
            with patch('urllib.request.urlopen',side_effect=AssertionError('DEM download')):
                build(root,cache)
            index=json.loads((root/'terrain-index.json').read_text());self.assertEqual(len(index['chunks']),1)
            blob=root/next(iter(index['chunks'].values()))['path'];first=blob.read_bytes()
            build(root,cache);self.assertEqual(first,blob.read_bytes())
            data=json.loads(gzip.decompress(first));self.assertEqual(data[0][1],[10]*72)
if __name__=='__main__':unittest.main()
