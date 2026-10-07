import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
test('Versioned terrain archive: pinned integrity, two feeds without DEM/cache, missing coverage and failures',()=>{const r=spawnSync('python',['tests/terrain_dataset_test.py'],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+'\n'+r.stderr);});
