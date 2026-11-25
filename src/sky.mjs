// 一番星ゲーム 天文計算モジュール(天文監修)
// 使い方(ブラウザ): <script src="lib/astronomy.browser.min.js"></script> のあと
//   import { createSky } from './sky.mjs';  const sky = createSky(window.Astronomy);
// 使い方(Node): const sky = createSky(require('astronomy-engine'));
//
// 区分: 【実データ】=ライブラリが計算した位置・等級 / 【ゲーム設定】=基準高度・最小高度・限界等級 / 【計算の目安】=予想される最初の星
// 方位は北=0°、東回り(東=90°)。高度は大気差を含む見かけの高度(太陽の「幾何高度」は別に返す)。

export const DEFAULT_H0_DEG = -12; // 【ゲーム設定】基準時刻の太陽高度(-6/-9/-12を比較して最終決定)
export const DEFAULT_MIN_ALT_DEG = 5; // 【ゲーム設定】一番星の候補にする最低高度(地平線すれすれを除く)
export const LIMIT_MAG_BY_CLASS = { A: 3.5, B: 4.5, C: 5.5, D: 6.0, E: 7.0 }; // 【ゲーム設定】仮値

const PLANETS = [['mercury', 'Mercury'], ['venus', 'Venus'], ['mars', 'Mars'], ['jupiter', 'Jupiter'], ['saturn', 'Saturn']];

