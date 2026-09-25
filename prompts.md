# prompts — 复用提示词库

> 关联文件：`AGENTS.md` 第 12 节、`ROADMAP.md` 各 Step
> 使用方式：每个 Step 完成后，将其提示词存档于此。新的记录追加在末尾。

---

## 通用提示词模板

```text
任务：实现 <功能名>
范围：只允许修改 <文件列表>
验收：<可观察的行为>
测试：<运行哪些测试 / 手动验证步骤>
证据：<ROADMAP.md §0.2 的 L0-L6 等级；已验证 / 仅代码审查 / 未验证>
失败与回滚：<失败时保留什么证据、回到哪个提交或子步骤>
禁止：<本步明确不允许做的事>
前置依赖：<ROADMAP 中的 Step 编号>
参考：<REFERENCES.md 中的章节编号>
```

## 会话开始提示词

```text
请先阅读 AGENTS.md、ROADMAP.md、REFERENCES.md、PROGRESS.md 和 DECISIONS.md。
然后按 ROADMAP.md 的 <Step N> 开始。
若准备开始新的玩法 Step，先执行 ROADMAP.md §0.1 扩展前 Bug Audit Gate；未得出“允许进入下一 Step”结论前不得新增玩法。
只允许修改该 Step“范围”内列出的文件。
先给计划，再改代码，最后告诉我如何验证。
```

## 会话结束提示词

```text
请在 PROGRESS.md 追加本次会话记录，包含：
- 完成项
- 验证方式
- 遗留问题
- 下一步建议

如本次出现非显然决策，请在 DECISIONS.md 追加记录。
```

## 扩展前 Bug Audit（当前 Step 7 后先用）

```text
任务：在不推进下一玩法 Step 的前提下，审计当前项目的功能缺陷、回归风险和未验证边界
范围：默认只读；允许运行现有测试、静态一致性脚本、本地 HTTP 冒烟和可用的移动模拟。除非用户明确要求修复，否则不改游戏代码、不新增 Step 8 功能。
开始前：阅读 AGENTS.md、ROADMAP.md §0.1/§0.2、当前 Step、REFERENCES.md 对应章节、PROGRESS.md 最近记录和 DECISIONS.md。
执行：
1. 运行 node tests/run-all.js，记录测试文件数、用例数、断言数、失败数和退出码。
2. 若 _build/consistency_check.py 存在则运行，区分静态检查与行为验证。
3. 经 HTTP 服务器验证首屏、有效/无效交换、消除/下落/补充、步数、结束面板和最高分；没有实际浏览器/设备时写未验证。
4. 检查窄屏触摸、滚动/缩放、安全区、输入锁、性能、控制台错误和本地存储边界；不得用桌面鼠标结果冒充真机触摸。
5. 对每个发现写 P0/P1/P2/P3、复现步骤、影响、证据等级、建议修复和回归用例。
输出：先列 findings（按严重度），再列未验证项、通过项和“是否允许进入下一 Step”的明确结论。
门禁：P0/P1 未清零、自动回归失败或浏览器冒烟失败时结论必须为“不允许进入下一 Step”。P2/P3 必须登记负责项和回归计划。
证据：严格按 ROADMAP.md §0.2 标注 L0-L6，并使用“已验证 / 仅代码审查 / 未验证”。
归档：在 PROGRESS.md 写审计命令、环境、结果和未验证边界；规则或范围变化才写 DECISIONS.md。
禁止：以分析或文档结论替代实际测试；在审计期间顺手实现包装糖果、魔力鸟、组合或其他后续 Step。
```

## 环境提示词（本项目专用）

```text
本项目源码是 ES Module，必须经 http 打开，不能双击 index.html：
  python -m http.server 8000     → http://localhost:8000/
手机真机：同一 Wi-Fi 下访问 http://<电脑局域网IP>:8000/
测试：node tests/run-all.js（依赖 package.json 的 "type": "module"）
```

---

## Step 0：项目骨架初始化

```text
任务：初始化项目骨架
范围：按 AGENTS.md 2.2 创建目录与空占位文件；只允许完善 Step 0 列出的骨架、治理文档与测试入口
验收：目录结构与宪法一致；CONFIG 字段齐全；assertEqual/assertTrue 可用；git init 后完成 [step0] 初始提交
测试：python -m http.server 8000 打开 localhost:8000 无控制台报错；运行 run-all.js
禁止：写任何业务逻辑，引入任何依赖
前置依赖：无
参考：REFERENCES.md §2.1 Step 0
```

## Step 1：棋盘渲染

```text
任务：在 Canvas 上渲染 8×8 消消乐棋盘
范围：只允许修改 index.html、styles.css、app.js
验收：手机浏览器可见正方形棋盘，无滚动无缩放，颜色从 CONFIG.COLOR_COUNT 随机取
测试：python -m http.server 8000 + Chrome DevTools 模拟手机，手动打开验证
禁止：实现触摸交互，修改任何逻辑模块，硬编码颜色数
```

## Step 2：触摸交换 + 匹配检测

```text
任务：实现滑动交换与 3 连匹配检测
范围：允许改 app.js、board.js、match.js、config.js 及对应测试
验收：交换无效回退，3/4/5 连与 L/T 型 shape 被正确识别
测试：node tests/board.test.js 与 node tests/match.test.js 全绿；手机手动滑动验证
禁止：实现消除动画与计分；引入 special.js 逻辑
```

## Step 3：消除、下落、填充、级联

```text
任务：实现消除、下落、填充、级联
范围：允许改 board.js、match.js、app.js、config.js 及对应测试
验收：消除后下落填充，级联检测直到无新匹配，级联层数可追踪
测试：node tests/integration.test.js 断言最终棋盘与级联层数；手动观察动画
禁止：实现特殊元素生成、计分、步数消耗、死局检测与重排
```

