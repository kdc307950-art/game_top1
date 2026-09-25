# ROADMAP — 手机版消消乐项目路线图

> 版本：v1.39
> 关联文件：`AGENTS.md`（宪法）、`REFERENCES.md`（借鉴方案）、`PROGRESS.md`（进度日志）、`DECISIONS.md`（决策记录）、`prompts.md`（提示词库）
> 使用方式：每个 Step 都是一个可独立验收的小任务。开始前先读 `AGENTS.md` 对应章节、`REFERENCES.md` 对应章节、本文件对应 Step、`PROGRESS.md` 最近记录与 `DECISIONS.md` 全部条目，结束后在 `PROGRESS.md` 追加一条记录。

---

## 0. 路线图使用规则

1. **顺序执行**：除非本文件显式声明可并行，否则必须按 Step 编号顺序推进。
2. **一步一验收**：每个 Step 完成后必须通过该 Step 的「验收」与「测试」两项，才能勾选完成。
3. **一步一提交**：每个 Step 完成后提交一次，提交信息格式 `[stepN] 简短描述`（见 `AGENTS.md` 16 节）。
4. **一步一记录**：完成后在 `PROGRESS.md` 追加记录。
5. **可回退**：任何 Step 若无法在合理时间内完成，允许拆分为子 Step，但必须在 `DECISIONS.md` 记录。
6. **提示词存档**：每个 Step 使用的提示词建议存档到 `prompts.md`。
7. **依赖检查**：开始一个 Step 前，确认其所有「前置依赖」已勾选完成。
8. **参考检查**：开始一个 Step 前，先读 `REFERENCES.md` 对应章节，理解借鉴要点与陷阱。
9. **运行方式（v1.2 新增，必读）**：本项目源码使用 ES Module（`import` / `export`）。
   - 浏览器：**必须通过本地静态服务器打开**，不能双击 `index.html`（`file://` 下浏览器会以 CORS 拒绝加载 ES Module）。
     启动方式（任选其一，均在项目根目录执行）：
     ```bash
     python -m http.server 8000      # 本机：http://localhost:8000/
     ```
     手机真机验证：手机与电脑同一 Wi-Fi，访问 `http://<电脑局域网IP>:8000/`。
   - 测试：`node tests/run-all.js`（依赖根目录 `package.json` 的 `"type": "module"`）。
   - 详见 `DECISIONS.md` D004 / D005。

## 0.1 扩展前 Bug Audit Gate（当前暂停点）

当一个 Step 已完成、准备进入下一个玩法 Step 时，先执行一次独立的 Bug Audit，不把“功能已经写出来”直接当成“可以继续扩展”。当前 **Step 14（关卡类型）已完成，Gate 0.1 第八轮已通过（tag `gate-0.1-step14-pass`）**，**Step 15（道具系统）已开工**：宪法 v1.20 与 D036 的口径已定（刷新复用 3.8 的重排、加五步在时间关改为加秒、小木锤只接受含动物的格子、数量持久化在 `storage.js`、道具条是画布外元素）。Step 15 完成后、进入 Step 16（音效与震动）前必须再走一轮 Gate 0.1。

1. **自动回归**：运行 `node tests/run-all.js`，记录测试文件数、用例数、断言数、失败数和退出码；失败用例必须先修复或在 `PROGRESS.md` 明确标记为阻塞。
2. **静态一致性**：运行现有 `_build/consistency_check.py`（如文件存在），检查模块边界、配置键、文档交叉引用和禁止依赖；不要用“脚本没有报错”替代行为测试。
3. **浏览器冒烟**：通过 HTTP 服务器打开首页，验证首屏、一次有效交换、一次无效交换、消除/下落/补充、步数、游戏结束和最高分；记录浏览器、系统、端口和是否有控制台错误。
4. **移动交互**：在至少一个窄屏模拟器或真机验证触摸滑动、方向锁、滚动/缩放禁用、安全区和输入锁；不能把桌面鼠标验证写成触摸验证。
5. **当前功能边界**：对照 `PROGRESS.md` 与 `DECISIONS.md`，逐项列出已实现、仅有单测、仅代码审查、未验证和明确延期；尚未实现的后续 Step 能力不得在验收中预设为可用。
6. **缺陷分级**：P0（无法启动、数据损坏、规则状态不可恢复）和 P1（核心交换/消除/步数/结束流程错误）阻止进入下一 Step；P2（视觉、兼容性或低频边界问题）必须有负责人、复现步骤和回归计划；P3 可进入待办。
7. **证据归档**：在 `PROGRESS.md` 追加审计记录，包含命令、环境、结果、失败日志路径和未验证边界；涉及规则或范围变化时追加 `DECISIONS.md`。没有证据的项目只能写“未验证”。

只有 P0/P1 清零、自动回归通过、浏览器冒烟通过，且剩余 P2/P3 已登记，才可以勾选“允许进入下一 Step”。这条门禁本身不新增玩法，也不改变规则数值。

## 0.2 证据等级与可声明范围

路线图中的“通过”必须注明证据等级，不能跨等级推断：

| 等级 | 证据 | 可以声明 | 不能声明 |
|---|---|---|---|
| L0 | 阅读代码、接口和决策记录 | 已检查静态实现 | 功能可玩、平台可用 |
| L1 | Node 单测/集成测试 | 算法在测试夹具中通过 | 浏览器和真机通过 |
| L2 | 本机 HTTP 浏览器手动流程 | 桌面浏览器流程通过 | 移动端触摸、WebView、商店就绪 |
| L3 | DevTools 窄屏/触摸模拟 | 模拟移动交互通过 | 真实设备性能、音频、震动 |
| L4-模拟器 | Android 模拟器安装包 | Android 模拟器安装和冒烟通过 | Android 真机、iOS 或商店发布 |
| L4-真机 | Android 真机安装包 | Android 真机安装和冒烟通过 | iOS 或商店发布 |
| L5-模拟器 | macOS/Xcode 上的 iOS 模拟器 | iOS 模拟器构建和核心流程通过 | iOS 真机、签名、审核、商店就绪 |
| L5-真机 | macOS/Xcode 上的 iOS 真机 | iOS 真机构建和设备冒烟通过 | 签名、审核、商店就绪 |
| L6 | 签名产物、升级/卸载回归、合规材料 | 可交付的发布候选版本 | 未完成的审核或未声明的平台 |

报告中使用“已验证”“仅代码审查”“未验证”三个词；“移动端可玩”至少需要 L3；Android 模拟器只能写 L4-模拟器，Android 真机才可写 L4-真机；iOS 模拟器只能写 L5-模拟器，iOS 真机才可写 L5-真机；“可发布”仍需 L6。Windows 环境不能声称完成 iOS 构建。

## 0.3 从可玩到可交付的总门槛

阶段里程碑不是单一的代码完成状态，而是以下顺序：

1. **核心可玩**：逻辑测试通过，本地浏览器可以完整玩一局。
2. **移动可玩**：窄屏/触摸/安全区/性能和视觉边界完成验证。
3. **功能冻结**：本阶段玩法不再随意扩展，Bug Audit 清零 P0/P1，保留回滚点。
4. **包装候选**：Web 资源、应用标识、版本号、图标/启动图、隐私说明和 Capacitor 配置可重建。
5. **平台验证**：Android 与 iOS 分别完成对应平台的构建、安装、升级、卸载、断网和恢复测试。
6. **发布候选**：签名、产物校验和证据归档完成；只有达到 L6 才能称为“可交付/商店准备完成”。

## 0.4 成熟 App 研发阶段总表

| 阶段 | 必须回答的问题 | 主要产物 | 放行证据 |
|---|---|---|---|
| 需求冻结 | 本轮做什么、不做什么？ | Step 范围、验收清单、风险清单 | DoR 通过 |
| 设计与契约 | 数据结构、模块边界、异常路径是什么？ | 接口契约、状态流、交互稿或文字说明 | 评审记录 |
| 实现 | 代码是否只改本 Step 范围？ | 源码、配置、最小迁移 | diff 可审计 |
| 自动化验证 | 规则和边界是否可重复验证？ | 单测、集成测、失败用例 | L1 |
| 浏览器验证 | 用户主流程是否可用？ | HTTP 启动记录、截图、控制台结果 | L2/L3 |
| 功能冻结 | 是否停止扩展并清理 P0/P1？ | Bug Audit、回滚点、冻结声明 | Gate 0.1 |
| 包装与平台构建 | Web 资源能否被平台重建和安装？ | Capacitor 配置、平台工程、构建产物 | L4/L5 |
| 发布候选 | 产物、版本、签名、合规是否齐全？ | RC 清单、校验和、回滚演练记录 | L6 |

## 0.5 每个 Step 的统一执行卡

每个 Step 开始前复制以下清单到 `PROGRESS.md`，完成后逐项填写，不以“代码已写”代替验收：

1. **开始前置条件**：前置 Step、相关 `AGENTS.md`/`REFERENCES.md` 章节、最近决策、当前 commit/tag、未解决缺陷。
2. **允许修改范围**：列出允许修改的文件与禁止触碰的模块；超出范围先记入 `DECISIONS.md`。
3. **执行顺序**：契约/夹具 → 实现 → 失败用例 → 修复 → 自动化回归 → 浏览器或设备验证 → 文档记录。
4. **必须产物**：源码 diff、测试结果、截图或日志、变更说明、回滚点、未验证边界。
5. **自动化测试**：命令、环境、用例数、断言数、失败数、退出码。
6. **手动测试**：设备/浏览器、视口、操作步骤、预期与实际、控制台异常。
7. **证据等级**：按 §0.2 标记 L0-L6；没有对应证据写“未验证”。
8. **失败处理**：P0/P1 阻止放行；P2 必须有负责人、复现步骤和回归计划；P3 进入待办。
9. **回滚点**：保留开始前 tag/commit；修复失败时只回到该点，不覆盖历史产物。

## 0.6 Definition of Ready / Done

**DoR（可开始）**：目标和非目标明确；前置 Step 已验收；允许修改文件已列出；接口和数据契约已确认；测试夹具与验收路径可执行；风险、依赖和回滚点已登记。

**DoD（可完成）**：实现与 Step 范围一致；新增行为有自动化测试；主流程完成对应级别的浏览器/设备验证；无 P0/P1；P2/P3 已登记；`PROGRESS.md` 有命令、环境、结果和证据路径；必要时更新 `DECISIONS.md`、`REFERENCES.md`、`prompts.md`；形成可回退提交。

## 0.7 需求到发布的追溯与版本规则

- 每项需求使用 `R-编号`，在 Step 验收、测试名称、截图/日志和提交信息中保持同一编号。
- 提交格式：`[stepN][R-编号] 简短描述`；Bug 修复追加 `fix:`，文档变更追加 `docs:`。
- 开始 Step 前建立 `stepN-start` tag；通过后建立 `stepN-done` tag。发布候选使用递增版本号和唯一 RC 标识，不覆盖旧包。
- 只允许从当前冻结分支生成候选包；工作区有未记录改动、未解决 P0/P1 或缺失签名/合规材料时不得构建 Release。
- 回滚顺序：停止发布 → 记录影响 → 回到最近稳定 tag → 复现并补测试 → 最小修复 → 递增版本 → 重新执行本 Step 验收。

## 0.8 App 包装与发布准备清单

在 Step 18.1 建立清单并逐项留证：应用名称与包标识、版本号/构建号、图标与启动图、方向与安全区、离线启动策略、localStorage 数据兼容与迁移、权限最小化、隐私说明、第三方许可、崩溃与日志边界、商店截图/描述/分类、签名与证书保管位置、APK/AAB/IPA 文件名和 SHA-256、安装/升级/卸载/断网恢复结果。密钥、证书和个人设备信息不得进入仓库。

---

## 1. 阶段总览

| 阶段 | 目标 | 包含 Step | 里程碑定义 |
|---|---|---|---|
| 第一阶段 | 核心可玩版 | Step 0 - Step 6 | 手机浏览器可完整玩一局，有分数、步数、最高分 |
| 第二阶段 | 开心消消乐核心机制 | Step 7 - Step 12 | 具备特殊元素、组合效果、障碍物、关卡目标、三星评分 |
| 第三阶段 | 扩展机制 | Step 13 - Step 18 | 具备多种障碍物、关卡类型、道具、音效、可打包发布 |

每个阶段结束建议打一次 tag：`phase-1-done`、`phase-2-done`、`phase-3-done`。

---

## 2. 第一阶段：核心可玩版

### Step 0：项目骨架初始化

**目标**：搭好目录与最小配套文件。

**范围**：允许创建 `index.html`、`styles.css`、`config.js`、`package.json`、`README.md`、`REFERENCES.md`、`PROGRESS.md`、`DECISIONS.md`、`prompts.md`、`.gitignore`、`tests/assert.js`、`tests/run-all.js` 及空占位模块；不允许写业务逻辑。

**验收**：
- 目录结构符合 `AGENTS.md` 第 2.2 节（含 `package.json`、`REFERENCES.md`、`assets/`，均已在宪法 2.2 节登记）。
- `config.js` 导出 `CONFIG`，字段齐全（可先留空壳）。
- `tests/assert.js` 提供 `assertEqual` 与 `assertTrue`。
- `git init` 并首次提交 `[step0] 项目骨架与宪法 v1.3`。

**测试**：
- `python -m http.server 8000` 后打开 `http://localhost:8000/`，页面无报错、控制台无错误。
- `node tests/run-all.js` 可执行（0 个测试文件时也必须正常退出，退出码 0）。