// ---------- 時刻(ライブラリ不要) ----------
export function tzOffsetMs(tz, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// 現地の年月日・時刻(時)をUTCのDateに直す
export function localToUtc(tz, y, m, d, hour = 12) {
  const guess = Date.UTC(y, m - 1, d, hour, 0, 0);
  let t = guess;
  for (let i = 0; i < 3; i++) t = guess - tzOffsetMs(tz, new Date(t));
  return new Date(t);
}

export function createSky(Astronomy) {
  const A = Astronomy;
  const observer = (site) => new A.Observer(site.lat, site.lon, site.elev ?? 0);

  // 太陽の高度。refraction=null なら幾何高度(基準時刻の判定に使う)
  function sunAltitude(site, date, refraction = null) {
    const obs = observer(site);
    const t = A.MakeTime(date);
    const eq = A.Equator(A.Body.Sun, t, obs, true, true);
    const h = A.Horizon(t, obs, eq.ra, eq.dec, refraction);
    return { altitude: h.altitude, azimuth: h.azimuth };
  }

  // 基準時刻 t0: その日の夕方、太陽の幾何高度が h0 まで下がる時刻
  // 白夜・極夜では、太陽が一番低い/高い時刻にする(status で区別)
  function findReferenceTime(site, local, h0 = DEFAULT_H0_DEG) {
    const obs = observer(site);
    const start = localToUtc(site.tz, local.y, local.m, local.d, 12);
    const t = A.SearchAltitude(A.Body.Sun, obs, -1, start, 1, h0);
    if (t) return { status: 'ok', utc: t.date, h0 };
    let min = Infinity, max = -Infinity, tMin = start, tMax = start;
    for (let i = 0; i <= 144; i++) {
      const d = new Date(start.getTime() + i * 600000);
      const alt = sunAltitude(site, d, null).altitude;
      if (alt < min) { min = alt; tMin = d; }
      if (alt > max) { max = alt; tMax = d; }
    }
    if (min > h0) return { status: 'sun-never-below', utc: tMin, h0, sunMinAltitude: min }; // 白夜
    if (max < h0) return { status: 'sun-never-above', utc: tMax, h0, sunMaxAltitude: max }; // 極夜
    return { status: 'fallback-min', utc: tMin, h0, sunMinAltitude: min };
  }

  // 恒星(J2000)の地平座標。J2000 → 日付の座標系へ回転してから Horizon に渡す(必須)。
  // stars: [[HIP, raDeg, decDeg, mag, bv], ...] → [[alt, az], ...]
  function horizonOfStars(stars, date, site, refraction = 'normal') {
    const obs = observer(site);
    const t = A.MakeTime(date);
    const rot = A.Rotation_EQJ_EQD(t);
    const out = new Array(stars.length);
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const v = A.VectorFromSphere(new A.Spherical(s[2], s[1], 1), t);
      const eq = A.EquatorFromVector(A.RotateVector(rot, v));
      const h = A.Horizon(t, obs, eq.ra, eq.dec, refraction);
      out[i] = [h.altitude, h.azimuth];
    }
    return out;
  }

  function bodyState(id, bodyKey, t, obs) {
    const body = A.Body[bodyKey];
    const eq = A.Equator(body, t, obs, true, true); // 観測者基準(視差込み)
    const h = A.Horizon(t, obs, eq.ra, eq.dec, 'normal');
    const ill = A.Illumination(body, t);
    return { id, kind: id === 'moon' ? 'moon' : 'planet', alt: h.altitude, az: h.azimuth, mag: ill.mag, phaseFraction: ill.phase_fraction };
  }

  // 指定時刻の空。
  //  opts: { stars, selectable(Set|配列), minAltDeg, limitMag(省略時は site.limitMag), withBodies }
  function computeAt(site, date, opts = {}) {
    const { stars = [], minAltDeg = DEFAULT_MIN_ALT_DEG, withBodies = true } = opts;
    const selectable = opts.selectable instanceof Set ? opts.selectable : new Set(opts.selectable ?? []);
    const limitMag = opts.limitMag ?? site.limitMag ?? LIMIT_MAG_BY_CLASS[site.darkClass] ?? 6.0;
    const obs = observer(site);
    const t = A.MakeTime(date);
    const sunGeo = sunAltitude(site, date, null);
    const sunApp = sunAltitude(site, date, 'normal');

    const hz = horizonOfStars(stars, date, site, 'normal');
    const visibleStars = [];
    const candidates = [];
    for (let i = 0; i < stars.length; i++) {
      const [hip, , , mag] = stars[i];
      const [alt, az] = hz[i];
      if (alt < 0 || mag > limitMag) continue;
      const sel = selectable.has(hip) ? 1 : 0;
      visibleStars.push([hip, round(alt, 3), round(az, 3), mag, sel]);
      if (sel && alt >= minAltDeg) candidates.push({ id: `hip:${hip}`, kind: 'star', mag, alt: round(alt, 3), az: round(az, 3) });
    }

    let moon = null;
    const planets = [];
    if (withBodies) {
      moon = bodyState('moon', 'Moon', t, obs);
      moon.phaseAngleDeg = A.MoonPhase(t); // 0=新月, 90=上弦, 180=満月, 270=下弦
      for (const [id, key] of PLANETS) planets.push(bodyState(id, key, t, obs));
      for (const b of [moon, ...planets]) {
        if (b.alt >= minAltDeg && b.mag <= limitMag) candidates.push({ id: b.id, kind: b.kind, mag: round(b.mag, 2), alt: round(b.alt, 3), az: round(b.az, 3) });
      }
    }
    candidates.sort((a, b) => a.mag - b.mag || b.alt - a.alt);
    return {
      utc: new Date(date.getTime()),
      sun: { altitudeGeometric: sunGeo.altitude, altitudeApparent: sunApp.altitude, azimuth: sunGeo.azimuth },
      moon, planets, limitMag, minAltDeg,
      visibleStars, // [HIP, alt, az, mag, 選択対象なら1] 地平線の上で限界等級より明るい恒星
      candidates, // 一番星の選択対象(M)。明るい順
      predictedFirst: candidates.length ? candidates[0].id : null, // 【計算の目安】実際の空で最初に見えるはずの天体(一番明るい候補)
    };
  }

  // 日付(現地の年月日)から基準時刻を求め、その時刻の空を返す
  function computeSky(site, local, opts = {}) {
    const h0 = opts.h0 ?? DEFAULT_H0_DEG;
    const reference = findReferenceTime(site, local, h0);
    return { reference, ...computeAt(site, reference.utc, opts) };
  }

  return { sunAltitude, findReferenceTime, horizonOfStars, computeAt, computeSky };
}

function round(v, n) {
  const k = 10 ** n;
  return Math.round(v * k) / k;
}