## Step 4：计分、步数、游戏结束、最高分

```text
任务：实现基础计分、步数、游戏结束、最高分
范围：允许改 score.js、level.js、game.js、app.js、config.js 及对应测试
验收：有效交换扣步，连消加分正确，游戏结束用页面内 UI，最高分存 localStorage
测试：node tests/score.test.js、level.test.js、game.test.js 全绿；手动玩一局
禁止：特殊元素计分、三星评分、逻辑模块操作 localStorage
```

## Step 5：移动端适配 + 动画打磨

```text
任务：移动端适配与动画打磨
范围：允许改 app.js、styles.css、config.js 的 ANIMATION_CONFIG
验收：动画时长均取自配置，先更新状态再播动画，色盲友好，安全区适配，帧率达标
测试：真机跑一局，Chrome DevTools 性能面板检查帧率与色盲模拟
禁止：引入动画库，改动规则逻辑
```

## Step 6：死局检测与重排

```text
任务：实现死局检测与重排
范围：允许改 board.js、game.js、app.js、config.js 及 board.test.js
验收：每次消除后检测，无可行交换则提示并重排，重排满足宪法 3.8，不消耗步数
测试：node tests/board.test.js 断言死局与重排；手动观察
禁止：改变障碍物布局，重排消耗步数，无限重试
```

## Step 7：条纹糖果

```text
任务：实现条纹糖果（4 连生成，激活消除整行/列）
范围：允许改 special.js、match.js、board.js、game.js、app.js、config.js、tests/special.test.js
验收：横向 4 连→横向条纹，纵向 4 连→纵向条纹，激活后整行/整列清除
测试：node tests/special.test.js 断言生成坐标与受影响坐标集合
禁止：实现包装糖果与魔力鸟
前置依赖：Step 6
参考：REFERENCES.md §2.2 Step 7
```

**Step 7 实战记录（2026-09-19）**

- 实际改动比模板多两个文件：`timeline.js`（新生成的条纹不该播消除动画，否则会「一闪就没了」）与 `render.js` + **新增 `candy.js`**（用户批准的糖果外观方案；外观代码让 `render.js` 超 300 行，按 §6 拆出并升宪法 v1.7）。`config.js` 最终**未改动**。
- 生成位置口径：4 连的条纹落在 `cells[floor((n−1)/2)]`（第 2 格），方向 = 匹配方向（D014 第 1 条，与参考实现相反）。
- 计分接入：本层「生成或触发」条纹时按 3.5 取 1.5 倍；组合倍数留给 Step 10。
- 提示词里最好直接写清「本层新生成的特殊元素本层不参与消除」，否则极易写成「生成即被消掉」。

## Step 8：包装糖果

```text
任务：实现包装糖果（L/T 型 5 连生成，激活消除 3×3）
范围：允许改 special.js、match.js、board.js、game.js、app.js、config.js、tests/special.test.js
验收：L 型与 T 型均识别为 wrapped，激活影响 3×3 且边界裁剪
测试：node tests/special.test.js 断言形状识别与影响范围
禁止：实现魔力鸟
前置依赖：Step 7
参考：REFERENCES.md §2.2 Step 8
```

**Step 8 实战记录（2026-09-20）**

- `detectMatchShape` 从 Step 2 起就能返回 `L`/`T`，所以本步只补了「映射 + 落点 + 影响范围 + 外观」；`config.js`、`board.js`、`timeline.js` **一行未改** —— Step 7 的 `spawnKeys`、链式清除与消除阶段补丁机制对包装糖果直接通用。这验证了 Step 7 把那套机制做成「类型无关」是对的。
- 落点口径：L/T 取**交叉点**（两条臂的公共格），与 4 连取「靠近中间」并列写进 D023；验收项「边界裁剪」用内部 9 / 边 6 / 角 4 三档断言。
- 老用例会因此失效，必须同步更新：`tests/integration.test.js` 里 Step 3 的「L 型消 5 格」要改成「消 4 格 + 交叉点留下包装糖果」，否则会把正确实现判成回归。
- 验证脚本的两个高频坑（本轮各踩一次）：① 近白像素判据会被左上高光污染，要按**象限**区分；② 消除键/消除阶段补丁都在**重力前**坐标空间，任何「生成格在不在消除键里」的断言都必须用 `cell.id` 而不是坐标。


## Step 9：魔力鸟

```text
任务：实现魔力鸟（5 连直线生成，交换后消除全屏同色）
范围：允许改 special.js、match.js、board.js、game.js、app.js、config.js、tests/special.test.js
验收：5 连直线生成 magic；与普通色块交换清除全屏该色；不能与空格交换
测试：node tests/special.test.js 断言生成与全屏清除坐标集合
禁止：实现特殊元素组合
前置依赖：Step 8
参考：REFERENCES.md §2.2 Step 9
```

**Step 9 实战记录（2026-09-20）**

- 本步的难点不是「怎么消」，而是 **4.2 的签名表达不了 3.2 的这条规则**：`getSpecialAffectedCells(board, r, c, type, direction)` 没有「目标颜色」参数，board 层也没有「清除任意坐标集合」的能力。开工前先向用户确认了三条口径并升宪法 **v1.11**（三条纯追加：`special.getMagicTargets`、`board.resolveCascades` 的 `initialClear`、`game.resolveBoard` 透传；两条行为口径：保留颜色但不参与同色匹配、交换消耗 1 步且拒绝空格）。**先定契约再写码**，避免了「先实现后改宪法」。
- 提示词里最好直接写清「魔力鸟不参与同色匹配（4.3.14）」。否则很容易顺手让它按颜色参与匹配 —— 那会让它被普通 3 连意外引爆，与「交换才触发」的口径冲突。
- 三个落点规则现在集中在一处：4 连取靠近中间、L/T 取交叉点、5 连直线取正中；`createSpecial` 里一眼能看全。
- **验证脚本必须同步升级模型**：Step 9 起盘面会出现魔力鸟，而旧套件（`verify-step6`、`audit-gate-step8`）仍把魔力鸟当可匹配格，于是把游戏正确拒绝的交换当成应当有效，整局循环提前耗尽、6 项失败。修法是给脚本补「魔力鸟识别（白心 + 多色相环）+ 匹配排除 + 优先走魔力鸟交换」。**产品代码一行未改** —— 脚本模型落后就改脚本。
- 顺带记录一个 3.8 的口径后果：`hasPossibleMove` 只认「交换后形成三消」，所以「只剩魔力鸟可换」会被判死局并重排；这是 3.8 字面定义的结果，本步不开例外（见 D025 第 6 条）。

