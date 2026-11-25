#!/usr/bin/env node
// 一番星アプリ: 天文ライブラリ(astronomy-engine)の動作確認スクリプト
// 目的: 「関数名が実在するか」「J2000の恒星座標をどう渡すか」「極点で方位角はどうなるか」などの未確認事項を実測で埋める。
// 使い方: node audit/astro-smoke.mjs --deps <npm installしたフォルダ> --stars <stars.6.jsonのパス> --out out
// 各テストは try/catch で囲み、失敗もレポートに残す(失敗=未確認事項が残る、という意味)。

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

function parseArgs(argv) {
  const a = { out: 'out' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--deps') a.deps = argv[++i];
    else if (argv[i] === '--stars') a.stars = argv[++i];
    else if (argv[i] === '--out') a.out = argv[++i];
  }
  return a;
}

const results = [];
function test(name, fn) {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail });
  } catch (e) {
    results.push({ name, ok: false, detail: String(e?.message ?? e) });
  }
}

const args = parseArgs(process.argv);
if (!args.deps) {
  console.error('--deps を指定してください');
  process.exit(2);
}
const req = createRequire(path.resolve(args.deps, 'noop.js'));
const Astronomy = req('astronomy-engine');
let version = 'unknown';
try {
  version = JSON.parse(fs.readFileSync(path.resolve(args.deps, 'node_modules/astronomy-engine/package.json'), 'utf8')).version;
} catch {}

// 1) 使う予定の関数が実在するか
const expected = [
  'Observer', 'Horizon', 'Equator', 'SearchAltitude', 'SearchRiseSet', 'Illumination', 'MoonPhase',
  'Body', 'Direction', 'MakeTime', 'Rotation_EQJ_EQD', 'RotateVector', 'VectorFromSphere', 'Spherical',
  'EquatorFromVector', 'SunPosition', 'SiderealTime', 'AngleFromSun', 'Elongation', 'GeoVector', 'HelioVector',
];
test('API名の存在確認', () => Object.fromEntries(expected.map((n) => [n, typeof Astronomy[n]])));

// 2) 太陽高度 -12° になる時刻を探し、その時刻の太陽高度を測り直す
const obs = new Astronomy.Observer(35.0, 139.0, 0);
const start = new Date(Date.UTC(2026, 11, 21, 6, 0, 0)); // 2026-12-21 15:00 JST
test('太陽が-12°になる時刻の探索と検算', () => {
  const found = {};
  for (const alt of [-6, -9, -12, -18]) {
    const t = Astronomy.SearchAltitude(Astronomy.Body.Sun, obs, -1, start, 1, alt);
    if (!t) { found[alt] = null; continue; }
    const eq = Astronomy.Equator(Astronomy.Body.Sun, t, obs, true, true);
    const hor = Astronomy.Horizon(t, obs, eq.ra, eq.dec, 'normal');
    found[alt] = { utc: t.date.toISOString(), measuredAltitude: Number(hor.altitude.toFixed(3)) };
  }
  return found;
});

// 3) 恒星(J2000)の渡し方: そのまま渡す vs 日付の座標系に変換して渡す
test('J2000座標の扱い(北極星で比較)', () => {
  if (!args.stars) throw new Error('--stars 未指定');
  const fc = JSON.parse(fs.readFileSync(args.stars, 'utf8'));
  const polaris = fc.features.find((f) => Number(f.id) === 11767); // 北極星(ヒッパルコス番号)
  if (!polaris) throw new Error('HIP 11767 が stars に見つからない');
  const [lon, lat] = polaris.geometry.coordinates;
  const raDeg = ((lon % 360) + 360) % 360;
  const time = Astronomy.MakeTime(new Date(Date.UTC(2026, 11, 21, 12, 0, 0)));
  // (a) J2000のまま Horizon に渡す
  const a = Astronomy.Horizon(time, obs, raDeg / 15, lat, 'normal');
  // (b) J2000 -> 日付の座標系(EQD)へ回転してから渡す
  const rot = Astronomy.Rotation_EQJ_EQD(time);
  const v = Astronomy.VectorFromSphere(new Astronomy.Spherical(lat, raDeg, 1), time);
  const v2 = Astronomy.RotateVector(rot, v);
  const eqd = Astronomy.EquatorFromVector(v2);
  const b = Astronomy.Horizon(time, obs, eqd.ra, eqd.dec, 'normal');
  return {
    polarisHip: 11767,
    observerLatitude: 35.0,
    altitude_direct_J2000: Number(a.altitude.toFixed(4)),
    altitude_converted_EQD: Number(b.altitude.toFixed(4)),
    differenceDeg: Number(Math.abs(a.altitude - b.altitude).toFixed(4)),
    azimuth_direct: Number(a.azimuth.toFixed(3)),
    azimuth_converted: Number(b.azimuth.toFixed(3)),
    note: '北極星の高度は観測地の緯度に近いはず(極からのずれ約0.7°)。direct と converted の差が座標系の違いの大きさ。',
  };
});

