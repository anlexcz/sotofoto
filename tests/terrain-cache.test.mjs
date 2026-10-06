import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
test('geographic terrain cache survives feed ID changes and reuses profiles without DEM requests',()=>{const r=spawnSync('python',['tests/terrain_cache_test.py'],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+'\n'+r.stderr);});