## Step 10：特殊元素组合

```text
任务：实现六种特殊元素组合效果
范围：允许改 special.js、game.js、app.js、config.js、tests/special.test.js
验收：六种组合按宪法 3.3 生效，优先级按 3.3 排序，组合触发扣 1 步
测试：node tests/special.test.js 逐一断言六种组合的影响坐标集合
禁止：新增宪法未列出的组合类型
前置依赖：Step 9
参考：REFERENCES.md §2.2 Step 10
```

**Step 10 实战记录（2026-09-20）**

- **本步不需要新的契约**：`resolveSpecialCombo(board, a, b)` 已在 Step 9 一并登记进 4.2（v1.11），`board.resolveCascades` 的 `initialClear` 也已存在。因此提示词里应该直接写明「复用既有入口、不新增契约」，避免又发明一套组合专用的清除 API。三步走完全够用：`trySwap` 判两侧都是特效 → `resolveSpecialCombo` 就地改造并返回清除坐标 → `resolveBoard(state, { initialClear })` 清除并级联。
- **最关键的一条设计是「`initialClear` 同时充当激活种子」**：3.3 里「条纹 + 魔力鸟 → 全屏同色变条纹并立即触发」「包装 + 魔力鸟 → 同色变包装并触发」「条纹 + 包装 → 区域内再触发包装爆炸」这三条**都不需要单独实现爆炸** —— 把要变形的格子就地改好、把坐标丢进清除集合，board 的种子链会让它们各自按 4.3.8 展开。若按直觉在 `special.js` 里再写一套二次爆炸，就会出现两处口径，迟早漂移。
- **倍数不要杜撰**：3.5 的倍数表只有四种「双方同类」组合；「条纹/包装 + 魔力鸟」按已有的魔力鸟 2.5 回落。`COMBO_TYPES` 的值与 `SCORE_CONFIG.specialMultipliers` 的组合键同名，`multiplierForLevel` 直接查表即可。
- **`multiplierForLevel` 只能看到逐层被清除的格子，看不到组合的双方是谁**，所以「级联里恰好清掉 2 颗条纹」会被记为 3.0、「恰好清掉 1 颗魔力鸟 + 别的特效」会按 2.5。规则顺序（magic ≥ 2 → 包+包 → 条+包 → 条+条）刻意对齐 3.3 的优先级；这条简化必须写进 `PROGRESS.md`/`DECISIONS.md`，不要假装精确。
- **组合会瞬间制造大面积空洞**（条+条 15 格、魔+魔 64 格），值得单独做一条渲染取证：真实 `render.js` 在空洞格不画糖果、不抛异常。
- **验证脚本的缓存问题（P3-6）**：`index.html` 用 `?t=` 破缓存，但它 `import` 的 `./special.js` 等子资源不带查询串，浏览器会复用上一轮的旧模块 —— 第一次跑 Step 10 验证时页面里根本没有 `COMBO_TYPES`，等于**拿旧代码当新代码验**。所有验证脚本此后都要加 `Network.enable` + `Network.setCacheDisabled({ cacheDisabled: true })`。
- **时序类脚本要把输入锁算进去**：组合/长级联会让动画变长，`verify-step5` 的「越界滑动」用例因为触摸落在输入锁窗口内而丢日志。修法是等动画结束后重投（输入锁吞掉的触摸不算产品缺陷）。

**Step 11 实战记录（2026-09-20）**

- **先问的三个口径决定了整步的形态**：① 冰块内的动物被消除后是否保留（选：动物消失并从上方补位、冰 −1 层，3 层冰因此需要三次消除）；② 同一层有多颗相邻动物被消除时雪块扣几层（选：**一层 = 一次被波及**，每格每层最多 −1）；③ 层数分是否参与特效倍数（选：另算不乘倍数）。提示词里最好把这三条直接写清，否则很容易实现成「一次 3 连贴着雪块扣 3 层」或「1000 分被 5.0 倍放大」。
- **最关键的设计是「障碍物属于格子」**：3.8 要求重排不改变障碍物布局，3.4 又要求冰里的动物可以移动 —— 只有把障碍物当**格子属性**才能同时成立。因此 `swapCells`（只移动动物、按位置还原两端障碍字段）、`compactSegment`（动物下落时同样按位置还原）、`refillBoard`（补位保留该格的冰）三处都要照顾到，缺一处冰就会随动物滑走或被补位抹掉。
- **顺手修掉一个 Step 3 的潜伏缺陷**：`clearCells` 只把 `color` 置 null 而保留 `obstacle`，于是冰块格会被判成**屏障** —— 不补位、还把所在列错误截断。今天没有关卡放冰块所以从没触发，但它说明**旧词汇（洞/屏障）会随着新玩法失效**：屏障判定必须按「占格障碍」而不是「有 obstacle」。
- **受损判定必须在 `clearCells` 之前做**：那之后所有被消除的格子都是空色，分不清哪些原本是动物；判定还要用 Set 按层去重才能落实「一层 = 一次被波及」。
- **外观改动被像素取证推翻了两次**：冰覆层 alpha 0.55 时真实 renderer 下红糖果被染成粉色（色相 358°→330°），两格已认不出糖色 —— 这是**产品问题**（玩家要判断冰里是哪颗动物），降到 0.35 后 6 色仍各自可辨；随后又发现三条裂纹里有一条正好压在格心，把「格心色相」这个最重要的识别点弄脏了，于是把裂纹全部移出格心。**像素取样的位置本身也是一种设计约束**。
- **旧脚本的模型又失效了一次（P3-5 第四次）**：「开局 64 格都有动物」「每格都能认出色相」「色相最大偏差 < 8 度」在雪块（不透明白格）与魔力鸟（白心）出现后必然失败。修法是改成障碍物感知口径，并让 `hasRun` 忽略识别不出的格子（否则相邻两块白格会被误读成三连）。**别为了脚本变绿去改产品**。
- **断言别写「随机局面必须出现 X」**：`verify-step10/11` 的「真实滑动中必须出现一次 4 连」在盘面多了 6 个障碍物后未必成立，改成「完成 ≥20 次滑动且全程无异常」，4 连次数降为观测量。

