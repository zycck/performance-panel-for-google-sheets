# Performance Panel for Google Sheets

**找出拖慢表格的公式。**

[![演示视频（MP4）](media/demo.gif)](media/demo.mp4)

[English](README.md) · [Русский](README.ru.md) · [Español](README.es.md) · [Deutsch](README.de.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Українська](README.uk.md) · 中文 · [日本語](README.ja.md)

Google 表格其实会记录每个公式的计算耗时，只是很少把这些数字展示出来。这个用户脚本会在“共享”按钮旁边加一个小按钮。点击 “Recalculate”，最慢的单元格会排在最前面，每一项都附带公式、耗时和一个直达该单元格的链接。

## 功能

- 用 Google 自己的计算引擎重新计算整个表格或单个工作表。
- 列出最慢的单元格：公式、条件格式和数据验证。
- 点击地址即可跳转到对应单元格。
- 显示时间花在哪里：公式、格式、验证、加载。
- Experiment 标签页：引擎计数器、各函数的调用次数，以及所选单元格的引用关系。

<p>
  <a href="media/performance.png"><img src="media/performance-panel.png" alt="最慢的单元格及其公式" width="32%"></a>
  <a href="media/result.png"><img src="media/result-panel.png" alt="各阶段耗时" width="32%"></a>
  <a href="media/experiment-counters.png"><img src="media/experiment-counters-panel.png" alt="引擎计数器" width="32%"></a>
</p>

## 安装

1. 安装 [Violentmonkey](https://violentmonkey.github.io/) 或 [Tampermonkey](https://www.tampermonkey.net/)。
2. 在 [Greasy Fork](https://greasyfork.org/zh-CN/scripts/597075-performance-panel-for-google-sheets) 上打开脚本并点击“安装”。
3. 重新加载表格，“共享”旁边会出现一个仪表盘图标按钮。

支持 Chrome 和 Firefox。Google 表格界面为俄语时面板显示俄语，其他情况下显示英语。

## 须知

- 所有数字都来自 Google。脚本不做任何估算；Google 没有提供的数据，面板会如实说明。
- 数据不会离开你的浏览器：没有服务器，也没有统计分析。结果只保存在内存中，刷新页面后清空。
- 重新计算一个工作表时，它所依赖的工作表也可能一起重新计算。
- Google 经常更新表格。如果脚本依赖的部分发生变化，你会看到明确的提示，而不是错误的数字。
- 本项目与 Google 无关。

演示使用的是示例数据。本仓库只包含构建好的脚本，Greasy Fork 会自动从这里同步更新。

作者：[@zycck](https://t.me/zycck)。
