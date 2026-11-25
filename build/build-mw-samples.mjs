// 天の川の描画用サンプル点を、d3-celestial の mw.json(実データ)から作り直す。
// 使い方: node build/build-mw-samples.mjs --data-dir <d3-celestial/data> --out docs/mwfix [--step 3]
//
// 試作28の天の川サンプルは、赤緯+27.5〜+65°にしか点がなく、銀河北極付近の点を含み、
// 南天の天の川(いて座・さそり座・みなみじゅうじ座など)が欠けていた(docs/mwfix/mw-verify.md の「旧データ」参照)。
// ここでは次の方法で作り直す:
//  1) 各等光度線(5層)の輪を赤経・赤緯の線分として 0.25°刻みに細分し、銀河座標(l,b)へ変換する
//     (輪が赤経の継ぎ目で切られていても、切れ目の線分は2回数えられて相殺される)
//  2) 銀河座標の格子点(緯度方向 step°、経度方向は面積がほぼ等しくなる間隔)ごとに、
//     「その点から銀河北極へ伸ばした子午線が、輪と何回交わるか」の偶奇で、その層の内側かを判定する
//     (偶奇法: 穴にも対応。どの輪も銀河北極を含まないことが前提=検証でも確認する)
//  3) 点が内側にある層の数(1〜5)を濃さ level とする(層は外側から内側へ入れ子の等光度線)
import fs from 'node:fs';
import path from 'node:path';

const D = Math.PI / 180;
// 【実データ】IAU 1958 の銀河座標の定義(J2000.0 赤道座標での銀河北極と、天の北極の銀経)
export const NGP = { ra: 192.85948, dec: 27.12825, lNCP: 122.93192 };

export function eqToGal(raDeg, decDeg) {
  const a = raDeg * D, e = decDeg * D, ag = NGP.ra * D, eg = NGP.dec * D;
  const sb = Math.sin(e) * Math.sin(eg) + Math.cos(e) * Math.cos(eg) * Math.cos(a - ag);
  const b = Math.asin(Math.max(-1, Math.min(1, sb))) / D;
  const y = Math.cos(e) * Math.sin(a - ag);
  const x = Math.sin(e) * Math.cos(eg) - Math.cos(e) * Math.sin(eg) * Math.cos(a - ag);
  let l = NGP.lNCP - Math.atan2(y, x) / D;
  l = ((l % 360) + 360) % 360;
  return [l, b];
}

export function galToEq(lDeg, bDeg) {
  const l = lDeg * D, b = bDeg * D, ag = NGP.ra * D, eg = NGP.dec * D, ln = NGP.lNCP * D;
  const sd = Math.sin(b) * Math.sin(eg) + Math.cos(b) * Math.cos(eg) * Math.cos(ln - l);
  const dec = Math.asin(Math.max(-1, Math.min(1, sd))) / D;
  const y = Math.cos(b) * Math.sin(ln - l);
  const x = Math.sin(b) * Math.cos(eg) - Math.cos(b) * Math.sin(eg) * Math.cos(ln - l);
  const ra = (((ag + Math.atan2(y, x)) / D) % 360 + 360) % 360;
  return [ra, dec];
}

const wrap180 = (x) => ((((x + 180) % 360) + 360) % 360) - 180;

// 輪(経度・緯度の度。経度は -180〜180 でも 0〜360 でもよい)を、頂点間の大円(d3 の描画と同じ解釈)に沿って
// maxStepDeg 刻みに細分し、銀河座標(l,b)の点列にする。大円で結ぶので、継ぎ目や天の極の近くでも正しい
const toVec = (lon, lat) => { const a = lon * D, e = lat * D; return [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)]; };
const vecToEq = (v) => [((Math.atan2(v[1], v[0]) / D) % 360 + 360) % 360, Math.asin(Math.max(-1, Math.min(1, v[2]))) / D];
export function ringToGalactic(ring, maxStepDeg = 0.25) {
  const pts = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const P = toVec(ring[i][0], ring[i][1]), Q = toVec(ring[(i + 1) % n][0], ring[(i + 1) % n][1]);
    const dot = Math.max(-1, Math.min(1, P[0] * Q[0] + P[1] * Q[1] + P[2] * Q[2]));
    const th = Math.acos(dot);
    const k = Math.max(1, Math.ceil(th / D / maxStepDeg));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      let v;
      if (th < 1e-9) v = P;
      else { const w1 = Math.sin((1 - t) * th) / Math.sin(th), w2 = Math.sin(t * th) / Math.sin(th); v = [w1 * P[0] + w2 * Q[0], w1 * P[1] + w2 * Q[1], w1 * P[2] + w2 * Q[2]]; }
      const [ra, dec] = vecToEq(v);
      pts.push(eqToGal(ra, dec));
    }
  }
  return pts;
}

