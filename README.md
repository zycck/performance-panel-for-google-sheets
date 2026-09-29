# Performance Panel for Google Sheets

**Find the formulas that slow your spreadsheet down.**

[![Demo video (MP4)](media/demo.gif)](media/demo.mp4)

English · [Русский](README.ru.md) · [Español](README.es.md) · [Deutsch](README.de.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Українська](README.uk.md) · [中文](README.zh.md) · [日本語](README.ja.md)

Google Sheets already times every formula it calculates, but keeps those numbers to itself. This userscript adds a small button next to Share. Press Recalculate and you get the slowest cells first, each with its formula, its time and a link that takes you straight to it.

## What it does

- Recalculates the whole spreadsheet or a single sheet with Google's own engine.
- Lists the slowest cells: formulas, conditional formatting and data validation.
- Click an address to jump to the cell.
- Shows where the time went: formulas, formatting, validation, loading.
- Experiment tab: engine counters, how often functions ran, and the links of the selected cell.

<p>
  <a href="media/performance.png"><img src="media/performance-panel.png" alt="Slowest cells with formulas" width="32%"></a>
  <a href="media/result.png"><img src="media/result-panel.png" alt="Time by stage" width="32%"></a>
  <a href="media/experiment-counters.png"><img src="media/experiment-counters-panel.png" alt="Engine counters" width="32%"></a>
</p>

## Install

1. Install [Violentmonkey](https://violentmonkey.github.io/) or [Tampermonkey](https://www.tampermonkey.net/).
2. Open the script on [Greasy Fork](https://greasyfork.org/en/scripts/597075-performance-panel-for-google-sheets) and click Install.
3. Reload your spreadsheet. The gauge button appears next to Share.

Works in Chrome and Firefox. The panel follows the language of Google Sheets: Russian or English.

## Good to know

- Every number comes from Google. The script doesn't estimate anything, and when Google doesn't report something, the panel says so.
- Nothing leaves your browser. No servers, no analytics. Results are kept in memory until you reload the page.
- Recalculating one sheet can also recalculate the sheets it depends on.
- Google changes Sheets often. If something the script relies on changes, you'll see a clear message instead of wrong numbers.
- Not affiliated with Google.

The demo uses sample data. This repository holds only the built script; Greasy Fork updates from it automatically.

Made by [@zycck](https://t.me/zycck).
