#!/usr/bin/env node
// 一番星アプリ: データ監査スクリプト
// d3-celestial のデータを実際に読み、件数・容量・星座線の突き合わせ・名前・天の川・DSO・時刻系・座標候補を集計する。
// 値はすべて「実測」(このスクリプトが数えた値)。推定値は "estimate" と明示する。
// 使い方: node audit/audit.mjs --data-dir <d3-celestialのdataフォルダ> --out out [--wikipedia] [--eps 0.05]

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

// ---------- 基本ヘルパ ----------
const DEG = Math.PI / 180;
export const gzipSize = (buf) => zlib.gzipSync(buf, { level: 9 }).length;
export const round = (v, n) => Math.round(v * 10 ** n) / 10 ** n;
export const raFromLon = (lon) => ((lon % 360) + 360) % 360;

export function unit(lonDeg, latDeg) {
  const l = lonDeg * DEG;
  const b = latDeg * DEG;
  return [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
}
export function sepDeg(a, b) {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.acos(Math.max(-1, Math.min(1, d))) / DEG;
}

// ---------- 恒星の読み込み ----------
export function parseStars(fc) {
  const out = [];
  for (const f of fc.features ?? []) {
    const c = f.geometry?.coordinates;
    const hip = Number(f.id);
    const mag = Number(f.properties?.mag);
    if (!Array.isArray(c) || !Number.isFinite(hip) || !Number.isFinite(mag)) continue;
    const bvRaw = f.properties?.bv;
    const bv = bvRaw === '' || bvRaw == null ? NaN : Number(bvRaw);
    out.push({
      hip,
      lon: c[0],
      lat: c[1],
      ra: raFromLon(c[0]),
      dec: c[1],
      mag,
      bv,
      u: unit(c[0], c[1]),
    });
  }
  return out;
}

export function countByMag(stars, limits) {
  const res = {};
  for (const lim of limits) res[`<=${lim}`] = stars.filter((s) => s.mag <= lim).length;
  return res;
}

// 軽量形式(配列)にしたときのサイズを実測する
export function compactStats(stars, limit) {
  const sel = stars.filter((s) => s.mag <= limit);
  const rows = sel.map((s) => [
    s.hip,
    round(s.ra, 3),
    round(s.dec, 3),
    round(s.mag, 2),
    Number.isFinite(s.bv) ? round(s.bv, 2) : null,
  ]);
  const json = JSON.stringify(rows);
  const jsonBytes = Buffer.byteLength(json);
  const jsonGz = gzipSize(Buffer.from(json));
  // 16バイト/星のバイナリ: hip(u32) ra(f32) dec(f32) mag*100(i16) bv*100(i16)
  const buf = Buffer.alloc(sel.length * 16);
  sel.forEach((s, i) => {
    const o = i * 16;
    buf.writeUInt32LE(s.hip, o);
    buf.writeFloatLE(s.ra, o + 4);
    buf.writeFloatLE(s.dec, o + 8);
    buf.writeInt16LE(Math.round(s.mag * 100), o + 12);
    buf.writeInt16LE(Number.isFinite(s.bv) ? Math.round(s.bv * 100) : -32768, o + 14);
  });
  return {
    limit,
    count: sel.length,
    jsonBytes,
    jsonGzipBytes: jsonGz,
    binaryBytes: buf.length,
    binaryGzipBytes: gzipSize(buf),
  };
}

// ---------- 最近傍検索(赤緯でソート) ----------
export function buildMatcher(stars) {
  const idx = stars.map((_, i) => i).sort((a, b) => stars[a].dec - stars[b].dec);
  const decs = idx.map((i) => stars[i].dec);
  const lowerBound = (x) => {
    let lo = 0;
    let hi = decs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (decs[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return function nearest(lon, lat, window = 2, eps = 0.05) {
    const u = unit(lon, lat);
    const cands = [];
    const from = lowerBound(lat - window);
    const to = lowerBound(lat + window);
    let best = null;
    let second = null;
    for (let k = from; k < to; k++) {
      const s = stars[idx[k]];
      const d = sepDeg(u, s.u);
      if (d <= eps) cands.push({ hip: s.hip, sep: d, mag: s.mag });
      if (!best || d < best.sep) {
        second = best;
        best = { hip: s.hip, sep: d, mag: s.mag };
      } else if (!second || d < second.sep) {
        second = { hip: s.hip, sep: d, mag: s.mag };
      }
    }
    return { best, second, cands };
  };
}

const HIST_EDGES = [0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2];

// 座標列(星座線・アステリズム)を恒星に突き合わせる
export function matchPolylines(fc, nearest, eps, magLimit = 6.0) {
  const hist = Object.fromEntries([...HIST_EDGES.map((e) => `<${e}`), '>=2/なし'].map((k) => [k, 0]));
  const unmatched = [];
  const ambiguous = [];
  const faint = [];
  const edges = {};
  const hipSet = new Set();
  const perFeature = {};
  let vertices = 0;

  for (const f of fc.features ?? []) {
    const id = String(f.id ?? f.properties?.desig ?? f.properties?.n ?? '?');
    const g = f.geometry;
    const lines = g?.type === 'MultiLineString' ? g.coordinates : g?.type === 'LineString' ? [g.coordinates] : [];
    const edgeList = [];
    let vCount = 0;
    let vUnmatched = 0;
    for (const line of lines) {
      let prev = null;
      for (let vi = 0; vi < line.length; vi++) {
        const [lon, lat] = line[vi];
        vertices++;
        vCount++;
        const { best, cands } = nearest(lon, lat, 2, eps);
        let key = '>=2/なし';
        if (best) {
          const e = HIST_EDGES.find((x) => best.sep < x);
          if (e !== undefined) key = `<${e}`;
        }
        hist[key]++;
        let cur = null;
        if (best && best.sep <= eps) {
          // 規則: eps内に複数の星があるときは一番明るい星を採用(同等なら近い方)
          const sorted = [...cands].sort((a, b) => a.mag - b.mag || a.sep - b.sep);
          const chosen = sorted[0];
          if (sorted.length > 1) {
            ambiguous.push({
              feature: id, vertex: vi, lon, lat,
              chosen, nearest: best, others: sorted.slice(1),
              chosenIsNearest: chosen.hip === best.hip,
              needsReview: Math.abs(sorted[0].mag - sorted[1].mag) < 0.5,
            });
          }
          cur = chosen.hip;
          hipSet.add(cur);
          // 方針: 6.0等より暗くても線の構成星は残す(例外採用)。等級は改変しない
          if (chosen.mag > magLimit) faint.push({ feature: id, vertex: vi, hip: chosen.hip, mag: chosen.mag });
        } else {
          vUnmatched++;
          unmatched.push({ feature: id, vertex: vi, lon, lat, nearest: best });
        }
        if (prev !== null && cur !== null && prev !== cur) edgeList.push([prev, cur]);
        prev = cur;
      }
    }
    edges[id] = edgeList;
    perFeature[id] = { vertices: vCount, unmatched: vUnmatched, edges: edgeList.length };
  }
  return {
    eps,
    vertices,
    uniqueMatchedHip: hipSet.size,
    histogram: hist,
    unmatched,
    ambiguous,
    faint,
    edges,
    hipSet,
    perFeature,
  };
}

// ---------- 星の名前 ----------
export function analyzeNames(obj, magByHip) {
  const keys = {};
  let withName = 0;
  const namedHips = new Set();
  const entries = Object.entries(obj ?? {});
  for (const [hipStr, v] of entries) {
    if (!v || typeof v !== 'object') continue;
    for (const k of Object.keys(v)) keys[k] = (keys[k] ?? 0) + 1;
    const name = typeof v.name === 'string' ? v.name : v.name?.en ?? '';
    if (name) {
      withName++;
      namedHips.add(Number(hipStr));
    }
  }
  const langKeys = Object.keys(keys).filter((k) => /^(ja|jp|ja[-_]?jp)$/i.test(k));
  let namedUpTo6 = 0;
  for (const h of namedHips) if ((magByHip.get(h) ?? 99) <= 6.0) namedUpTo6++;
  return {
    totalEntries: entries.length,
    withProperName: withName,
    namedWithMag_le_6: namedUpTo6,
    propertyKeyFrequency: keys,
    japaneseKeysFound: langKeys,
    namedHips,
  };
}

// ---------- 選択対象の概算(実データから数える) ----------
export function selectionCounts(lineHips, namedHips, magByHip, limits = [3.5, 4.5, 5.5, 6.0]) {
  // 候補集合 = 線の構成星(等級によらず) ∪ 固有名のある星(6.0等以下)
  const union = new Set([...lineHips, ...[...namedHips].filter((h) => (magByHip.get(h) ?? 99) <= 6.0)]);
  const res = {
    union_all: union.size,
    union_le_6: [...union].filter((h) => (magByHip.get(h) ?? 99) <= 6.0).length,
    lineVertexStars_all: lineHips.size,
    lineVertexStars_le_6: [...lineHips].filter((h) => (magByHip.get(h) ?? 99) <= 6).length,
    lineExceptions_gt_6: [...lineHips].filter((h) => (magByHip.get(h) ?? 99) > 6).length,
  };
  for (const lim of limits) res[`union_le_${lim}`] = [...union].filter((h) => (magByHip.get(h) ?? 99) <= lim).length;
  return res;
}
export function brightButNotSelectable(stars, union, limit = 3.5) {
  return stars
    .filter((s) => s.mag <= limit && !union.has(s.hip))
    .map((s) => ({ hip: s.hip, mag: s.mag }));
}

// ---------- 天の川 ----------
function dpSimplify(points, tol) {
  const n = points.length;
  if (n <= 3) return points.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  const dist = (p, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0;
    let maxI = -1;
    for (let i = s + 1; i < e; i++) {
      const d = dist(points[i], points[s], points[e]);
      if (d > maxD) {
        maxD = d;
        maxI = i;
      }
    }
    if (maxD > tol && maxI > 0) {
      keep[maxI] = 1;
      stack.push([s, maxI], [maxI, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

export function analyzeMilkyWay(fc, tolerances = [0.05, 0.1, 0.25]) {
  const features = [];
  let seamTouchVertices = 0;
  let seamJumps = 0;
  const simplified = Object.fromEntries(tolerances.map((t) => [t, { vertices: 0, bytes: 0 }]));
  for (const f of fc.features ?? []) {
    const g = f.geometry;
    const polys = g?.type === 'MultiPolygon' ? g.coordinates : g?.type === 'Polygon' ? [g.coordinates] : [];
    let rings = 0;
    let verts = 0;
    for (const poly of polys) {
      for (const ring of poly) {
        rings++;
        verts += ring.length;
        for (let i = 0; i < ring.length; i++) {
          if (Math.abs(ring[i][0]) >= 179.99) seamTouchVertices++;
          if (i > 0 && Math.abs(ring[i][0] - ring[i - 1][0]) > 180) seamJumps++;
        }
        for (const t of tolerances) {
          const s = dpSimplify(ring, t);
          simplified[t].vertices += s.length;
          simplified[t].bytes += Buffer.byteLength(JSON.stringify(s.map(([x, y]) => [round(x, 2), round(y, 2)])));
        }
      }
    }
    features.push({ id: f.id, geometryType: g?.type, polygons: polys.length, rings, vertices: verts });
  }
  const raw = JSON.stringify(fc);
  return {
    features,
    totalVertices: features.reduce((a, b) => a + b.vertices, 0),
    rawBytes: Buffer.byteLength(raw),
    gzipBytes: gzipSize(Buffer.from(raw)),
    seamTouchVertices,
    seamJumps,
    simplifiedAtToleranceDeg: simplified,
  };
}

// ---------- DSO(大小マゼラン雲・M31) ----------
export function analyzeDsos(fc) {
  const wanted = ['LMC', 'SMC', 'M 31'];
  const found = {};
  const stringMags = [];
  for (const f of fc.features ?? []) {
    const d = f.properties?.desig;
    if (typeof f.properties?.mag === 'string') stringMags.push({ id: f.id, mag: f.properties.mag });
    if (wanted.includes(d)) {
      found[d] = { id: f.id, ...f.properties, coordinates: f.geometry?.coordinates };
    }
  }
  return { totalFeatures: (fc.features ?? []).length, found, missing: wanted.filter((w) => !found[w]), stringMagFeatures: stringMags };
}

// ---------- 観測地点(時刻系・座標候補) ----------
export function resolveOffset(tz, date) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(date);
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '?';
  } catch (e) {
    return `ERROR: ${e.message}`;
  }
}

export function checkSites(sites) {
  const jan = new Date(Date.UTC(2026, 0, 15, 12));
  const jul = new Date(Date.UTC(2026, 6, 15, 12));
  return sites.map((s) => ({
    id: s.id,
    tz: s.tz,
    offsetJan2026: resolveOffset(s.tz, jan),
    offsetJul2026: resolveOffset(s.tz, jul),
  }));
}

export async function fetchWikipediaCoords(sites, fetchImpl = fetch) {
  const titles = sites.map((s) => s.wikipedia_title).filter(Boolean);
  const url =
    'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&prop=coordinates&colimit=max&redirects=1&titles=' +
    encodeURIComponent(titles.join('|'));
  const res = await fetchImpl(url, {
    headers: { 'User-Agent': 'ichiban-boshi-audit/0.1 (https://github.com/konbu-love/ichiban-boshi)' },
  });
  if (!res.ok) throw new Error(`Wikipedia API ${res.status}`);
  const json = await res.json();
  const redirects = new Map((json.query?.redirects ?? []).map((r) => [r.from, r.to]));
  const normalized = new Map((json.query?.normalized ?? []).map((r) => [r.from, r.to]));
  const pages = new Map((json.query?.pages ?? []).map((p) => [p.title, p]));
  const fetchedAt = new Date().toISOString();
  return sites.map((s) => {
    if (!s.wikipedia_title) return { id: s.id, status: 'no-title' };
    let t = normalized.get(s.wikipedia_title) ?? s.wikipedia_title;
    const redirectedTo = redirects.get(t);
    if (redirectedTo) t = redirectedTo;
    const p = pages.get(t);
    const c = p?.coordinates?.find((x) => x.primary) ?? p?.coordinates?.[0];
    return {
      id: s.id,
      requestedTitle: s.wikipedia_title,
      resolvedTitle: t,
      redirected: Boolean(redirectedTo),
      missingPage: Boolean(p?.missing),
      lat: c?.lat ?? null,
      lon: c?.lon ?? null,
      globe: c?.globe ?? null,
      status: c ? 'ok' : 'no-coordinates',
      source: `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replaceAll(' ', '_'))}`,
      fetchedAt,
    };
  });
}

// ---------- レポート ----------
const mdTable = (head, rows) =>
  `| ${head.join(' | ')} |\n| ${head.map(() => '---').join(' | ')} |\n${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}\n`;
const kb = (b) => `${(b / 1024).toFixed(1)}KB`;

export function renderMarkdown(r) {
  let m = `# データ監査レポート\n\n- 実行日時: ${r.meta.generatedAt}\n- d3-celestial: ${r.meta.d3CelestialVersion ?? '不明'}\n- 区分: 【実測】=このスクリプトが数えた値 / 【推定】=計算式による見積り / 【未取得】=取得に失敗\n\n`;

  m += `## 1. 恒星の件数と容量【実測】\n\n`;
  m += mdTable(
    ['ファイル', '星の数', '生サイズ'],
    [
      ['stars.6.json', r.stars6.count, kb(r.stars6.fileBytes)],
      ['stars.8.json', r.stars8.count, kb(r.stars8.fileBytes)],
    ],
  );
  m += `\nstars.8.jsonの等級別件数: ${JSON.stringify(r.stars8.countByMag)}\n`;
  m += `\nstars.6.jsonの全HIPがstars.8.jsonに含まれるか: **${r.stars6.allIn8 ? 'はい' : 'いいえ(' + r.stars6.missingIn8 + '件)'}**\n\n`;
  m += `### 軽量形式のサイズ(stars.8.jsonから等級で切り出し)\n\n`;
  m += mdTable(
    ['等級上限', '件数', 'JSON(配列)', 'JSON gzip', 'バイナリ16B/星', 'バイナリ gzip'],
    r.compact.map((c) => [c.limit, c.count, kb(c.jsonBytes), kb(c.jsonGzipBytes), kb(c.binaryBytes), kb(c.binaryGzipBytes)]),
  );

  m += `\n## 2. 星座線と恒星の突き合わせ【実測】\n\n`;
  const l = r.lines;
  m += `- 許容誤差 ε = ${l.eps}° / 頂点総数 ${l.vertices} / 一致した恒星(重複除く) ${l.uniqueMatchedHip}\n`;
  m += `- 一致なし ${l.unmatched.length} 件 / εの中に複数星(一番明るい星を採用) ${l.ambiguous.length} 件(うち要確認 ${l.ambiguous.filter((a) => a.needsReview).length} 件) / 6.0等より暗い構成星(例外採用) ${l.faint.length} 件\n\n`;
  m += `最近傍距離の分布(度):\n\n` + mdTable(['区間', '頂点数'], Object.entries(l.histogram).map(([k, v]) => [k, v]));
  if (l.unmatched.length) m += `\n一致なし(先頭20件): ${JSON.stringify(l.unmatched.slice(0, 20))}\n`;
  if (l.ambiguous.length) m += `\n複数星の頂点(全件): ${JSON.stringify(l.ambiguous)}\n`;
  if (l.faint.length) m += `\n6.0等より暗い構成星(全件): ${JSON.stringify(l.faint)}\n`;

  m += `\n## 3. 星の名前【実測】\n\n`;
  m += `- starnames.json 総エントリ ${r.names.totalEntries} / 固有名あり ${r.names.withProperName} / うち6.0等以下 ${r.names.namedWithMag_le_6}\n`;
  m += `- 日本語キー(ja等): ${r.names.japaneseKeysFound.length ? r.names.japaneseKeysFound.join(', ') : '見つからず'}\n`;
  m += `- 項目キーの出現数: ${JSON.stringify(r.names.propertyKeyFrequency)}\n`;

  m += `\n## 4. 一番星の選択対象の件数【実測】\n\n`;
  m += `全天(地平線の上下を区別しない)の件数です。\n\n` + mdTable(['条件', '件数'], Object.entries(r.selection.counts).map(([k, v]) => [k, v]));
  m += `\n3.5等以下なのに選択対象に入らない星: ${r.selection.brightNotSelectable.length}件 ${JSON.stringify(r.selection.brightNotSelectable.slice(0, 30))}\n`;

  m += `\n## 5. アステリズム(asterisms.json)【実測】\n\n`;
  m += mdTable(
    ['id/名前', '頂点', '一致したHIP数', '一致なし'],
    r.asterisms.map((a) => [a.id, a.vertices, a.matchedHip, a.unmatched]),
  );

  m += `\n## 6. 天の川(mw.json)【実測】\n\n`;
  const w = r.milkyWay;
  m += `- 生 ${kb(w.rawBytes)} / gzip ${kb(w.gzipBytes)} / 頂点総数 ${w.totalVertices}\n`;
  m += `- 赤経±180°の継ぎ目: 境界上の頂点 ${w.seamTouchVertices} / 辺が継ぎ目を跨ぐ ${w.seamJumps}\n\n`;
  m += mdTable(['id', '型', 'ポリゴン', 'リング', '頂点'], w.features.map((f) => [f.id, f.geometryType, f.polygons, f.rings, f.vertices]));
  m += `\n間引き後(Douglas-Peucker、許容誤差=度):\n\n` +
    mdTable(['許容誤差', '頂点数', '概算サイズ'], Object.entries(w.simplifiedAtToleranceDeg).map(([t, v]) => [t, v.vertices, kb(v.bytes)]));

  m += `\n## 7. 大小マゼラン雲・M31(dsos.bright.json)【実測】\n\n`;
  m += `${JSON.stringify(r.dsos.found)}\n\n- 見つからない: ${r.dsos.missing.join(', ') || 'なし'}\n- 等級が文字列の項目: ${JSON.stringify(r.dsos.stringMagFeatures)}\n`;

  m += `\n## 8. 観測地点の時刻系【実測】\n\n`;
  m += mdTable(['id', 'IANA', '1月', '7月'], r.sites.tz.map((s) => [s.id, s.tz, s.offsetJan2026, s.offsetJul2026]));

  m += `\n## 9. 観測地点の座標候補(Wikipedia API)\n\n`;
  if (r.sites.coords?.error) m += `【未取得】${r.sites.coords.error}\n`;
  else if (r.sites.coords) {
    m += `座標は候補です。種別(天文台・山頂・都市の代表点)の妥当性は人が確認します。\n\n`;
    m += mdTable(
      ['id', '解決したタイトル', '緯度', '経度', '状態', 'リダイレクト'],
      r.sites.coords.map((c) => [c.id, c.resolvedTitle ?? '-', c.lat ?? '-', c.lon ?? '-', c.status, c.redirected ? 'あり' : '']),
    );
  } else m += `未実行(--wikipedia を付けると取得します)\n`;
  return m;
}

// ---------- メイン ----------
function readJson(dir, name) {
  const p = path.join(dir, name);
  const buf = fs.readFileSync(p);
  return { json: JSON.parse(buf.toString('utf8')), bytes: buf.length };
}

function parseArgs(argv) {
  const a = { eps: 0.05, wikipedia: false, out: 'out', sites: path.join(path.dirname(fileURLToPath(import.meta.url)), 'sites.seed.json') };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--data-dir') a.dataDir = argv[++i];
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--eps') a.eps = Number(argv[++i]);
    else if (k === '--wikipedia') a.wikipedia = true;
    else if (k === '--sites') a.sites = argv[++i];
    else if (k === '--version') a.version = argv[++i];
  }
  return a;
}

export async function runAudit(opts) {
  const { dataDir, eps = 0.05 } = opts;
  const s6 = readJson(dataDir, 'stars.6.json');
  const s8 = readJson(dataDir, 'stars.8.json');
  const stars6 = parseStars(s6.json);
  const stars8 = parseStars(s8.json);
  const magByHip = new Map(stars8.map((s) => [s.hip, s.mag]));
  for (const s of stars6) if (!magByHip.has(s.hip)) magByHip.set(s.hip, s.mag);
  const set8 = new Set(stars8.map((s) => s.hip));
  const missingIn8 = stars6.filter((s) => !set8.has(s.hip)).length;

  const nearest = buildMatcher(stars8.length ? stars8 : stars6);
  const linesFc = readJson(dataDir, 'constellations.lines.json').json;
  const lines = matchPolylines(linesFc, nearest, eps);

  const names = analyzeNames(readJson(dataDir, 'starnames.json').json, magByHip);
  const counts = selectionCounts(lines.hipSet, names.namedHips, magByHip);
  const union = new Set([...lines.hipSet, ...names.namedHips].filter((h) => (magByHip.get(h) ?? 99) <= 6.0));
  const brightNotSelectable = brightButNotSelectable(stars6, union, 3.5);

  let asterisms = [];
  try {
    const ast = readJson(dataDir, 'asterisms.json').json;
    const m = matchPolylines(ast, nearest, eps);
    asterisms = (ast.features ?? []).map((f) => {
      const id = String(f.id ?? f.properties?.desig ?? f.properties?.n ?? '?');
      const nm = f.properties?.n ?? f.properties?.name ?? f.properties?.desig ?? '';
      return {
        id: nm && nm !== id ? `${id} (${nm})` : id,
        vertices: m.perFeature[id]?.vertices ?? 0,
        matchedHip: m.perFeature[id] ? m.perFeature[id].vertices - m.perFeature[id].unmatched : 0,
        unmatched: m.perFeature[id]?.unmatched ?? 0,
      };
    });
  } catch (e) {
    asterisms = [{ id: `読み込み失敗: ${e.message}`, vertices: 0, matchedHip: 0, unmatched: 0 }];
  }

  const milkyWay = analyzeMilkyWay(readJson(dataDir, 'mw.json').json);
  const dsos = analyzeDsos(readJson(dataDir, 'dsos.bright.json').json);

  const sitesFile = JSON.parse(fs.readFileSync(opts.sites, 'utf8'));
  const sites = { tz: checkSites(sitesFile.sites) };
  if (opts.wikipedia) {
    try {
      sites.coords = await fetchWikipediaCoords(sitesFile.sites);
    } catch (e) {
      sites.coords = { error: e.message };
    }
  }

  const stripSets = ({ hipSet, ...rest }) => rest;
  return {
    meta: { generatedAt: new Date().toISOString(), d3CelestialVersion: opts.version ?? null, eps },
    stars6: { count: stars6.length, fileBytes: s6.bytes, allIn8: missingIn8 === 0, missingIn8 },
    stars8: { count: stars8.length, fileBytes: s8.bytes, countByMag: countByMag(stars8, [3.5, 4.5, 5, 6, 6.5, 7, 7.5, 8, 8.5]) },
    compact: [6.0, 6.5, 7.0].map((lim) => compactStats(stars8, lim)),
    lines: stripSets(lines),
    names: (({ namedHips, ...rest }) => rest)(names),
    selection: { counts, brightNotSelectable },
    asterisms,
    milkyWay,
    dsos,
    sites,
    _linesHipEdges: lines.edges,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.dataDir) {
    console.error('--data-dir を指定してください');
    process.exit(2);
  }
  fs.mkdirSync(args.out, { recursive: true });
  const report = await runAudit(args);
  const { _linesHipEdges, ...publicReport } = report;
  fs.writeFileSync(path.join(args.out, 'audit-report.json'), JSON.stringify(publicReport, null, 1));
  fs.writeFileSync(path.join(args.out, 'lines.hip.json'), JSON.stringify(_linesHipEdges));
  fs.writeFileSync(path.join(args.out, 'audit-report.md'), renderMarkdown(publicReport));
  console.log(`監査レポートを ${args.out}/ に書きました`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
