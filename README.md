# 手机版消消乐

一个对标开心消消乐规则的手机版 H5 消消乐游戏，使用 HTML5 Canvas + Vanilla JavaScript（ES Module）构建，**无框架、无构建工具、无第三方依赖**。

## 当前阶段

第一阶段：核心可玩版（对应 `ROADMAP.md` Step 0 - Step 6）已完成；第二阶段（Step 7 - Step 12）已完成：Step 7 条纹糖果（4 连生成横/竖条纹、激活消整行/列、按 3.5 计 1.5 倍）、Step 8 包装糖果（L/T 型 5 连在**交叉点**生成、激活消周围 3×3 且贴边裁剪、按 3.5 计 2.0 倍）、Step 9 魔力鸟（5 连直线生成、与任意普通色块交换清全屏同色、消耗 1 步、按 3.5 计 2.5 倍；它保留颜色但不参与同色匹配）、Step 10 特殊元素组合（3.3 的六种组合全部生效，优先级按 3.3 排序，组合触发扣 1 步；「全屏同色变形并触发」与「条纹+包装的二次爆炸」统一由清除集合的**链式种子**实现；「条纹/包装 + 魔力鸟」按 3.5 已有的 2.5 回落）与 Step 11 冰块与雪块（冰块 1-3 层：半透明覆层，冰里的动物照常匹配、被消除后该格补位而冰 −1 层；雪块 1-5 层：不透明白色占格，靠相邻消除或特效波及 −1 层；同一级联层内每格最多 −1 层；层数分 1000/层另算、不参与特效倍数）、Step 12 关卡模式与三星评分（`LEVELS.md` 的 **50 关全部落地**；四种目标 `score` / `collect` / `clearIce` / `mixed`；通关即一星、二三星只看分数；**步数不手写**，由难度经 `computeStepBudget` 派生；本局结束前引爆盘面全部特殊方块并**链式引爆**，引爆成果计入目标判定与星级；选关界面 10×5 网格 + 每关星级存档 `xxl_level_stars`；HUD 常驻四格：分数 / 剩余步数 / 目标进度 / 最高分）。糖果外观采用用户批准的程序化绘制方案，界面层已拆为 `app.js`、`render.js`、`candy.js`、`hud.js`、`input.js`、`timeline.js`、`storage.js`。

**关卡模式已实现**：`LEVELS.md` 定义的 50 关（难度曲线、10 个障碍布局图案、五条关卡设计硬指标）全部落进 `level.js` 并可在选关界面进入；代码表由文档生成（`_build/gen-level-table.mjs`）、再由 `_build/check-level-table.mjs` 反向逐项巡检，`LEVELS.md` 自身由 `_build/lint-levels.mjs` 巡检 —— 任一侧漂移都会让巡检变红。

**扩展前 Bug Audit Gate（`ROADMAP.md` §0.1）已通过**（Step 7→8、8→9、9→10、10→11、11→12 各一轮，**Step 12→13 为第六轮**）：L1 自动回归 173 用例 / 1545 断言 / 0 失败，静态巡检三项（`check-level-table`、`lint-levels`、`consistency_check`）PASS，浏览器与窄屏套件 `verify-step4`–`verify-step12b` 与 `audit-gate-step7`–`audit-gate-step11` 共 **15 个套件 / 582 项断言 PASS / 0 FAIL**，P0/P1 清零，P3 已登记（见 `PROGRESS.md` 与 `DECISIONS.md` D022/D025/D026/D027/D032；其中 P3-9 记录了两个 Step 2/3 时代的像素解码器脚本仍红的原因与回归计划）。**当前暂停点：Step 13（藤蔓、巧克力）开工前需先确认规则口径**；README 不替代测试证据。

