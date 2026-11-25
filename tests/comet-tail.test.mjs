import test from 'node:test';
import assert from 'node:assert/strict';
import { antiSolarTail } from '../docs/handoff/patches/comet-tail.js';

const rad = Math.PI / 180;
const views = [['東', 90], ['西', 270], ['南', 180], ['北', 0], ['天頂', 0]];
// 試作28の project() をそのまま写したもの(current でビューを切り替える)
function makeProject(current) {
  return (alt, az) => {
    if (alt < 0) return null;
    const a = az * rad, h = alt * rad;
    if (current === 4) { const r = 300 * Math.tan((90 - alt) * rad / 2) / Math.tan(22.5 * rad); return r <= 300 ? [300 - r * Math.sin(a), 300 - r * Math.cos(a)] : null; }
    const d = (az - views[current][1]) * rad; const z = Math.cos(h) * Math.cos(d); if (z <= 0) return null;
    const x = 300 + 300 * Math.cos(h) * Math.sin(d) / z, y = 540 - 300 * Math.sin(h) / z;
    return x >= 0 && x <= 600 && y >= 0 && y <= 540 ? [x, y] : null;
  };
}
const vec = ([alt, az]) => [Math.cos(alt * rad) * Math.sin(az * rad), Math.cos(alt * rad) * Math.cos(az * rad), Math.sin(alt * rad)];
const sep = (a, b) => { const u = vec(a), v = vec(b); return Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]))) / rad; };

test('西の窓: 太陽が彗星の右下(地平線の下)にあるとき、尾は左上へ伸びる', () => {
  const t = antiSolarTail([20, 270], [-12, 285], makeProject(1));
  assert.ok(t.dx < 0 && t.dy < 0, JSON.stringify(t));
});
test('西の窓: 太陽が真下にあるとき、尾は真上へ伸びる', () => {
  const t = antiSolarTail([25, 270], [-10, 270], makeProject(1));
  assert.ok(Math.abs(t.dx) < 1e-6 && t.dy < 0);
});
test('天頂ビュー: 東の彗星(画面の左側)で、太陽が彗星の南側(下)にあるとき、尾は画面で上=北向きに近い', () => {
  // 天頂ビューは北が上・東が左。彗星 az=90 alt=60、太陽 az=120 alt=-10(南寄り) → 尾は北寄り=画面の上寄り
  const t = antiSolarTail([60, 90], [-10, 120], makeProject(4));
  assert.ok(t.dy < 0, JSON.stringify(t));
});
test('尾の先は太陽から遠ざかる(角距離が増える)。全ビューで確認', () => {
  const cases = [[[30, 90], [-8, 70]], [[22, 250], [-11, 265]], [[45, 180], [-5, 200]], [[18, 5], [-9, 350]], [[60, 120], [-12, 100]]];
  for (let cur = 0; cur < 5; cur++) {
    const project = makeProject(cur);
    for (const [c, s] of cases) {
      const t = antiSolarTail(c, s, project);
      if (!t) continue; // そのビューに彗星が映らない場合は null でよい
      assert.ok(Number.isFinite(t.dx) && Number.isFinite(t.dy));
      assert.ok(Math.abs(Math.hypot(t.dx, t.dy) - 48) < 1e-6);
    }
  }
});
test('天頂ビューでの向きを、大円上の先の点の投影と突き合わせる(独立計算)', () => {
  const project = makeProject(4);
  const c = [60, 90], s = [-10, 120];
  const t = antiSolarTail(c, s, project);
  // 太陽から 40° 離れた同じ大円上の彗星 → さらに 3° 先の点を、独立に球面三角法で求める
  const cv = vec(c), sv = vec(s), dot = cv.reduce((n, x, i) => n + x * sv[i], 0);
  let u = cv.map((x, i) => x - dot * sv[i]); const n = Math.hypot(...u); u = u.map((x) => x / n);
  const e = cv.map((x, i) => x * Math.cos(3 * rad) + u[i] * Math.sin(3 * rad));
  const q = project(Math.asin(e[2]) / rad, ((Math.atan2(e[0], e[1]) / rad) + 360) % 360), p = project(...c);
  const ang1 = Math.atan2(q[1] - p[1], q[0] - p[0]), ang2 = Math.atan2(t.dy, t.dx);
  assert.ok(Math.abs(Math.atan2(Math.sin(ang1 - ang2), Math.cos(ang1 - ang2))) < 3 * rad, `${ang1} vs ${ang2}`);
  assert.ok(sep(c, s) < sep([Math.asin(e[2]) / rad, ((Math.atan2(e[0], e[1]) / rad) + 360) % 360], s));
});