## Step 11：冰块与雪块

```text
任务：实现冰块与雪块障碍物
范围：允许改 obstacles.js、board.js、match.js、special.js、game.js、app.js、config.js、tests/obstacles.test.js
验收：冰块 1-3 层、雪块 1-5 层，不参与匹配，影响下落与交换，被波及减 1 层，得分按宪法 3.5
测试：node tests/obstacles.test.js 断言层数减少与得分
禁止：实现藤蔓、巧克力
前置依赖：Step 10
参考：REFERENCES.md §2.2 Step 11
```

**Step 12 开工前提示（2026-09-20，文档先行）**

- 关卡设计已经定稿在 `LEVELS.md`：50 关、五个阶段、10 个命名障碍布局图案、五条硬指标。**实现时以文档为准**，不要凭手感改数值；确需微调只动「步数、收集数量、clearIce 层数、星阈值」四项，并同步文档 + 重跑 `_build/lint-levels.mjs`。
- 建议拆成 12.1（目标与三星引擎 + 进度累加 + HUD 常驻显示）与 12.2（50 关落地 + 关卡表巡检 + 通关流转）分别验收。
- 关卡表巡检要断言「代码里的表与 `LEVELS.md` 逐项一致」，否则文档与实现会立刻漂移 —— 这正是把设计提前落成文档的收益。
- `clearIce` 只计**冰块层数**（雪块层数不计入 `Level.clearedIce`）；`collect` 的键是 `COLOR_NAMES` 里的动物名，需要 level.js 用 `CONFIG.COLOR_NAMES` 解析成颜色索引。

## Step 12：关卡模式（50 关）与三星评分

```text
任务：实现关卡目标与三星评分
范围：允许改 level.js、game.js、app.js、config.js、tests/level.test.js
验收：支持 score/collect/clearIce/mixed 四种目标，步数用尽未达成即失败，三星仅取决于分数，剩余步数按 3.5 转化
测试：node tests/level.test.js 断言四种目标判定与三星计算
禁止：实现道具系统
前置依赖：Step 11
参考：REFERENCES.md §2.2 Step 12
```

## Step 13：更多障碍物（藤蔓、巧克力）

```text
任务：实现藤蔓与巧克力障碍物
范围：允许改 obstacles.js、board.js、app.js、tests/obstacles.test.js
验收：藤蔓中动物不能交换但可被相邻波及；巧克力被相邻消除或特效波及即消除；重排不改变障碍物布局
测试：node tests/obstacles.test.js 断言交换限制与波及消除
禁止：实现绳索（宪法未定义规则）
前置依赖：Step 12
参考：REFERENCES.md §2.3 Step 13
```

## Step 14：关卡类型

```text
任务：实现水果关、时间关、金豆荚关三种关卡类型
范围：允许改 level.js、game.js、app.js、config.js、tests/level.test.js
验收：水果关收集水果；时间关以时间替代步数；金豆荚落到指定位置即通关
测试：node tests/level.test.js 断言三种关卡通关判定
禁止：修改已验收的关卡目标语义（金豆荚机制宪法未定义，需先在 DECISIONS.md 记录设计）
前置依赖：Step 13
参考：REFERENCES.md §2.3 Step 14
```

## Step 15：道具系统

```text
任务：实现刷新、加五步、小木锤三种道具
范围：允许改 level.js、game.js、app.js、config.js、tests/level.test.js
验收：刷新不消耗步数重排；加五步 +5；小木锤消除单格；道具数量持久化在 app.js 层完成
测试：node tests/level.test.js 断言三种道具效果
禁止：逻辑模块直接操作 localStorage
前置依赖：Step 14
参考：REFERENCES.md §2.3 Step 15
```

## Step 16：音效与震动反馈

```text
任务：接入音效与震动反馈
范围：允许改 app.js、styles.css、config.js，新增 assets/ 音频
验收：消除/连消/特效/结束各一处音效，支持静音开关并持久化，支持 navigator.vibrate 且有兼容性检测
测试：真机验证；首次用户手势后才初始化 AudioContext
禁止：引入音频库；使用未授权素材
前置依赖：Step 15
参考：REFERENCES.md §2.3 Step 16
```

## Step 17：粒子动画与视觉打磨（已完成，v1.27 / D044）