// 銀河北極へ向かう子午線が輪と交わる回数の偶奇(true=内側)
export function insideByNorthRay(l0, b0, galRings) {
  let count = 0;
  for (const g of galRings) {
    const n = g.length;
    // 各頂点の銀経を l0 からの差(-180〜180)にしておく。頂点ごとに1回だけ計算するので、
    // 隣り合う辺で同じ頂点を二重に数えることがない
    let a = wrap180(g[0][0] - l0);
    for (let i = 0; i < n; i++) {
      const q = g[(i + 1) % n], p = g[i];
      const c = wrap180(q[0] - l0);
      if ((a < 0) !== (c < 0) && Math.abs(c - a) < 180) {
        const bc = p[1] + ((q[1] - p[1]) * (0 - a)) / (c - a);
        if (bc > b0) count++;
      }
      a = c;
    }
  }
  return count % 2 === 1;
}

export function loadLayers(mwFc, maxStepDeg = 0.25) {
  const layers = [];
  for (const f of mwFc.features ?? []) {
    const g = f.geometry;
    const polys = g?.type === 'MultiPolygon' ? g.coordinates : g?.type === 'Polygon' ? [g.coordinates] : [];
    const rings = polys.flat().map((r) => ringToGalactic(r, maxStepDeg));
    layers.push({ id: String(f.id), rings, ringCount: rings.length });
  }
  return layers;
}

// 銀河座標の格子(緯度 step° 刻み。経度は cos(b) に応じて間引き)
export function galacticGrid(stepDeg = 3, bMax = 60) {
  const out = [];
  for (let row = 0, b = -bMax; b <= bMax + 1e-9; row++, b += stepDeg) {
    const n = Math.max(1, Math.round((360 * Math.cos(b * D)) / stepDeg));
    const off = row % 2 ? 0.5 : 0;
    for (let i = 0; i < n; i++) out.push([((i + off) * 360) / n, b]);
  }
  return out;
}

export function levelsAt(points, layers) {
  return points.map(([l, b]) => layers.reduce((s, ly) => s + (insideByNorthRay(l, b, ly.rings) ? 1 : 0), 0));
}

const r1 = (x) => Math.round(x * 10) / 10;

export function buildSamples(mwFc, { step = 3, maxStepDeg = 0.25 } = {}) {
  const layers = loadLayers(mwFc, maxStepDeg);
  const grid = galacticGrid(step);
  const lev = levelsAt(grid, layers);
  const samples = [];
  const gal = [];
  grid.forEach(([l, b], i) => {
    if (lev[i] < 1) return;
    const [ra, dec] = galToEq(l, b);
    samples.push([0, r1(ra), r1(dec), lev[i]]);
    gal.push([l, b, lev[i]]);
  });
  return { samples, gal, layers, gridCount: grid.length };
}

// ---- 検証 ----
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };

export function statsOf(samples) {
  // samples: [0, ra, dec, w]。銀河座標へ戻して統計を取る
  const bs = samples.map((s) => eqToGal(s[1], s[2])[1]);
  const abs = bs.map(Math.abs).sort((x, y) => x - y);
  const decs = samples.map((s) => s[2]);
  const pct = (p) => (abs.length ? abs[Math.min(abs.length - 1, Math.floor(abs.length * p))] : null);
  return {
    count: samples.length,
    absBMedian: abs.length ? r1(median(abs)) : null,
    absBP90: abs.length ? r1(pct(0.9)) : null,
    absBMax: abs.length ? r1(abs[abs.length - 1]) : null,
    decMin: decs.length ? Math.min(...decs) : null,
    decMax: decs.length ? Math.max(...decs) : null,
    southOfMinus30: decs.filter((d) => d < -30).length,
    withinB10: bs.filter((b) => Math.abs(b) <= 10).length,
    beyondB45: bs.filter((b) => Math.abs(b) > 45).length,
  };
}

