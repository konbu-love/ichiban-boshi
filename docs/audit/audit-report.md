# データ監査レポート

- 実行日時: 2026-11-25T11:01:50.787Z
- d3-celestial: 0.7.35
- 区分: 【実測】=このスクリプトが数えた値 / 【推定】=計算式による見積り / 【未取得】=取得に失敗

## 1. 恒星の件数と容量【実測】

| ファイル | 星の数 | 生サイズ |
| --- | --- | --- |
| stars.6.json | 5044 | 641.3KB |
| stars.8.json | 41411 | 5259.5KB |

stars.8.jsonの等級別件数: {"<=3.5":288,"<=4.5":921,"<=5":1627,"<=6":5044,"<=6.5":8874,"<=7":15544,"<=7.5":25723,"<=8":41411,"<=8.5":41411}

stars.6.jsonの全HIPがstars.8.jsonに含まれるか: **はい**

### 軽量形式のサイズ(stars.8.jsonから等級で切り出し)

| 等級上限 | 件数 | JSON(配列) | JSON gzip | バイナリ16B/星 | バイナリ gzip |
| --- | --- | --- | --- | --- | --- |
| 6 | 5044 | 161.8KB | 63.6KB | 78.8KB | 67.3KB |
| 6.5 | 8874 | 284.5KB | 109.8KB | 138.7KB | 117.7KB |
| 7 | 15544 | 497.7KB | 188.2KB | 242.9KB | 204.2KB |

## 2. 星座線と恒星の突き合わせ【実測】

- 許容誤差 ε = 0.05° / 頂点総数 893 / 一致した恒星(重複除く) 757
- 一致なし 0 件 / εの中に複数星(一番明るい星を採用) 24 件(うち要確認 3 件) / 6.0等より暗い構成星(例外採用) 1 件

最近傍距離の分布(度):

| 区間 | 頂点数 |
| --- | --- |
| <0.001 | 893 |
| <0.005 | 0 |
| <0.01 | 0 |
| <0.02 | 0 |
| <0.05 | 0 |
| <0.1 | 0 |
| <0.25 | 0 |
| <0.5 | 0 |
| <1 | 0 |
| <2 | 0 |
| >=2/なし | 0 |

