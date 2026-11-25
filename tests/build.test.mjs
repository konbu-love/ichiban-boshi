// データ変換(build/build-data.mjs)の検証。合成データで「変換ロジックが正しいか」を確かめる(実データの数値ではない)。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll } from '../build/build-data.mjs';
import { simplifyRing, sepDeg, unit } from '../audit/audit.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

function synth() {
  const specials = [[1, 10, 20, 2.0], [2, 11, 20, 3.0], [3, -170, -30, 4.0], [5, 50, 80, 6.5], [8, -100, 40, 3.2], [9, 100, -50, 5.0]];
  const avoid = specials.map(([, lon, lat]) => [lon, lat]);
  let seed = 777;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const feats = specials.map(([id, lon, lat, mag]) => ({ type: 'Feature', id, properties: { mag, bv: '0.4' }, geometry: { type: 'Point', coordinates: [lon, lat] } }));
  let id = 1000;
  while (feats.length < 200) {
    const lon = rnd() * 360 - 180;
    const lat = Math.asin(rnd() * 2 - 1) * (180 / Math.PI);
    if (avoid.some(([a, b]) => sepDeg(unit(lon, lat), unit(a, b)) < 3)) continue;
    feats.push({ type: 'Feature', id: id++, properties: { mag: Number((4.1 + rnd() * 3.9).toFixed(2)), bv: '' }, geometry: { type: 'Point', coordinates: [Number(lon.toFixed(4)), Number(lat.toFixed(4))] } });
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ichiban-build-'));
  const w = (n, o) => fs.writeFileSync(path.join(dir, n), JSON.stringify(o));
  w('stars.8.json', { type: 'FeatureCollection', features: feats });
  w('stars.6.json', { type: 'FeatureCollection', features: feats.filter((f) => f.properties.mag <= 6.0) });
  w('constellations.lines.json', { type: 'FeatureCollection', features: [
    { type: 'Feature', id: 'AAA', properties: {}, geometry: { type: 'MultiLineString', coordinates: [[[10, 20], [11, 20], [-170, -30]]] } },
    { type: 'Feature', id: 'BBB', properties: {}, geometry: { type: 'MultiLineString', coordinates: [[[50, 80], [10, 20]]] } },
  ] });
  w('starnames.json', {
    1: { name: 'Alpha', bayer: 'α', c: 'AAA', ja: 'アルファ' },
    3: { name: '', c: 'AAA' },
    5: { name: 'Faint', c: 'BBB' },
    9: { name: 'Solo', c: 'BBB' },
  });
  const con = (id, ja) => ({ type: 'Feature', id, properties: { name: id + 'Latin', desig: id, en: id + 'En', ja }, geometry: { type: 'Point', coordinates: [10, 20] } });
  w('constellations.json', { type: 'FeatureCollection', features: [con('AAA', 'エー座'), con('BBB', null)] });
  w('mw.json', { type: 'FeatureCollection', features: [{ type: 'Feature', id: 'ol1', properties: {}, geometry: { type: 'MultiPolygon', coordinates: [[[[170, 10], [179.9, 12], [-179.9, 13], [-170, 10], [-175, 5], [170, 10]]]] } }] });
  return dir;
}

test('天の川の輪: 折り返しをまたいでも間引きが壊れず、赤経は0〜360°に収まる', () => {
  const ring = [[170, 10], [179.9, 12], [-179.9, 13], [-170, 10], [-175, 5], [170, 10]];
  const s = simplifyRing(ring, 0.05);
  assert.ok(s.length >= 4);
  for (const [ra, dec] of s) { assert.ok(ra >= 0 && ra < 360); assert.ok(dec >= 5 && dec <= 13); }
  // 連続化できていれば、隣り合う点の赤経差は180°未満
  for (let i = 1; i < s.length; i++) assert.ok(Math.min(Math.abs(s[i][0] - s[i - 1][0]), 360 - Math.abs(s[i][0] - s[i - 1][0])) < 180);
});

test('データ変換: 恒星・選択対象・線・名前・星座・地点(合成データ)', () => {
  const dataDir = synth();
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ichiban-out-'));
  const rep = buildAll({ dataDir, outDir, siteSeedPath: path.join(root, 'audit', 'sites.seed.json'), siteCoordsPath: path.join(root, 'data-src', 'site-coords.json'), version: 'synthetic' });
  const rd = (n) => JSON.parse(fs.readFileSync(path.join(outDir, 'data', n), 'utf8'));
  const stars = rd('stars.json');
  const byHip = new Map(stars.map((r) => [r[0], r]));
  assert.ok(byHip.has(5)); // 6.5等だが線の構成星なので例外採用
  assert.equal(byHip.get(5)[3], 6.5); // 等級は改変しない
  assert.deepEqual(rep.stars.exceptions, [{ hip: 5, mag: 6.5 }]);
  for (let i = 1; i < stars.length; i++) assert.ok(stars[i][3] >= stars[i - 1][3]); // 明るい順
  assert.deepEqual(byHip.get(1), [1, 10, 20, 2, 0.4]);
  assert.equal(byHip.get(3)[1], 190); // 経度-170 → 赤経190
  assert.equal(byHip.get(3)[4], 0.4);
  const sel = new Set(rd('selectable.json'));
  for (const h of [1, 2, 3, 5, 9, 8]) assert.ok(sel.has(h), `HIP ${h}`);
  assert.deepEqual(rep.selectable.promotedBright, [8]);
  const lines = rd('lines.json');
  assert.deepEqual(lines.AAA, [[1, 2], [2, 3]]);
  assert.deepEqual(lines.BBB, [[5, 1]]);
  const names = rd('names.json');
  assert.deepEqual(names[1], { en: 'Alpha', ja: 'アルファ', bayer: 'α' });
  assert.equal(names[2], undefined);
  const cons = rd('starCons.json');
  assert.deepEqual(cons[9], ['BBB']);
  assert.equal(cons[8], undefined);
  assert.equal(rep.names.selectableConstellationUnknown, 1); // 星座が分からないのは、線にも名前にも属さない昇格星のHIP 8だけ
  const cc = rd('constellations.json');
  assert.deepEqual(cc.AAA, { la: 'AAALatin', en: 'AAAEn', ja: 'エー座', ra: 10, dec: 20 });
  assert.equal(cc.BBB.ja, undefined);
  const mw = rd('mw.json');
  assert.equal(mw.layers.length, 1);
  for (const [ra] of mw.layers[0].polygons[0][0]) assert.ok(ra >= 0 && ra < 360);
  const sites = rd('sites.json');
  assert.equal(sites.length, 23);
  const mitaka = sites.find((x) => x.id === 'mitaka');
  assert.equal(mitaka.lat, 35.678322);
  assert.equal(mitaka.limitMag, 3.5); // クラスA
  assert.equal(sites.find((x) => x.id === 'fuji').limitMag, 7.0); // クラスE
  assert.ok(sites.every((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon) && x.tz));
  assert.equal(rep.problems.length, 0);
  assert.ok(rd('credits.json').items.some((i) => i.license === '未確認'));
});
