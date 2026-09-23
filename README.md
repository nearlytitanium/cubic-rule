# Cubic Rule

立方体を回して底面を選び、落として、同じ色を 2×2×2 に揃えて消す立体パズル。

1. 立方体を回して底面を選び、落とす。
2. 同じ色が 2×2×2 に揃うと消える。
3. 全部消せばクリア。

灰色のマスは動かない障害物で、ブロックはそこで止まる。出題される問題はすべて解けることと、表示される最短手数が真の最短であることが保証されている。

## 操作

| 操作 | タッチ / マウス | キーボード |
|---|---|---|
| 底面を入れ替える | 上下にスワイプ（ドラッグ） | ↑ ↓ / W S |
| 見回す | 左右にスワイプ（ドラッグ） | ← → / A D |
| 落とす | 「落とす」ボタン | Space / Enter |
| 1手戻す | 「1手戻す」ボタン | — |

左上のメニューから「最初から」「この問題をスキップ」（解答を自動再生）「タイトルに戻る」を選べる。全消し後は「落とす」が「次の問題」に変わる。

## 機能

- **難易度** — タイトル画面の設定から Easy / Normal / Hard を選ぶか、盤サイズ・色数・手数の下限を個別に指定する（プリセット外はカスタム）。

  | 難易度 | 盤サイズ | 色数 | 手数の下限 |
  |---|---|---|---|
  | Easy | 4³ | 1 | 3 |
  | Normal | 5³ | 2 | 4 |
  | Hard | 5³ | 3 | 6 |

- **Seed** — 同じ seed と設定なら同じ問題が出る。空欄ならランダム。遊んでいる問題の seed はメニューに表示される。
- **日本語 / English** — タイトル画面の右上で切り替え。初回はブラウザの言語に合わせる。
- **BGM** — 下記。
- **レスポンシブ** — PC・タブレット・スマホ縦・スマホ横でそれぞれ配置を変え、画面全体を使う。

## BGM（DiscoFunc）

BGM は [DiscoFunc](https://discofunc.com) の数式トラックで、公開クライアント
`https://discofunc.com/discofunc-embed.js` を実行時に読み込み、埋め込みプレイヤー（iframe）を操作して鳴らしている。
このリポジトリに含まれるのは曲の数式（`src/audio/tracks.js`）と操作するコードだけで、音の生成は DiscoFunc 側で行われる。

- 1曲を2つのライブ変数で変化させる。曲の差し替えや一時停止はしない。
  - `x` — パズルの進み具合。開始 0.25 → 最短手数で 1 → 大きく超えると最大 2。手数が進むほど旋律が埋まり、テンポが上がる。
  - `y` — 場面。1 = プレイ中、2 = 全消し時のフレーズ（約12拍）、3 = 無音。
- タイトル画面はプレイ開始時と同じ状態で流れる。
- ブラウザは操作前の音声再生を許さないため、初回アクセス時に「音あり / 音なし」を尋ね、そのボタン操作で再生を始める。2回目以降は最初の操作で始まる。
- 画面下の BGM ボタンで再生 / 停止。停止は記憶される。「DiscoFunc ↗」はこの曲を DiscoFunc のエディタで開く。
- discofunc.com に接続できない場合は BGM を出さず、ゲームだけが動く。
- iOS Safari などでは、ページ側の操作では iframe の音声が始まらないことがある。その場合は BGM ボタンを直接タップする。

## ブラウザに保存するデータ

`localStorage` に次の3つだけを保存する（使えない環境では毎回既定値で動く）。これらをどこかへ送ることはない。
外部への通信は、BGM のために discofunc.com からプレイヤーを読み込むことだけ。

| キー | 内容 |
|---|---|
| `cubicrule.config` | 盤サイズ・色数・手数の下限 |
| `cubicrule.lang` | 表示言語 |
| `cubicrule.bgm` | BGM のオン / オフ |

## 開発

Node.js 20 以降。

```sh
npm install
npm run dev       # 開発サーバ
npm test          # エンジンの自己診断を Node で実行
npm run build     # dist/ に静的ファイルを出力
npm run preview   # dist/ をローカルで確認
```

## 公開

`npm run build` で出力される `dist/` をそのまま静的ホスティングに置く。
アセットは相対パスで参照しているので、ドメイン直下でもサブパス（GitHub Pages の `/<repo>/` など）でも動く。
BGM のために実行時に `https://discofunc.com` を読み込む（上記）。

## 構成

```
src/
  engine/            ルール・探索・生成。React にも DOM にも依存しない
    tuning.js          実験で決めた数値
    rng.js             シード付き乱数、シャッフル
    rules.js           盤面表現、落下、消滅、連鎖
    solver.js          最短手数の探索（反復深化＋参照用の幅優先）
    certify.js         問題として受理するかの唯一の関門
    generator.js       全消し状態からの逆生成
    selftest.js        自己診断（npm test）
    worker.js          生成を別スレッドで動かす Web Worker
  hooks/
    useCubeScene.js    three.js の描画・アニメーション・入力
    usePuzzleSource.js Worker への生成依頼（失敗時はメインスレッドで生成）
    useBgm.js          DiscoFunc プレイヤーの読み込みと、場面・手数の反映
  audio/
    tracks.js          BGM の数式と、手数から変数を決める規則
  ui/
    theme.js           色・ライティング・操作感の定数
    Hud.jsx            プレイ中の表示（メニュー、手数、落とすボタン）
    TitleScreen.jsx    タイトル画面と設定、難易度プリセット
    TitleCube.jsx      タイトルの回転する立方体
    ClearPopup.jsx     全消し / 解答のポップアップ
    SoundNotice.jsx    初回の音の案内
    BgmBar.jsx         BGM ボタン
    controls.jsx       選択ボタン
  i18n.jsx           日本語 / 英語の文言
  App.jsx            画面全体の状態管理
scripts/selftest.js  npm test の本体
```

生成アルゴリズムの設計と計測の経緯は `cubic-rule-engineering-log.html` を、分割前の単一ファイル版は `cube-engine.jsx` を参照。