// 4) 月: 観測者基準(視差込み)と地心の差
test('月の位置(観測者基準と地心基準)', () => {
  const t = Astronomy.MakeTime(new Date(Date.UTC(2026, 11, 21, 12, 0, 0)));
  const topo = Astronomy.Equator(Astronomy.Body.Moon, t, obs, true, true);
  const geo = Astronomy.Equator(Astronomy.Body.Moon, t, null, true, true);
  const hor = Astronomy.Horizon(t, obs, topo.ra, topo.dec, 'normal');
  const dRa = (topo.ra - geo.ra) * 15;
  return {
    topocentric_ra_hours: Number(topo.ra.toFixed(4)),
    topocentric_dec: Number(topo.dec.toFixed(4)),
    parallaxShiftApproxDeg: Number(Math.hypot(dRa * Math.cos((topo.dec * Math.PI) / 180), topo.dec - geo.dec).toFixed(3)),
    altitude: Number(hor.altitude.toFixed(2)),
    azimuth: Number(hor.azimuth.toFixed(2)),
  };
});

// 5) 惑星の明るさと満ち欠け
test('金星・木星の等級と輝面比', () => {
  const t = Astronomy.MakeTime(new Date(Date.UTC(2026, 11, 21, 12, 0, 0)));
  const out = {};
  for (const b of ['Venus', 'Jupiter', 'Mars', 'Saturn', 'Mercury']) {
    const ill = Astronomy.Illumination(Astronomy.Body[b], t);
    out[b] = { mag: Number(ill.mag.toFixed(2)), phase_fraction: Number(ill.phase_fraction.toFixed(3)) };
  }
  const moon = Astronomy.Illumination(Astronomy.Body.Moon, t);
  out.Moon = { mag: Number(moon.mag.toFixed(2)), phase_fraction: Number(moon.phase_fraction.toFixed(3)), moonPhaseAngleDeg: Number(Astronomy.MoonPhase(t).toFixed(2)) };
  return out;
});

// 6) 出没時刻の検索
test('金星の出没時刻検索', () => {
  const t0 = Astronomy.MakeTime(new Date(Date.UTC(2026, 11, 21, 0, 0, 0)));
  const rise = Astronomy.SearchRiseSet(Astronomy.Body.Venus, obs, +1, t0, 2);
  const set = Astronomy.SearchRiseSet(Astronomy.Body.Venus, obs, -1, t0, 2);
  return { riseUtc: rise?.date?.toISOString() ?? null, setUtc: set?.date?.toISOString() ?? null };
});

// 7) 極点・高緯度での方位角
test('極点・高緯度の方位角の返り値', () => {
  const t = Astronomy.MakeTime(new Date(Date.UTC(2026, 11, 21, 12, 0, 0)));
  const out = {};
  for (const lat of [90, -90, 89.99, 69.65, 78.2]) {
    const o = new Astronomy.Observer(lat, 15.0, 0);
    const h = Astronomy.Horizon(t, o, 6.0, 20.0, 'normal');
    out[lat] = { altitude: Number(h.altitude.toFixed(3)), azimuth: Number.isFinite(h.azimuth) ? Number(h.azimuth.toFixed(3)) : String(h.azimuth) };
  }
  return out;
});

// 8) 速度(Actionsのランナー上の値。スマホの速度ではない)
test('Horizon 1万回の所要時間(ランナー上)', () => {
  const t = Astronomy.MakeTime(new Date(Date.UTC(2026, 11, 21, 12, 0, 0)));
  const n = 10000;
  const t0 = process.hrtime.bigint();
  let acc = 0;
  for (let i = 0; i < n; i++) acc += Astronomy.Horizon(t, obs, (i % 240) / 10, ((i % 180) - 90) * 0.99, null).altitude;
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { calls: n, totalMs: Number(ms.toFixed(1)), perCallMicroseconds: Number(((ms * 1000) / n).toFixed(2)), checksum: Number(acc.toFixed(1)) };
});

// ---------- 出力 ----------
fs.mkdirSync(args.out, { recursive: true });
fs.writeFileSync(path.join(args.out, 'astro-smoke.json'), JSON.stringify({ version, results }, null, 1));
let md = `# 天文ライブラリ動作確認\n\n- astronomy-engine: ${version}\n- 失敗した項目は「未確認事項が残る」という意味です。\n\n`;
for (const r of results) {
  md += `## ${r.ok ? '✅' : '❌'} ${r.name}\n\n\`\`\`json\n${JSON.stringify(r.detail, null, 1)}\n\`\`\`\n\n`;
}
fs.writeFileSync(path.join(args.out, 'astro-smoke.md'), md);
console.log(`astro-smoke: ${results.filter((r) => r.ok).length}/${results.length} 成功`);