複数星の頂点(全件): [{"feature":"Aps","vertex":1,"lon":-114.9133,"lat":-78.6957,"chosen":{"hip":80047,"sep":8.537736462515939e-7,"mag":4.68},"nearest":{"hip":80047,"sep":8.537736462515939e-7,"mag":4.68},"others":[{"hip":80057,"sep":0.028630415428465478,"mag":5.27}],"chosenIsNearest":true,"needsReview":false},{"feature":"Boo","vertex":6,"lon":-131.1243,"lat":33.3148,"chosen":{"hip":74666,"sep":0,"mag":3.46},"nearest":{"hip":74666,"sep":0,"mag":3.46},"others":[{"hip":74674,"sep":0.029140800395174905,"mag":7.8}],"chosenIsNearest":true,"needsReview":false},{"feature":"Boo","vertex":2,"lon":-146.6341,"lat":51.7879,"chosen":{"hip":69483,"sep":0.003738369949569533,"mag":4.53},"nearest":{"hip":69481,"sep":0,"mag":6.62},"others":[{"hip":69481,"sep":0,"mag":6.62}],"chosenIsNearest":false,"needsReview":false},{"feature":"Cnc","vertex":3,"lon":131.6666,"lat":28.7651,"chosen":{"hip":43103,"sep":0.008520700435192215,"mag":4.03},"nearest":{"hip":43100,"sep":0,"mag":6.58},"others":[{"hip":43100,"sep":0,"mag":6.58}],"chosenIsNearest":false,"needsReview":false},{"feature":"CVn","vertex":0,"lon":-165.9981,"lat":38.3149,"chosen":{"hip":63125,"sep":0.005257354962712113,"mag":2.89},"nearest":{"hip":63121,"sep":0,"mag":5.61},"others":[{"hip":63121,"sep":0,"mag":5.61}],"chosenIsNearest":false,"needsReview":false},{"feature":"Car","vertex":5,"lon":163.3736,"lat":-58.8532,"chosen":{"hip":53253,"sep":0,"mag":3.78},"nearest":{"hip":53253,"sep":0,"mag":3.78},"others":[{"hip":53231,"sep":0.04426010683784548,"mag":6.26}],"chosenIsNearest":true,"needsReview":false},{"feature":"Cen","vertex":0,"lon":-140.1038,"lat":-60.8372,"chosen":{"hip":71683,"sep":0.004301931072043025,"mag":-0.01},"nearest":{"hip":71681,"sep":0,"mag":1.35},"others":[{"hip":71681,"sep":0,"mag":1.35}],"chosenIsNearest":false,"needsReview":false},{"feature":"Cep","vertex":6,"lon":-22.7072,"lat":58.4152,"chosen":{"hip":110991,"sep":0,"mag":4.07},"nearest":{"hip":110991,"sep":0,"mag":4.07},"others":[{"hip":110988,"sep":0.011326246419328584,"mag":6.31}],"chosenIsNearest":true,"needsReview":false},{"feature":"Cha","vertex":4,"lon":179.9066,"lat":-78.2218,"chosen":{"hip":58484,"sep":8.537736462515939e-7,"mag":4.88},"nearest":{"hip":58484,"sep":8.537736462515939e-7,"mag":4.88},"others":[{"hip":58520,"sep":0.03719873051928444,"mag":6.58}],"chosenIsNearest":true,"needsReview":false},{"feature":"Cyg","vertex":3,"lon":-67.3197,"lat":27.9597,"chosen":{"hip":95947,"sep":8.537736462515939e-7,"mag":3.05},"nearest":{"hip":95947,"sep":8.537736462515939e-7,"mag":3.05},"others":[{"hip":95951,"sep":0.009579872089617218,"mag":5.12}],"chosenIsNearest":true,"needsReview":false},{"feature":"Del","vertex":3,"lon":-48.3381,"lat":16.1241,"chosen":{"hip":102532,"sep":0.0026014865475611345,"mag":4.27},"nearest":{"hip":102531,"sep":0,"mag":5.15},"others":[{"hip":102531,"sep":0,"mag":5.15}],"chosenIsNearest":false,"needsReview":false},{"feature":"Dra","vertex":3,"lon":-96.9332,"lat":55.173,"chosen":{"hip":85829,"sep":0,"mag":4.86},"nearest":{"hip":85829,"sep":0,"mag":4.86},"others":[{"hip":85819,"sep":0.0171738509082633,"mag":4.89}],"chosenIsNearest":true,"needsReview":true},{"feature":"Lup","vertex":7,"lon":-130.3666,"lat":-47.8753,"chosen":{"hip":74911,"sep":0,"mag":4.27},"nearest":{"hip":74911,"sep":0,"mag":4.27},"others":[{"hip":74915,"sep":0.006374532483025831,"mag":6.87}],"chosenIsNearest":true,"needsReview":false},{"feature":"Lyr","vertex":0,"lon":-78.8068,"lat":37.6051,"chosen":{"hip":91971,"sep":0,"mag":4.34},"nearest":{"hip":91971,"sep":0,"mag":4.34},"others":[{"hip":91973,"sep":0.012104024915574392,"mag":5.73}],"chosenIsNearest":true,"needsReview":false},{"feature":"Lyr","vertex":3,"lon":-78.8068,"lat":37.6051,"chosen":{"hip":91971,"sep":0,"mag":4.34},"nearest":{"hip":91971,"sep":0,"mag":4.34},"others":[{"hip":91973,"sep":0.012104024915574392,"mag":5.73}],"chosenIsNearest":true,"needsReview":false},{"feature":"Lyr","vertex":7,"lon":-78.8068,"lat":37.6051,"chosen":{"hip":91971,"sep":0,"mag":4.34},"nearest":{"hip":91971,"sep":0,"mag":4.34},"others":[{"hip":91973,"sep":0.012104024915574392,"mag":5.73}],"chosenIsNearest":true,"needsReview":false},{"feature":"Mon","vertex":2,"lon":95.942,"lat":4.5929,"chosen":{"hip":30419,"sep":0,"mag":4.39},"nearest":{"hip":30419,"sep":0,"mag":4.39},"others":[{"hip":30422,"sep":0.0034101629364689614,"mag":6.72}],"chosenIsNearest":true,"needsReview":false},{"feature":"Nor","vertex":1,"lon":-113.204,"lat":-47.5548,"chosen":{"hip":80582,"sep":8.537736462515939e-7,"mag":4.46},"nearest":{"hip":80582,"sep":8.537736462515939e-7,"mag":4.46},"others":[{"hip":80579,"sep":0.00625041546667448,"mag":6.69}],"chosenIsNearest":true,"needsReview":false},{"feature":"Oph","vertex":5,"lon":-113.6037,"lat":-23.4472,"chosen":{"hip":80473,"sep":0.0000012074182697257333,"mag":4.57},"nearest":{"hip":80473,"sep":0.0000012074182697257333,"mag":4.57},"others":[{"hip":80461,"sep":0.0433682130894324,"mag":6.75},{"hip":80474,"sep":0.04200010023519498,"mag":7.27}],"chosenIsNearest":true,"needsReview":false},{"feature":"Psc","vertex":11,"lon":18.4329,"lat":7.5754,"chosen":{"hip":5737,"sep":0,"mag":5.21},"nearest":{"hip":5737,"sep":0,"mag":5.21},"others":[{"hip":5743,"sep":0.006350994392670356,"mag":6.44}],"chosenIsNearest":true,"needsReview":false},{"feature":"Sco","vertex":2,"lon":-118.6407,"lat":-19.8055,"chosen":{"hip":78820,"sep":0,"mag":2.56},"nearest":{"hip":78820,"sep":0,"mag":2.56},"others":[{"hip":78821,"sep":0.003802106547468134,"mag":4.9}],"chosenIsNearest":true,"needsReview":false},{"feature":"Ser","vertex":5,"lon":-75.9451,"lat":4.2036,"chosen":{"hip":92946,"sep":0.0000012074182697257333,"mag":4.62},"nearest":{"hip":92946,"sep":0.0000012074182697257333,"mag":4.62},"others":[{"hip":92951,"sep":0.0062657913373606105,"mag":4.98}],"chosenIsNearest":true,"needsReview":true},{"feature":"Tuc","vertex":2,"lon":7.8861,"lat":-62.9582,"chosen":{"hip":2484,"sep":8.537736462515939e-7,"mag":4.36},"nearest":{"hip":2484,"sep":8.537736462515939e-7,"mag":4.36},"others":[{"hip":2487,"sep":0.0075596840723703915,"mag":4.53}],"chosenIsNearest":true,"needsReview":true},{"feature":"Vol","vertex":4,"lon":107.1869,"lat":-70.4989,"chosen":{"hip":34481,"sep":0,"mag":3.78},"nearest":{"hip":34481,"sep":0,"mag":3.78},"others":[{"hip":34473,"sep":0.003910795624423714,"mag":5.68}],"chosenIsNearest":true,"needsReview":false}]

