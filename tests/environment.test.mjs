import test from 'node:test';
import assert from 'node:assert/strict';
import {horizonHeight,terrainLight,weatherAt} from '../src/environment.js';
test('horizon wraps north and interpolates angles',()=>{const p=Array(72).fill(0);p[71]=100;p[0]=200;assert.equal(horizonHeight(p,357.5),15);assert.equal(horizonHeight(p,360),20);assert.equal(horizonHeight(p,-2.5),15);});
test('terrain blocks only sun below local skyline',()=>{const p=Array(72).fill(80);assert.equal(terrainLight({altitude:5,azimuth:120},p),true);assert.equal(terrainLight({altitude:9,azimuth:120},p),false);assert.equal(terrainLight({altitude:-1,azimuth:120},p),false);assert.ok(!terrainLight({altitude:5,azimuth:120},null));});
test('weather uses timestamps and does not reuse forecast outside its range',()=>{const d={hourly:{time:[1000,4600],visibility:[500,null],cloud_cover:[90,30],direct_normal_irradiance_instant:[0,300]}};assert.equal(weatherAt(d,new Date(1100*1000)).visibility,500);assert.equal(weatherAt(d,new Date(5000*1000)).visibility,null);assert.equal(weatherAt(d,new Date(8200*1000)),null);assert.equal(weatherAt(null,new Date()),null);});