**禁止**：引入依赖；写棋盘、渲染、交互代码。

**前置依赖**：无

**参考**：`REFERENCES.md` §2.1 Step 0

**提示词**：
```text
任务：初始化项目骨架
范围：按 AGENTS.md 2.2 创建目录与空占位文件；只允许完善 Step 0 列出的骨架、治理文档与测试入口
验收：目录结构与宪法一致；CONFIG 字段齐全；assertEqual/assertTrue 可用；git init 后完成 [step0] 初始提交
测试：python -m http.server 8000 打开 localhost:8000 无控制台报错；运行 run-all.js
禁止：写任何业务逻辑，引入任何依赖
前置依赖：无
参考：REFERENCES.md §2.1 Step 0
```

---

### Step 1：棋盘渲染（只做显示，无交互）

**目标**：在 Canvas 上渲染 8×8 棋盘，每格显示一个随机颜色的圆形/方块。

**范围**：允许修改 `index.html`、`styles.css`、`app.js`；不允许修改逻辑模块。

**验收**：
- 手机浏览器可见 8×8 棋盘。
- 颜色从 `CONFIG.COLOR_COUNT` 中随机取。
- 棋盘为正方形，按 `devicePixelRatio` 清晰渲染。
- 页面不可滚动、不可缩放（`AGENTS.md` 5.1）。

**测试**：手机与桌面浏览器各打开一次；Chrome DevTools 模拟 iPhone/Android；检查控制台无错误。

**禁止**：实现触摸交互；在 `app.js` 中实现游戏规则；修改逻辑模块。

**前置依赖**：Step 0

**参考**：`REFERENCES.md` §2.1 Step 1

**提示词**：
```text
任务：在 Canvas 上渲染 8×8 消消乐棋盘
范围：只允许修改 index.html、styles.css、app.js
验收：手机浏览器可见正方形棋盘，无滚动无缩放，颜色从 CONFIG.COLOR_COUNT 随机取
测试：python -m http.server 8000 + Chrome DevTools 模拟手机，手动打开验证
禁止：实现触摸交互，修改任何逻辑模块，硬编码颜色数
```

---

### Step 2：触摸交换 + 匹配检测

**目标**：实现滑动交换相邻格子，并实现横向/纵向 3 连匹配检测。

**范围**：允许修改 `app.js`、`board.js`、`match.js`、`config.js`、`tests/board.test.js`、`tests/match.test.js`；不允许修改 `special.js`、`score.js`、`obstacles.js`、`level.js`、`game.js`。

**验收**：
- 手指滑动相邻格子可交换。
- 交换后若无匹配，自动回退，不扣步数。
- 交换后若形成 3 连，匹配组被正确识别。
- 滑动阈值取自 `CONFIG.ANIMATION_CONFIG.swipeThreshold`。

**测试**：
- `node tests/board.test.js`：交换、回退、`hasPossibleMove`。
- `node tests/match.test.js`：横向 3 连、纵向 3 连、4 连、5 连、L 型、T 型的 `shape` 断言。
- 手动：滑动手感、误触、斜向滑动。

**禁止**：实现消除动画；实现计分；引入 `special.js` 逻辑。

**前置依赖**：Step 1

**参考**：`REFERENCES.md` §2.1 Step 2

**提示词**：
```text
任务：实现滑动交换与 3 连匹配检测
范围：允许改 app.js、board.js、match.js、config.js 及对应测试
验收：交换无效回退，3/4/5 连与 L/T 型 shape 被正确识别
测试：node tests/board.test.js 与 node tests/match.test.js 全绿；手机手动滑动验证
禁止：实现消除动画与计分；引入 special.js 逻辑
```

---

### Step 3：消除、下落、填充、级联

**目标**：实现完整的消除循环。

**范围**：允许修改 `board.js`、`match.js`、`app.js`、`config.js`、`tests/board.test.js`、`tests/match.test.js`、`tests/integration.test.js`；不允许修改 `special.js`、`score.js`、`obstacles.js`、`level.js`、`game.js`。

**验收**：
- 匹配组被清除，上方格子下落，顶部生成新格子。
- 下落填充后如再形成匹配，继续级联消除，直到无新匹配。
- 级联层数可被追踪。

**测试**：
- `node tests/integration.test.js`：断言最终棋盘与级联层数。
- 手动：构造 4 连、T 型级联，观察动画节奏。

**禁止**：实现特殊元素生成；实现计分与步数消耗；实现死局检测与重排。

**前置依赖**：Step 2

**参考**：`REFERENCES.md` §2.1 Step 3

**提示词**：
```text
任务：实现消除、下落、填充、级联
范围：允许改 board.js、match.js、app.js、config.js 及对应测试
验收：消除后下落填充，级联检测直到无新匹配，级联层数可追踪
测试：node tests/integration.test.js 断言最终棋盘与级联层数；手动观察动画
禁止：实现特殊元素生成、计分、步数消耗、死局检测与重排
```

---

### Step 4：计分、步数、游戏结束、最高分

**目标**：实现基础计分、步数限制、游戏结束与最高分存储。

**范围**：允许修改 `score.js`、`level.js`、`game.js`、`app.js`、`config.js`、`tests/score.test.js`、`tests/level.test.js`、`tests/game.test.js`。

**验收**：
- 每次有效交换扣 1 步。
- 基础分 = `matchedCells.length × CONFIG.SCORE_CONFIG.basePerCell`。
- 连消加分按 `CONFIG.SCORE_CONFIG.cascadeStep` 递增。
- 步数用尽时进入游戏结束 UI（页面内 UI，禁止 `alert`）。
- 最高分写入 `localStorage`，键名 `xxl_best_score`。
- `localStorage` 读写只在 `app.js` 中。

**测试**：`node tests/score.test.js`、`tests/level.test.js`、`tests/game.test.js` 全绿；手动完整玩一局。

**禁止**：实现特殊元素计分；实现三星评分；在逻辑模块中操作 `localStorage`。

**前置依赖**：Step 3

**参考**：`REFERENCES.md` §2.1 Step 4

**提示词**：
```text
任务：实现基础计分、步数、游戏结束、最高分
范围：允许改 score.js、level.js、game.js、app.js、config.js 及对应测试
验收：有效交换扣步，连消加分正确，游戏结束用页面内 UI，最高分存 localStorage
测试：node tests/score.test.js、level.test.js、game.test.js 全绿；手动玩一局
禁止：特殊元素计分、三星评分、逻辑模块操作 localStorage
```

---

### Step 5：移动端适配 + 动画打磨

**目标**：真机手感流畅、视觉舒适。

**范围**：允许修改 `app.js`、`styles.css`、`config.js`（仅 `ANIMATION_CONFIG`）；不允许修改逻辑模块。

**验收**：
- 消除动画、下落动画、级联间隔均取自 `CONFIG.ANIMATION_CONFIG`。
- 动画不阻塞逻辑更新。
- 色盲友好：普通动物在颜色之外有可区分的形状或图案。
- 刘海屏使用 `env(safe-area-inset-*)` 适配。
- 帧率达标（`AGENTS.md` 15 节）。

**测试**：真机与模拟器各跑一局；开启「色盲模拟」确认可区分。

**禁止**：引入动画库；改动任何规则逻辑。

**前置依赖**：Step 4

**参考**：`REFERENCES.md` §2.1 Step 5

**提示词**：
```text
任务：移动端适配与动画打磨
范围：允许改 app.js、styles.css、config.js 的 ANIMATION_CONFIG
验收：动画时长均取自配置，先更新状态再播动画，色盲友好，安全区适配，帧率达标
测试：真机跑一局，Chrome DevTools 性能面板检查帧率与色盲模拟
禁止：引入动画库，改动规则逻辑
```

---

### Step 6：死局检测与重排

**目标**：实现死局检测与重排。

**范围**：允许修改 `board.js`、`game.js`、`app.js`、`tests/board.test.js`；允许**读取** `CONFIG.ANIMATION_CONFIG.shuffleMaxTries`（如需调整其默认值，须先在 `DECISIONS.md` 记录）。

**验收**：
- 每次消除与填充完成后自动检测是否有可行交换。
- 无可行交换时，先提示，再重排。
- 重排满足 `AGENTS.md` 3.8 四条约束。
- 重排不消耗步数。
- 超过尝试上限时进入游戏结束流程。

**测试**：`node tests/board.test.js` 断言死局与重排；手动连续玩若干局。

**禁止**：改变障碍物布局；重排消耗步数；无限重试。

**前置依赖**：Step 5

**参考**：`REFERENCES.md` §2.1 Step 6

**提示词**：
```text
任务：实现死局检测与重排
范围：允许改 board.js、game.js、app.js、config.js 及 board.test.js
验收：每次消除后检测，无可行交换则提示并重排，重排满足宪法 3.8，不消耗步数
测试：node tests/board.test.js 断言死局与重排；手动观察
禁止：改变障碍物布局，重排消耗步数，无限重试
```

---

## 3. 第二阶段：开心消消乐核心机制

### Step 7：条纹糖果

**目标**：4 连生成条纹糖果，激活后消除整行或整列。

**范围**：`special.js`、`match.js`、`board.js`、`game.js`、`app.js`、`config.js`、`tests/special.test.js`。

**验收**：横向 4 连生成横向条纹，纵向 4 连生成纵向条纹；视觉有方向区分；激活后整行/列被清除。

**测试**：`node tests/special.test.js` 断言生成坐标与影响范围。

**禁止**：实现包装糖果与魔力鸟。

**前置依赖**：Step 6

**参考**：`REFERENCES.md` §2.2 Step 7

**提示词**：
```text
任务：实现条纹糖果（4 连生成，激活消除整行/列）
范围：允许改 special.js、match.js、board.js、game.js、app.js、config.js、tests/special.test.js
验收：横向 4 连→横向条纹，纵向 4 连→纵向条纹，激活后整行/整列清除
测试：node tests/special.test.js 断言生成坐标与受影响坐标集合
禁止：实现包装糖果与魔力鸟
前置依赖：Step 6
参考：REFERENCES.md §2.2 Step 7
```

---

### Step 8：包装糖果

**目标**：L/T 型 5 连生成包装糖果，激活后消除周围 3×3。

**范围**：同 Step 7。

**验收**：L 型与 T 型均被识别为 `wrapped`；激活后影响范围 3×3，边界处裁剪。

**测试**：`node tests/special.test.js` 断言 L 型与 T 型识别与影响范围。

**禁止**：实现魔力鸟。

**前置依赖**：Step 7

**参考**：`REFERENCES.md` §2.2 Step 8

**提示词**：
```text
任务：实现包装糖果（L/T 型 5 连生成，激活消除 3×3）
范围：允许改 special.js、match.js、board.js、game.js、app.js、config.js、tests/special.test.js
验收：L 型与 T 型均识别为 wrapped，激活影响 3×3 且边界裁剪
测试：node tests/special.test.js 断言形状识别与影响范围
禁止：实现魔力鸟
前置依赖：Step 7
参考：REFERENCES.md §2.2 Step 8
```

---

### Step 9：魔力鸟

**目标**：5 连直线生成魔力鸟，与任意普通色块交换可消除全屏该色。

**范围**：同 Step 7。

**验收**：5 连直线生成 `magic`；与普通色块交换后全屏该色被清除；不能与空格交换。

**测试**：`node tests/special.test.js` 断言生成与全屏清除。

**禁止**：实现特殊元素组合。

**前置依赖**：Step 8

**参考**：`REFERENCES.md` §2.2 Step 9

**提示词**：
```text
任务：实现魔力鸟（5 连直线生成，交换后消除全屏同色）
范围：允许改 special.js、match.js、board.js、game.js、app.js、config.js、tests/special.test.js
验收：5 连直线生成 magic；与普通色块交换清除全屏该色；不能与空格交换
测试：node tests/special.test.js 断言生成与全屏清除坐标集合
禁止：实现特殊元素组合
前置依赖：Step 8
参考：REFERENCES.md §2.2 Step 9
```

---

### Step 10：特殊元素组合

**目标**：实现 `AGENTS.md` 3.3 的六种组合效果。

**范围**：`special.js`、`game.js`、`app.js`、`config.js`、`tests/special.test.js`。

**验收**：六种组合均按 3.3 表格生效；优先级按 3.3 排序；组合触发时扣 1 步。

**测试**：`node tests/special.test.js` 逐一构造六种组合并断言影响坐标集合。

**禁止**：新增宪法未列出的组合类型。

**前置依赖**：Step 9

**参考**：`REFERENCES.md` §2.2 Step 10

**提示词**：
```text
任务：实现六种特殊元素组合效果
范围：允许改 special.js、game.js、app.js、config.js、tests/special.test.js
验收：六种组合按宪法 3.3 生效，优先级按 3.3 排序，组合触发扣 1 步
测试：node tests/special.test.js 逐一断言六种组合的影响坐标集合
禁止：新增宪法未列出的组合类型
前置依赖：Step 9
参考：REFERENCES.md §2.2 Step 10
```

---

### Step 11：冰块与雪块

**目标**：实现冰块与雪块障碍物。

**范围**：`obstacles.js`、`board.js`、`match.js`、`special.js`、`game.js`、`app.js`、`config.js`、`tests/obstacles.test.js`。

**验收**：冰块 1-3 层、雪块 1-5 层；不参与匹配；影响下落与交换；被波及减 1 层；得分按 3.5。

**测试**：`node tests/obstacles.test.js` 断言层数减少与得分。

**禁止**：实现藤蔓、巧克力。

