# ROADMAP — 手机版消消乐项目路线图

> 版本：v1.3
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

### Step 12：关卡目标与三星评分

**目标**：实现 3.6、3.7 的关卡目标与三星评分。

**范围**：`level.js`、`game.js`、`app.js`、`config.js`、`tests/level.test.js`。

**验收**：支持 `score`、`collect`、`clearIce`、`mixed` 四种目标；步数用尽未达成则失败；三星只取决于分数；剩余步数按 3.5 转化。

**测试**：`node tests/level.test.js` 断言四种目标与三星计算。

**禁止**：实现道具系统。

**前置依赖**：Step 11

**参考**：`REFERENCES.md` §2.2 Step 12

**提示词**：
```text
任务：实现关卡目标与三星评分
范围：允许改 level.js、game.js、app.js、config.js、tests/level.test.js
验收：支持 score/collect/clearIce/mixed 四种目标，步数用尽未达成即失败，三星仅取决于分数，剩余步数按 3.5 转化
测试：node tests/level.test.js 断言四种目标判定与三星计算
禁止：实现道具系统
前置依赖：Step 11
参考：REFERENCES.md §2.2 Step 12
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

### Step 18：Capacitor 打包为 Android/iOS

**目标**：将 H5 游戏打包为原生 App。

**范围**：新增 `capacitor.config.json`、`android/`、`ios/`；不改逻辑模块。

**验收**：Android APK 可安装运行；iOS 可在模拟器运行；真机上触摸、音效、震动正常。

**测试**：真机安装联调；确认 WebView 内 ESM 可加载、`localStorage` 与 `navigator.vibrate` 行为正常。

**禁止**：为适配原生而改动游戏逻辑语义。

**前置依赖**：Step 17

**参考**：`REFERENCES.md` §2.3 Step 18

**提示词**：
```text
任务：用 Capacitor 打包为 Android/iOS
范围：新增 capacitor.config.json、android/、ios/，不改逻辑模块
验收：Android APK 可安装运行，iOS 模拟器可运行，真机触摸/音效/震动正常
测试：真机安装联调，确认 WebView 内 ESM、localStorage、vibrate 正常
禁止：为适配原生改动游戏逻辑语义
前置依赖：Step 17
参考：REFERENCES.md §2.3 Step 18
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
- [ ] Step 6：死局检测与重排

### 第二阶段

- [ ] Step 7：条纹糖果
- [ ] Step 8：包装糖果
- [ ] Step 9：魔力鸟
- [ ] Step 10：特殊元素组合
- [ ] Step 11：冰块与雪块
- [ ] Step 12：关卡目标与三星评分

### 第三阶段

- [ ] Step 13：更多障碍物
- [ ] Step 14：关卡类型
- [ ] Step 15：道具系统
- [ ] Step 16：音效与震动反馈
- [ ] Step 17：粒子动画与视觉打磨
- [ ] Step 18：Capacitor 打包

---

## 6. 更新记录

| 版本 | 日期 | 修改人 | 原因 | 影响范围 |
|---|---|---|---|---|
| v1.1 | 2026-09-18 | Agent | 初始版本 | 全文 |
| v1.2 | 2026-09-18 | Agent | 补全 `REFERENCES.md` 交叉引用、明确 ESM 运行方式、补全 Step 7-18 提示词、修正 Step 6/13/14/16/17 的禁止项与测试项 | 第 0 节、各 Step、第 6 节 |
| v1.3 | 2026-09-18 | Agent | Step 0 范围与验收补 `REFERENCES.md`（M1）、Step 6 措辞去歧义（M5）、Step 16 标注 `assets/` 启用时点（M2） | Step 0、Step 6、Step 16、第 6 节 |
