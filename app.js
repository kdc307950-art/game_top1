// app.js — Canvas 渲染、触摸输入、动画；本项目唯一允许读写 localStorage 与操作 DOM 的模块。见 AGENTS.md 2.3 / 5。
// 对外出入口（AGENTS.md 4.2 game.js 契约由 game.js 承担；本文件只做渲染与输入）。

// 【Step 0 空占位】本文件目前只有说明注释，不允许写业务逻辑。
// 实现时请遵守：
//   - 棋盘数据结构只能用 AGENTS.md 4.1 的 cell[][]，禁止二维数字数组；
//   - 所有可调数值从 config.js 的 CONFIG 读取，禁止硬编码（宪法 0.7 / 9 节）；
//   - DOM / Canvas / localStorage 副作用只集中在本文件，并按 ROADMAP 对应 Step 分步启用。