**前置依赖**：Step 10

**参考**：`REFERENCES.md` §2.2 Step 11

**提示词**：
```text
任务：实现冰块与雪块障碍物
范围：允许改 obstacles.js、board.js、match.js、special.js、game.js、app.js、config.js、tests/obstacles.test.js
验收：冰块 1-3 层、雪块 1-5 层，不参与匹配，影响下落与交换，被波及减 1 层，得分按宪法 3.5
测试：node tests/obstacles.test.js 断言层数减少与得分
禁止：实现藤蔓、巧克力
前置依赖：Step 10
参考：REFERENCES.md §2.2 Step 11
```

---

### Step 12：关卡模式（50 关）与三星评分

> **关卡设计已先行定稿**：50 关的目标、步数、色数、障碍布局与三星阈值见 `LEVELS.md`（宪法 v1.13 登记为关卡设计的唯一真相源）。
> 本 Step 拆成两个子步骤分别验收（先例：Step 6.1、Step 18.1-18.7），**不得合并验收**。

**目标**：实现 3.6、3.7 的关卡目标与三星评分，并按 `LEVELS.md` 落地 50 关。

**范围**：`level.js`、`game.js`、`app.js`、`hud.js`、`config.js`、`tests/level.test.js`、`tests/integration.test.js`。

**验收**：
1. **Step 12.1（目标与三星引擎）**：支持 `score`、`collect`、`clearIce`、`mixed` 四种目标；Level.collected 与 Level.clearedIce 正确累加；步数用尽未达成则失败；三星只取决于分数；剩余步数按 3.5 转化；关卡目标与进度在 HUD 常驻可见（5.5）。
2. **Step 12.2（50 关落地 + 步数由难度派生）**：**步数不手写**，由 `computeStepBudget` 从难度派生（宪法 3.6 第 6 条 / `STEP_BUDGET`）；`level.js` 的关卡表与 `LEVELS.md` 的 50 关表**逐项一致**（关数、目标类型与参数、步数、色数、障碍布局的格数与层数、三星阈值）；通关后进入下一关；第 50 关通关后给出「全部通关」状态；关卡表满足 3.6 的五条关卡设计硬指标。

**测试**：`node tests/level.test.js` 断言四种目标判定、进度累加与三星计算；新增的关卡表巡检断言 50 关与 `LEVELS.md` 一致；`node _build/lint-levels.mjs` 复核文档自身。

**禁止**：实现道具系统；实现藤蔓/巧克力；改动 `LEVELS.md` 的硬指标（要改先改文档与宪法）。

**前置依赖**：Step 11

**参考**：`REFERENCES.md` §2.2 Step 12；`LEVELS.md`

**提示词**：
```text
任务：实现关卡模式（50 关）与三星评分
范围：允许改 level.js、game.js、app.js、hud.js、config.js、tests/level.test.js、tests/integration.test.js
验收：四种目标判定正确、进度正确累加、步数用尽未达成即失败、三星仅取决于分数、剩余步数按 3.5 转化；
      50 关的关卡表与 LEVELS.md 逐项一致，且满足宪法 3.6 的五条关卡设计硬指标
测试：node tests/level.test.js；关卡表巡检；node _build/lint-levels.mjs
禁止：实现道具系统、藤蔓/巧克力；擅自改 LEVELS.md 的硬指标
前置依赖：Step 11
参考：REFERENCES.md §2.2 Step 12；LEVELS.md
```

---

## 4. 第三阶段：扩展机制

### Step 13：更多障碍物（藤蔓、巧克力）

**目标**：实现藤蔓与巧克力。

**范围**：`obstacles.js`、`board.js`、`app.js`、`tests/obstacles.test.js`。

**验收**：藤蔓中动物不能交换但可被相邻波及；巧克力被相邻消除或特效波及时消除；重排不改变障碍物布局。

**测试**：`node tests/obstacles.test.js` 断言交换限制与波及消除。

**禁止**：绳索（宪法 3.4 列为第三阶段但未定义规则，需先补宪法）。

**前置依赖**：Step 12

**参考**：`REFERENCES.md` §2.3 Step 13

**提示词**：
```text
任务：实现藤蔓与巧克力障碍物
范围：允许改 obstacles.js、board.js、app.js、tests/obstacles.test.js
验收：藤蔓中动物不能交换但可被相邻波及；巧克力被相邻消除或特效波及即消除；重排不改变障碍物布局
测试：node tests/obstacles.test.js 断言交换限制与波及消除
禁止：实现绳索（宪法未定义规则）
前置依赖：Step 12
参考：REFERENCES.md §2.3 Step 13
```

---

### Step 14：关卡类型（水果关、时间关、金豆荚关）

**目标**：实现三种关卡类型。

**范围**：`level.js`、`game.js`、`app.js`、`config.js`、`tests/level.test.js`。

**验收**：水果关收集水果；时间关以时间替代步数；金豆荚需落到指定位置。

**测试**：`node tests/level.test.js` 断言三种关卡通关判定。

**禁止**：修改第一、二阶段已验收的关卡目标逻辑语义。

**前置依赖**：Step 13

**参考**：`REFERENCES.md` §2.3 Step 14

**提示词**：
```text
任务：实现水果关、时间关、金豆荚关三种关卡类型
范围：允许改 level.js、game.js、app.js、config.js、tests/level.test.js
验收：水果关收集水果；时间关以时间替代步数；金豆荚落到指定位置即通关
测试：node tests/level.test.js 断言三种关卡通关判定
禁止：修改已验收的关卡目标语义（金豆荚机制宪法未定义，需先在 DECISIONS.md 记录设计）
前置依赖：Step 13
参考：REFERENCES.md §2.3 Step 14
```

---

### Step 15：道具系统（刷新、加五步、小木锤）

**目标**：实现三种基础道具。

**范围**：`level.js`、`game.js`、`app.js`、`config.js`、`tests/level.test.js`。

**验收**：刷新不消耗步数重排；加五步增加 5 步；小木锤消除单个格子；道具数量持久化到 `localStorage`（读写只在 `app.js`）。

**测试**：`node tests/level.test.js` 断言道具效果。

**禁止**：在逻辑模块中直接操作 `localStorage`。

**前置依赖**：Step 14

**参考**：`REFERENCES.md` §2.3 Step 15

**提示词**：
```text
任务：实现刷新、加五步、小木锤三种道具
范围：允许改 level.js、game.js、app.js、config.js、tests/level.test.js
验收：刷新不消耗步数重排；加五步 +5；小木锤消除单格；道具数量持久化在 app.js 层完成
测试：node tests/level.test.js 断言三种道具效果
禁止：逻辑模块直接操作 localStorage
前置依赖：Step 14
参考：REFERENCES.md §2.3 Step 15
```

---

### Step 16：音效与震动反馈

**目标**：接入音效与震动。

**范围**：`app.js`、`styles.css`、`config.js`、`assets/`（该目录自本 Step 起启用，见 `AGENTS.md` 2.2 节与 `DECISIONS.md` D009）。

**验收**：消除、连消、特殊元素触发、游戏结束各有一处音效；支持静音开关；支持的设备上使用 `navigator.vibrate`。

**测试**：真机（iOS + Android）各验证一遍；静音开关刷新后保持（`localStorage`）。

**禁止**：引入音频库；音效文件不得提交来源不明或未授权的素材（许可证登记见 `REFERENCES.md` §5）。

**前置依赖**：Step 15

**参考**：`REFERENCES.md` §2.3 Step 16

**提示词**：
```text
任务：接入音效与震动反馈
范围：允许改 app.js、styles.css、config.js，新增 assets/ 音频
验收：消除/连消/特效/结束各一处音效，支持静音开关并持久化，支持 navigator.vibrate 且有兼容性检测
测试：真机验证；首次用户手势后才初始化 AudioContext
禁止：引入音频库；使用未授权素材
前置依赖：Step 15
参考：REFERENCES.md §2.3 Step 16
```

---

### Step 17：粒子动画与视觉打磨

**目标**：为消除、特殊元素触发、组合效果加入粒子动画。

> **完成记录（v1.27 / Step 17）**：新增纯逻辑模块 `particles.js`（固定容量环形池、生命周期、按事件种类的生成计划、确定性 PRNG、只读快照）+ `tests/particles.test.js`（7 例）；`candy.js` 新增 `buildParticleAtlas`（3 形状 × 6 色，布局时烘焙、每帧只 `drawImage`）；`render.js` 新增 `drawParticles`；`app.js` 把「生成 + 推进」挂到 `timeline` 的每帧回调上（生成只在相位切换时一次）。**强度分三档**（普通消除 3 颗/格 → 条纹 8 → 包装 10 → 魔力鸟 12 → 组合 14），方向按事件区分（向上扇形 / 双向直线 / 环形 / 全色相）。**验收数据**：本机 60 帧渲染循环平均单帧耗时、每帧 `drawImage` 调用数 ≤ `maxPerFrame`（96）、每帧路径 `shadowBlur` 计数 = 0、`prefers-reduced-motion` 下粒子数为 0 —— 取证见 `PROGRESS.md` 的 Step 17 记录与 `_build/verify-step17.mjs`。口径与替代方案见 `DECISIONS.md` **D044**。

**范围**：`app.js`、`styles.css`、`config.js`。

**验收**：粒子动画不影响帧率预算（`AGENTS.md` 15 节）；特殊元素触发有独特粒子效果。

**测试**：Chrome DevTools Performance 面板实测帧时间；`shadowBlur` 在每帧绘制路径中为 0（性能红线，见 `REFERENCES.md` §3.5）。

**禁止**：引入粒子引擎；在每帧绘制中滥用 `ctx.shadowBlur`。

**前置依赖**：Step 16

**参考**：`REFERENCES.md` §2.3 Step 17

**提示词**：
```text
任务：为消除、特效、组合效果加入粒子动画
范围：允许改 app.js、styles.css、config.js
验收：粒子不影响帧率预算（60fps，低端机 ≥30fps）；特效有独特粒子表现
测试：DevTools Performance 实测单帧耗时；确认每帧路径无 shadowBlur
禁止：引入粒子引擎；每帧滥用 shadowBlur
前置依赖：Step 16
参考：REFERENCES.md §2.3 Step 17
```

---

### Step 18：Capacitor 打包为 Android/iOS（软件交付阶段）

**目标**：在不改变已验收游戏规则语义的前提下，将完成冻结的 H5 游戏包装为可重建、可安装、可验证、可回滚的 Android/iOS 原生应用候选版本。

**总前置依赖**：Step 17 已验收；本文件 §0.1 Bug Audit Gate 已通过；至少保留一个可回退的 Git tag 或提交；用户明确批准为打包引入 Capacitor 依赖、平台工程和必要的构建脚本。

**为什么单独批准**：项目此前的零依赖约束仍适用于 H5 游戏本体。Capacitor 属于 Step 18 为“原生包装”引入的显式例外，必须在 `DECISIONS.md` 记录批准范围、目标平台、包名、产物保存位置和不纳入仓库的密钥规则；未经批准不得修改 `package.json` 的零依赖状态。

**总禁止项**：

- 不借打包之名推进 Step 8-17 的玩法、规则数值或 UI 重构。
- 不把 keystore、密码、Apple 签名证书、Provisioning Profile、API token 或个人设备标识提交到仓库、日志或截图。
- 不把“生成工程”“本机能编译”“已安装”“真机功能通过”“商店可提交”混为同一验收结论。
- 不通过在 `android/` 或 `ios/` 中复制业务逻辑来绕过 Web 代码问题；发现 WebView 行为差异时，先写复现与回归测试，再决定应改 Web 层还是原生配置。

#### Step 18.1：交付立项、环境盘点与功能冻结

**目标**：在任何依赖或平台目录落地前，明确本次包装的边界、平台条件和可验证能力。

**范围**：`ROADMAP.md`、`PROGRESS.md`、`DECISIONS.md`、`README.md`，以及环境检查输出；不改游戏源码、不安装或升级依赖。

**执行清单**：

1. 固定候选源码：记录 commit/tag、当前 `git status`、`node --version`、包管理器版本和操作系统。
2. 执行 §0.1 Bug Audit Gate；明确 Step 7 之后仍未实现的包装糖果、魔力鸟、组合效果和第二阶段障碍物等功能不属于本次回归目标。
3. 写出目标矩阵：Web 浏览器、Android 模拟器/真机、iOS 模拟器/真机；对没有的设备或系统明确写“未验证”。
4. 确认 Capacitor 官方当前支持的 Node、Android Studio/SDK、macOS/Xcode 等要求，并把实际安装版本写入 `PROGRESS.md`，不在路线图中硬编码会过期的工具版本。
5. 明确应用名称、反向域名格式的唯一包标识、初始版本号、版本号递增规则、产物命名规则和责任人；包标识一旦发布不得随意更改。
6. 明确本地数据预期：最高分等现有 `localStorage` 数据在“应用更新”“强制结束”“卸载重装”三种场景的预期和实际观察必须分别记录，禁止把本地存储写成云端同步。

**验收门禁**：

- P0/P1 为 0，L1 自动回归和 L2 浏览器冒烟均有可追溯记录。
- `DECISIONS.md` 已记录 Capacitor 例外批准和密钥不入库规则。
- Android 与 iOS 的可执行环境、缺失环境和负责人均已写明；Windows 只能把 iOS 标为“待 macOS/Xcode 验证”。
- 有明确的回滚 commit/tag 和未污染工作区。

