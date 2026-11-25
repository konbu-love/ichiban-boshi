// 天文計算モジュールの検証。時刻の変換はライブラリ不要。位置の計算は astronomy-engine が必要(無ければ飛ばす)。
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createSky, localToUtc, tzOffsetMs } from '../src/sky.mjs';

let Astronomy = null;
try {
  const dir = path.resolve(process.env.AUDIT_DEPS ?? '.audit-deps');
  Astronomy = createRequire(path.join(dir, 'x.js'))('astronomy-engine');
} catch { /* 無ければ位置計算のテストは飛ばす */ }
const needAstro = { skip: Astronomy ? false : 'astronomy-engine が無い(Actionsでは実行される)' };

const tokyo = { id: 'mitaka', lat: 35.678322, lon: 139.537003, tz: 'Asia/Tokyo', limitMag: 6.0 };

test('現地時刻→UTC: 東京は+9時間、シドニーは夏時間、ネパールは+5:45', () => {
  assert.equal(localToUtc('Asia/Tokyo', 2026, 12, 21, 12).toISOString(), '2026-12-21T03:00:00.000Z');
  assert.equal(localToUtc('Australia/Sydney', 2026, 12, 21, 12).toISOString(), '2026-12-21T01:00:00.000Z');
  assert.equal(localToUtc('Australia/Sydney', 2026, 6, 21, 12).toISOString(), '2026-06-21T02:00:00.000Z');
  assert.equal(localToUtc('Asia/Kathmandu', 2026, 1, 1, 12).toISOString(), '2026-01-01T06:15:00.000Z');
  assert.equal(localToUtc('UTC', 2026, 3, 1, 0).toISOString(), '2026-03-01T00:00:00.000Z');
  assert.equal(tzOffsetMs('Asia/Kolkata', new Date(Date.UTC(2026, 0, 1))), 5.5 * 3600000);
});

test('基準時刻: 東京の12月・6月、シドニーの12月で太陽の幾何高度が-12°になる', needAstro, () => {
  const sky = createSky(Astronomy);
  const cases = [
    [tokyo, { y: 2026, m: 12, d: 21 }, '08:00', '09:30'],
    [tokyo, { y: 2026, m: 6, d: 21 }, '10:30', '12:30'],
    [{ lat: -33.8596, lon: 151.2047, tz: 'Australia/Sydney' }, { y: 2026, m: 12, d: 21 }, '09:30', '11:30'],
  ];
  for (const [site, local, lo, hi] of cases) {
    const r = sky.findReferenceTime(site, local, -12);
    assert.equal(r.status, 'ok');
    const hhmm = r.utc.toISOString().slice(11, 16);
    assert.ok(hhmm >= lo && hhmm <= hi, `${site.tz} ${local.m}月: ${hhmm}`);
    assert.ok(Math.abs(sky.sunAltitude(site, r.utc, null).altitude + 12) < 0.01);
  }
  // -6/-9/-12 は夕方の順に遅くなる
  const t6 = sky.findReferenceTime(tokyo, { y: 2026, m: 12, d: 21 }, -6).utc;
  const t9 = sky.findReferenceTime(tokyo, { y: 2026, m: 12, d: 21 }, -9).utc;
  const t12 = sky.findReferenceTime(tokyo, { y: 2026, m: 12, d: 21 }, -12).utc;
  assert.ok(t6 < t9 && t9 < t12);
});

test('白夜・極夜の代わりの基準時刻', needAstro, () => {
  const sky = createSky(Astronomy);
  const tromso = { lat: 69.6517, lon: 18.9556, tz: 'Europe/Oslo' };
  const white = sky.findReferenceTime(tromso, { y: 2026, m: 6, d: 21 }, -12);
  assert.equal(white.status, 'sun-never-below');
  assert.ok(white.sunMinAltitude > -12);
  const polar = sky.findReferenceTime({ lat: 85, lon: 0, tz: 'UTC' }, { y: 2026, m: 12, d: 21 }, -12); // 試験用の地点(ゲームの地点ではない)
  assert.equal(polar.status, 'sun-never-above');
  assert.ok(polar.sunMaxAltitude < -12);
});

test('恒星: 南中高度が 90-|緯度-赤緯| に一致(日付の座標系へ回転して計算)', needAstro, () => {
  const sky = createSky(Astronomy);
  const site = { lat: 35, lon: 139, tz: 'Asia/Tokyo' };
  const stars = [[1, 100, 35, 3, null], [2, 250, -20, 3, null]];
  let max = [-99, -99];
  const start = Date.UTC(2026, 11, 21, 0, 0, 0);
  for (let i = 0; i < 288; i++) {
    const hz = sky.horizonOfStars(stars, new Date(start + i * 300000), site, null);
    for (let k = 0; k < 2; k++) max[k] = Math.max(max[k], hz[k][0]);
  }
  assert.ok(max[0] > 89.5, `赤緯35°の星の最大高度 ${max[0]}`); // 日付の座標系で赤緯は±0.3°ほど動く
  assert.ok(Math.abs(max[1] - 35) < 0.6, `赤緯-20°の星の最大高度 ${max[1]}`);
});

test('一日の空: 月・惑星・候補・予想される最初の星', needAstro, () => {
  const sky = createSky(Astronomy);
  const stars = [];
  let seed = 4242;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let i = 0; i < 5000; i++) stars.push([100000 + i, rnd() * 360, Math.asin(rnd() * 2 - 1) * (180 / Math.PI), rnd() * 6, null]);
  const selectable = new Set(stars.filter((_, i) => i % 5 === 0).map((s) => s[0]));
  const t0 = Date.now();
  const r = sky.computeSky(tokyo, { y: 2026, m: 12, d: 21 }, { stars, selectable });
  const ms = Date.now() - t0;
  assert.equal(r.reference.status, 'ok');
  assert.ok(Math.abs(r.sun.altitudeGeometric + 12) < 0.01);
  assert.ok(r.moon.phaseFraction >= 0 && r.moon.phaseFraction <= 1);
  assert.ok(r.moon.phaseAngleDeg >= 0 && r.moon.phaseAngleDeg < 360);
  assert.equal(r.planets.length, 5);
  for (const p of r.planets) assert.ok(Number.isFinite(p.mag) && p.az >= 0 && p.az < 360);
  assert.ok(r.candidates.length > 0);
  for (const c of r.candidates) { assert.ok(c.alt >= r.minAltDeg); assert.ok(c.mag <= r.limitMag); }
  for (let i = 1; i < r.candidates.length; i++) assert.ok(r.candidates[i].mag >= r.candidates[i - 1].mag);
  assert.equal(r.predictedFirst, r.candidates[0].id);
  for (const v of r.visibleStars) { assert.ok(v[1] >= 0); assert.ok(v[3] <= r.limitMag); if (v[4]) assert.ok(selectable.has(v[0])); }
  assert.ok(ms < 5000, `5000星の計算が ${ms}ms`); // Actions上の目安。スマホの速度は実機で確認する
  // 限界等級を厳しくすると見える星が減る
  const dim = sky.computeAt(tokyo, r.utc, { stars, selectable, limitMag: 3.5 });
  assert.ok(dim.visibleStars.length < r.visibleStars.length);
  console.log(`# 5000星の計算 ${ms}ms / 見える星 ${r.visibleStars.length} / 候補 ${r.candidates.length} / 予想 ${r.predictedFirst}`);
});