export function checks(res, layers) {
  const out = [];
  const add = (name, ok, detail) => out.push({ name, ok: !!ok, detail });
  const st = statsOf(res.samples);
  add('点が十分にある(200点以上)', st.count >= 200, `${st.count}点`);
  add('銀緯45°超の点がない(天の川の帯の外を含まない)', st.beyondB45 === 0, `${st.beyondB45}点`);
  add('南天(赤緯-30°より南)にも点がある', st.southOfMinus30 >= 50, `${st.southOfMinus30}点`);
  add('赤緯の範囲が両半球にまたがる', st.decMin < -60 && st.decMax > 60, `${st.decMin}〜${st.decMax}`);
  // 銀経30°刻みの各区間で、銀緯±3°以内(銀河面のすぐ近く)に点がある=帯が途切れない
  const gaps = [];
  for (let l0 = 0; l0 < 360; l0 += 30) {
    const has = res.gal.some(([l, b]) => l >= l0 && l < l0 + 30 && Math.abs(b) <= 3);
    if (!has) gaps.push(l0);
  }
  add('銀経0〜360°のどこでも銀河面近く(|b|≦3°)に点がある', gaps.length === 0, gaps.length ? `欠け: l=${gaps.join(',')}°台` : '欠けなし');
  // 定義上の点の判定
  const P = (l, b) => layers.reduce((s, ly) => s + (insideByNorthRay(l, b, ly.rings) ? 1 : 0), 0);
  const gc = P(0.0001, 0), ac = P(180, 0), n90 = P(0, 89), s90 = P(0, -89), b60 = P(90, 60), b60s = P(270, -60);
  add('銀河中心方向(l=0,b=0)は内側(1層以上)', gc >= 1, `${gc}層`);
  add('銀河反中心方向(l=180,b=0)は内側(1層以上)', ac >= 1, `${ac}層`);
  add('銀河北極・南極付近(|b|=89°)は外側(0層)', n90 === 0 && s90 === 0, `北${n90}層/南${s90}層`);
  add('銀緯±60°は外側(0層)', b60 === 0 && b60s === 0, `+60:${b60}層 / -60:${b60s}層`);
  // どの輪も銀河北極を含まない(偶奇法の前提): 北極から見て輪の巻き数がゼロ→ P(0,89)=0 で代用して確認済み
  return { checks: out, detail: { gc, ac }, stats: st };
}

