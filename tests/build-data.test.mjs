import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('GTFS build preserves per-stop operation types, shared patterns and geometry boundaries',()=>{
  const result=spawnSync('python',['tests/build_data_test.py'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
});