```text
任务：为消除、特效、组合效果加入粒子动画
范围：新增 particles.js + tests/particles.test.js；允许改 candy.js、render.js、app.js、config.js
验收：粒子不影响帧率预算（60fps，低端机 ≥30fps）；特效有独特粒子表现
      粒子每帧贴图 ≤ PARTICLE_CONFIG.maxPerFrame（96）且计入 15 节的「单帧绘制调用 ≤ 200」；
      prefers-reduced-motion 下不生成（不是变透明）；同输入同粒子（确定性）
测试：_build/verify-step17.mjs 实测「播放帧画布调用数 / 画布耗时 p95 / 粒子贴图峰值 / 减少动效下 0 颗」；
      确认每帧路径无阴影模糊类 API（源码 grep 计数 = 0）
禁止：引入粒子引擎；每帧滥用阴影模糊/径向渐变；用运行时随机抖动；为粒子改动任何玩法规则或 4.2 契约
前置依赖：Step 16
参考：REFERENCES.md §2.3 Step 17 与 §3.5 三条性能红线；DECISIONS.md D044
已完成：particles.js（环形池 + 确定性生成计划 + 只读快照）、candy.js 的 buildParticleAtlas、
        render.js 的 drawParticles、app.js 的时间线挂载；外观方案 A（预烘焙精灵 + 三类强度）
```

## Step 18：Capacitor 打包

```text
任务：按 ROADMAP.md Step 18.<子步骤>，把功能冻结的 H5 游戏包装为 Capacitor 原生应用候选版本
开始前：
1. 阅读 AGENTS.md、ROADMAP.md §0.1/§0.2/Step 18、REFERENCES.md Step 18、PROGRESS.md、DECISIONS.md。
2. 先完成扩展前 Bug Audit Gate，固定源码 commit/tag，确认 P0/P1 为 0。
3. 取得用户对 Capacitor 依赖、平台工程和最小资源准备脚本的明确批准；没有批准不得修改 package.json 的零依赖状态。
4. 盘点实际可用环境。Windows 上不得把 iOS 写成“已验证”；缺少 Android Studio/SDK、macOS/Xcode 或真机时必须写未验证。
子步骤：
- 18.1：环境盘点、功能冻结、包标识/版本/回滚点与本地存储预期。
- 18.2：可重复生成 webDir、Capacitor 初始化、add/sync 平台，验证 ESM 和资源路径。
- 18.3：WebView 的触摸、生命周期、safe-area、localStorage、音频、震动和离线降级边界。
- 18.4：Android Debug 构建、安装、真机冒烟和日志证据。
- 18.5：macOS/Xcode 上 iOS 模拟器/真机构建与验证；模拟器不能替代真实触摸或震动。
- 18.6：Release 版本映射、图标/启动图、最小权限、隐私说明、签名隔离和签名产物。
- 18.7：新安装、覆盖升级、卸载重装、前后台、离线启动、平台矩阵、归档和回滚演练。
范围：只改当前子步骤列出的文档、资源准备、Capacitor 配置或平台工程；不得推进 Step 8-17 玩法，不得在 Android/iOS 原生层重写匹配、计分、棋盘或关卡规则。
验收：逐项满足 ROADMAP 对应子步骤的门禁；分别报告“生成工程”“Debug 已安装”“真机已验证”“Release 已签名”“商店准备”的实际状态，不能混用。
测试：每次 Web 资源变更均执行 npm run stage:web -> 资源检查 -> npx cap sync <platform> -> 平台复测；若 Web 逻辑改动，额外运行 node tests/run-all.js 和浏览器冒烟。
证据：按 ROADMAP.md §0.2 标注 L0-L6；记录命令、工具版本、commit/tag、包标识、版本、设备、产物文件名、校验值、日志位置和未验证边界。
安全：密钥、证书、Provisioning Profile、签名密码和真实账号信息均不得进入 Git、终端回显、截图或 PROGRESS.md；只使用受控凭据存储。
失败与回滚：保留完整构建错误和最小复现；修复后从 stage:web 和 cap sync 重新开始。发布阻塞缺陷回到固定 tag/commit，修复并递增构建版本后生成新包，不覆盖旧 Release 包。
禁止：用 Android 结果替代 iOS 结论；把 Debug APK 说成正式发布包；为了适配原生而改变已验收游戏规则语义；未记录许可来源就加入图标、启动图或其他素材。
前置依赖：Step 17、ROADMAP.md §0.1 Gate；iOS 还依赖可用的 macOS/Xcode 环境
参考：REFERENCES.md §2.3 Step 18.1-18.7
```

---

## Step 19：藤蔓地图与存档演进

```text
任务：按 ROADMAP.md §4.1 的 Step 19 推进「藤蔓地图 + 存档演进」（用户提案，见 DECISIONS D037）
开始前：
1. 阅读 AGENTS.md（2.3 / 5.1 / 6）、ROADMAP.md §4.1 Step 19、PROGRESS.md 的 19.1 记录、DECISIONS.md D037。
2. 确认子步骤：19.1 存档版本化（已完成）→ 19.2 藤蔓地图（已完成）→ 19.3 解锁 / 天边关卡 / 隐藏关（**已完成**，宪法 v1.28 / D045）。
3. 19.3 属规则变更（宪法 3.6 目前没有「解锁」概念），未获用户批准不得动工；软件化（Tauri / Capacitor）同属拍板项。
子步骤：
- 19.1：storage.js 的 backend 注入、存档 version + 就地迁移、totalStars 派生（已完成，v1.21）。
- 19.2：vine-map.js（SVG，确定性路径）+ 坐标三件套 + 巡检脚本；改写 canvas 选关链路为 DOM 事件与 verify-step12b。
- 19.4（已完成，v1.29 / D046）：藤蔓地图**从下往上**（`climbDirection = 'up'`，页内最下方是第 1 个节点）+
  画风增强（分层背景 / 双层藤蔓 / 节点高光 / 锁形图标 / **当前关指针** / 云层漂移 / 进度条渐变，零素材）；
  路径锚点方向随之翻转、跨屏衔接条件改为 `入口 y − 1 ≈ 出口 y`；**玩法零改动**。
- 19.3（已完成，v1.28 / D045）：**只按累计星数**解锁（门槛 = `round((n−1) × UNLOCK_CONFIG.starsPerLevel)`，第 1 关恒解锁，
  已通关的关卡永远可玩）；**天边云层**（`tianbianStars` = 120）散去后露出隐藏关 51–53（演示关，不计入 ⭐ n/150）；
  地图 6 页 + 节点三态（新增 `locked`），点锁定关卡被拒并弹「还差 N ⭐」；**解锁状态是派生量，存档格式不变**。
验收：每个子步骤单独验收；19.2 需 50 节点可见可点、星级正确、页面不可滚动、改写后的套件全绿。
禁止：自行发明解锁规则；引入依赖或构建工具；地图层读写游戏状态或存档；坐标出现两个真相源。
前置依赖：Step 19.1（19.2）；用户对滚动口径与解锁口径的批准（19.2/19.3）。
参考：用户提案 §1.1-§1.5、DECISIONS.md D037
```