6.0等より暗い構成星(全件): [{"feature":"Cet","vertex":8,"hip":10826,"mag":6.47}]

## 3. 星の名前【実測】

- starnames.json 総エントリ 4870 / 固有名あり 600 / うち6.0等以下 493
- 日本語キー(ja等): ja
- 項目キーの出現数: {"name":4870,"bayer":4774,"flam":4774,"var":4774,"gl":4774,"hd":4786,"hip":4870,"c":4503,"desig":4774,"gliese":565,"ar":494,"zh":490,"el":154,"ja":279,"ko":481,"ru":508,"he":165,"de":33,"es":50,"fi":20,"fr":35,"it":36,"la":18,"tr":28,"fa":18,"hi":2,"en":1}

## 4. 一番星の選択対象の件数【実測】

全天(地平線の上下を区別しない)の件数です。

| 条件 | 件数 |
| --- | --- |
| union_all | 912 |
| union_le_6 | 911 |
| lineVertexStars_all | 757 |
| lineVertexStars_le_6 | 756 |
| lineExceptions_gt_6 | 1 |
| union_le_3.5 | 281 |
| union_le_4.5 | 693 |
| union_le_5.5 | 896 |

3.5等以下なのに選択対象に入らない星: 7件 [{"hip":32759,"mag":3.5},{"hip":32768,"mag":2.94},{"hip":36377,"mag":3.25},{"hip":45080,"mag":3.43},{"hip":46701,"mag":3.16},{"hip":48002,"mag":2.92},{"hip":56561,"mag":3.11}]

