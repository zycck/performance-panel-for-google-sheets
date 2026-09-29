# Performance Panel for Google Sheets

**スプレッドシートを重くしている数式を見つけます。**

[![デモ動画（MP4）](media/demo.gif)](media/demo.mp4)

[English](README.md) · [Русский](README.ru.md) · [Español](README.es.md) · [Deutsch](README.de.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Українська](README.uk.md) · [中文](README.zh.md) · 日本語

Google スプレッドシートは各数式の計算時間をすでに計測していますが、その数字はほとんど表示されません。このユーザースクリプトは「共有」ボタンの横に小さなボタンを追加します。「Recalculate」を押すと、遅いセルから順に、数式・時間・そのセルへ直接移動できるリンク付きで表示されます。

## できること

- Google 自身の計算エンジンで、スプレッドシート全体または 1 枚のシートを再計算します。
- 遅いセルを一覧表示します：数式、条件付き書式、データの入力規則。
- アドレスをクリックするとそのセルへ移動します。
- 時間の内訳を表示します：数式、書式、入力規則、読み込み。
- Experiment タブ：エンジンのカウンター、関数の呼び出し回数、選択したセルの参照関係。

<p>
  <a href="media/performance.png"><img src="media/performance-panel.png" alt="数式付きの遅いセル" width="32%"></a>
  <a href="media/result.png"><img src="media/result-panel.png" alt="段階ごとの時間" width="32%"></a>
  <a href="media/experiment-counters.png"><img src="media/experiment-counters-panel.png" alt="エンジンのカウンター" width="32%"></a>
</p>

## インストール

1. [Violentmonkey](https://violentmonkey.github.io/) または [Tampermonkey](https://www.tampermonkey.net/) をインストールします。
2. [Greasy Fork](https://greasyfork.org/ja/scripts/597075-performance-panel-for-google-sheets) でスクリプトを開き、「インストール」をクリックします。
3. スプレッドシートを再読み込みすると、「共有」の横にメーターのボタンが表示されます。

Chrome と Firefox で動作します。Google スプレッドシートがロシア語ならパネルもロシア語、それ以外は英語で表示されます。

## 知っておきたいこと

- 数字はすべて Google から取得しています。スクリプトは推定を行わず、Google が提供しない情報はその旨を表示します。
- データがブラウザの外に出ることはありません。サーバーも解析ツールも使いません。結果はページを再読み込みするまでメモリにだけ保持されます。
- 1 枚のシートを再計算すると、依存しているシートも一緒に再計算されることがあります。
- Google はスプレッドシートを頻繁に更新します。スクリプトが頼っている部分が変わった場合は、誤った数字ではなく分かりやすいメッセージが表示されます。
- Google とは関係ありません。

デモではサンプルデータを使用しています。このリポジトリにはビルド済みのスクリプトだけが置かれ、Greasy Fork はここから自動で更新されます。

作者：[@zycck](https://t.me/zycck)