---

## Step 19.5：把「左右翻页」换成「藤蔓向上蔓延」（世界坐标 + 视口内纵向平移）

```text
任务：按 ROADMAP.md §4.1 的 Step 19.5 推进「世界坐标 + 视口内纵向平移」（用户口径，见 DECISIONS D047）
开始前：
1. 阅读 AGENTS.md（2.3 / 5.1 / 6 / 附录 B）、ROADMAP.md §4.1、PROGRESS.md 的 19.5 执行卡与完成记录、DECISIONS.md D040 / D045 / D046 / **D047**。
2. 口径（**已向用户确认**）：**保留 19.3**（解锁门槛 / 天边云层 / 隐藏关、53 个节点），只把「分页」换成「世界纵向平移」；
   用户方案「不做」一栏的三项是 19.3 交付前的旧口径，回退它们属规则回退，需单独批准。
范围：
- config.js：`VINE_MAP_CONFIG` 世界模型（`worldHeightRatio` / `nodesPerRow` / `scrollMs` / `dragThreshold` / `scrollInertia` /
  `navStepRatio` / `parallaxFar` / `parallaxNear` / `particleCount` / `tianbianBand` / `backdropBleed`；删 `pageSize`/`nodeRows`/`pageSlideMs`）；
  `LEVEL_MAP_POS` 改世界归一化坐标（生成器仍是唯一写入方；LEVELS.md §9 表头改「关 / x / y」）。
- _build/gen-vine-map.mjs 与 _build/check-vine-map.mjs：世界不变量（y 严格单调、行距 > 2 × 错落、任意连续 2 行覆盖 3 列、
  **云带覆盖全部隐藏关且不盖住第 50 关**、锚点跨越整个世界）。
- vine-map.js / vine-map.css / app.js：视口固定 + `translateY` 平移、自动居中、「回到当前关」、▲▼、单条贯穿世界的贝塞尔、
  两层视差（0.25× / 1.45×）+ 确定性星光、云带、`relayoutMap`；**事件仍由 app.js 委托，地图层不绑事件**。
验收：node tests/run-all.js 0 失败；python _build/consistency_check.py 全绿；node _build/check-vine-map.mjs PASS；
      浏览器里「进入当前关居中、拖拽跟手、松手无残余惯性、页面不滚动（scrollY 恒 0）、云带覆盖隐藏关、满星后 51–53 露出」。
禁止：改玩法规则与数值（解锁 / 星级 / 关卡表一律不动）；改 input.js（侦察结论：不需要）；引入素材或依赖；
      让页面本身滚动或缩放（5.1）；把「分页」的旧断言留在 verify 套件里不管（要改写，且属**规则变更式改写**，须在 PROGRESS 明写）。
前置依赖：Step 19.4 已验收（tag step19.4-done）+ Gate 0.1 第十五轮通过；用户对「保留 19.3 / 本轮只做原型」的确认。
参考：用户提案（把左右翻页换成向上蔓延）、DECISIONS.md D047
```

---

## Step 20：结算阶段与星级统一动态调整

```text
任务：按 ROADMAP.md §4.2 的 Step 20 实现「结算阶段」（余步 → 递增奖励分 + 随机特殊糖果 → 从棋盘底部到顶部连锁引爆）
      与「星级统一动态调整」（一条公式派生 2★/3★ 阈值，含结算期望分修正）
开始前：
1. 阅读 AGENTS.md（3.5 / 3.6 第 7 条 / 3.7 / 4.2 / 附录 B）、ROADMAP.md §4.2 Step 20、DECISIONS.md D041、PROGRESS.md 的 Step 20 记录。
2. 确认三处口径：① 余步奖励用递增制、量级挂在关卡 1★ 基准分上；② 转化用固定种子的受控伪随机（mulberry32(seed + 关卡id)）；
   ③ 结算阶段**不再消耗步数**，且**取代**旧的「每剩余一步 30 分」（否则同一批步数被计两次分）。
子步骤：
- 20.1：settlement.js（PRNG / 转化计划 / 引爆顺序）+ game.settleEndgame（队列式连锁引爆）+ timeline 的「转化定格」一帧。
- 20.2：递增奖励分 settlementStepsScore + 沿用 3.5 特效倍数表的连锁引爆分；删除 SCORE_CONFIG.stepBonus 与 getRemainingStepBonus。
- 20.3：level.computeStarThresholds（统一动态派生）+ 用 _build/measure-step20.mjs 的**实测数据**标定 typicalRemainingRatio 与 settlementCoverage。
- 20.4：彩星 rainbow 字段预留与存档迁移（已完成，v1.26）—— 只做「字段 + 迁移」，彩星的**分数线**仍属后续数值调优。
验收：node tests/run-all.js 全绿；python _build/consistency_check.py 全绿；lint-levels / check-level-table PASS；
      浏览器里过关后**先转化定格、再连锁引爆**，结束面板星级与最终分一致；LEVELS.md 阈值列与代码逐项一致；
      verify-step19-1 / 19-2 在 v2 存档格式下仍全绿。
禁止：结算阶段消耗步数；运行时随机；为连锁引爆另起一套倍数表；把阈值改成逐关手写的表；
      把彩星**计入总星数**（口径是「不计入」，见 D042）。
前置依赖：无（Step 12.3 的「结束前引爆」是本步前身）。
参考：用户提交的结算阶段方案；DECISIONS.md D041；_build/measure-step20.mjs 的产数据。
```

