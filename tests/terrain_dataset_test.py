import unittest,tempfile,json,gzip,sys,zipfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from build_terrain import geographic_keys,publish
from terrain_dataset import package,install,verify_archive,expand_keys,sha,install_release

class TerrainDatasetTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.data=self.root/'data';self.data.mkdir();self.out=self.root/'release'
        self.g={'points':[[50,14],[50.001,14.002]],'edges':[[0,1]]};self.keys=geographic_keys(self.g)
        self.profiles={','.join(map(str,k)):[[10]*72,1] for k in expand_keys(self.keys,2)}
        publish(self.data,expand_keys(self.keys,2),self.profiles)
        self.digest=package(self.data,self.out,'terrain-v1-test',2,{'demTiles':[{'name':'test','sha256':'a'*64}]},1)
    def tearDown(self):self.tmp.cleanup()
    def geometry(self,g=None):(self.data/'geometry.json.gz').write_bytes(gzip.compress(json.dumps(g or self.g).encode()))
    def test_two_feeds_and_empty_cache_install_without_dem(self):
        for g in [self.g,{'points':list(reversed(self.g['points'])),'edges':[[1,0],[0,1]]}]:
            self.geometry(g)
            with patch('urllib.request.urlopen',side_effect=AssertionError('No network/DEM')):
                self.assertEqual(install(self.out/'terrain.zip',self.data,self.digest,'terrain-v1-test'),[])
            self.assertFalse((self.root/'.cache').exists())
            installed=json.loads((self.data/'terrain-dataset.json').read_text())
            self.assertEqual(installed['archiveSha256'],self.digest)
            for name,entry in installed['files'].items():
                self.assertEqual(sha((self.data/name).read_bytes()),entry['sha256'])
            self.assertEqual(json.loads((self.data/'terrain-index.json').read_text())['coverageCheck']['missingProfiles'],0)
    def test_new_area_remains_missing_not_zero(self):
        self.geometry({'points':[[51,15]],'edges':[[0,0]]})
        self.assertTrue(install(self.out/'terrain.zip',self.data,self.digest,'terrain-v1-test'))
        self.assertEqual(json.loads((self.data/'terrain-index.json').read_text())['coverageCheck']['missingProfiles'],1)
    def test_corruption_wrong_version_and_unsafe_archive_leave_previous_data(self):
        self.geometry();previous=(self.data/'terrain-index.json').read_bytes()
        for digest,version in [('0'*64,'terrain-v1-test'),(self.digest,'terrain-v1-other')]:
            with self.assertRaises(ValueError):install(self.out/'terrain.zip',self.data,digest,version)
        self.assertEqual((self.data/'terrain-index.json').read_bytes(),previous)
        bad=self.root/'bad.zip'
        with zipfile.ZipFile(bad,'w') as z:z.writestr('../escape','bad')
        with self.assertRaises(ValueError):verify_archive(bad)
        damaged=self.root/'damaged.zip'
        with zipfile.ZipFile(self.out/'terrain.zip') as source,zipfile.ZipFile(damaged,'w') as z:
            for name in source.namelist():z.writestr(name,source.read(name)+b'x' if name.endswith('.gz') else source.read(name))
        with self.assertRaises(ValueError):verify_archive(damaged)
    def test_pinned_download_only_release_no_dem_and_failure_keeps_previous(self):
        self.geometry();lock=self.root/'lock.json';lock.write_text(json.dumps({'repository':'anlexcz/sotofoto','tag':'terrain-v1-test','sha256':self.digest}))
        from io import BytesIO
        urls=[]
        def fetch(url,**kwargs):urls.append(url);return BytesIO((self.out/'terrain.zip').read_bytes())
        with patch('urllib.request.urlopen',side_effect=fetch):install_release(lock,self.data)
        self.assertEqual(urls,['https://github.com/anlexcz/sotofoto/releases/download/terrain-v1-test/terrain.zip'])
        previous=(self.data/'terrain-index.json').read_bytes()
        with patch('urllib.request.urlopen',side_effect=OSError('offline')):
            with self.assertRaises(OSError):install_release(lock,self.data)
        self.assertEqual((self.data/'terrain-index.json').read_bytes(),previous)
    def test_bound_reserve_and_invalid_profiles(self):
        self.assertEqual(len(expand_keys([(0,0)],2)),25)
        for n in [-1,11]:
            with self.assertRaises(ValueError):expand_keys(self.keys,n)
        dataset,index,data,profiles=verify_archive(self.out/'terrain.zip',self.digest,'terrain-v1-test')
        self.assertEqual(len(profiles),25);self.assertFalse(dataset['coverage']['continuousRectangle'])

if __name__=='__main__':unittest.main()
