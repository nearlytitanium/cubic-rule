# Cubic Rule

立方体を回して底面を選び、落として、同じ色を 2×2×2 に揃えて消す立体パズル。

## 開発

```sh
npm install
npm run dev       # 開発サーバ
npm test          # エンジンの自己診断（起動時と同じ項目）を Node で実行
npm run build     # dist/ に静的ファイルを出力
npm run preview   # dist/ をローカルで確認
```

## 公開

`npm run build` で出力される `dist/` をそのまま静的ホスティングに置く。
アセットは相対パスで参照しているので、ドメイン直下でもサブパス（GitHub Pages の `/<repo>/` など）でも動く。

## 構成

```
src/
  engine/          ルール・探索・生成。React にも DOM にも依存しない
    tuning.js        実験で決めた数値
    rng.js           シード付き乱数、シャッフル
    rules.js         盤面表現、落下、消滅、連鎖
    solver.js        最短手数の探索（反復深化＋参照用の幅優先）
    certify.js       問題として受理するかの唯一の関門
    generator.js     全消し状態からの逆生成
    selftest.js      起動時の自己診断
    worker.js        生成を別スレッドで動かす Web Worker
  hooks/
    useCubeScene.js    three.js の描画・アニメーション・入力
    usePuzzleSource.js Worker への生成依頼（失敗時はメインスレッドで生成）
  ui/              表示部品と色などの定数
  App.jsx          画面全体の状態管理
scripts/selftest.js  npm test の本体
```

生成アルゴリズムの設計と計測の経緯は `cubic-rule-engineering-log.html` を参照。
