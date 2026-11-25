// 監査ロジックの検証(合成データ)。実データの数値ではなく、「集計ロジックが正しく動くか」を確かめるテスト。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseStars, countByMag, compactStats, buildMatcher, matchPolylines, sepDeg, unit,
  analyzeNames, analyzeMilkyWay, analyzeDsos, resolveOffset, checkSites, fetchWikipediaCoords,
  runAudit, renderMarkdown,
} from '../audit/audit.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(here, '..', 'audit', 'sites.seed.json');

// ---- 合成データの作成 ----
function makeSynthetic() {
  // [HIP, 経度, 緯度, 等級]
  const specials = [
    [1, 10, 20, 2.0], [2, 11, 20, 3.0], [3, -170, -30, 4.0], [4, 179.999, 0, 5.0],
    [5, 50, 80, 6.5], [6, 100, 10, 4.0], [7, 100.02, 10, 4.0],
  ];
  const avoid = [[10, 20], [11, 20], [-170, -30], [179.999, 0], [50, 80], [100, 10], [30, -60], [170, 10]];
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const feats = specials.map(([id, lon, lat, mag]) => ({
    type: 'Feature', id, properties: { mag, bv: '0.5' }, geometry: { type: 'Point', coordinates: [lon, lat] },
  }));
  let id = 1000;
  while (feats.length < 300) {
    const lon = rnd() * 360 - 180;
    const lat = Math.asin(rnd() * 2 - 1) * (180 / Math.PI);
    if (avoid.some(([a, b]) => sepDeg(unit(lon, lat), unit(a, b)) < 3)) continue;
    const mag = 4.1 + rnd() * 4.3; // 4.1〜8.4等(3.5等以下の星は特別な星だけにする)
    feats.push({
      type: 'Feature', id: id++, properties: { mag: Number(mag.toFixed(2)), bv: '' },
      geometry: { type: 'Point', coordinates: [Number(lon.toFixed(4)), Number(lat.toFixed(4))] },
    });
  }
  const stars8 = { type: 'FeatureCollection', features: feats };
  const stars6 = { type: 'FeatureCollection', features: feats.filter((f) => f.properties.mag <= 6.0) };
  const lines = {
    type: 'FeatureCollection',
    features: [
      // 頂点がHIP 1,2,3に一致(3は経度が負)
      { type: 'Feature', id: 'AAA', properties: {}, geometry: { type: 'MultiLineString', coordinates: [[[10.001, 20.0], [11, 20.001], [-170.0005, -30]]] } },
      // 50,80はHIP5(6.5等で6.0等より暗い) / 100.01,10は近接2星で曖昧 / 30,-60は星なし
      { type: 'Feature', id: 'BBB', properties: {}, geometry: { type: 'MultiLineString', coordinates: [[[50, 80], [100.01, 10], [30, -60]]] } },
    ],
  };
  const names = {
    1: { name: 'Alpha Test', desig: 'x' },
    2: { name: '', desig: 'y' },
    3: { name: 'Beta', desig: 'z', ja: 'ベータ' },
    5: { name: 'Faint Named', desig: 'w' },
  };
  const asterisms = { type: 'FeatureCollection', features: [{ type: 'Feature', id: 'Ast1', properties: { n: 'Big Dipper' }, geometry: { type: 'LineString', coordinates: [[10, 20], [11, 20]] } }] };
  const mw = {
    type: 'FeatureCollection',
    features: [
      // 継ぎ目(±180°)に触れ、辺が2回跨ぐリング
      { type: 'Feature', id: 'ol1', properties: {}, geometry: { type: 'MultiPolygon', coordinates: [[[[170, 10], [179.999, 12], [-179.999, 13], [-170, 10], [170, 10]]]] } },
      { type: 'Feature', id: 'ol2', properties: {}, geometry: { type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [2, 0.001], [3, 0], [3, 1], [0, 1], [0, 0]]]] } },
    ],
  };
  const mk = (desig, mag, lon, lat) => ({ type: 'Feature', id: desig, properties: { desig, mag, dim: '1' }, geometry: { type: 'Point', coordinates: [lon, lat] } });
  const dsos = { type: 'FeatureCollection', features: [mk('LMC', 0.4, 80.895, -69.75), mk('SMC', 2.3, 13.155, -72.8), mk('M 31', 3.4, 10.68, 41.267), mk('NGC 3532', '3', 166.4, -58.7)] };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ichiban-synth-'));
  const w = (n, o) => fs.writeFileSync(path.join(dir, n), JSON.stringify(o));
  w('stars.6.json', stars6); w('stars.8.json', stars8); w('constellations.lines.json', lines);
  w('starnames.json', names); w('asterisms.json', asterisms); w('mw.json', mw); w('dsos.bright.json', dsos);
  return { dir, stars6, stars8, names, mw, dsos, lines };
}