---

## Step 21：对局 UI 视觉升级（HUD 果汁化 / 道具栏 / 棋子拟人化）

```text
任务：实现 ROADMAP.md §4.3 的 Step 21「对局界面果汁感升级」（用户方案，见 DECISIONS D048）
开始前：
1. 阅读 AGENTS.md（2.3 的 DOM/Canvas 分工、5.1 禁滚动、15 节的绘制预算与「零 shadowBlur / 零每帧渐变」、
   附录 B）、ROADMAP.md §4.3、DECISIONS.md D048、PROGRESS.md 的 19.5 收口记录。
2. 口径：**玩法零改动**（计分 / 步数 / 目标 / 星级 / 关卡表一律不动），只改信息层与外观；
   用户已批准三步全做：21.1 HUD 果汁化 → 21.2 道具栏与设置 → 21.3 棋子拟人化。
范围：
- 21.1：config.js 加 HUD_CONFIG；hud.js 加目标进度条（含达标闪烁）、步数 ≤5 心跳缩放、分数飘字池（纯函数 +
  绘制）、连击文字走既有 drawBanner 通道；render.js 在**静态图层**里烘焙 HUD 卡片（圆角 / 内嵌高光 / 阴影）
  并绘制飘字；app.js 把 nowMs 与飘字池接进帧循环。
- 21.2：index.html + styles.css 的道具栏（右上角红色圆形计数徽章、图标、糖果质感 3D 描边）与「音效/震动」
  收成设置齿轮弹层；**必须保住 --booster-bar-h 契约**（render.js 从可用高度里扣它、它决定 computeBoardSize）。
- 21.3：candy.js 重烘焙 6 色 × 5 状态 = 30 张精灵（高光 / 厚投影 / 小眼睛与腮红），**仍布局期一次性烘焙**。
验收：node tests/run-all.js 与 python _build/consistency_check.py 全绿；浏览器里进度条 / 心跳 / 飘字可见且飘完回收；
      每帧绘制调用 ≤ 200（15 节）；**每个子步先出截图交用户确认再继续**；21.3 之后复跑像素哈希套件
      （verify-step17 / verify-step20）与 Gate 0.1 第十七轮。
禁止：改玩法数值或规则；引入素材或依赖（D009 零素材，全部程序化画）；**每帧** shadowBlur / 渐变（只能烘焙）；
      把 HUD 或棋盘挪到 DOM / 把道具条挪到 canvas；破坏 --booster-bar-h 契约。
前置依赖：Step 19.5 收口（tag step19.5-done / gate-0.1-step19.5-pass）。
参考：用户提交的「对局核心界面 UI 优化方案」；DECISIONS.md D048。
```

---

## Step 22：藤蔓地图「共生」重构（节点长在藤蔓上）

```text
任务：实现 ROADMAP.md §4.4 的 Step 22「藤蔓地图共生重构」（用户 2026-09-26 提交的改进总方案，见 DECISIONS D049）
开始前：
1. 阅读 AGENTS.md（2.3 的 DOM/Canvas 分工、5.1 禁滚动、15 节的绘制预算与「零 shadowBlur / 零每帧渐变」、
   附录 B）、ROADMAP.md §4.4、DECISIONS.md D049、LEVELS.md §9、PROGRESS.md 的 19.5 / 21.2 记录。
2. 四条已确认口径（用户逐条确认，不要自行更改）：
   ① **不反转数据流** —— 节点坐标（LEVELS.md §9 ↔ LEVEL_MAP_POS ↔ check-vine-map.mjs 三件套）是唯一真相源，
      曲线**反向拟合**穿过它们（Catmull-Rom → 三次贝塞尔），不得由曲线定义节点；
   ② **禁用一切视觉滤镜** —— 不上 feGaussianBlur / box-shadow，光影用「内嵌高光偏移 + 下缘预烘焙暗边」的几何 + 静态渐变；
   ③ **保持「向上」，但 y 原点翻到世界底部** —— y 随关号递增，屏幕换算 = (1 − y) × 世界总高；
   ④ 平移保持「节点居中夹取」（首/末关都要能真正居中），世界总高保持固定比例（不按视口反算「正好 5 屏」）。
范围：
- 22.1：_build/gen-vine-map.mjs 生成器改为 y 自底向上递增（同时翻 anchors 的 y 语义）→ 重跑生成器重写
  level.js 的 LEVEL_MAP_POS 与 LEVELS.md §9；vine-map.js 的 mapGeometry / yOf / visibleLevelIds /
  focusedLevelId / 云带 / 天空与地面分层全部改用 (1 − y) 换算；check-vine-map.mjs 的单调性断言改为「递增」；
  tests/vine-map.test.js 与 _build/verify-step19-2/19-3/19-4.mjs 的 y 断言同步。**视觉零变化**。
- 22.2：vine-map.js 用「穿过每个节点」的平滑曲线画藤蔓（节点仍是真相源）+ 藤蔓分段渐粗（底部细 → 顶部粗）
  + 沿路径的叶子/卷须（固定种子决定朝向，不使用运行时随机）。
- 22.3：vine-map.css / vine-map.js 做视觉降噪与焦点 —— 当前关金色呼吸光环 + 放大 15% +「当前」标签（去掉小黄箭头）；
  未解锁改磨砂质感（半透明低饱和暗绿 + 白细描边 + 精致小锁）；星星 +30%、未点亮改浅灰描边；
  视口底部深色渐变遮罩（暗示「下面还有路」）；首次进入的上滑提示（一次性、reduced-motion 不播）；
  「回到当前关」移到右下角并图标化。
验收：node tests/run-all.js 与 python _build/consistency_check.py 全绿；node _build/check-vine-map.mjs PASS；
      **「每个节点到藤蔓曲线的距离 ≤ 0.5px」为硬断言**（22.2 的核心）；光影是几何 + 静态渐变，代码里不出现
      任何 SVG 滤镜或 shadowBlur、不出现每帧新建渐变；页面仍不可滚动（5.1）；当前关仍能真正居中；
      **每个子步先出截图交用户确认再继续**（截图请附 _build/png-stats.mjs 的像素统计，本机没有视觉模型）。
禁止：改玩法数值或规则（解锁门槛 / 天边云层 / 隐藏关 / 50 关表一律不动）；引入素材或依赖（D009）；
      SVG 滤镜 / feGaussianBlur / canvas shadowBlur / 每帧渐变；由曲线定义节点坐标；破坏「进入地图当前关居中」。
前置依赖：Step 19.5 收口（tag step19.5-done）、Step 21.2（tag step21.2-done）、用户确认的四条口径与 22.x 原型截图。
参考：用户「🚀 改进总方案（针对性优化）」五节 + 落地实施路线；_build/proto-vine-22.html（一次性原型）；
      King 的 Candy Crush 地图专利 WO2014041202A1；DECISIONS.md D049。
```