**失败处理**：若 Bug Audit 未通过，停止在 18.1，先修缺陷；若没有用户批准或平台环境，保留方案与未验证状态，不创建半成品平台目录。

**前置依赖**：Step 17、§0.1

**参考**：`REFERENCES.md` §2.3 Step 18、§0.1

#### Step 18.2：Web 资源目录与 Capacitor 初始化

**目标**：把当前“由静态服务器直接读取源码”的 H5 运行方式，转化为 Capacitor 可以确定性复制的 Web 资源目录。

**范围**：经 18.1 批准后，允许改 `package.json`、新增 `capacitor.config.*`、最小化资源准备脚本、`www/`（或另一个明确的 `webDir`）及 `.gitignore`；不得改游戏规则模块。

**执行清单**：

1. 定义一个可重复生成的 Web 资源目录，例如 `www/`。目录根必须含 `index.html`，并包含运行所需的 CSS、ES Module、资源与相对路径；不能以手工复制作为长期流程。
2. 为无构建工具项目编写最小化资源准备命令，例如 `npm run stage:web`。命令只能复制/校验交付资源，不能暗中压缩、转译或修改规则逻辑；每次输出前清理旧资源时必须限于已确认的 `webDir`。
3. 在本机 HTTP 服务下同时验证源码根目录与 `webDir`：页面可启动、ES Module 可加载、相对资源无 404、`index.html` 保留 `<head>`。
4. 按当时官方 Capacitor 文档安装核心、CLI 和目标平台包，初始化配置并明确 `appId`、`appName`、`webDir`。依赖版本统一锁定，不能混装不同主版本。
5. 只添加需要的平台：先 `npx cap add android`；只有在 macOS/Xcode 可用或确定交给对应环境后，才添加 iOS。生成的 `android/`、`ios/` 是可审查的平台源码，不是可随意删除的缓存。
6. 每次 Web 资源变化遵循同一顺序：生成 `webDir` → 运行资源检查 → `npx cap sync <platform>` → 在平台上测试；不得只改源码而忘记同步。

**建议命令序列（先在 `DECISIONS.md` 记录精确的同版本族，再以执行当天官方文档核对）**：

```powershell
npm run stage:web
$capVersion = "<执行当天批准的 Capacitor 版本>"
npm install --save-exact "@capacitor/core@$capVersion"
npm install --save-dev --save-exact "@capacitor/cli@$capVersion"
npx cap init
npm install --save-exact "@capacitor/android@$capVersion"
npx cap add android
npx cap sync android
```

iOS 在具备 macOS/Xcode 环境时按相同版本族添加 `@capacitor/ios@$capVersion` 和 `npx cap add ios`。`$capVersion` 必须先替换为已批准且与 CLI/runtime 同主版本的精确版本；命令执行前先确认 `webDir` 已实际存在且包含 `index.html`，并把 `npx cap init` 的交互填写值记录到 `DECISIONS.md`。`npx cap sync` 不替代 Web 资源准备。

**验收门禁**：

- Web 资源目录能由空目录重复生成，两次生成的文件清单一致（时间戳差异不计入内容差异）。
- L2：以 `webDir` 为根打开的页面能完整进入游戏，浏览器控制台没有新增错误或资源 404。
- Capacitor 配置的 `appId`、`appName`、`webDir` 与 18.1 决策一致，且 `npx cap sync android` 成功复制资源。
- 新增依赖、锁文件、平台目录和忽略规则的 diff 已人工审查；密钥和 build 输出不在 Git 暂存区。

**失败处理**：发现白屏、模块加载失败或资源路径错误时，先保留最小复现，修复资源准备过程并从空 `webDir` 重跑；禁止通过在原生工程中手工塞入旧资源掩盖问题。

**前置依赖**：18.1

**参考**：`REFERENCES.md` §2.3 Step 18.2

#### Step 18.3：WebView 兼容性与原生能力边界

**目标**：验证游戏在原生 WebView 中仍使用同一份 Web 逻辑，并为音效、震动、存储、生命周期和安全区建立可降级边界。

**范围**：允许改 `app.js`、`input.js`、`styles.css`、`config.js`、必要的 Capacitor 配置与对应测试，但每一处改动必须有 Web 与原生复现依据；不得在原生代码复制匹配、计分、棋盘或关卡规则。

**检查项**：

1. **页面与模块**：ES Module、相对 URL、Canvas DPR、安全区 CSS、竖屏提示和禁止滚动/缩放在 WebView 中不白屏、不丢样式。
2. **触摸与生命周期**：首触摸、滑动方向锁、动画期间输入锁、前后台切换/进程恢复后画面和状态不异常；旋转若不支持，必须保持可读提示而非布局错乱。
3. **存储**：首次启动、完成一局、强制关闭后重启、同包升级后，验证 `localStorage` 的实际表现；失败时提供不崩溃的降级提示，不假定跨安装保留数据。
4. **音频与震动**：音频仍只在用户手势后初始化；震动必须特性检测且无支持时静默降级。iOS/某些 WebView 不支持的能力只能报告“不可用/未验证”，不能伪造反馈。
5. **权限与网络**：当前离线游戏不应请求无关权限、不应依赖远端 CDN、不得包含密钥；若以后引入原生插件，先在 `DECISIONS.md` 定义用途、权限、Web 降级和隐私影响。

**验收门禁**：

- Android WebView 至少完成一次有效交换、一次无效交换、一次消除/下落/补充、游戏结束与重开（L4 前置冒烟）。
- 所有差异均归类为：已修复、平台不支持但可降级、待验证；没有“应该能用”的模糊结论。
- 若改了 Web 层，重新通过 `node tests/run-all.js`、浏览器 L2 冒烟和目标平台同步后的复测。

**失败处理**：先记录设备/系统/WebView 版本、重现步骤、控制台或原生日志；只在确认属于原生包装配置时改平台工程，其他情况回到 Web 代码修复并回归浏览器。

**前置依赖**：18.2

**参考**：`REFERENCES.md` §2.3 Step 18.3

#### Step 18.4：Android Debug 构建、安装与真机冒烟

**目标**：在 Android Studio/SDK 环境中构建可安装的 Debug 版本，并获得明确标注为 L4-模拟器或 L4-真机的 Android 证据。

**范围**：`android/`、Capacitor 配置、资源准备脚本、必要的 Android 图标/启动图资源和文档；不得修改游戏规则语义。

**执行清单**：

1. 检查 Android Studio、SDK、可用模拟器或 USB 调试真机；将实际工具和设备信息记录到 `PROGRESS.md`。
2. 运行 `npm run stage:web` 与 `npx cap sync android`，再使用 `npx cap run android` 或 Android Studio 打开/构建项目。优先用 IDE 查看 Gradle、Manifest 和 WebView 日志，不把构建输出截断后当成成功。
3. 安装 Debug APK 后执行最小流程：冷启动、开始一局、有效/无效交换、消除与下落、步数、结束面板、最高分重启后读取、后台切回、旋转/窄屏、无网络启动。
4. 真机额外验证触摸滑动、页面不滚动、音频在用户交互后播放、震动是否由设备实际支持；设备不支持的反馈必须记为降级而非失败或通过。
5. 记录应用包名、版本、构建类型、设备型号、Android 版本、安装方式、日志结论和产物校验值。Debug APK 只作为测试证据，不等同于可发布包。

**验收门禁**：

- Android 工程可从干净依赖状态完成同步和 Debug 构建。
- 模拟器或真机可安装、冷启动无白屏，核心一局流程与 L2 浏览器结果一致。
- 至少一台 Android 真机完成触摸与本地存储冒烟时，才能标 L4-真机；若只有模拟器，只能标 L4-模拟器，不能声称真机验证。
- 不出现新增权限、未解释的网络请求、密钥文件或 Native 崩溃。

**失败处理**：构建问题先保留完整 Gradle/Android Studio 错误；安装冲突先核对包名与旧应用；WebView 白屏先检查 `webDir`、同步日志和资源清单。修复后必须从 `stage:web` 和 `sync` 重新开始验证。

**前置依赖**：18.3、Android 环境已就绪

**参考**：`REFERENCES.md` §2.3 Step 18.4

#### Step 18.5：iOS 构建、模拟器与真机验证

**目标**：在 macOS/Xcode 环境中为同一候选源码完成 iOS 原生工程构建和可区分的 L5 证据。

**范围**：`ios/`、Capacitor 配置、iOS 图标/启动图、必要的 `Info.plist` 使用说明和文档；不得在 iOS 原生层重写游戏逻辑。

**环境边界**：iOS 构建、签名和真实设备验证需要 macOS、Xcode 及对应 Apple 工具链。在 Windows 上只能准备 Web 资源与 iOS 工程配置，所有 iOS 结论必须写“未验证”，不能用 Android 结果替代。

**执行清单**：

1. 在 macOS 上从同一 commit 安装已批准的依赖，执行 `npm run stage:web`、`npx cap sync ios`，再用 `npx cap open ios` 或 Xcode 打开工程。
2. 先跑 iOS 模拟器冒烟：启动、Canvas 适配、基本交换、存储重启、窄屏、安全区、横竖方向提示；模拟器不替代真实触摸、音频路由、震动验证。
3. 具备设备和签名资格时，安装到真机验证冷启动、触摸、后台切回、存储、音频、无网络启动与安全区；记录设备和 iOS 版本。
4. 任何需要权限的原生能力必须有最小化 `Info.plist` Usage Description，且内容与实际功能相符。当前无此能力时不得预先添加无关权限文案。
5. 如出现插件未注入、Pod/包管理或 Xcode 缓存问题，先保存完整错误并在 `PROGRESS.md` 记录，不在 Windows 端臆测“已修复”。

**验收门禁**：

- L5-模拟器：iOS 模拟器可以构建、启动且完成核心流程；L5-真机：只有具备真实设备、安装记录和设备冒烟结果时才可声明真机通过。
- `Info.plist`、Bundle Identifier、显示名称和版本与 18.1/18.6 的交付信息一致。
- iOS 不支持或尚未验证的震动、音频、存储差异有明确降级或待办记录。

**失败处理**：缺少 macOS/Xcode 时停止在“iOS 待验证”，不阻塞 Android Debug 证据，但阻止“Android/iOS 均已支持”或 L6 发布候选结论。

**前置依赖**：18.3、macOS/Xcode 环境已就绪

**参考**：`REFERENCES.md` §2.3 Step 18.5

#### Step 18.6：Release 构建、签名、版本与合规材料

**目标**：把已通过平台冒烟的候选版本转化为可追溯的 Release 构建输入，准备渠道提交所需的最小合规材料。

**范围**：平台工程中的版本/资源/签名引用配置、图标与启动图、隐私说明、发布说明、构建脚本和 `.gitignore`；禁止提交签名私钥或将内部测试包误标为正式发布包。

**执行清单**：

1. **版本治理**：定义产品版本、Android versionCode/versionName、iOS build number/marketing version 的映射和递增规则；每一个外发包都关联源码 commit、依赖锁文件和构建时间。
2. **应用标识与视觉资源**：确认 Android application ID、iOS Bundle ID、显示名称、图标、启动图与渠道资料一致。素材必须为自制、用户提供或已授权素材，来源和许可证按 `REFERENCES.md` §5 登记。
3. **签名隔离**：密钥、证书、Provisioning Profile、密码和商店账号只保存在受控的本地凭据或 CI 密钥库；仓库只保留示例变量名和加载说明，绝不保留真值。
4. **最小权限和隐私**：逐项审查 Android Manifest 与 iOS Info.plist，删除未使用权限；准备数据收集、离线存储、广告/分析 SDK（若无则明确无）和儿童/内容分级等渠道所需说明。渠道政策以提交当天官方要求为准。
5. **Release 构建**：用 Android Studio/Xcode 或已审查的 CI 生成渠道需要的签名产物。Android 的 APK/AAB、iOS 的 Archive/IPA 是不同交付物，按目标渠道选择并分别记录；生成文件先校验签名和版本，再交付测试。

**验收门禁**：

- 版本、包标识、图标、应用名称和隐私说明没有相互矛盾。
- Release 构建可从固定 commit 和受控凭据重建，且构建日志能定位到工具版本与输入。
- 签名材料不在 Git 追踪、终端回显、截图或 `PROGRESS.md` 中；扫描暂存区无敏感文件。
- 没有因 Release 配置引入未解释权限、调试服务器地址、测试证书或远程调试开关。

**失败处理**：签名、合规或渠道资料不全时，停留在“技术候选/内部测试”，不能标记为可提交商店；不要通过临时关闭安全检查或提交密钥解决问题。

**前置依赖**：18.4，iOS 目标还需 18.5

**参考**：`REFERENCES.md` §2.3 Step 18.6

#### Step 18.7：发布候选回归、产物归档与回滚演练

**目标**：用独立的发布候选测试证明产物可安装、可升级、可复现，并保留故障时回到已知版本的路径。

**范围**：测试记录、发布说明、产物清单、校验值、Git tag、`PROGRESS.md`、`DECISIONS.md`；仅为修复已复现的发布阻塞缺陷修改最小代码。

**发布候选测试矩阵**：

| 场景 | 必须记录的结论 |
|---|---|
| 全量自动回归 | 命令、用例/断言、退出码、源码 commit |
| 新安装 | 安装、冷启动、核心一局流程、无白屏/崩溃 |
| 覆盖升级 | 旧测试包升级到候选包后可启动；最高分等本地数据的实际结果与预期一致 |
| 卸载重装 | 明确记录沙盒数据是否清除；不得把清除误报为数据损坏或云端保留 |
| 强制结束/前后台 | 回到应用后画面、输入和本地状态可解释，无卡死 |
| 离线启动 | 不依赖网络/CDN 的核心游戏仍可启动和玩一局 |
| 平台边界 | Android 与 iOS 分别记录；缺少 iOS 真机/签名时仍为未验证 |
| 视觉与可访问性 | 安全区、窄屏、文字可读性、色盲图案、滚动/缩放禁用、性能采样结论 |