test('角距離: 経度の折り返しをまたいでも小さい / 90°離れた点は90°', () => {
  assert.ok(sepDeg(unit(179.999, 0), unit(-179.999, 0)) < 0.003);
  assert.ok(Math.abs(sepDeg(unit(0, 0), unit(90, 0)) - 90) < 1e-9);
});

test('恒星の読み込み・等級別件数・軽量形式の件数', () => {
  const { stars8 } = makeSynthetic();
  const p8 = parseStars(stars8);
  assert.equal(p8.length, 300);
  const c = countByMag(p8, [3.5, 6.0, 8.5]);
  assert.equal(c['<=3.5'], 2); // HIP 1 (2.0等) と HIP 2 (3.0等)
  assert.equal(c['<=8.5'], 300);
  const stat = compactStats(p8, 6.0);
  assert.equal(stat.count, c['<=6']);
  assert.equal(stat.binaryBytes, stat.count * 16);
  assert.ok(stat.jsonGzipBytes > 0 && stat.binaryGzipBytes > 0);
});

test('最近傍検索: 負の経度・継ぎ目付近・曖昧・星なしを正しく判定', () => {
  const { stars8 } = makeSynthetic();
  const p8 = parseStars(stars8);
  const nearest = buildMatcher(p8);
  assert.equal(nearest(-170.0005, -30).best.hip, 3);
  assert.equal(nearest(-179.999 + 0.0005, 0).best.hip, 4); // HIP 4 は経度179.999
  assert.equal(nearest(10.001, 20).best.hip, 1);
  const amb = nearest(100.01, 10);
  assert.ok(amb.best.sep <= 0.05 && amb.second.sep <= 0.05);
  const none = nearest(30, -60);
  assert.ok(!none.best || none.best.sep > 0.5);
});

test('星座線の突き合わせ: 一番明るい星を採用・暗い星も例外として残す・辺の生成', () => {
  const { stars8, lines } = makeSynthetic();
  const nearest = buildMatcher(parseStars(stars8));
  const m = matchPolylines(lines, nearest, 0.05, 6.0);
  assert.equal(m.vertices, 6);
  assert.equal(m.hipSet.size, 5); // 1,2,3,5 と 6か7(同等なので近い方)
  for (const h of [1, 2, 3, 5]) assert.ok(m.hipSet.has(h));
  assert.equal(m.ambiguous.length, 1);
  assert.equal(m.ambiguous[0].others.length, 1);
  assert.equal(m.ambiguous[0].needsReview, true); // 等級差0.5未満
  assert.equal(m.unmatched.length, 1);
  assert.equal(m.faint.length, 1); // HIP 5 (6.5等) は線の構成星として残す
  assert.equal(m.faint[0].hip, 5);
  assert.deepEqual(m.edges.AAA, [[1, 2], [2, 3]]);
  assert.equal(m.edges.BBB.length, 1); // 5 -> 6or7 の辺。一致なしの頂点の先へは延ばさない
  assert.equal(m.edges.BBB[0][0], 5);
});

