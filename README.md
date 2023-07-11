# manifest v3 でどうにかして ffmpeg.wasm を動かす

結論としては半分ほど妥協した状態と言える

## モチベーション

- ffmpeg.wasm が manifest v3 の拡張の上だと動かせないらしく、興味があった
  - wasm 自体は動かせる(個人的に Rust + wasm_bindgen で作られたモジュールを動かしたことがある)ので、何が難しくしているのか気になった

## 環境

- 前提として、Vite によってバンドルする形式で進める
  - いわゆるモダンフロントエンド開発とおなじ方法
  - クラシックな方法で読み込む場合、今回の肝としては `ffmpeg-core` を直接触っているよ～という点
- 環境
  - Node.js v18
  - Vite v3
  - @crxjs/vite-plugin v2 beta

## [@ffmpeg/ffmpeg](https://www.npmjs.com/package/@ffmpeg/ffmpeg) のブラウザ実装が ServiceWorker 向きではない

- 以下の理由により、直接 @ffmpeg/ffmpeg を使うのをやめた
  - wasm を扱うアプローチのそれぞれに対して、現状の @ffmpeg/ffmpeg ではうまく対応できない
    - backend (ServiceWorker) として動かす
    - sandbox 上で動かす
    - (いずれも CSP の設定によって wasm を実行できるような権限をつけておく)
  - `SharedArrayBuffer` を使用している

#### backend 上で動かす際の困りごと

- エントリーポイントとしては `@ffmpeg/ffmpeg` になるが、こいつが依存を読み込む際に `URL.createObjectURL` を実行する
  - ServiceWorker 上では使用することができない API
- ServiceWorker 上で使う場合、そのような遅延ロードは ESM の流儀に則ってもらうか、そもそもメインスレッドを専有しないため同期的に読み込む方式のいずれかがベターに思うが、現状の ffmpeg.wasm はあまりメンテされていないように見える
  - やるならフォークする必要あり

#### sandbox 上で動かす際の困りごと

- sandbox 環境では CORS の制限を突破できない
  - 動画のバイナリが落とせないため意味がなくなってしまう
  - (諸々の対応によって ffmpeg.wasm を読み込むところまではできた)
  - (アイデア)もしかしたら downloader.html と同じ仕組みで、backend で各リリースを取得 →sandbox に送信する、で事なきを得られるかも

#### SharedArrayBuffer

- ServiceWorker 上では愚直に使うことはできない(Spectre の対応のため)
  - https://developer.chrome.com/docs/extensions/mv3/cross-origin-isolation/ より許容できるように設定可能
    - 今回は実行できるところまでは検証していない
  - [シングルスレッド版](https://www.npmjs.com/package/@ffmpeg/core-st)は SharedArrayBuffer を使わないため回避可能
    - 今回はこちらを採用
      - `-c copy` であれば充分な速度が出るだろうと推測し、シングルスレッドを許容

## [@ffmpeg/core](https://www.npmjs.com/package/@ffmpeg/core) のブラウザ向け実装が ServiceWorker 向きではない

- 直接使おうとしたが、やはりいくつか罠があった
  - マルチスレッド版が `new Worker()` を実行しようとするが、ServiceWorker には存在しない
    - シングルスレッド版 [@ffmpeg/core-st](https://www.npmjs.com/package/@ffmpeg/core-st) を使う必要があった
    - emscripten の制約によるもの
      - https://github.com/emscripten-core/emscripten/issues/17363
  - ESM や UMD などのモダンな方法によって読み込まれることを考えていない
    - public から見た同じ階層の `ffmpeg-core.wasm` を fetch しにいくのでバンドラによるコピーの設定が必要だった
    - emscripten のビルド結果が任意の wasm を読み取る機構にない？？
      - もしこの ↑ 機構があるならコピーも必要ないかも

ここまでやると一応 ffmpeg が動くようになる

https://twitter.com/\_naari\_/status/1678568667657945090

ここからは ffmpeg.wasm で HLS のプレイリストを結合するまでの苦労ごと

## wasm のサンドボックス上ではネットワークに疎通できない

- 疎通できないため、自前で HLS のプレイリストの構造をパースし、すべてのファイルを事前に fetch しておく必要がある
  - ふつうの ffmpeg みたいにプレイリストの中身を全て舐めて勝手にインターネットから取ってくる、ということはしてくれない
  - emscripten の世界では [`core.FS.writeFile` などの API](https://emscripten.org/docs/api_reference/Filesystem-API.html)を叩いて仮想 FS 上にファイルを置く必要がある
- 今回の中で一番つらいところかも

## まとめ

- ffmpeg.wasm の core (シングルスレッド版) を manifest v3 で動かすことに成功した
  - 言い方を変えると低レイヤーな API を使わざるを得なかった
- @ffmpeg/ffmpeg のフロント用コードは古く、モダンなパッケージ管理の環境ではうまく動かない
  - 主な原因が古いだけだったりするのでおそらくフォークすることで対処可能に思える
- sandbox page を利用することでマルチスレッド版を動かすことが可能かも？
  - 少なくとも ServiceWorker + wasm + マルチスレッド は実現不可能に見える
  - ブラウザ上の wasm のマルチスレッド対応は 通常のページ + wasm + WebWorker の組み合わを前提にしているっぽいが、WebWorker は ServiceWorker から叩けない
- そもそも wasm 上では外のネットワークに疎通できない
  - なんなら content_script で動くような pure JS なライブラリがありそうだし、もしそれが動くならそっちのほうがいいかも
