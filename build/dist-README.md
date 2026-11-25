# 一番星ゲーム 天文データ一式(天文監修より 描画担当へ)

実データ(d3-celestial 0.7.35)と、位置計算モジュール(astronomy-engine)を使った一式です。
区分: 【実データ】=出典のある値 / 【ゲーム設定】=ゲーム用の仮値 / 【計算の目安】=見積り / 【未確認】=裏づけなし。

## 中身
| 場所 | 内容 |
| --- | --- |
| data/stars.json | 恒星 `[HIP, 赤経°, 赤緯°, 等級, B-V or null]`(J2000)。6.0等まで+星座線の構成星(暗くても例外採用、等級は改変なし)。明るい順 |
| data/selectable.json | 一番星の選択対象にできる恒星のHIP番号(線の構成星 ∪ 固有名のある6.0等以下 ∪ 3.5等以下) |
| data/names.json | 選択対象の星の名前 `{HIP: {en, ja, bayer, flam}}`(無い項目は省略) |
| data/starCons.json | 選択対象の星の所属星座 `{HIP: [星座ID,...]}`(分からない星は載らない) |
| data/lines.json | 星座線 `{星座ID: [[HIP,HIP],...]}` |
| data/constellations.json | 星座の名前・中心 `{星座ID: {la, en, ja, ra, dec}}` |
| data/mw.json | 天の川(5層の多角形、赤経・赤緯の度、許容誤差0.25°で間引き済み) |
| data/sites.json | 23地点 `{id, name_ja, lat, lon, tz, darkClass, limitMag, landscape, ...}` |
| data/credits.json | 出典・ライセンス表記(クレジット画面用) |
| src/sky.mjs | 位置計算モジュール |
| lib/astronomy.browser.min.js | 位置計算ライブラリ(ブラウザ用。グローバル `Astronomy` を作る) |
| licenses/ | d3-celestial と astronomy-engine のライセンス全文(再配布時に同梱) |
| docs/data-spec.md | 受け渡し仕様 v1.0 |
| reports/ | 変換の結果・テスト結果・データ監査レポート |

## 使い方(ブラウザ)
```html
<script src="lib/astronomy.browser.min.js"></script>
<script type="module">
  import { createSky } from './src/sky.mjs';
  const [stars, selectable, sites] = await Promise.all(
    ['stars', 'selectable', 'sites'].map((n) => fetch(`data/${n}.json`).then((r) => r.json())));
  const sky = createSky(window.Astronomy);
  const site = sites.find((s) => s.id === 'mitaka');
  // 現地の年月日から基準時刻(太陽の幾何高度が h0 になる夕方)を求め、その時刻の空を返す
  const r = sky.computeSky(site, { y: 2026, m: 12, d: 21 }, { stars, selectable: new Set(selectable), h0: -12 });
  // r.reference.status: 'ok' | 'sun-never-below'(白夜) | 'sun-never-above'(極夜) | 'fallback-min'
  // r.visibleStars: [HIP, 高度, 方位, 等級, 選択対象なら1]  地平線の上で限界等級より明るい恒星
  // r.candidates:   一番星の選択対象(M)。明るい順 {id:'hip:N'|'moon'|'venus'..., kind, mag, alt, az}
  // r.predictedFirst: 予想される最初の星のid【計算の目安】(一番明るい候補)
  // r.moon: {alt, az, mag, phaseFraction(0〜1), phaseAngleDeg(0=新月,180=満月)} / r.planets: 5惑星
  // r.sun.altitudeGeometric: 太陽の幾何高度(空の色の計算用)
</script>
```
- 方位は北0°・東回り。高度は大気差を含む見かけの高度。
- 基準時刻(h0)は引数で変えられる(-6/-9/-12を比較して最終決定)。初期値 -12(仮)。
- 一番星の候補にする最低高度は `minAltDeg`(初期値5°)、地点の限界等級は `site.limitMag`(暗さクラスA〜E=3.5/4.5/5.5/6.0/7.0、ゲーム設定の仮値)。
- 星の位置はJ2000→日付の座標系へ回転してから地平座標にしている(必須)。
- `computeAt(site, date, opts)` で任意の時刻の空も取れる(点灯後の空の時計用)。
- 星座線の描画は、`lines.json` のHIPの組を `stars.json` の座標につなぐ。

## 注意(既知の事項)
- 6.0等より暗い構成星(HIP 10826=6.47等)は、限界等級が6.0以下の地点では見えない扱いで、星図モードでは線の構成点として表示する。
- 二重星の頂点は、一番明るい星に対応づけた。等級差0.5未満の3か所のうち、りゅう座ときょしちょう座は暫定(元データに決め手なし)。記録は reports/audit-report.md の「複数星の頂点」。
- 地点座標は一部が暫定(西はりま天文台は町字レベルの代表点)。種別の確認は未了(`coordReviewed:false`)。
- 日本語名・星座名の出典と利用条件、地点座標の利用条件は【未確認】(公開前に確認する)。
- 天の川は継ぎ目(赤経0°)で分割していない。頂点ごとに投影し、地平線で切る処理は描画側で行う。
- 速度はActions上の測定のみ。Pixel 7aでの速度は実機で確認する。