**归档清单**：

1. 记录发布候选的 tag、commit、依赖锁文件摘要、平台工具版本、包标识、版本号、产物文件名、SHA-256、构建日志位置和测试设备矩阵。
2. 发布说明只写已验证的平台和限制；例如“Android 真机已验证，iOS 待 macOS/Xcode 验证”，不能简写成“全平台已发布”。
3. 产物放入约定的受控交付目录或发布系统，避免把大型 APK/IPA 和签名材料误提交到源码仓库；仓库只保留可重建脚本和清单。
4. 发生阻塞缺陷时：回到固定 tag/commit → 修复最小问题 → 增加回归证据 → 重新递增构建版本并生成新包。不要把旧 Release 包直接覆盖为新版本，也不要依赖未记录的手工改动回滚。

**最终验收门禁**：

- Android 要声称“可交付”至少有 L4 真机安装、Release 产物和 18.7 回归证据；iOS 同理至少有 L5 对应环境证据。
- 要声称“Android/iOS 均可交付”必须两平台分别完成上述证据，不能互相替代。
- 要声称“商店准备完成”必须达到 L6：签名产物、版本/隐私/权限资料、目标渠道要求和发布候选矩阵均已完成并归档；实际审核通过另行记录，不能提前承诺。
- 任一 P0/P1、无法复现的构建、未知权限、未归档签名或未经记录的平台差异都阻止最终勾选。

**前置依赖**：18.6

**参考**：`REFERENCES.md` §2.3 Step 18.7

**提示词**（Step 18.1-18.7 统一模板）：
```text
任务：按 ROADMAP.md Step 18.<子步骤> 将冻结的 H5 消消乐包装为 Capacitor 候选版本
开始前：先执行 ROADMAP §0.1 Bug Audit Gate，读取 DECISIONS.md 的 Capacitor 例外批准，确认当前 commit/tag、目标平台和可用环境
范围：只改本子步骤列出的文档、资源准备、Capacitor 配置或平台工程；不得推进 Step 8-17 玩法，不得重写游戏规则
证据：按 §0.2 标注 L0-L6；分别报告“已验证 / 仅代码审查 / 未验证”，Windows 上 iOS 一律标未验证
验收：完成本子步骤门禁并将命令、版本、设备、产物和失败边界写入 PROGRESS.md
安全：不提交密钥、证书、个人设备信息或签名密码；不把 Debug 包说成发布包
失败：保留完整错误和最小复现，按本子步骤失败处理回滚或修复后从 stage:web 与 cap sync 重新验证
参考：REFERENCES.md 对应 Step 18.<子步骤>
```

---

## 4.1 新增 Step 19：藤蔓地图 + 存档演进（用户提案，19.1 已落地）

### Step 19：藤蔓地图与存档演进

**目标**：把静态的 10×5 选关网格升级为**藤蔓攀爬地图**，同时让本地存档可迁移 —— 为将来换存储介质（Tauri 文件 / IndexedDB）与软件化预留。用户提案见 `DECISIONS.md` D037（含逐条评审结论）。

**拆分与状态**：

| 子步骤 | 内容 | 状态 |
|---|---|---|
| **19.1** | 存档版本化 + 就地迁移 + 可注入 backend + `totalStars` 改派生函数 | **已完成**（宪法 v1.21） |
| **19.2** | 藤蔓地图（只读视觉层：SVG 藤蔓 + 关卡节点 + 星级，只画不加门槛）；坐标三件套（**归一化 0–1**）+ 确定性路径（**单条平滑贝塞尔**，锚点进 config）；改写 `verify-step12b` | **已完成**（宪法 v1.23 首版 / **v1.24 按用户修订方案重做**：归一化坐标、有机曲线、节点状态机、星星 +40%、呼吸光效、翻页箭头 + 总星数进度条、叶子点缀；`_build/verify-step19-2.mjs` 全绿，`verify-step12b` 仍绿，`check-vine-map.mjs` PASS —— 见 DECISIONS D040） |
| **19.3** | 解锁门槛（`unlockStars`）与「天边关卡」云层 + 隐藏关 | **已完成**（宪法 v1.28 / D045）：只按**累计星数**解锁（`round((n−1) × 1.2)`，第 50 关 59 星，第 1 关恒解锁，**已通关的关卡永远可玩**）；**天边云层**（120 星）散去后露出隐藏关 51–53（水果/时间/金豆荚演示关，**不计入** ⭐ n/150）；地图扩到 6 页、节点状态机三态（新增 `locked`）、点锁定关卡被拒并弹提示；**解锁状态是派生量，存档格式不变** |
| **19.4** | 藤蔓地图**从下往上** + 画风增强（参考其他消消乐源码） | **已完成**（宪法 v1.29 / D046，玩法零改动）：新增 `VINE_MAP_CONFIG.climbDirection = 'up'` —— 页内最下方是第 1 个节点、关号越大越靠上；锚点入口在页内底部、出口探出页顶（跨屏条件翻转为 `入口 y − 1 ≈ 出口 y`）；画风：分层背景（渐变天空 + 两层远山 + 地面）、双层藤蔓、节点内嵌高光、锁定节点锁形图标、**当前关指针**、云层漂移、进度条渐变 |
| **19.5** | 把「左右翻页」换成**「藤蔓向上蔓延」**（世界坐标 + 视口内纵向平移） | **已完成（已收口）**（宪法 v1.30 / **D047**，玩法零改动、**保留 19.3**）：`LEVEL_MAP_POS` 改**世界归一化坐标**（`{id,x,y}`，y 相对世界总高）、世界总高 = `height × worldHeightRatio`(6.5)、世界用一张 SVG + 外层**统一缩放**；**进入地图当前关自动居中**、拖拽（触摸 + 鼠标）+ 惯性 + `▲`/`▼` + **「回到当前关」**取代分页；路径改为**一条贯穿世界**的贝塞尔；**两层视差**（远山 0.25× / 150 个确定性星光 1.45×）与随世界高度的天空渐变；`tianbianBand` **云带**取代「第 6 页」。证据：L1 **263 用例 / 3334 断言 / 0 失败**、`check-vine-map` **20 项 PASS**、`_build/shot-map-195.mjs` **35 项 PASS + 4 张截图**；**收口**：`verify-step19-2`（48/0）/`verify-step12b`（21/0，含真实触摸滑动 1:1 跟手）/`verify-step19-3`（46/0）/`verify-step19-4`（18/0）四个套件完成**规则变更式改写**，`shot-map-194.mjs` / `s19-2-probe.mjs` 退役；**Gate 0.1 第十六轮**（`_build/gate16.ps1`，24 套件 + 8 复跑）主轮 22 PASS，两处红按「改写过时断言 + 复跑时序抖动」收口（登记 P3-K/P3-L），`rt-snapshot` drift: none |
| **软件化** | 软件化（Tauri 还是保留 Capacitor；工具链、前端零改动加载、存档双写） | 挂起 —— 需改 2.1/0.3 与 Step 18，属用户拍板项（**阶段项，不占 Step 号**；Step 20 已被结算阶段占用，见 §4.2） |

**19.2 的范围**：`vine-map.js`（新模块）+ 坐标数据（落 `level.js` 的表或独立数据文件，二者只能有一个真相源）+ 样式 + `index.html` 的 SVG 容器；`hud.js` 的 `drawLevelSelect`/`render.js`/`app.js` 的 canvas 命中链路换成 DOM 事件；`_build/check-vine-map.mjs` 巡检文档与代码表一致。**路径必须确定性**（固定种子 PRNG 或直接写控制点），符合「设计期派生：同一配置永远同一结果」。

**19.2 的验收**：`index.html?screen=select`（或等效入口）下 50 个节点可见、每节点带 `data-level`/`data-stars`/`aria-label`；点按进关；星级来自 `storage.js`；改写后的 `verify-step19-2` 全绿；`verify-step12b` 改为 DOM 版后仍绿；页面仍不可滚动（5.1，按选定的滚动口径处理）。

**19.2 的禁止**：引入解锁门槛（属 19.3）；引入任何外部依赖或构建工具（2.1）；让地图层读游戏状态或写存档（2.3）；把坐标写进两个真相源。

**19.2 的前置依赖**：Step 19.1（已完成）；用户对**滚动口径**的拍板。

**19.2 的参考**：用户提案 §1.1/§1.4（SVG + 确定性路径 + 一屏翻页）。

**提示词**：
```text
任务：实现 Step 19.2 藤蔓地图（只读视觉层）
开始前：读 AGENTS.md（2.3/5.1/6）、ROADMAP Step 19、DECISIONS D037、PROGRESS 的 19.1 记录，确认滚动口径
范围：新增 vine-map.js 与样式、index.html 加 SVG 容器、改写 hud/render/app 的选关链路为 DOM 事件、坐标三件套与巡检脚本
验收：50 节点可见可点、星级正确、页面不可滚动、改写后的 verify-step12b 与新增 verify-step19-2 全绿
禁止：解锁门槛（属 19.3）、新依赖/构建工具、地图层读写游戏状态或存档、坐标出现两个真相源
前置依赖：Step 19.1
```

---

## 4.2 新增 Step 20：结算阶段与星级统一动态调整（用户方案，已落地）

### Step 20：结算阶段（余步 → 特殊糖果 → 连锁引爆）+ 星级统一动态调整

**目标**：把「过关后剩余步数的处理」从一个**平坦加分**升级为**独立的结算阶段** —— 剩余步数先给**递增制奖励分**，再把每一步变成一颗**随机特殊糖果**，然后**从棋盘底部到顶部逐颗连锁引爆**；星级阈值随之改为**一条公式统一动态派生**（含结算期望分修正），避免结算阶段把 50 关的星级经济冲垮。

**编号说明**：用户方案里建议作为「19.3.1–19.3.4」，本路线图**落在 Step 20.x** —— `19.3` 的「解锁门槛 / 天边关卡」名额**保留**（它仍需先批准规则），§4.1 表里原来的那行 `20`（软件化）是**阶段项、不占 Step 号**，已改名以免与本步冲突。

**拆分与状态**：

| 子步骤 | 内容 | 状态 |
|---|---|---|
| **20.1** | 结算阶段：余步 → 递增奖励分 + 随机特殊糖果 → **队列式连锁引爆**（新增 `settlement.js` 与 `game.settleEndgame`）；`resolveBoard({ final: true })` 在结算期间跳过 3.8 的重排；`timeline.js` 加一帧「转化定格」 | **已完成**（宪法 v1.25） |
| **20.2** | 结算计分：递增奖励分（`settlementStepsScore`）+ 连锁引爆分（**沿用 3.5 的特效倍数表，不另起一套**）；删除平坦的「每剩余一步 30 分」 | **已完成**（宪法 v1.25） |
| **20.3** | 星级统一动态派生：`level.computeStarThresholds` + `STAR_CONFIG.settlementCoverage` + `SETTLEMENT_CONFIG.typicalRemainingRatio`（**由 300 局实测标定**）；`LEVELS.md` 的阈值列改为公式输出 | **已完成**（宪法 v1.25） |
| **20.4** | 彩星（`rainbow`）字段预留与存档迁移（`levels` 的值由数字改为 `{ stars, rainbow }`，`schemaVersion` 1 → 2） | **已完成**（宪法 v1.26 —— 只做「字段 + 迁移」，彩星**分数线**仍属后续调优，见 `DECISIONS.md` D042） |

**20 的范围**：`settlement.js`（新模块）+ `level.js`（`computeStarThresholds`、删 `getRemainingStepBonus`）+ `game.js`（`settleEndgame` / `applyConversion` / `chainDetonations`）+ `timeline.js` 与 `app.js`（转化定格阶段与日志）+ `config.js`（`SETTLEMENT_CONFIG` 等）+ `LEVELS.md`（阈值列）+ `tests/settlement.test.js`。

**20 的验收**：`node tests/run-all.js` 全绿；`python _build/consistency_check.py` 全绿；`node _build/lint-levels.mjs` 与 `node _build/check-level-table.mjs` PASS；`node _build/measure-step20.mjs` 能给出通关余步分布、结算贡献占比与星级分布（阈值标定依据）；浏览器里过关后**先看到转化定格、再看到连锁引爆**，结束面板的星级与最终分一致。

**20 的禁止**：把结算阶段做成会消耗步数的阶段（1.5：结算阶段不再消耗步数）；让结算阶段使用**运行时随机**（必须是固定种子的受控伪随机）；为连锁引爆另起一套倍数表（必须沿用 3.5）；顺手实现彩星（属 20.4，需先批准）。

**20 的前置依赖**：无 —— Step 12.3 的「结束前引爆」是本步的直接前身，本步把它升级为完整的结算阶段。

**20 的参考**：用户提交的结算阶段方案（余步转特殊糖果 + 连锁引爆计分 + 星级动态调整）与 `DECISIONS.md` D041。