test('明るい方を採用: 二星のうち暗い方が近くても明るい方を選ぶ', () => {
  const stars = [
    { type: 'Feature', id: 10, properties: { mag: 5.6 }, geometry: { type: 'Point', coordinates: [40, 10] } },
    { type: 'Feature', id: 11, properties: { mag: 2.9 }, geometry: { type: 'Point', coordinates: [40.005, 10] } },
  ];
  const nearest = buildMatcher(parseStars({ type: 'FeatureCollection', features: stars }));
  const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', id: 'X', properties: {}, geometry: { type: 'LineString', coordinates: [[40, 10], [41, 10]] } }] };
  const m = matchPolylines(fc, nearest, 0.05, 6.0);
  assert.deepEqual([...m.hipSet], [11]);
  assert.equal(m.ambiguous[0].chosenIsNearest, false);
  assert.equal(m.ambiguous[0].needsReview, false);
});

test('二重星の判断: 明るさが近いときは元データの名前がある星を採用し、記録を残す', () => {
  const stars = [
    { type: 'Feature', id: 20, properties: { mag: 4.0 }, geometry: { type: 'Point', coordinates: [60, 10] } },
    { type: 'Feature', id: 21, properties: { mag: 4.2 }, geometry: { type: 'Point', coordinates: [60.01, 10] } },
  ];
  const nearest = buildMatcher(parseStars({ type: 'FeatureCollection', features: stars }));
  const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', id: 'Y', properties: {}, geometry: { type: 'LineString', coordinates: [[60, 10], [61, 10]] } }] };
  const pick = (sorted) => { const w = sorted.filter((c) => c.hip === 21); return w.length === 1 ? { chosen: w[0], basis: 'bayer' } : null; };
  const m = matchPolylines(fc, nearest, 0.05, 6.0, pick);
  assert.deepEqual([...m.hipSet], [21]);
  assert.equal(m.ambiguous[0].basis, 'bayer');
  assert.equal(m.ambiguous[0].confirmed, true);
  const m2 = matchPolylines(fc, nearest, 0.05, 6.0, () => null);
  assert.deepEqual([...m2.hipSet], [20]);
  assert.equal(m2.ambiguous[0].basis, 'brightest');
  assert.equal(m2.ambiguous[0].confirmed, false);
});

test('星の名前: 固有名・日本語キー・6.0等以下の固有名の数', () => {
  const { stars8, names } = makeSynthetic();
  const magByHip = new Map(parseStars(stars8).map((s) => [s.hip, s.mag]));
  const r = analyzeNames(names, magByHip);
  assert.equal(r.totalEntries, 4);
  assert.equal(r.withProperName, 3);
  assert.equal(r.namedWithMag_le_6, 2); // HIP 5 は6.5等
  assert.deepEqual(r.japaneseKeysFound, ['ja']);
});

test('天の川: 継ぎ目の検出と間引き', () => {
  const { mw } = makeSynthetic();
  const r = analyzeMilkyWay(mw);
  assert.equal(r.seamTouchVertices, 2);
  assert.equal(r.seamJumps, 2);
  assert.equal(r.features.length, 2);
  assert.equal(r.totalVertices, 12);
  assert.ok(r.simplifiedAtToleranceDeg['0.25'].vertices <= r.totalVertices);
  assert.ok(r.rawBytes > 0);
});

test('DSO: LMC/SMC/M31の抽出と文字列等級の検出', () => {
  const { dsos } = makeSynthetic();
  const r = analyzeDsos(dsos);
  assert.deepEqual(r.missing, []);
  assert.equal(r.found['M 31'].mag, 3.4);
  assert.equal(r.stringMagFeatures.length, 1);
  assert.equal(r.stringMagFeatures[0].mag, '3');
});

