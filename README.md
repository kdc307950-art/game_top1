# 手机版消消乐

一个对标开心消消乐规则的手机版 H5 消消乐游戏，使用 HTML5 Canvas + Vanilla JavaScript（ES Module）构建，**无框架、无构建工具、无第三方依赖**。

## 当前阶段

第一阶段：核心可玩版（对应 `ROADMAP.md` Step 0 - Step 6）。
当前进度：Step 5 移动端适配 + 动画打磨已完成（`app.js` 按宪法 v1.4 拆为 `app.js` + `render.js` + `input.js`；消除/下落/级联动画时长全部取自 `ANIMATION_CONFIG`；6 色改为 6 种可辨识形状以支持色盲；跟随系统「减少动效」），下一步为 Step 6 死局检测与重排，详见 `PROGRESS.md`。

## 快速开始

⚠️ 本项目源码使用 ES Module（`import` / `export`），**不能双击 `index.html` 直接打开** —— 浏览器在 `file://` 协议下会以 CORS 拒绝加载模块。必须经本地静态服务器打开：

```bash
# 在项目根目录执行（任选其一）
python -m http.server 8000     # 推荐，零安装
```

然后浏览器打开 <http://localhost:8000/>。

**手机真机验证**：手机与电脑接入同一 Wi-Fi，查看电脑局域网 IP（`ipconfig`），手机浏览器访问：

```
http://<电脑局域网IP>:8000/
```

原因与备选方案见 `DECISIONS.md` D004。

## 测试

```bash
node tests/run-all.js        # 自动发现并执行 tests/*.test.js，失败时退出码 1
node tests/board.test.js     # 单文件直接运行
```

零依赖、零框架的自研断言工具在 `tests/assert.js`（`assertEqual` / `assertTrue` / `assertFalse` / `assertDeepEqual` / `assertThrows` + `test()` 注册表）。

## 项目结构

**文档（宪法与流程）**

- `AGENTS.md`：项目宪法，AI Agent 的最高开发约束。**每次会话开工前必读。**
- `ROADMAP.md`：Step 级任务清单与验收标准（Step 0 - Step 18）。
- `REFERENCES.md`：外部参考项目、逐 Step 借鉴方案、许可证合规。
- `PROGRESS.md`：跨会话进度日志。
- `DECISIONS.md`：关键决策记录（D001 起编号）。
- `prompts.md`：复用提示词库。

**代码**

- `index.html`、`styles.css`：页面结构与移动端样式。
- `config.js`：全局配置，唯一允许存放可调数值/常量字符串的文件。
- `game.js`、`board.js`、`match.js`、`special.js`、`score.js`、`obstacles.js`、`level.js`：游戏逻辑模块（纯逻辑，不碰 DOM）。
- `app.js`：Canvas 渲染与触摸交互，唯一允许操作 DOM / Canvas / `localStorage` 的模块。
- `tests/`：自动化测试。
- `package.json`：**无任何依赖**，只有 `"type": "module"` 与两个 script —— `test` = `node tests/run-all.js`、`serve` = `python -m http.server 8000`（见 D004）。零依赖是硬约束，禁止往里加 `dependencies`。

## 开发规则

所有开发必须遵守 `AGENTS.md`。开始任何 Step 前，先读：

1. `AGENTS.md` 对应章节。
2. `ROADMAP.md` 当前 Step 与第 0.9 条运行方式。
3. `REFERENCES.md` 对应章节。
4. `PROGRESS.md` 最近记录。
5. `DECISIONS.md` 全部条目。

核心红线（摘自宪法）：

- 每次只做一件事，禁止跨 Step 混合修改。
- 所有可调数值必须来自 `config.js`，禁止硬编码。
- 逻辑模块禁止操作 DOM / Canvas / `localStorage`。
- 禁止引入依赖、框架、构建工具。
- 禁止声称「已完成」而没有实际验证。

## 常用命令

| 命令 | 作用 |
|---|---|
| `python -m http.server 8000` | 起本地服务器（浏览器验证必需） |
| `node tests/run-all.js` | 跑全部测试 |
| `grep -c shadowBlur app.js` | 性能红线检查，目标 0（见 `REFERENCES.md` §3.5） |
| `git log --oneline` | 查看 Step 提交历史（提交信息格式 `[stepN] 描述`） |

> 上表是**操作建议**，不是验收标准。验收以 `AGENTS.md` 第 7 节（测试与验证）、第 10 节（完成定义）、第 16 节（提交与回滚）为准；两者若冲突，以宪法为准并在 `DECISIONS.md` 记录。

## 许可证

（待定）
