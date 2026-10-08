import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {dayContexts} from '../src/core.js';import {readFileSync} from 'node:fs';
test('GTFS update snapshots, service-day isolation, midnight, exceptions and failures',()=>{const r=spawnSync('python',['tests/gtfs_update_test.py'],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);});
test('Archived preceding service day is available without expanding selectable dates',()=>{const m={startDate:'20261007',endDate:'20261020',serviceStartDate:'20261006',services:[['20261006','20261006',1,1,1,1,1,1,1]],exceptions:{}};assert.equal(dayContexts(m,'20261007')[0].day,'20261006');assert.equal(dayContexts({...m,serviceStartDate:undefined},'20261007').length,1);});
test('VPS schedules Prague mornings and dispatches the standard checked Pages pipeline',()=>{
 const w=readFileSync('.github/workflows/pages.yml','utf8'),installer=readFileSync('ops/install_gtfs_scheduler.sh','utf8'),scheduler=readFileSync('ops/gtfs_scheduler.py','utf8');
 assert.doesNotMatch(w,/cron:/);assert.match(w,/workflow_dispatch:/);
 assert.ok(installer.includes('OnCalendar=*-*-* 04,05,06:07:00 Europe/Prague'));
 assert.match(scheduler,/dispatches/);assert.match(w,/regression.mjs/);assert.match(w,/Preserve verified raw GTFS snapshot/);
});