**提示词**：
```text
任务：实现 Step 20 结算阶段（余步 → 递增奖励分 + 随机特殊糖果 → 从棋盘底部到顶部连锁引爆）与星级统一动态调整
开始前：读 AGENTS.md（3.5 / 3.6 第 7 条 / 3.7 / 4.2 / 附录 B）、ROADMAP Step 20、DECISIONS D041、PROGRESS 的 Step 20 记录
范围：新增 settlement.js；level.js 加 computeStarThresholds 并删 getRemainingStepBonus；game.js 加结算阶段；timeline/app 加转化定格；config 加 SETTLEMENT_CONFIG；LEVELS.md 阈值列改公式输出
验收：node tests/run-all.js 全绿；consistency_check.py 全绿；lint-levels / check-level-table PASS；measure-step20 给出标定数据；浏览器里先转化定格再连锁引爆
禁止：结算阶段消耗步数、运行时随机、另起一套特效倍数、顺手做彩星字段
前置依赖：无（Step 12.3 是其前身）
```

---

## 4.3 新增 Step 21：对局 UI 视觉升级（用户方案「糖果质感 / 果汁感」）

### Step 21：对局界面的「果汁感」升级（HUD / 道具栏 / 棋子）

**目标**：把对局界面从「几何极简」升级到「糖果质感」。用户方案原文：「优先做**目标进度条、棋子拟人化、彩色化、道具按钮 3D 化**这三步，界面的『开心』感立刻就能出来」；用户已拍板**三步全做**。**玩法零改动**（计分、步数、目标、星级、关卡表一律不动），只改信息层与外观。

**拆分与状态**：

| 子步骤 | 内容 | 状态 |
|---|---|---|
| **21.1** | HUD 果汁化：目标**进度条**（含达标闪烁）、步数 ≤5 **心跳缩放**、分数**向上飘字**、HUD **卡片化**（圆角 + 内嵌高光 + 烘焙阴影）、连击文字走既有 `drawBanner` 通道 | **已完成**（v1.31，`_build/step21-hud-*.png`） |
| **21.2** | 道具栏与设置：计数改**右上角红色圆形徽章**、按钮加图标 + 糖果质感 3D 描边、「音效 / 震动」收成**设置齿轮弹层** | **已完成**（v1.32，`_build/step21-booster-*.png`） |
| **21.3** | 棋子拟人化与质感重烘焙：6 色 × 5 状态 = **30 张精灵**（高光 / 厚投影 / 小眼睛与腮红），仍**布局期一次性烘焙** | **已完成**（v1.35，`_build/step213-sheet.png` / `step213-board.png`） |

**21 的范围**：`config.js`（`HUD_CONFIG`）、`hud.js`（目标进度条 / 步数心跳 / 飘字池与绘制）、`render.js`（静态图层里的卡片烘焙 + 飘字绘制）、`app.js`（把 `nowMs` 与飘字池接进帧循环）、`index.html` + `styles.css`（21.2 的道具栏与设置齿轮）、`candy.js`（21.3）、`tests/hud.test.js`（新文件）。

**21 的验收**：`node tests/run-all.js` 全绿；`python _build/consistency_check.py` 全绿；浏览器里 HUD 出现**目标进度条**且达标变色、**步数 ≤5** 时数字心跳、消除时**分数向上飘字**且飘完回收；棋子在高光/投影上肉眼可辨；**每帧绘制调用仍 ≤ 200**（15 节）；**每个子步出截图交用户确认后再继续**。

**21 的禁止**：改任何玩法数值或规则；引入素材或依赖（零素材 D009，全部程序化画）；**每帧**使用 `shadowBlur` 或渐变（只能布局期烘焙，见 D043/D044）；把 HUD 挪到 DOM（2.3：HUD 与棋盘在 canvas，道具条与地图是 DOM）；破坏 `--booster-bar-h` 的布局契约（21.2 必须保住它，它决定 `computeBoardSize`）。

**21 的前置依赖**：Step 19.5 已收口（tag `step19.5-done` / `gate-0.1-step19.5-pass`）；用户已批准完整方案。

**21 的参考**：用户提交的「对局核心界面 UI 优化方案」（HUD / 棋盘与棋子 / 道具栏三段 + 「缺失的灵魂元素」五条）；`DECISIONS.md` **D048**。

**提示词**：
```text
任务：实现 Step 21 对局 UI 视觉升级（21.1 HUD 果汁化 → 21.2 道具栏与设置 → 21.3 棋子拟人化）
开始前：读 AGENTS.md（2.3 / 5.1 / 15 / 附录 B）、ROADMAP.md §4.3、DECISIONS.md D048、PROGRESS.md 的 19.5 收口记录
范围：config.js 加 HUD_CONFIG；hud.js 加目标进度条 / 步数心跳 / 飘字池；render.js 在静态图层烘焙卡片并绘制飘字；app.js 把 nowMs 与飘字接进帧循环；index.html + styles.css 改道具栏与设置齿轮；candy.js 重烘焙 30 张精灵；新增 tests/hud.test.js
验收：tests/run-all.js 与 consistency_check.py 全绿；进度条 / 心跳 / 飘字在浏览器里可见且飘完回收；每帧绘制调用 ≤ 200；每个子步先出截图交用户确认
禁止：改玩法数值或规则；引入素材或依赖；每帧 shadowBlur / 渐变；把 HUD 挪出 canvas；破坏 --booster-bar-h 契约
前置依赖：Step 19.5 收口（tag step19.5-done）
```

---

## 4.4 新增 Step 22：藤蔓地图「共生」重构（用户方案「节点长在藤蔓上」）

### Step 22：让藤蔓弯起来、让节点长在藤蔓上

**目标**：19.5 已经打通「世界 + 视口内向上平移」，但地图仍是**两套互不相关的几何** —— 节点由 `LEVEL_MAP_POS` 显式排布，藤蔓由 10 个独立 `anchors` + 固定种子抖动画出来，**曲线并不经过节点**。用户判断「这一步一改，开心消消乐感立刻提升 80%」，并同时要求**视觉降噪**（满屏锁定节点的压抑感）与**攀爬氛围**（景深、光影、底部暗示）。

**用户方案（2026-09-26 提交）与已确认的口径修正**：用户最初的实施单里有三处工程隐患，Agent 逐条提出后用户**明确接受修正**：

1. **不反转数据流**：用户原写「沿曲线 `getPointAtLength()` 取节点坐标」，Agent 指出这会**把真相源从数据层挪到渲染层**，破坏 `LEVELS.md §9` ↔ `LEVEL_MAP_POS` ↔ `check-vine-map.mjs` 的**坐标三件套**。**确认后的做法**：节点坐标仍是唯一真相源，曲线**反向拟合**穿过它们（Catmull-Rom → 三次贝塞尔）。三件套与既有巡检**一行不改**语义。
2. **禁用视觉滤镜**：用户原写「节点与藤蔓加 `box-shadow`」。Canvas 侧早有 D043/D044 红线（零 `shadowBlur`、零每帧渐变），SVG 侧的等价物 `feGaussianBlur` 在中低端机上同样昂贵且难以巡检。**确认后的做法**：光影全部走**几何 + 静态渐变**（内嵌高光偏移 + 下缘预烘焙暗边），断言落在「附加了几何子元素」上，而不是去验证模糊算法。
3. **确认「向上」= 坐标原点翻转（不是改玩法）**：用户最初给的例子（第 2 关 `y=0.04`、第 50 关 `y=0.98`）与 19.4 已验收的 `climbDirection: 'up'`（第 1 关在世界最底）**方向相反**。用户澄清并拍板：**保持向上**，同时把 **y 的原点从世界顶部改到世界底部** —— 即 `y` 随关号**递增**（第 1 关 ≈ 0.11、第 50 关 ≈ 0.89），屏幕换算改为 `screenY = (1 − y) × 世界高`。这是**纯记法翻转、视觉零变化**，但会触碰坐标表、生成器、巡检、单测与三个浏览器套件（见 22.1）。

**Agent 另提出两处「按字面做会出问题」并保留现状**（已向用户说明）：① 平移范围用「节点居中夹取」而不是 `[0, 世界高 − 视口高]` —— 后者会让首/末关无法居中，与「进入地图当前关居中」的验收冲突；② 世界总高**保持固定比例**（`worldHeightRatio` 6.5，在 390×844 上约 5.3 屏）而不是「视口高 × 5」——后者在运行时按视口反算，会让不同设备上的**节点密度不一致**（手感漂、巡检也失去基准）。

**拆分与状态**：

| 子步骤 | 内容 | 状态 |
|---|---|---|
| **22.1** | **坐标口径翻转**：`LEVEL_MAP_POS.y` 改为**自世界底部起算、随关号递增**；生成器 / `LEVELS.md §9` / `mapGeometry`·`visibleLevelIds`·`focusedLevelId` / 云带与锚点语义 / `check-vine-map.mjs` 单调性 / `tests/vine-map.test.js` 与 `verify-step19-2/19-3/19-4` 全部同步。**视觉零变化** | **已完成**（v1.33，PNG sha256 逐字节相同为证） |
| **22.2** | **曲线穿过节点**（反向拟合，节点仍是真相源）+ 藤蔓**分段渐粗**（世界底部细 → 顶部粗）+ 沿路径的叶子/卷须（固定种子） | **已完成**（v1.34，`_build/step222-map-*.png`；节点到曲线 ≤ 0.47px） |
| **22.3** | **视觉降噪与焦点**：当前关金色呼吸光环 + 放大 15% +「当前」标签（**去掉**小黄箭头）；未解锁改**磨砂质感**（半透明低饱和暗绿 + 白细描边 + 精致小锁）；星星 **+30%**、未点亮改浅灰描边；底部**渐变遮罩**（暗示「下面还有路」）；首次进入的**上滑提示**（一次性、reduced-motion 不播）；「回到当前关」移到右下角并图标化 | 待开工 |

**22 的范围**：`config.js`（`VINE_MAP_CONFIG` 的 `anchors` / 注释语义，可能在 22.3 微调 `starSize` / `starScale`）、`_build/gen-vine-map.mjs`（生成器：y 原点翻转、锚点语义）、`level.js`（`LEVEL_MAP_POS` 由生成器重写）、`LEVELS.md` §9（坐标表由生成器重写）、`vine-map.js`（屏幕换算、曲线拟合、渐粗、光影几何）、`vine-map.css`（焦点/磨砂/星标/遮罩/提示）、`app.js`（若 22.3 需要绑定提示的关闭）、`_build/check-vine-map.mjs`（巡检口径）、`tests/vine-map.test.js`、`_build/verify-step19-2/19-3/19-4.mjs`（按新坐标口径追平）。

**22 的验收**：`node tests/run-all.js` 全绿；`python _build/consistency_check.py` 全绿；`node _build/check-vine-map.mjs` PASS；**「每个节点到藤蔓曲线的距离 ≤ 0.5px」**为硬断言（22.2 的核心）；节点/藤蔓的光影是**几何 + 静态渐变**，代码里不出现任何 SVG 滤镜与 `shadowBlur`；页面仍不可滚动（5.1）；`transform` 平移量仍在 `[minOffset, maxOffset]` 内且**当前关能真正居中**；**每个子步先出截图交用户确认再继续**。

**22 的禁止**：改任何玩法数值或规则（解锁门槛、天边云层、隐藏关、50 关表一律不动）；引入素材或依赖（D009，全程序化画）；使用 SVG 滤镜 / `feGaussianBlur` / canvas `shadowBlur` / 每帧新建渐变；把节点坐标的真相源从数据层挪到渲染层（曲线必须**拟合**节点，不得反过来由曲线**定义**节点）；让「进入地图当前关居中」失效。

**22 的前置依赖**：Step 19.5 已收口（tag `step19.5-done`）；Step 21.1 / 21.2 已提交（tag `step21.2-done`）；用户已确认「保持向上 + y 原点翻转 + 曲线拟合节点 + 禁用滤镜」四条口径，并已看过 22.2/22.3 的**原型截图**（`_build/step22-proto-*.png`）。