当前已实现、仅代码审查、仅测试夹具通过、真机未验证和延期能力必须分开表述。特别是 Android/iOS 包装、真实设备性能、iOS Safari/WebView、音频/震动、色盲与控制台检查，未实际验证前均不得写成“已支持”或“可发布”。

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
python _build/consistency_check.py  # 若该脚本存在，检查文档/模块约束一致性
```

零依赖、零框架的自研断言工具在 `tests/assert.js`（`assertEqual` / `assertTrue` / `assertFalse` / `assertDeepEqual` / `assertThrows` + `test()` 注册表）。

### 验收和证据

每次准备进入新玩法 Step 前，按 `ROADMAP.md` §0.1 做 Bug Audit；不要把一次测试通过等同于跨平台可用。路线图 §0.2 定义了以下证据等级：

| 等级 | 含义 | 不能替代 |
|---|---|---|
| L1 | Node 单测/集成测试通过 | 浏览器、触摸和设备验证 |
| L2 | 本机 HTTP 浏览器流程通过 | 移动 WebView 或真机 |
| L3 | 窄屏/触摸模拟通过 | 真实设备性能、音频、震动 |
| L4-模拟器 | Android 模拟器安装包与核心冒烟 | Android 真机、iOS 或商店发布 |
| L4-真机 | Android 真机安装包与核心冒烟 | iOS 或商店发布 |
| L5-模拟器 | macOS/Xcode 上的 iOS 模拟器构建与核心冒烟 | iOS 真机、签名和渠道发布 |
| L5-真机 | macOS/Xcode 上的 iOS 真机构建与核心冒烟 | 签名、审核和渠道发布 |
| L6 | 签名产物、升级/卸载回归、合规材料 | 实际审核结果 |

审计报告必须区分“已验证”“仅代码审查”“未验证”。P0/P1 缺陷、自动回归失败或浏览器冒烟失败时，不得开始下一个玩法 Step。

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
- `game.js`、`board.js`、`shuffle.js`、`match.js`、`special.js`、`score.js`、`obstacles.js`、`level.js`：游戏逻辑模块（纯逻辑，不碰 DOM）。
- `app.js`：应用编排（视图状态、调用游戏逻辑、动画起播），唯一允许操作 `localStorage` 的模块。
- `render.js`、`candy.js`、`hud.js`、`input.js`、`timeline.js`：界面层 —— 几何与每帧绘制、糖果外观与精灵烘焙、HUD 与结束面板、手势识别、动画时间线。只接收「场景描述」数据，不读游戏状态、不碰存档。
- `tests/`：自动化测试。
- `package.json`：**当前没有任何依赖**，只有 `"type": "module"` 与两个 script —— `test` = `node tests/run-all.js`、`serve` = `python -m http.server 8000`（见 D004）。零依赖是 H5 本体的硬约束；只有经用户批准并进入 `ROADMAP.md` Step 18.1 后，才可为 Capacitor 增加受控的打包依赖。

## 从可玩 H5 到原生软件交付

路线图不会从“浏览器能打开”直接跳到“可以发布”。完整路径见 `ROADMAP.md` §0.3 和 Step 18：

1. **核心可玩**：逻辑回归和本机浏览器能完整玩一局。
2. **移动可玩**：完成窄屏、触摸、安全区、滚动/缩放、性能和视觉边界验证。
3. **功能冻结**：通过 Bug Audit Gate，P0/P1 清零并保留可回退 commit/tag。
4. **Capacitor 候选**：经明确批准后，将 H5 资源确定性准备到 `webDir`，再初始化和同步平台工程。
5. **平台验证**：Android 与 iOS 分别在对应环境中构建、安装、测试；Android 不能替代 iOS，Windows 不能替代 macOS/Xcode。
6. **发布候选**：完成签名、版本、图标/启动图、最小权限、隐私资料、新安装/升级/卸载/离线回归和产物归档。

Step 18 已拆为可独立验收的 7 个子步骤：

| 子步骤 | 交付焦点 | 最低结论 |
|---|---|---|
| 18.1 | 环境盘点、功能冻结、包标识、版本与回滚点 | 仅在 Gate 通过后允许初始化打包 |
| 18.2 | 可重复 `webDir`、Capacitor 初始化、资源同步 | Web 资源不白屏、无模块/资源路径错误 |
| 18.3 | WebView、触摸、存储、音频/震动、离线边界 | 同一 Web 逻辑可降级运行 |
| 18.4 | Android Debug 构建、安装与真机冒烟 | L4 Android 证据 |
| 18.5 | iOS 模拟器/真机构建与验证 | L5 iOS 证据，需 macOS/Xcode |
| 18.6 | Release 签名、版本、素材、隐私与权限 | 可重建的签名候选输入 |
| 18.7 | 新装/升级/卸载/前后台/离线回归、归档与回滚 | L6 发布候选证据 |

### Step 18 的执行边界

- Capacitor 不是当前已安装工具，也不是现在要执行的下一步。只有完成 18.1、得到用户批准并准备好对应环境后，才能安装它和创建 `android/`、`ios/`。
- 未来的命令必须在 PowerShell 中逐行运行，例如 `npm run stage:web`、`npx cap sync android`、`npx cap run android`；不要复制 Bash 专用的 `&&`、环境变量写法或未验证的版本参数。
- 每次 Web 资源变更都必须重新走“生成 `webDir` → 资源检查 → `npx cap sync <platform>` → 平台复测”。`sync` 不会替代资源准备。
- Debug APK、Android 真机安装、iOS 模拟器运行、签名 Release、商店审核是不同状态。发布说明只能写已有的证据等级和实际平台。
- 私钥、keystore、Apple 证书、Provisioning Profile、密码、真实账号和个人设备标识不得写入仓库、命令输出、截图或进度日志。

## 开发规则

所有开发必须遵守 `AGENTS.md`。开始任何 Step 前，先读：

1. `AGENTS.md` 对应章节。
2. `ROADMAP.md` 当前 Step 与第 0 节第 9 条运行方式。
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
| `python _build/consistency_check.py` | 若脚本存在，检查模块与文档约束一致性 |
| `(Select-String -LiteralPath app.js,render.js,candy.js,hud.js,timeline.js -Pattern 'shadowBlur' -AllMatches | ForEach-Object Matches | Measure-Object).Count` | PowerShell 下检查绘制路径中的高开销阴影调用，目标为 0，结合 `REFERENCES.md` §3.5 人工判断 |
| `git status --short` | 检查工作区是否混入未审查的文件 |
| `git log --oneline` | 查看 Step 提交历史（提交信息格式 `[stepN] 描述`） |

> 上表是**操作建议**，不是验收标准。验收以 `AGENTS.md` 第 7 节（测试与验证）、第 10 节（完成定义）、第 16 节（提交与回滚）为准；两者若冲突，以宪法为准并在 `DECISIONS.md` 记录。

## 许可证

（待定）
