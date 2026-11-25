// 彗星の尾の向き(反太陽方向)を、どのビュー(東西南北・天頂)でも正しく出す関数。 【計算】
// 彗星の尾は、おおまかに「太陽と反対の向き」に伸びる(ここでは塵の尾の曲がりは無視する=【演出】)。
// 方法: 彗星 c と太陽 s を地平座標の単位ベクトルにし、c を通って s から遠ざかる大円の上に、
//       少し先の点 e = c·cosε + u·sinε を取る(u = c から見た「太陽と反対向き」の単位接線)。
//       c と e を、そのビューの project() で画面座標にして、差を尾の向きにする。
//       これなら地平窓(gnomonic)でも天頂ビュー(stereographic・東が左)でも向きが自動的に合う。
//       太陽は地平線の下にあってよい(投影しないので)。
// 使い方(drawComet の中の dx,dy の計算を置き換える):
//   const sun = …(既存どおり Horizon で太陽の高度 sh.altitude・方位 sh.azimuth を得る);
//   const t = antiSolarTail(c.h, [sh.altitude, sh.azimuth], project, 48);
//   if (t) { 尾を p から p+(t.dx,t.dy) まで描く }   // null のときは尾を描かない(点だけ)
export function antiSolarTail(comet, sun, project, lenPx = 48) {
  const rad = Math.PI / 180;
  const vec = ([alt, az]) => [Math.cos(alt * rad) * Math.sin(az * rad), Math.cos(alt * rad) * Math.cos(az * rad), Math.sin(alt * rad)];
  const c = vec(comet), s = vec(sun);
  const dot = c[0] * s[0] + c[1] * s[1] + c[2] * s[2];
  let u = [c[0] - dot * s[0], c[1] - dot * s[1], c[2] - dot * s[2]];
  const n = Math.hypot(...u);
  if (n < 1e-6) return null; // 太陽と同じ方向(または正反対)では向きが決まらない
  u = u.map((x) => x / n);
  const p = project(comet[0], comet[1]);
  if (!p) return null;
  // 画面に収まる範囲で、ε を小さくしながら試す(地平線の下や窓の外に出る場合の対策)
  for (const eps of [8, 5, 3, 1.5]) {
    const e = c.map((x, i) => x * Math.cos(eps * rad) + u[i] * Math.sin(eps * rad));
    const alt = Math.asin(Math.max(-1, Math.min(1, e[2]))) / rad;
    const az = ((Math.atan2(e[0], e[1]) / rad) + 360) % 360;
    const q = project(alt, az);
    if (!q) continue;
    const dx = q[0] - p[0], dy = q[1] - p[1], m = Math.hypot(dx, dy);
    if (m < 1e-6) continue;
    return { dx: (dx / m) * lenPx, dy: (dy / m) * lenPx, epsDeg: eps };
  }
  return null;
}