---

## Step 23：对局页「满屏竖版」配比（对齐真实竖屏手游）

```text
任务：实现 Step 23 对局页「满屏竖版」配比（对齐真实竖屏手游的纵向配比）
开始前：读 AGENTS.md（2.3 / 5.1 / 5.2 / 5.5 / 15）、ROADMAP.md §4.5、DECISIONS.md D051、PROGRESS.md 最近的配比实测记录
背景：用户问「目前游戏的页面配比符不符合手机游戏的实际配比，《开心消消乐》是多少×多少，要不要改一下」，
      并在三选一（只做快赢 / 一步到位 / 暂不改）里选了「一步到位」。实测旧版 iPhone 14 上 HUD 只有 47px（5.6% 屏高）、
      棋盘区 311px（格边长 38.9px）、纵向只有 54.3% 被内容占用（上下各 193px 空白），而地图层 #map 本就是满屏层。
落地：
- render.js：computeBoardSize 删除 → computeCanvasSize() 返回 {w,h}（宽 = 屏宽，高 = 屏高 − 安全区 − --booster-bar-h）；
  boardRect({w,h}) 给出「满宽 HUD 带 + 正方形棋盘区 + 底部台面」；buildChrome 新增棋盘台面（含 1px 上沿高光）与底部暖光带；
  P2 的暖色环境光从「只罩棋盘区」扩到整块画布。全部仍是布局期烘焙一次的几何填充。
- hud.js：HUD_RATIO 0.13 → 0.165（语义改成「/画布高」）；hudCells(canvasW, hudHeight) / drawHud({ canvasW, ... })；
  字号不再写死比例，改为「按带高给目标字号 → fitSize 压到卡片宽度内」，长分数绝不溢出卡片。
- app.js：applyLayout 用 computeCanvasSize + boardRect，画布 style/backing 按 w×h；场景描述 sizePx → canvas: {w,h}；
  cellAt 传 canvasSize。styles.css 的 #board 兜底尺寸改成满屏竖版（不再 aspect-ratio 1/1）。
- _build：23 个探针里各自内联的旧几何（hudCss = round(sizeCss*0.13)、sideCss = sizeCss − hudCss、
  以 hudCss 当棋盘顶边 y）统一改成调用 render.js 的真实几何，并把棋盘取样点从「HUD 底边」改成「棋盘区顶边」；
  含 await import 的页面表达式全部改成 async IIFE（evaluate 的 awaitPromise 已为 true）。
验收：node tests/run-all.js 与 python _build/consistency_check.py 全绿；node _build/check-canvas23.mjs 12 项 PASS；
      node _build/measure-layout.mjs 6 视口「上下留白 0、滚动 OK、HUD 13–18% 屏高、格边长 ≥42px」；
      受影响的浏览器套件（verify-step4–20、verify-step19-2/3/4、audit-gate-step7–11、shot-hud-*、
      shot-candy-21、shot-booster-21）全部复跑通过；出截图交用户确认（本机没有视觉模型，附 png-stats 像素统计）。
禁止：改玩法数值或规则；破坏 5.1（禁滚动/缩放）与 5.2（棋盘必须正方形）；改 --booster-bar-h 的契约语义；
      引入素材或依赖（D009）；每帧 shadowBlur 或每帧新建渐变（D043/D044）；把 HUD 挪出 canvas（2.3）。
前置依赖：step21.3-done、step22.2-done、用户选定「一步到位」。
参考：用户对页面配比的追问与选择；行业通用的「设计分辨率 + 高度适配」口径（750×1334 / 720×1280，
      更高的屏把多出来的高度给装饰而不是留黑边）；DECISIONS.md D051。
```

---

## 待补充的提示词模式（随实战积累）

- 报错排查类：`先把完整的报错栈贴出来` + 复现步骤 + 预期行为 三段式。
- 规则争议类：引用宪法条款号，不允许 Agent 自行发明规则。
- 性能排查类：先给测量命令（DevTools Performance / `performance.now()` 循环），再给结论。