## 5. アステリズム(asterisms.json)【実測】

| id/名前 | 頂点 | 一致したHIP数 | 一致なし |
| --- | --- | --- | --- |
| BigDipper (Big Dipper) | 8 | 8 | 0 |
| NorthernPointer (Northern Pointer) | 3 | 3 | 0 |
| LittleDipper (Little Dipper) | 8 | 8 | 0 |
| GuardiansofthePole (Guardians of the Pole) | 2 | 2 | 0 |
| TheQueensW (The Queen's 'W') | 5 | 5 | 0 |
| HouseofCepheus (House of Cepheus) | 9 | 9 | 0 |
| Belt | 3 | 3 | 0 |
| TheLeash ('The Leash') | 2 | 2 | 0 |
| Sword | 3 | 3 | 0 |
| WinterHexagon (Winter Hexagon) | 7 | 7 | 0 |
| WinterTriangle (Winter Triangle) | 4 | 4 | 0 |
| GreatDiamond (Great Diamond) | 5 | 5 | 0 |
| Kite | 11 | 11 | 0 |
| TheSickle (The Sickle) | 6 | 6 | 0 |
| SummerTriangle (Summer Triangle) | 4 | 4 | 0 |
| NorthernCross (Northern Cross) | 3 | 3 | 0 |
| NorthernCross (Northern Cross) | 3 | 3 | 0 |
| PegasusSquare (Pegasus Square) | 5 | 5 | 0 |
| Teapot | 11 | 11 | 0 |
| Teaspoon | 6 | 6 | 0 |
| Fishhook | 13 | 13 | 0 |
| SouthernCross (Southern Cross) | 4 | 4 | 0 |
| SouthernPointer (Southern Pointer) | 3 | 3 | 0 |
| SouthPole (South Pole) | 2 | 1 | 1 |
| DiamondCross (Diamond Cross) | 4 | 4 | 0 |
| FalseCross (False Cross) | 4 | 4 | 0 |
| ArgoNavis (Argo Navis) | 27 | 27 | 0 |
| HeadoftheWhale (Head of the Whale) | 7 | 7 | 0 |
| MedusasHead (Medusa's Head) | 6 | 6 | 0 |
| TheKids (The Kids) | 3 | 3 | 0 |
| FalseKids (False Kids) | 4 | 4 | 0 |
| HerschelsTelescope (Herschel's Telescope) | 4 | 4 | 0 |
| HerschelsTelescope (Herschel's Telescope) | 4 | 4 | 0 |
| Manger | 5 | 5 | 0 |
| LittleCrab (Little Crab) | 3 | 3 | 0 |
| HeadofHydra (Head of Hydra) | 6 | 6 | 0 |
| NightOwl (Night Owl) | 2 | 2 | 0 |
| MiniScorpion (Mini Scorpion) | 7 | 7 | 0 |
| Sail | 5 | 5 | 0 |
| ThreePatriarchs (Three Patriarchs) | 4 | 4 | 0 |
| Keystone | 5 | 5 | 0 |
| Club | 3 | 3 | 0 |
| Coffin | 6 | 6 | 0 |
| PoniatowskisBull (Poniatowski's Bull) | 5 | 5 | 0 |
| Lozenge | 5 | 5 | 0 |
| Swoosh | 5 | 5 | 0 |
| JobsCoffin (Job's Coffin) | 5 | 5 | 0 |
| Crossbow | 6 | 6 | 0 |
| WaterJar (Water Jar) | 5 | 5 | 0 |
| DNAStrand (DNA Strand) | 10 | 10 | 0 |
| CircletofPisces (Circlet of Pisces) | 8 | 8 | 0 |
| FredericksGlory (Frederick's Glory) | 5 | 5 | 0 |
| Lilium | 4 | 4 | 0 |
| DavisDog (Davis' Dog) | 12 | 12 | 0 |
| SkipLoader (Skip Loader) | 5 | 5 | 0 |
| QuadransMuralis (Quadrans Muralis) | 16 | 16 | 0 |
| UMa-Vir | 4 | 4 | 0 |
| UMa-Leo | 5 | 5 | 0 |
| UMa-Gem | 3 | 3 | 0 |
| CMa-Tau | 6 | 6 | 0 |
| UMi-Spring | 4 | 3 | 1 |
| Peg-Per | 5 | 5 | 0 |
| Cas-Aur | 3 | 3 | 0 |
| Cas-Cyg | 6 | 4 | 2 |
| Boo-Sgr | 4 | 3 | 1 |

## 6. 天の川(mw.json)【実測】

- 生 521.7KB / gzip 173.3KB / 頂点総数 30676
- 赤経±180°の継ぎ目: 境界上の頂点 2 / 辺が継ぎ目を跨ぐ 8

| id | 型 | ポリゴン | リング | 頂点 |
| --- | --- | --- | --- | --- |
| ol1 | MultiPolygon | 1 | 10 | 10126 |
| ol2 | MultiPolygon | 1 | 113 | 12472 |
| ol3 | MultiPolygon | 1 | 46 | 5651 |
| ol4 | MultiPolygon | 1 | 27 | 1843 |
| ol5 | MultiPolygon | 1 | 6 | 584 |

間引き後(Douglas-Peucker、許容誤差=度):

| 許容誤差 | 頂点数 | 概算サイズ |
| --- | --- | --- |
| 0.05 | 9837 | 148.0KB |
| 0.1 | 5439 | 81.8KB |
| 0.25 | 2677 | 40.5KB |

## 7. 大小マゼラン雲・M31(dsos.bright.json)【実測】

{"LMC":{"id":"PGC 17223","desig":"LMC","type":"sd","morph":"SB(s)m","mag":0.4,"dim":"550x170","bv":"","coordinates":[80.895,-69.75]},"M 31":{"id":"NGC 224","desig":"M 31","type":"s","morph":"SA(s)b","mag":3.4,"dim":"189x61","bv":"0.92","coordinates":[10.68,41.267]},"SMC":{"id":"NGC 292","desig":"SMC","type":"i","morph":"dIrr","mag":2.3,"dim":"319x205","bv":"0.59","coordinates":[13.155,-72.8]}}

- 見つからない: なし
- 等級が文字列の項目: [{"id":"NGC 3532","mag":"3"},{"id":"IC 2391","mag":"2.5"}]

## 8. 観測地点の時刻系【実測】

| id | IANA | 1月 | 7月 |
| --- | --- | --- | --- |
| mitaka | Asia/Tokyo | GMT+09:00 | GMT+09:00 |
| sapporo | Asia/Tokyo | GMT+09:00 | GMT+09:00 |
| nobeyama | Asia/Tokyo | GMT+09:00 | GMT+09:00 |
| fuji | Asia/Tokyo | GMT+09:00 | GMT+09:00 |
| nishiharima | Asia/Tokyo | GMT+09:00 | GMT+09:00 |
| ishigaki | Asia/Tokyo | GMT+09:00 | GMT+09:00 |
| chichijima | Asia/Tokyo | GMT+09:00 | GMT+09:00 |
| quito | America/Guayaquil | GMT-05:00 | GMT-05:00 |
| maunakea | Pacific/Honolulu | GMT-10:00 | GMT-10:00 |
| honolulu | Pacific/Honolulu | GMT-10:00 | GMT-10:00 |
| jantar-mantar-delhi | Asia/Kolkata | GMT+05:30 | GMT+05:30 |
| merzouga | Africa/Casablanca | GMT+01:00 | GMT+01:00 |
| everest | Asia/Kathmandu | GMT+05:45 | GMT+05:45 |
| beijing-observatory | Asia/Shanghai | GMT+08:00 | GMT+08:00 |
| new-york | America/New_York | GMT-05:00 | GMT-04:00 |
| greenwich | Europe/London | GMT+00:00 | GMT+01:00 |
| paranal | America/Santiago | GMT-03:00 | GMT-04:00 |
| sydney-observatory | Australia/Sydney | GMT+11:00 | GMT+10:00 |
| ushuaia | America/Argentina/Ushuaia | GMT-03:00 | GMT-03:00 |
| point-nemo | UTC | GMT+00:00 | GMT+00:00 |
| syowa | Antarctica/Syowa | GMT+03:00 | GMT+03:00 |
| tromso | Europe/Oslo | GMT+01:00 | GMT+02:00 |
| yellowknife | America/Edmonton | GMT-07:00 | GMT-06:00 |

## 9. 観測地点の座標候補(Wikipedia API)

座標は候補です。種別(天文台・山頂・都市の代表点)の妥当性は人が確認します。

| id | 解決したタイトル | 緯度 | 経度 | 状態 | リダイレクト |
| --- | --- | --- | --- | --- | --- |
| mitaka | National Astronomical Observatory of Japan | - | - | no-coordinates |  |
| sapporo | Sapporo | 43.06194444 | 141.35444444 | ok |  |
| nobeyama | Nobeyama radio observatory | 35.9417 | 138.4758 | ok | あり |
| fuji | Mount Fuji | 35.36083333 | 138.7275 | ok |  |
| nishiharima | Nishi-Harima Astronomical Observatory | - | - | no-coordinates |  |
| ishigaki | List of observatory codes | - | - | no-coordinates | あり |
| chichijima | Chichijima | 27.06666667 | 142.20833333 | ok |  |
| quito | Quito | -0.22 | -78.5125 | ok |  |
| maunakea | Mauna Kea | 19.82055556 | -155.46805556 | ok |  |
| honolulu | Honolulu | 21.3 | -157.85 | ok |  |
| jantar-mantar-delhi | Jantar Mantar, New Delhi | 28.6271 | 77.2164 | ok |  |
| merzouga | Merzouga | 31.09916667 | -4.01166667 | ok |  |
| everest | Mount Everest | 27.98833333 | 86.92527778 | ok |  |
| beijing-observatory | Beijing Ancient Observatory | 39.9061 | 116.4281 | ok |  |
| new-york | New York City | 40.7128 | -74.0061 | ok |  |
| greenwich | Royal Observatory, Greenwich | 51.477 | -0.0147 | ok |  |
| paranal | Paranal Observatory | -24.62722222 | -70.40416667 | ok |  |
| sydney-observatory | Sydney Observatory | -33.8596 | 151.2047 | ok |  |
| ushuaia | Ushuaia | -54.80722222 | -68.30805556 | ok |  |
| point-nemo | Pole of inaccessibility | - | - | no-coordinates | あり |
| syowa | Syowa Station (Antarctica) | -69.004122 | 39.581836 | ok | あり |
| tromso | Tromsø | 69.6517 | 18.9556 | ok |  |
| yellowknife | Yellowknife | 62.45361111 | -114.37 | ok |  |
