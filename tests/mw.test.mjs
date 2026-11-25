import test from 'node:test';
import assert from 'node:assert/strict';
import { eqToGal, galToEq, NGP, buildSamples, insideByNorthRay, loadLayers, statsOf } from '../build/build-mw-samples.mjs';

const wrapLon = (ra) => (ra > 180 ? ra - 360 : ra); // d3-celestial 形式(-180〜180)に寄せる

function bandRing(b, step = 1) {
  const r = [];
  for (let l = 0; l < 360; l += step) { const [ra, dec] = galToEq(l, b); r.push([wrapLon(ra), dec]); }
  return r;
}
function circleRing(l0, b0, rad, n = 72) {
  const r = [];
  for (let i = 0; i < n; i++) { const a = (2 * Math.PI * i) / n; const [ra, dec] = galToEq(l0 + (rad * Math.cos(a)) / Math.cos(b0 * Math.PI / 180), b0 + rad * Math.sin(a)); r.push([wrapLon(ra), dec]); }
  return r;
}

test('銀河座標の往復と定義点', () => {
  const [l, b] = eqToGal(NGP.ra, NGP.dec);
  assert.ok(Math.abs(b - 90) < 1e-6);
  const [ra, dec] = galToEq(0, 0);
  assert.ok(Math.abs(ra - 266.405) < 0.05 && Math.abs(dec + 28.936) < 0.05);
  for (const [l0, b0] of [[10, 5], [200, -30], [359, 60]]) {
    const [a, d] = galToEq(l0, b0); const [l1, b1] = eqToGal(a, d);
    assert.ok(Math.abs(((l1 - l0 + 540) % 360) - 180) < 1e-6 && Math.abs(b1 - b0) < 1e-6);
  }
});

test('帯(b=±10°)の内外判定。経度が -180〜180 形式でも正しい', () => {
  const fc = { features: [{ id: 'mw1', geometry: { type: 'Polygon', coordinates: [bandRing(10), bandRing(-10)] } }] };
  const layers = loadLayers(fc);
  for (const [l, b, want] of [[0, 0, true], [90, 5, true], [180, -9, true], [270, 0, true], [45, 15, false], [45, -15, false], [0, 60, false], [300, -40, false]]) {
    assert.equal(insideByNorthRay(l, b, layers[0].rings), want, `l=${l} b=${b}`);
  }
});

test('穴(l=90,b=0の半径4°)は外側になる', () => {
  const fc = { features: [{ id: 'mw1', geometry: { type: 'Polygon', coordinates: [bandRing(10), bandRing(-10), circleRing(90, 0, 4)] } }] };
  const L = loadLayers(fc)[0].rings;
  assert.equal(insideByNorthRay(90, 0, L), false);
  assert.equal(insideByNorthRay(90, 7, L), true);
});

test('サンプル生成: 2層の入れ子と統計', () => {
  const fc = { features: [
    { id: 'mw1', geometry: { type: 'Polygon', coordinates: [bandRing(20), bandRing(-20)] } },
    { id: 'mw2', geometry: { type: 'Polygon', coordinates: [bandRing(8), bandRing(-8)] } },
  ] };
  const res = buildSamples(fc, { step: 3 });
  const st = statsOf(res.samples);
  assert.ok(st.count > 200);
  assert.ok(res.gal.every(([, b]) => Math.abs(b) <= 20.5));
  assert.ok(res.gal.filter(([, b]) => Math.abs(b) < 7).every(([, , lv]) => lv === 2));
  assert.ok(res.gal.filter(([, b]) => Math.abs(b) > 9).every(([, , lv]) => lv === 1));
  assert.ok(st.southOfMinus30 > 50 && st.decMin < -60);
});