**22 的参考**：用户 2026-09-26 提交的「🚀 改进总方案（针对性优化）」五节 + 落地实施路线；King 的 Candy Crush 地图专利（[WO2014041202A1](https://patentimages.storage.googleapis.com/b0/d7/f4/8acdc16c379140/WO2014041202A1.pdf)：地图是玩家向上攀爬的虚拟风景、当前关有指针）；Agent 的**一次性原型** `_build/proto-vine-22.html`（`getPointAtLength` 采样证明节点到曲线 ≤ 0.3px）；`DECISIONS.md` **D049**。

**提示词**：
```text
任务：实现 Step 22 藤蔓地图「共生」重构（22.1 坐标口径翻转 → 22.2 曲线穿过节点 → 22.3 视觉降噪）
开始前：读 AGENTS.md（2.3 / 5.1 / 15 / 附录 B）、ROADMAP.md §4.4、DECISIONS.md D049、LEVELS.md §9、PROGRESS.md 的 19.5/21.2 记录
范围：_build/gen-vine-map.mjs 生成器（y 自底向上、锚点语义翻转）→ level.js 的 LEVEL_MAP_POS 与 LEVELS.md §9 由它重写；vine-map.js 的屏幕换算 screenY=(1−y)×世界高、曲线反向拟合节点、藤蔓分段渐粗、光影几何；vine-map.css 的焦点/磨砂/星标/遮罩/提示
验收：tests/run-all.js 与 consistency_check.py 全绿；check-vine-map.mjs PASS；每个节点到曲线距离 ≤ 0.5px；零滤镜 / 零 shadowBlur / 零每帧渐变；5.1 仍成立；当前关仍能真正居中；每个子步先出截图交用户确认
禁止：改玩法数值或规则；引入素材或依赖；SVG 滤镜或 shadowBlur；由曲线定义节点坐标（必须反过来拟合）；破坏「当前关居中」
前置依赖：Step 19.5 收口（tag step19.5-done）、Step 21.2（tag step21.2-done）、用户确认的四条口径
```

---

## 4.5 新增 Step 23：对局页「满屏竖版」配比（对齐真实竖屏手游）

### Step 23：把对局页从「浮在屏幕中间的正方形卡片」改成「满屏竖版」

**目标**：对齐真实竖屏手游的纵向配比 —— 顶部 HUD 15–20% / 棋盘 45–50% / 底部 15–20% / 其余装饰铺满。**玩法零改动**：计分、步数、目标、星级、关卡表、存档、逻辑模块一律不动，只改**画布几何与静态图层**。

**用户口径（2026-09-26）**：用户问「目前游戏的页面配比符不符合手机游戏的实际配比，《开心消消乐》是多少×多少，要不要改一下」，并在三选一里选定 **「一步到位」**（画布改成满屏竖版，一次把 HUD / 棋盘 / 留白全部对齐），而不是「只做快赢（全屏背景 + 边距微调）」或「暂不改」。

**实测背景（新增 `_build/measure-layout.mjs`，6 种视口）**：旧版 iPhone 14 上画布 358×358、HUD 只有 **47px（5.6% 屏高）**、棋盘区 311px（格边长 38.9px）、**纵向只有 54.3% 被内容占用**（上下各 193px 空白）；而地图层 `#map` 本就是 `inset: 0` 的满屏层 —— 两个页面配比互相矛盾。参考口径是行业通用的「设计分辨率 + 高度适配」（750×1334 或 720×1280；更高的屏把多出来的高度给背景与装饰，**不留黑边**），因此要比的是**纵向配比**而不是某个像素数。

**范围**：`render.js`（`computeCanvasSize` / `boardRect` / `buildChrome` 的台面与底部暖光带）、`hud.js`（`HUD_RATIO` 语义、`hudCells` / `drawHud` 参数、长数字自适应缩放）、`app.js`（画布尺寸与场景的 `canvas: {w,h}`）、`styles.css`（`#board` 的兜底尺寸）、`_build/` 的探针（**23 个**内联旧几何公式的脚本统一改为调用 `render.js` 的真实几何）与新增的 `measure-layout.mjs` / `check-canvas23.mjs`。

**验收**：`node tests/run-all.js` 全绿；`python _build/consistency_check.py` 全绿；`_build/check-canvas23.mjs` **12 项 PASS**（画布铺满 / 画布 + 道具条 = 屏高 / 道具条贴底 / 画布内不出现页面底色 / HUD 占屏 13–18% / 棋盘正方形 / 格边长 ≥42px / 棋盘在 HUD 之下且下方留台面 / 台面上沿有高光 / 棋盘下方有暖光带 / 5.1 不滚动 / 0 异常）；6 视口配比表「上下留白 0、滚动 OK」；受影响的浏览器套件（`verify-step4`–`verify-step20`、`verify-step19-2/3/4`、`audit-gate-step7`–`11`、`shot-hud-*`、`shot-candy-21`、`shot-booster-21`）全部复跑通过；**出截图交用户确认**。

**禁止**：改任何玩法数值或规则；破坏 5.1（禁滚动/缩放）与 5.2（棋盘必须正方形）；改 `--booster-bar-h` 的契约语义（`#controls` 高度 == 该变量）；引入素材或依赖（D009）；每帧 `shadowBlur` 或每帧新建渐变（D043/D044）；把 HUD 挪出画布（2.3：HUD 与棋盘在 canvas，道具条与地图是 DOM）。

**前置依赖**：Step 21.3 已提交（tag `step21.3-done`）、Step 22.2 已提交（tag `step22.2-done`）；用户已选定「一步到位」。

**参考**：用户 2026-09-26 的提问与选择；行业通用的「设计分辨率 + 高度适配」口径（[Cocos 设计分辨率讨论](https://ask.csdn.net/questions/9238377)、[Unity 屏幕适配——立项时设置](https://blog.csdn.net/nratel/article/details/146253789)）；`DECISIONS.md` **D051**。

**提示词**：
```text
任务：实现 Step 23 对局页「满屏竖版」配比（对齐真实竖屏手游的纵向配比）
开始前：读 AGENTS.md（2.3 / 5.1 / 5.2 / 5.5 / 15）、ROADMAP.md §4.5、DECISIONS.md D051、PROGRESS.md 最近的配比实测记录
范围：render.js 的 computeCanvasSize/boardRect/buildChrome；hud.js 的 HUD_RATIO/hudCells/drawHud；app.js 的画布尺寸与场景；styles.css 的 #board 兜底；_build 探针里内联的旧几何公式统一改成调用真实几何
验收：tests/run-all.js 与 consistency_check.py 全绿；check-canvas23.mjs 12 项 PASS；6 视口配比表「上下留白 0、不滚动」；受影响套件全部复跑通过；出截图交用户确认
禁止：改玩法数值或规则；破坏 5.1/5.2；改 --booster-bar-h 契约；引入素材/依赖；每帧 shadowBlur 或每帧渐变；把 HUD 挪出 canvas
前置依赖：step21.3-done、step22.2-done、用户选定「一步到位」
```

---

## 4.6 新增 Step 24：彩星（rainbow）分数线与展示

### Step 24：在三星之上加一条「彩星线」（分数制，不计入总星数）

**目标**：把 20.4 预留的 `rainbow` 字段**接上规则与展示** —— 每关在三星分数线之上再加一条**彩星线**，通关且最终分达标即点亮彩星。**玩法零改动**：计分、步数、目标、星级、关卡表与所有逻辑模块的**既有语义**一律不动，只**新增**一条荣誉线。用户口径：「开始彩星分数线」。

**规则来源（对齐参考游戏）**：《开心消消乐》官方公告（2020-02-28，[TapTap](https://www.taptap.cn/moment/15206728828193602)）原文 —— 「每关在**达到 3 星分数之后**会出现彩星分数，达到彩星分数之后关卡花变成漂亮的彩星关卡花」，且「**彩星不加入总星星数计算**」（当年 4 星关全部改成了彩星）。这正是 20.4 预留字段时参照的语义。

**标定（先测后定，新增 `_build/measure-rainbow.mjs`）**：300 局真实对局（50 关 × 贪心/随机两档 × 3 种子，与 `measure-step20.mjs` 同一玩家模型）—— 通关 187（62.3%）；通关余步比例中位 **20.8%** / p75 39.1%；最终分 ÷ 三星阈值中位 **0.48** / **max 1.38**。⇒ ×1.10–1.30 都有**可达实例**；弱玩家通关局在 ×1.15 上的命中率约 1%（**下界**）。**用户在候选里选定 ×1.15**（分数制）。

**范围**：`config.js`（`STAR_CONFIG.rainbowFactor`）、`level.js`（`computeRainbowThreshold` / `isRainbowEarned` / `withStars` 给四处关卡与演示关配置挂 `rainbowThreshold`）、`game.js`（`GameSnapshot.rainbow`）、`storage.js`（`getLevelRainbows` / `readLevelRainbows`，**存档格式不变**）、`app.js`（载入/落盘/传给地图层）、`hud.js`（结束面板的彩虹五角星 +「彩星」小字）、`vine-map.js` + `vine-map.css`（节点 `data-rainbow` + 彩虹星，SVG 静态渐变）、`tests/level.test.js`、`_build/verify-step24.mjs`。

**验收**：`node tests/run-all.js` 全绿（彩星线公式与取整 / 彩星线严格高于三星线 / 只在通关且达标时给 / 缺字段不给）；`python _build/consistency_check.py` 全绿（`STAR_CONFIG.rainbowFactor` 已登记附录 B，覆盖断言扩到 **Step 0-24**）；浏览器套件 `_build/verify-step24.mjs` PASS（阈值一致性 / 快照 `rainbow` / 落盘往返 / 地图节点 `data-rainbow` 与彩虹星 / 结束面板出现彩虹色像素 / **⭐ n/150 不受彩星影响**）；**出截图交用户确认**。

**禁止**：把彩星做成「第四颗星」或计入 `⭐ n/150`（20.4 与用户方案 §2.2 的口径）；改动手写关卡表（彩星线必须**由公式派生**）；给失败局发彩星；引入素材或依赖（D009）；在 canvas 用每帧渐变或 `shadowBlur` 画彩星（D043/D044）；在 SVG 侧用 `feGaussianBlur` / `drop-shadow` 等视觉滤镜（D049 第 2 条）；改存档格式（v2 的 `{ stars, rainbow }` 早已就位）。

**前置依赖**：Step 20.4 已落地（v2 存档的 `rainbow` 字段与 `readLevelRecords` / `recordLevelStars({ rainbow })` 就位）；用户已选定规则形式与系数（分数制 ×1.15）。

**参考**：《开心消消乐》官方公告「【功能优化】余步分数调整，彩星功能上线」（TapTap，2020-02-28）；`DECISIONS.md` **D042**（20.4 的字段预留）与 **D052**（本步口径与标定）。

**提示词**：
```text
任务：实现 Step 24 彩星（rainbow）分数线与展示（分数制：彩星线 = 三星阈值 × 1.15，不计入总星数）
开始前：读 AGENTS.md（3.7 / 4.2 / 4.4 / 附录 B）、ROADMAP.md §4.6、DECISIONS.md D042 与 D052、PROGRESS.md 的 20.4 记录
范围：config.js 加 STAR_CONFIG.rainbowFactor；level.js 加 computeRainbowThreshold / isRainbowEarned 并给四处配置挂 rainbowThreshold；game.js 快照加 rainbow；storage.js 加 getLevelRainbows / readLevelRainbows（存档格式不变）；app.js 载入/落盘/传参；hud.js 结束面板画彩虹五角星；vine-map.js + vine-map.css 画节点彩星
验收：tests/run-all.js 与 consistency_check.py 全绿；verify-step24.mjs PASS（阈值/快照/落盘/地图标记/面板像素/⭐ 不受影响）；出截图交用户确认
禁止：把彩星做成第四颗星或计入 ⭐ n/150；手写彩星线；失败局发彩星；引入素材/依赖；canvas 每帧渐变或 shadowBlur；SVG 视觉滤镜；改存档格式
前置依赖：Step 20.4（v2 存档字段就位）、用户选定「分数制 ×1.15」
```

---

## 5. 完成记录

### 第一阶段

- [x] Step 0：项目骨架初始化
- [x] Step 1：棋盘渲染
- [x] Step 2：触摸交换 + 匹配检测
- [x] Step 3：消除、下落、填充、级联
- [x] Step 4：计分、步数、游戏结束、最高分
- [x] Step 5：移动端适配 + 动画打磨
- [x] Step 6：死局检测与重排（含 Step 6.1 纯重构：拆出 `shuffle.js`，见 DECISIONS D019）

### 第二阶段

- [x] Step 7：条纹糖果（4 连生成 + 激活消整行/列，含 `candy.js` 外观拆分，见 DECISIONS D020）
- [x] Gate 0.1：Step 7 完成后的 Bug Audit —— **2026-09-20 通过**（L1 自动回归 89 用例/803 断言/exit 0；L2 浏览器冒烟 49 项；L3 窄屏触摸模拟；P0/P1=0，P3 已登记，详见 `PROGRESS.md` 同日审计记录与 DECISIONS D022）
- [x] Step 8：包装糖果（L/T 型 5 连 → 消周围 3×3，2.0 倍；落点=交叉点、边界裁剪、24 张精灵，见 DECISIONS D023）
- [x] Step 9：魔力鸟（5 连直线 → magic；与普通色块交换清全屏同色、消耗 1 步、不能与空格交换；4.3.14 匹配层排除；契约见 D025）
- [x] Step 10：特殊元素组合（六种组合按 3.3 生效、优先级按 3.3 排序、组合触发扣 1 步；「全屏同色变形并触发」与「条纹+包装的二次爆炸」由 `initialClear` 充当**激活种子**的链式展开实现；两种魔力鸟混搭按 3.5 已有的 2.5 回落，不新增数值；无宪法修订，见 DECISIONS D026）
- [x] Gate 0.1：Step 10 完成后的 Bug Audit —— **2026-09-20 通过**（L1 自动回归 128 用例/937 断言/exit 0；L2 浏览器冒烟 49/49；L3 窄屏/极窄视口/安全区全过；P0/P1=0，P3 已登记含新增 P3-6/P3-7，详见 `PROGRESS.md` 同日「Gate 0.1 第四轮」）
- [x] Step 11：冰块与雪块（冰块 1-3 层、雪块 1-5 层；占格障碍不参与匹配、把列切成两段，覆层障碍的动物被消除后该格补位而障碍物保留；一层 = 一次被波及；层数分 1000/层另算不乘倍数、冰块连消 (n−1)×1000；见 DECISIONS D027）
- [x] Gate 0.1：Step 11 完成后的 Bug Audit —— **2026-09-20 通过**（L1 自动回归 145 用例/1025 断言/exit 0；L2 浏览器冒烟 49/49；L3 窄屏/极窄视口/安全区全过；P0/P1=0，P3 已登记含新增 P3-8，详见 `PROGRESS.md` 同日「Gate 0.1 第五轮」）
- [x] Step 12：关卡目标与三星评分（12.1 目标与三星引擎 / 12.2 50 关落地 + 步数由难度派生 / 12.3 结束前引爆，三步全部完成；见 DECISIONS D029–D034）

### 第三阶段

- [x] Step 13：更多障碍物（藤蔓与巧克力，规则口径见宪法 v1.17 / DECISIONS D033）
- [x] Step 14：关卡类型（14.1 水果关 / 14.2 时间关 / 14.3 金豆荚关，**三步全部完成**，见宪法 v1.18/v1.19 与 DECISIONS D035）
- [x] Step 15：道具系统（刷新 / 加五步 / 小木锤 + 数量持久化 + 画布外道具条，见宪法 v1.20 与 DECISIONS D036；P3-12 的刷新失败率仍登记在案）
- [x] Step 16：音效与震动反馈（**零素材**：Web Audio 合成 + `navigator.vibrate`；音高按连击层数/星级派生（同输入同声音）；音效与震动各自可开关且偏好持久化；桌面无 `vibrate` 静默降级；顺带根治 P3-13（`test()` 现在 await 异步用例）；见 DECISIONS D038）
- [x] Step 17：粒子动画与视觉打磨（**已完成**：`particles.js` + 确定性粒子 + 三类强度 + 帧预算，见 §4.2 与 DECISIONS D044）
- [ ] Step 18：Capacitor 打包
- [x] **Step 19**：藤蔓地图与存档演进（19.1 存档版本化**已完成**；**19.2 藤蔓地图已完成**；**19.3 解锁门槛 / 天边云层 / 隐藏关已完成**；**19.4 从下往上 + 画风增强已完成**；**19.5 世界坐标 + 纵向平移已收口（四个浏览器套件改写 + Gate 0.1 第十六轮）**，见 §4.1、DECISIONS D037 / D039 / D045 / D046 / **D047**）
- [x] **Step 20**：结算阶段（余步 → 递增奖励分 + 随机特殊糖果 → 从棋盘底部到顶部连锁引爆）+ 星级统一动态调整 + 彩星字段预留（20.1–20.4 **全部完成**，见 §4.2 与 DECISIONS D041 / D042）

- [x] **Step 21**：对局 UI 视觉升级（21.1 HUD 果汁化 / 21.2 道具栏与设置齿轮 / 21.3 棋子拟人化与质感重烘焙，**三步全部完成**，见 §4.3 与 DECISIONS D048；21.3 之后又按用户视觉评审做了 **P0/P1/P1.5/P2** 四项返工 —— 特殊糖果发光线与高对比条纹、步数 ≤5 红色警告与心跳、道具栏深色底 + 果冻图标且标签不折行、三处普通糖果细节、棋盘暖色环境光，见 DECISIONS **D050**）
- [x] **Step 22**：藤蔓地图「共生」重构（22.1 坐标口径翻转 / 22.2 曲线穿过节点 + 藤蔓渐粗 **已完成**；**22.3 视觉降噪与焦点待开工**，见 §4.4 与 DECISIONS D049）
- [x] **Step 23**：对局页「满屏竖版」配比（画布 390×744 铺满、HUD 47 → 123px、棋盘区 311 → 370px、格边长 38.9 → 46.25px、HUD 之下与棋盘之下不再留空白，见 §4.5 与 DECISIONS **D051**）
- [x] **Step 24**：彩星分数线与展示（分数制：**彩星线 = 三星阈值 × 1.15**，通关且达标即点亮；结束面板画彩虹五角星、藤蔓地图节点挂彩星标记；**不计入 ⭐ n/150**，见 §4.6 与 DECISIONS **D052**）

---

## 6. 更新记录

| 版本 | 日期 | 修改人 | 原因 | 影响范围 |
|---|---|---|---|---|
| v1.38 | 2026-09-26 | Agent（用户口径「开始彩星分数线」，规则与系数由用户拍板） | 与宪法 v1.38 同步：**新增 §4.6 Step 24「彩星分数线与展示」** —— 分数制（彩星线 = 三星阈值 × `STAR_CONFIG.rainbowFactor` 1.15，**标定脚本 `measure-rainbow.mjs` 的 300 局实测**）、`isRainbowEarned` 只在通关且达标时给、`GameSnapshot.rainbow` 纯追加、`storage.getLevelRainbows` 派生量（**存档格式不变**）、结束面板彩虹星与地图节点彩星标记、**不计入 ⭐ n/150**；顺带把 §5 完成记录里 Step 12/13/14/15 的过期勾选与 Step 21/22/23/24 一并补齐 | §4.6、§5、第 6 节 |
| v1.1 | 2026-09-18 | Agent | 初始版本 | 全文 |
| v1.2 | 2026-09-18 | Agent | 补全 `REFERENCES.md` 交叉引用、明确 ESM 运行方式、补全 Step 7-18 提示词、修正 Step 6/13/14/16/17 的禁止项与测试项 | 第 0 节、各 Step、第 6 节 |
| v1.3 | 2026-09-18 | Agent | Step 0 范围与验收补 `REFERENCES.md`（M1）、Step 6 措辞去歧义（M5）、Step 16 标注 `assets/` 启用时点（M2） | Step 0、Step 6、Step 16、第 6 节 |
| v1.4 | 2026-09-19 | Agent | 同步 Step 2-4 的接口契约与连消口径，并登记 Step 5 的 `render.js` / `input.js` 拆分边界 | Step 2-5、目录与模块边界 |
| v1.5 | 2026-09-19 | Agent | 同步 `hud.js` / `timeline.js` 拆分、死局重排的可配置重试和对 UI 可见的死局结算轨迹 | Step 5-6、目录与验收 |
| v1.6 | 2026-09-19 | Agent | 同步 Step 6.1：从 `board.js` 拆出 `shuffle.js` 的纯重构与单向依赖 | Step 6、目录与模块边界 |
| v1.7 | 2026-09-19 | Agent | 同步 Step 7 条纹糖果完成、`candy.js` 外观拆分与第二阶段当前进度 | Step 7、完成记录 |
| v1.8 | 2026-09-20 | Agent | 在 Step 8 前新增 Bug Audit Gate、证据等级和可交付门槛；将 Step 18 扩充为 Capacitor 从环境冻结到发布候选回归的 7 个子步骤 | §0.1-§0.3、Step 18、完成记录、第 6 节 |
| v1.9 | 2026-09-20 | Agent | 同步扩展前 Bug Audit 收尾规则、静态检查口径与当前暂停点，确保路线图版本与宪法一致 | §0.1-§0.3、Step 8 前置门禁、第 6 节 |
| v1.10 | 2026-09-20 | Agent | 补充成熟 App 研发阶段总表、统一 Step 执行卡、DoR/DoD、需求到发布追溯、分支版本回滚与包装发布准备清单；明确当前仍停在 Gate 0.1 | §0.4-§0.8、Step 8 前置门禁 |
| v1.19 | 2026-09-22 | Agent（用户预授权默认） | 与宪法 v1.19 同步：Step 14 的落地契约（时间关 `timeLimit`/`remainingTime`、收集物 `collectibles`/`CollectibleHit`、`applyGravity` 的下落上限、`level.consumeTime` 与 `game.tickTime`、`computeTimeBudget`、`TIME_CONFIG`/`STAR_CONFIG`）；更新 §0.1 的当前暂停点为「Step 14 进行中」，Step 14 完成后进 Step 15 前需再过一轮 Gate 0.1 | §0.1、Step 14、第 6 节 |
| v1.20 | 2026-09-22 | Agent（用户预授权默认） | 与宪法 v1.20 同步：Step 15 道具系统（3.9 规则、`game.useBooster`/`BoosterResult`、`level.grantSteps`/`grantTime`、`BOOSTER_CONFIG` 4 键、`BOOSTER_KIND`、画布外道具条与 `--booster-bar-h`）；§0.1 的暂停点更新为「Step 15 进行中，完成后进 Step 16 前需再过一轮 Gate 0.1」 | §0.1、Step 15、第 6 节 |
| v1.21 | 2026-09-22 | Agent（用户批准 19.1） | 与宪法 v1.21 同步：新增 §4.1 Step 19（藤蔓地图 + 存档演进，19.1 已完成 / 19.2 待滚动口径 / 19.3 需先批规则 / 软件化挂起），`storage.js` 的 backend 注入与存档版本化进入契约 | §4.1、Step 19、第 5/6 节 |
| v1.30 | 2026-09-25 | Agent（用户口径：把「左右翻页」换成「藤蔓向上蔓延」） | 与宪法 v1.30 同步：**Step 19.5 世界坐标 + 视口内纵向平移**（玩法零改动，**用户拍板保留 19.3**）—— `LEVEL_MAP_POS` 改世界归一化坐标、世界总高 `height × 6.5`、进入地图当前关居中、拖拽 + 惯性 + `▲`/`▼` + 「回到当前关」、单条贯穿世界的贝塞尔、两层视差（0.25× / 1.45×）+ 150 个确定性星光、`tianbianBand` 云带取代「第 6 页」；附录 B 删 3 键 / 增 11 键；新增 `_build/shot-map-195.mjs` | §4.1、§5、第 6 节 |
| v1.29 | 2026-09-25 | Agent（用户口径：从下往上 + 画风增强） | 与宪法 v1.29 同步：**Step 19.4 藤蔓地图朝向与画风**（玩法零改动）—— `VINE_MAP_CONFIG.climbDirection = 'up'`（页内自下而上、锚点入口在底部/出口探出页顶、跨屏条件翻转）、分层背景 / 双层藤蔓 / 节点高光 / 锁形图标 / 当前关指针 / 云层漂移 / 进度条渐变；附录 B 新增 4 键；参考 Candy Crush 地图专利与既有 REFERENCES 条目；`_build/verify-step19-4.mjs` 新增套件 | §4.1、§5、第 6 节 |
| v1.28 | 2026-09-25 | Agent（用户拍板三条口径） | 与宪法 v1.28 同步：**Step 19.3 解锁门槛 / 天边云层 / 隐藏关完成**（只按累计星数解锁、`round((n−1) × 1.2)`、反锁保护、120 星天边云层、隐藏关 51–53 不计入 ⭐ n/150、地图 6 页与三态节点、点锁定关卡被拒）；`LEVELS.md` 新增 §10 解锁曲线；附录 B 新增 `UNLOCK_CONFIG` 3 键 | §4.1、§5、第 6 节 |
| v1.27 | 2026-09-25 | Agent（用户拍板外观 A） | 与宪法 v1.27 同步：**Step 17 粒子动画与视觉打磨完成** —— 新增 `particles.js`（确定性粒子：环形池 + 生成计划 + 只读快照）、`candy.js` 的 `buildParticleAtlas`、`render.js` 的 `drawParticles`、`app.js` 的时间线挂载；15 节新增粒子每帧贴图上限（96）/ 池上限（192）/ reduced-motion 不生成三条；附录 B 新增 `PARTICLE_CONFIG` 20 键、B-2 新增 `PARTICLE_KIND`；`tests/particles.test.js` 7 例 | 第 6 节、Step 17、附录 B、附录 B-2 |
| v1.26 | 2026-09-23 | Agent（用户方案的 Step 20 第 4 项） | 与宪法 v1.26 同步：**20.4 彩星字段预留 + 存档迁移**（`STORAGE_CONFIG.schemaVersion` 1 → 2，`levels` 的值改为 `{ stars, rainbow }`，v0/v1 就地迁移且老存档不丢；新增 `readLevelRecords`/`writeLevelRecords`/`getTotalRainbows`，对外形状 `readLevelStars`/`getTotalStars`/`recordLevelStars` 不变；彩星不计入总星数）；Step 20 的 20.1–20.4 全部完成 | §4.2、§5、第 6 节 |
| v1.25 | 2026-09-23 | Agent（用户批准的 Step 20 方案） | 与宪法 v1.25 同步：新增 §4.2 Step 20（结算阶段 + 星级统一动态调整，20.1–20.3 已完成 / 20.4 彩星待批准）；§4.1 表里的软件化行去掉「20」这个编号以免与 Step 20 冲突；新增 `settlement.js`、`LEVELS.md` 阈值列改公式输出（`sync-levels-stars.mjs` / `measure-step20.mjs`） | §4.1、§4.2、§5、第 6 节 |
| v1.24 | 2026-09-22 | Agent（用户批准的 19.2 v2 修订方案） | 与宪法 v1.24 同步：Step 19.2 藤蔓地图按用户修订方案重做（坐标归一化 0–1、路径改单条平滑贝塞尔且锚点进 `VINE_MAP_CONFIG.anchors`、节点显式坐标不参与路径计算、`data-state` 两态、星星 +40%、呼吸光效、翻页箭头 + 总星数进度条、叶子沿切线旋转、附录 B `VINE_MAP_CONFIG` 8→19 键）；19.3 与软件化仍挂起 | §4.1、§5、第 6 节 |
| v1.23 | 2026-09-22 | Agent（用户批准 19.2） | 与宪法 v1.23 同步：Step 19.2 藤蔓地图完成（`vine-map.js`/`vine-map.css`、`LEVEL_MAP_POS` 与 `LEVELS.md` §9 坐标表 + 巡检、确定性路径、canvas 选关退役、`?map=1` 入口、`VINE_MAP_CONFIG` 8 键）；门禁清单 19→20 套件 | §4.1、§5、第 6 节 |
| v1.22 | 2026-09-22 | Agent（用户批准） | 与宪法 v1.22 同步：Step 16 音效与震动完成（5.6、`audio.js` 登记、`AUDIO_CONFIG`/`HAPTIC_CONFIG`/`STORAGE_KEYS.PREFS` 进附录 B、P3-13 根治） | §5、Step 16、第 6 节 |