test('時刻系: 既知のUTCオフセット', () => {
  const jan = new Date(Date.UTC(2026, 0, 15, 12));
  const jul = new Date(Date.UTC(2026, 6, 15, 12));
  assert.equal(resolveOffset('Asia/Tokyo', jan), 'GMT+09:00');
  assert.equal(resolveOffset('Asia/Kathmandu', jan), 'GMT+05:45');
  assert.equal(resolveOffset('Asia/Kolkata', jan), 'GMT+05:30');
  assert.equal(resolveOffset('Australia/Sydney', jan), 'GMT+11:00');
  assert.equal(resolveOffset('Australia/Sydney', jul), 'GMT+10:00');
  assert.equal(resolveOffset('America/Argentina/Ushuaia', jan), 'GMT-03:00');
  assert.match(resolveOffset('Mars/Phobos', jan), /^ERROR/);
});

test('23地点の種: 件数・ID重複なし・時刻系がすべて解決できる', () => {
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  assert.equal(seed.sites.length, 23);
  assert.equal(new Set(seed.sites.map((s) => s.id)).size, 23);
  const res = checkSites(seed.sites);
  for (const r of res) {
    assert.ok(!r.offsetJan2026.startsWith('ERROR'), `${r.id} ${r.tz}: ${r.offsetJan2026}`);
    assert.ok(!r.offsetJul2026.startsWith('ERROR'), `${r.id} ${r.tz}: ${r.offsetJul2026}`);
  }
  const classes = {};
  for (const s of seed.sites) classes[s.dark_class_provisional] = (classes[s.dark_class_provisional] ?? 0) + 1;
  assert.deepEqual(classes, { A: 4, B: 5, C: 5, D: 3, E: 6 });
  const landscapes = new Set(seed.sites.map((s) => s.landscape));
  assert.equal(landscapes.size, 6);
});

test('Wikipedia座標の取得: リダイレクト・座標なしをモックで処理', async () => {
  const sites = [
    { id: 'a', wikipedia_title: 'Alpha' },
    { id: 'b', wikipedia_title: 'Beta Old' },
    { id: 'c', wikipedia_title: 'Gamma' },
  ];
  const body = {
    query: {
      redirects: [{ from: 'Beta Old', to: 'Beta New' }],
      pages: [
        { title: 'Alpha', coordinates: [{ lat: 1.5, lon: 2.5, primary: true, globe: 'earth' }] },
        { title: 'Beta New', coordinates: [{ lat: -3, lon: 4, primary: true, globe: 'earth' }] },
        { title: 'Gamma' },
      ],
    },
  };
  const mock = async () => ({ ok: true, json: async () => body });
  const r = await fetchWikipediaCoords(sites, mock);
  assert.equal(r[0].status, 'ok');
  assert.equal(r[0].lat, 1.5);
  assert.equal(r[1].redirected, true);
  assert.equal(r[1].resolvedTitle, 'Beta New');
  assert.equal(r[1].lon, 4);
  assert.equal(r[2].status, 'no-coordinates');
});

test('監査の一括実行とMarkdown出力(合成データ)', async () => {
  const { dir } = makeSynthetic();
  const rep = await runAudit({ dataDir: dir, eps: 0.05, sites: seedPath, version: 'synthetic' });
  assert.equal(rep.stars8.count, 300);
  assert.equal(rep.stars6.allIn8, true);
  assert.equal(rep.lines.uniqueMatchedHip, 5);
  assert.equal(rep.selection.counts.union_le_6, 4); // 線: 1,2,3,6or7 / 名前: 1,3
  assert.equal(rep.selection.counts.union_all, 5); // HIP 5 (6.5等) は線の構成星として例外で残る
  assert.equal(rep.selection.counts.lineExceptions_gt_6, 1);
  assert.equal(rep.selection.counts['union_le_3.5'], 2); // HIP 1,2
  assert.deepEqual(rep.selection.brightNotSelectable, []);
  assert.equal(rep.asterisms[0].matchedHip, 2);
  assert.equal(rep.dsos.missing.length, 0);
  const { _linesHipEdges, ...pub } = rep;
  const md = renderMarkdown(pub);
  assert.ok(md.includes('データ監査レポート'));
  assert.ok(md.includes('【実測】'));
  assert.ok(md.includes('未実行'));
});
