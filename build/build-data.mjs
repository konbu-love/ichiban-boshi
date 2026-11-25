// d3-celestial(実データ) → 描画担当向けの軽量データ一式(dist/data/)に変換する。
// 使い方: node build/build-data.mjs --data-dir <d3-celestial/data> --out dist [--version 0.7.35]
// 方針(docs/handoff/data-spec.md):
//  - 恒星は6.0等まで+星座線の構成星(暗くても例外として採用。等級は改変しない)
//  - 一番星の選択対象 = 線の構成星 ∪ 固有名のある6.0等以下の星 ∪ 3.5等以下の星(昇格)
//  - 線の頂点は、0.05°以内で一番明るい星に対応づける(等級差0.5未満は元データの命名で確認、無ければ明るい方)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parseStars, buildMatcher, matchPolylines, makeNamePicker, simplifyRing, round } from '../audit/audit.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const LIMIT_MAG_BY_CLASS = { A: 3.5, B: 4.5, C: 5.5, D: 6.0, E: 7.0 }; // 【ゲーム設定】仮値

const readJson = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const gz = (s) => zlib.gzipSync(Buffer.from(s), { level: 9 }).length;
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

export function buildAll({ dataDir, outDir, siteSeedPath, siteCoordsPath, eps = 0.05, mwTolerance = 0.25, version = 'unknown' }) {
  const stars6 = parseStars(readJson(dataDir, 'stars.6.json'));
  const stars8 = parseStars(readJson(dataDir, 'stars.8.json'));
  const starByHip = new Map(stars8.map((s) => [s.hip, s]));
  for (const s of stars6) if (!starByHip.has(s.hip)) starByHip.set(s.hip, s);
  const namesRaw = readJson(dataDir, 'starnames.json');
  const consFc = readJson(dataDir, 'constellations.json');
  const conIds = new Set((consFc.features ?? []).map((f) => String(f.id)));

  // --- 星座線 ---
  const nearest = buildMatcher(stars8);
  const m = matchPolylines(readJson(dataDir, 'constellations.lines.json'), nearest, eps, 6.0, makeNamePicker(namesRaw));
  if (m.unmatched.length) throw new Error(`星座線の頂点に対応する星がない: ${m.unmatched.length}件`);
  const lines = {};
  const starCons = new Map(); // HIP -> Set(星座ID)
  for (const [id, edges] of Object.entries(m.edges)) {
    const seen = new Set();
    const list = [];
    for (const [a, b] of edges) {
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (a === b || seen.has(k)) continue;
      seen.add(k);
      list.push([a, b]);
      for (const h of [a, b]) {
        if (!starCons.has(h)) starCons.set(h, new Set());
        starCons.get(h).add(id);
      }
    }
    if (list.length) lines[id] = list;
  }

  // --- 名前 ---
  const nameInfo = (hip) => {
    const v = namesRaw[hip] ?? namesRaw[String(hip)];
    if (!v || typeof v !== 'object') return null;
    const en = str(typeof v.name === 'string' ? v.name : v.name?.en);
    return { en, ja: str(v.ja), bayer: str(v.bayer), flam: str(v.flam), con: conIds.has(v.c) ? v.c : undefined };
  };
  const namedHips = [];
  for (const k of Object.keys(namesRaw)) {
    const hip = Number(k);
    const info = nameInfo(hip);
    const s = starByHip.get(hip);
    if (info?.en && s && s.mag <= 6.0) namedHips.push(hip);
  }

  // --- 選択対象 ---
  const selectable = new Set([...m.hipSet, ...namedHips]);
  const promoted = [];
  for (const s of stars6) if (s.mag <= 3.5 && !selectable.has(s.hip)) { selectable.add(s.hip); promoted.push(s.hip); }

  // --- 恒星(6.0等まで + 線の構成星の例外) ---
  const starRows = new Map();
  const toRow = (s) => [s.hip, round(s.ra, 4), round(s.dec, 4), round(s.mag, 2), Number.isFinite(s.bv) ? round(s.bv, 2) : null];
  for (const s of stars6) starRows.set(s.hip, toRow(s));
  const exceptions = [];
  for (const h of m.hipSet) {
    if (!starRows.has(h)) {
      const s = starByHip.get(h);
      starRows.set(h, toRow(s));
      exceptions.push({ hip: h, mag: s.mag });
    }
  }
  const starsOut = [...starRows.values()].sort((a, b) => a[3] - b[3] || a[0] - b[0]);

  // --- 選択対象の名前・星座(選択対象の星だけ) ---
  const names = {};
  const conOf = {};
  let jaCount = 0;
  let conUnknown = 0;
  for (const h of [...selectable].sort((a, b) => a - b)) {
    const info = nameInfo(h) ?? {};
    const entry = {};
    if (info.en) entry.en = info.en;
    if (info.ja) { entry.ja = info.ja; jaCount++; }
    if (info.bayer) entry.bayer = info.bayer;
    if (info.flam) entry.flam = info.flam;
    if (Object.keys(entry).length) names[h] = entry;
    const cons = starCons.has(h) ? [...starCons.get(h)] : info.con ? [info.con] : [];
    if (cons.length) conOf[h] = cons;
    else conUnknown++;
  }

  // --- 星座の名前・中心 ---
  const constellations = {};
  for (const f of consFc.features ?? []) {
    const p = f.properties ?? {};
    const c = f.geometry?.coordinates;
    constellations[String(f.id)] = {
      la: str(p.name) ?? str(p.la),
      en: str(p.en),
      ja: str(p.ja),
      ra: Array.isArray(c) ? round(((c[0] % 360) + 360) % 360, 2) : null,
      dec: Array.isArray(c) ? round(c[1], 2) : null,
    };
  }

  // --- 天の川(輪ごとに間引き。赤経0〜360°で、継ぎ目では分割しない) ---
  const mwFc = readJson(dataDir, 'mw.json');
  const mw = { note: '各層は赤経・赤緯(度)の多角形(外側の輪+穴)。継ぎ目では分割していない。投影は頂点ごとにおこない、地平線で切る処理は描画側で行う。', toleranceDeg: mwTolerance, layers: [] };
  for (const f of mwFc.features ?? []) {
    const g = f.geometry;
    const polys = g?.type === 'MultiPolygon' ? g.coordinates : g?.type === 'Polygon' ? [g.coordinates] : [];
    mw.layers.push({ id: String(f.id), polygons: polys.map((poly) => poly.map((ring) => simplifyRing(ring, mwTolerance))) });
  }

  // --- 地点 ---
  const seed = JSON.parse(fs.readFileSync(siteSeedPath, 'utf8')).sites;
  const coords = JSON.parse(fs.readFileSync(siteCoordsPath, 'utf8')).sites;
  const sites = seed.map((s) => {
    const c = coords[s.id];
    if (!c) throw new Error(`座標がない地点: ${s.id}`);
    return {
      id: s.id, name_ja: s.name_ja, lat: c.lat, lon: c.lon, tz: s.tz,
      darkClass: s.dark_class_provisional, limitMag: LIMIT_MAG_BY_CLASS[s.dark_class_provisional],
      landscape: s.landscape, coordKind: s.coord_kind, coordSource: c.source, coordReviewed: c.reviewed === true,
    };
  });

  // --- 出典 ---
  const credits = {
    note: '未確認の項目は status に未確認と書いてある。公開前に確認する。',
    items: [
      { name: 'd3-celestial', version, role: '恒星・星座線・星の名前・星座の名前・天の川', license: 'BSD-3-Clause', copyright: 'Olaf Frohn', url: 'https://github.com/ofrohn/d3-celestial', status: 'ライセンス全文は同梱(licenses/)' },
      { name: 'astronomy-engine', role: '太陽・月・惑星の位置、地平座標の計算', license: 'MIT', copyright: 'Don Cross', url: 'https://github.com/cosinekitty/astronomy', status: 'ライセンス全文は同梱(licenses/)' },
      { name: 'ja(日本語名)', role: 'd3-celestialに含まれる日本語名', license: '未確認', status: '出典・利用条件が未確認(公開前の確認事項)' },
      { name: '地点座標', role: '国土地理院 住所検索API / Wikipedia', license: '未確認', status: '利用条件の確認が必要(公開前の確認事項)' },
    ],
  };

  // --- 出力 ---
  const dataOut = path.join(outDir, 'data');
  fs.mkdirSync(dataOut, { recursive: true });
  const files = {
    'stars.json': starsOut,
    'selectable.json': [...selectable].sort((a, b) => a - b),
    'names.json': names,
    'starCons.json': conOf,
    'lines.json': lines,
    'constellations.json': constellations,
    'mw.json': mw,
    'sites.json': sites,
    'credits.json': credits,
  };
  const sizes = {};
  for (const [name, obj] of Object.entries(files)) {
    const text = JSON.stringify(obj);
    fs.writeFileSync(path.join(dataOut, name), text);
    sizes[name] = { bytes: Buffer.byteLength(text), gzipBytes: gz(text) };
  }

  const report = {
    version,
    stars: { total: starsOut.length, le6: starsOut.filter((r) => r[3] <= 6).length, exceptions },
    selectable: { total: selectable.size, promotedBright: promoted, namedLe6: namedHips.length, lineStars: m.hipSet.size },
    lines: { constellations: Object.keys(lines).length, edges: Object.values(lines).reduce((a, b) => a + b.length, 0), ambiguousVertices: m.ambiguous.length, unconfirmed: m.ambiguous.filter((a) => !a.confirmed).map((a) => ({ feature: a.feature, vertex: a.vertex, chosen: a.chosen.hip, basis: a.basis })) },
    names: { selectableWithName: Object.values(names).filter((n) => n.en).length, selectableWithJa: jaCount, selectableConstellationUnknown: conUnknown },
    constellations: { total: Object.keys(constellations).length, withJa: Object.values(constellations).filter((c) => c.ja).length },
    milkyWay: { layers: mw.layers.length, vertices: mw.layers.reduce((a, l) => a + l.polygons.reduce((b, p) => b + p.reduce((c, r) => c + r.length, 0), 0), 0) },
    sites: { total: sites.length, unreviewedCoords: sites.filter((s) => !s.coordReviewed).map((s) => s.id) },
    sizes,
  };
  // 参照の整合性
  const hipSetOut = new Set(starsOut.map((r) => r[0]));
  const problems = [];
  for (const [con, edges] of Object.entries(lines)) for (const [a, b] of edges) for (const h of [a, b]) if (!hipSetOut.has(h)) problems.push(`lines ${con}: HIP ${h} が stars.json にない`);
  for (const h of selectable) if (!hipSetOut.has(h)) problems.push(`selectable: HIP ${h} が stars.json にない`);
  report.problems = problems;
  fs.writeFileSync(path.join(outDir, 'build-report.json'), JSON.stringify(report, null, 1));
  if (problems.length) throw new Error(`整合性エラー: ${problems.slice(0, 5).join(' / ')}`);
  return report;
}

function parseArgs(argv) {
  const a = { out: 'dist' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--data-dir') a.dataDir = argv[++i];
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--version') a.version = argv[++i];
  }
  return a;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = parseArgs(process.argv.slice(2));
  if (!a.dataDir) throw new Error('--data-dir が必要');
  const rep = buildAll({
    dataDir: a.dataDir, outDir: a.out, version: a.version ?? 'unknown',
    siteSeedPath: path.join(here, '..', 'audit', 'sites.seed.json'),
    siteCoordsPath: path.join(here, '..', 'data-src', 'site-coords.json'),
  });
  console.log(JSON.stringify(rep, null, 1));
}