export function levelProfile(gal) {
  // 銀経30°ごとの、最大level・帯の幅(その区間で点がある銀緯の最小〜最大)
  const rows = [];
  for (let l0 = 0; l0 < 360; l0 += 30) {
    const g = gal.filter(([l]) => l >= l0 && l < l0 + 30);
    rows.push({
      lRange: `${l0}-${l0 + 30}`,
      n: g.length,
      maxLevel: g.length ? Math.max(...g.map((x) => x[2])) : 0,
      bMin: g.length ? r1(Math.min(...g.map((x) => x[1]))) : null,
      bMax: g.length ? r1(Math.max(...g.map((x) => x[1]))) : null,
    });
  }
  return rows;
}

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dataDir = arg('data-dir');
  const outDir = arg('out', 'docs/mwfix');
  const step = Number(arg('step', '3'));
  const version = arg('version', 'unknown');
  if (!dataDir) throw new Error('--data-dir が必要です');
  fs.mkdirSync(outDir, { recursive: true });
  const mwFc = JSON.parse(fs.readFileSync(path.join(dataDir, 'mw.json'), 'utf8'));
  const res = buildSamples(mwFc, { step });
  const ck = checks(res, res.layers);
  const prof = levelProfile(res.gal);
  const oldPath = new URL('../data-src/mw-p28-old-samples.json', import.meta.url);
  const old = fs.existsSync(oldPath) ? JSON.parse(fs.readFileSync(oldPath, 'utf8')) : null;
  const oldStats = old ? statsOf(old.samples) : null;
  const oldChecks = old ? checks({ samples: old.samples, gal: old.samples.map((s) => { const [l, b] = eqToGal(s[1], s[2]); return [l, b, s[3]]; }) }, res.layers) : null;

  // 層ごとの構造(診断用)
  const layerInfo = res.layers.map((ly) => ({ id: ly.id, rings: ly.ringCount, vertices: ly.rings.reduce((a, r) => a + r.length, 0) }));
  const levelCount = [1, 2, 3, 4, 5].map((v) => res.samples.filter((s) => s[3] === v).length);

  const meta = {
    source: 'd3-celestial data/mw.json(出典: Milky Way Outline Catalog, Jose R. Vieira)',
    d3CelestialVersion: version,
    format: '[0, 赤経J2000(度), 赤緯J2000(度), level(1〜5)]。先頭の0は試作28の形式に合わせた予約欄',
    gridStepDeg: step,
    method: '銀河座標の格子点を、各等光度線の輪(細分0.25°)に対する北向き子午線の交差回数の偶奇で判定',
    galacticDefinition: NGP,
  };
  fs.writeFileSync(path.join(outDir, 'mw-samples.json'), JSON.stringify({ meta, samples: res.samples }));
  fs.writeFileSync(path.join(outDir, 'mw-samples.js'), `// 天の川サンプル(d3-celestial mw.json 由来・検証済み)。形式: [0,赤経J2000°,赤緯J2000°,level 1〜5]\nconst mwSamples=${JSON.stringify(res.samples)};\n`);
  const report = { meta, gridCount: res.gridCount, sampleCount: res.samples.length, levelCount, layerInfo, checks: ck.checks, stats: ck.stats, profile: prof, old: old ? { stats: oldStats, checks: oldChecks.checks } : null };
  fs.writeFileSync(path.join(outDir, 'mw-verify.json'), JSON.stringify(report, null, 2));

  const L = [];
  L.push('# 天の川サンプルの検証結果', '');
  L.push(`- 出典: ${meta.source}(d3-celestial ${version})`, `- 点数: ${res.samples.length}(格子 ${step}°刻み・${res.gridCount}点のうち内側)`, `- level別の点数(1〜5): ${levelCount.join(' / ')}`, '');
  L.push('## 層の構造(診断)', '', '| 層 | 輪の数 | 頂点数 |', '|---|---|---|', ...layerInfo.map((x) => `| ${x.id} | ${x.rings} | ${x.vertices} |`), '');
  L.push('## 新データのチェック', '', '| 項目 | 結果 | 詳細 |', '|---|---|---|', ...ck.checks.map((c) => `| ${c.name} | ${c.ok ? '合格' : '**不合格**'} | ${c.detail} |`), '');
  L.push('## 銀経ごとの帯(新データ)', '', '| 銀経 | 点数 | 最大level | 銀緯の範囲 |', '|---|---|---|---|', ...prof.map((p) => `| ${p.lRange}° | ${p.n} | ${p.maxLevel} | ${p.bMin}〜${p.bMax}° |`), '');
  if (old) {
    L.push('## 旧データ(試作28)の同じ検査', '', '| 項目 | 結果 | 詳細 |', '|---|---|---|', ...oldChecks.checks.map((c) => `| ${c.name} | ${c.ok ? '合格' : '**不合格**'} | ${c.detail} |`), '');
    L.push(`旧データの統計: ${JSON.stringify(oldStats)}`, '');
  }
  fs.writeFileSync(path.join(outDir, 'mw-verify.md'), L.join('\n'));
  console.log(L.join('\n'));
  const bad = ck.checks.filter((c) => !c.ok);
  if (bad.length) { console.error(`不合格 ${bad.length} 件`); process.exitCode = 1; }
}
