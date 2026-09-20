# DECISIONS — 关键决策记录

> 关联文件：`AGENTS.md`、`ROADMAP.md`、`REFERENCES.md`
> 使用方式：每次出现非显然决策时追加。新的记录在最上方。
> 编号规则：`D001`、`D002`……，一旦分配不再复用。

---

## D018：Step 6 的死局检测与重排口径

- 日期：2026-09-19
- 背景：3.8 要求「每次消除和填充完成后检测是否存在至少一个有效交换；无可行交换则重排或结束游戏」，并给出四条重排约束。落地时需要在「重排什么、失败怎么办、检测放在哪」上定口径；另外本轮实测发现一个与色数相关的非显然事实。
- 决策：
  1. **`shuffleBoard(board, options?)` 只重排「普通动物格」**（`color !== null && obstacle === null`）：障碍物格既不参与置换、也不会被写入其他内容，从而**严格满足 3.8 约束 3「不改变障碍物布局」**。冰块/藤蔓里的动物与障碍物是绑定的，单独搬动动物会破坏「障碍物—动物」对应关系，因此一并排除，留待 Step 11/13 按规则细化。
  2. **重排置换的是格子对象本身**（`cell.id` 随对象移动），因此 UI 只需按 `id` 匹配前后快照即可得到每格的起止位置做动画，`shuffleBoard` 不必额外返回轨迹（保持 4.2/v1.5 的 `boolean` 返回）。
  3. **失败时还原棋盘**：若用尽 `maxTries` 仍未得到「无三连且可行交换」的局面，把动物格恢复为重排前的排列。否则棋盘会停在「被打乱且含三连」的中间态 —— 对调用方与玩家都是更糟的状态；还原后至少保持「无三连」的自洽状态，再由调用方进入结束流程。
  4. **`options.stats` 作为诊断出参**：4.2/v1.5 的 `shuffleBoard` 只返回 `boolean`，而 `DeadlockResolution.tries` 需要真实尝试次数，故用调用方提供的 `{ tries }` 对象回传（显式、可选，不影响布尔返回语义）。
  5. **检测点放在 `game.resolveBoard` 内**（3.8 原文是「每次消除和填充完成后」），且**不加「最后一步跳过」的例外**：即使本次交换已耗尽步数，也照样检测与重排，避免给规则加例外分支；重排不消耗步数（`consumeStep` 与重排互不影响）。
  6. **「死局 + 重排失败 → 结束流程」的接线没有可执行测试覆盖，已如实登记**：该分支需要同时满足「无可行交换」与「任何置换都含三连」。在 6 色 8×8 满盘上二者不可能同时成立（无三连的棋盘里每种颜色约 10 个，随机置换避免三连的概率约 7%/次，50 次内成功率 ≈ 97%），故它只在关卡配置异常时才可能触发。本轮验证到「`resolveBoard` 会如实报告 `deadlock.shuffled === false`」（用退化盘构造），`state.gameOver = stuck` 那一行只有代码审查、没有可执行测试。
  7. **实测发现：重排对色数极其敏感**。3 色满盘（`(r+2c)%3`）随机置换避免三连的概率约 `e^{-10.6} ≈ 2e-5`，50 次内几乎必然失败；6 色盘约 `e^{-2.67} ≈ 7%/次`，50 次内 ≈ 97% 成功。这既说明 3.8 约束 4 的「关卡异常」分支在少色关卡里是**真实路径**而非死代码，也说明「重排应成功」的测试夹具必须用 6 色盘（该结论已写进 `tests/board.test.js` 注释）。
  8. **重排的提示与动画**：5.5 要求「无可行交换时必须给出明确提示，再进行重排」，故 `hud.js` 新增 `drawBanner`（棋盘区中央胶囊），`timeline.js` 在阶段列表末尾追加 `shuffle` 阶段（提示文案 + 按 `id` 对位出的位移集合）。**15 节没有独立的「重排」预算**，故复用 `fallDuration` 作为时长、减少动效下退化为 `cascadeGap`，不新增配置键（新增键须同步附录 B）。
  9. **验证方法**：不在浏览器里等随机死局（实测约 0.1%/局面），而是在浏览器内 `import` 真实模块喂死局盘来验证整条链路（检测 → 重排 → 阶段列表 → 提示文案），并用离屏画布直测新增渲染代码（`drawBanner` 的像素、插值帧与静止帧的差异）；浏览器另跑一次「完整一局」确认端到端无异常。
- 影响：`board.js`、`game.js`、`timeline.js`、`app.js`、`hud.js`、`render.js`、`tests/board.test.js`；`config.js` 与其余逻辑模块本步未改动。
- 替代方案：连障碍物格一起重排（否决：违反 3.8 约束 3）；失败时不还原（否决：留下含三连的中间态）；把 `tries` 从契约里去掉（否决：v1.5 已登记，且失败日志需要它）；最后一步跳过重排（否决：给规则加例外）；为「重排时长」新增配置键（否决：需同步附录 B，复用 `fallDuration` 已足够）。

---

## D017：Step 5 的模块拆分、动画模型与色盲方案

- 日期：2026-09-19
- 背景：Step 5 要求「真机手感流畅、视觉舒适」，同时宪法 6 节要求模块 ≤ 300 行 —— 而 `app.js` 在 Step 4 已达 674 行。用户在 Step 4 结束前批准：「Step 5 开始前拆出 `render.js` 与 `input.js`，届时同步更新 `AGENTS.md` 第 2.2 节和模块边界」。本轮先按批准把宪法升到 **v1.4**（2.2 目录 + 2.3 边界 + 4.2 契约结构 + 3.5 连消口径），再实施拆分与动画。
- 决策：
  1. **拆分口径**（已写入 2.2/2.3）：`app.js` = 视图状态 + 动画时间线调度 + 交互编排 + 存档 + 日志；`render.js` = 绘制与几何（画布尺寸/DPR、HUD 与棋盘布局、6 色形状、结束面板），只接收「场景描述」；`input.js` = 手势识别与视口守卫，只产出 `{kind, x0, y0, x1, y1}`。结果：`app.js` 674 行 → **418 行**；新增 `render.js` 381 行、`input.js` 111 行。`localStorage` 仍只在 `app.js`（已用 `Select-String 'localStorage\.'` 对全部逻辑模块确认零调用）。
  2. **动画模型**：每一层级联拆成三段 —— 消除（`clearDuration`）→ 下落（`fallDuration`）→ 落定（`cascadeGap`），由 rAF 驱动的时间线播放**历史快照**（`levels[i].board` / `afterSwap` / `MoveRecord`）。逻辑仍在 `game.trySwap` 内**同步算完**，因此 5.4「动画不阻塞逻辑更新」成立：动画只是回放，不参与规则。
  3. **下落时长按距离缩放**：`round(fallDuration × (0.75 + 0.25 × min(最大下落距离, 4) / 4))` → 1 格 ≈ 162ms、≥4 格 = 200ms，落在 15 节的 150-250ms 区间内；缓动用 `t²`（重力先慢后快）。
  4. **`prefers-reduced-motion` 双重生效**：`CONFIG.ANIMATION_CONFIG.reducedMotion` 或系统媒体查询任一为真 → 消除/下落时长归零（直接显示结果），但**保留 `cascadeGap`**：静态的逐层揭示仍能让玩家看出发生了连消；`styles.css` 另加媒体查询兜底 CSS 侧动效。
  5. **色盲友好方案**：6 种颜色各自绑定一种形状（圆 / 圆角方 / 三角 / 菱形 / 五角星 / 六边形），形状由 `color` 索引决定，因此色觉异常者用形状即可区分。实测：6 色灰度亮度最小间隔仅 **2.3**（灰度下几乎不可分），而 6 种形状的灰度剪影最差 IoU = **0.856**（< 0.90 阈值）—— 即「颜色不可分时形状仍可分」这一目标被量化验证，而不是靠观感断言。
  6. **性能红线的落实方式（REFERENCES §3.5 三条）**：① 每帧路径不使用阴影模糊类 API，`shadowBlur` 计数为 **0**；② 静态图层（背景 + HUD 底 + 棋盘区底）与 **6 色 × 6 形状共 36 个糖果精灵**烘焙到离屏 canvas，每帧只 `drawImage`（若逐格画路径，仅形状顶点就要 ~350 次调用，会超 15 节「单帧 ≤ 200 次」）；③ 修饰性底色透明度 0.06（≤ 0.1）。
  7. **帧率实测口径**：用页内 rAF 采样器测「动画期间的单帧耗时」，**测量窗口内不做像素回读**（`getImageData` 是探针自己的开销，会污染结论）。headless + `--disable-gpu`（软件渲染）下 390×844 DPR3：平均 **16.7ms**、p95 16.7ms、最差 16.8ms。**这是本机 headless 数字，不等于真机基线**（REFERENCES §3.5 已警示同类问题），真机复测仍待用户执行。
  8. **HUD 分数逐层累加**：播放期间用 `ResolveResult.levelScores` 累加显示（终值等于 `level.currentScore`），让连消收益看得见；数据来自 4.2 已登记的 `levelScores`，不新增契约。
  9. **行数仍未达标的登记**：拆分后 `app.js` 仍 418 行（纯代码 329）、`render.js` 381 行（纯代码 313），均超过 6 节「≤ 300 行」的目标。**待批准事项**：若要严格达标，建议再拆出 `hud.js`（HUD + 结束面板及其常量，约 120 行，可使 `render.js` 降到 ~260），并把 `app.js` 的存档读写与日志各压到最小实现；这需要再次修改 2.2 节目录，故本轮不擅自新增第四个文件。
  10. **本轮自查发现的真实缺陷**：`startTimeline(result, ...)` 曾把 `SwapResult` 当作 `ResolveResult` 使用（`result.levels` 实为 `result.resolve.levels`），导致 `TypeError` 抛出后时间线从未建立 —— 现象是「画面完全不更新 + 输入永久锁定」。已在浏览器中用页内 `window.onerror` + 异常事件定位并修复。
  11. **验证脚本的教训**：清空 `consoleLog` 会与 CDP 事件投递竞态（可能把上一条日志当成本次结果，也可能吞掉异常），已改为「标记索引 + 切片」，并把异常收集到**永不清空**的独立数组；每阶段结束后追加异常断言。这条已写进 `PROGRESS.md` 的流程改进。
- 影响：`AGENTS.md`（v1.4）、`app.js`、`render.js`（新增）、`input.js`（新增）、`styles.css`。逻辑模块（`config.js`、`board.js`、`match.js`、`score.js`、`level.js`、`obstacles.js`、`special.js`、`game.js`）与 `tests/` 本步**未改动**。
- 替代方案：继续把动画塞在 `app.js`（否决：与已批准的拆分决定冲突，且模块已 674 行）；逐格绘制 6 种形状而不做精灵烘焙（否决：单帧调用超 200 次预算）；把 HUD/结束面板改成 DOM（否决：Step 4 已验证的画布方案行为会变，且需要改范围外的 `index.html`）；减少动效时把 `cascadeGap` 也归零（否决：会丢失「发生了连消」的信息）。

---

## D016：Step 4 的实现口径、契约扩展，以及一次外部改动事故的处理

- 日期：2026-09-19
- 背景（事故部分）：开始 Step 4 时发现工作区有四个文件被**本会话之外**的写入替换：`score.js`（8:59:01）、`level.js`（8:59:30）、`game.js`（9:00:03）、`app.js`（9:00:29），全部晚于 Step 3 的提交 `420a5be`。前三份从 550/545 字节的占位注释变成压缩实现（`game.js` 5 行），`app.js` 则被改成调用 `game.trySwap` 的半截接线 —— 但日志仍引用 `result.cleared.length`/`result.spawned.length`，而 `game.js` 的返回值没有这两个字段，**每次有效交换都会抛 `TypeError`**。`node tests/run-all.js` 当时仍显示 41/41 PASS，只是因为三个对应测试文件还是空占位、从不 import 这三个模块。
- 决策（经用户选择「按项目风格与 4.2 契约重写这三份 + 修好 app.js」）：
  1. **重写 `score.js` / `level.js` / `game.js`**：保留原素材里值得留的设计（`getState` 的 `Object.freeze` 不可变快照、`resolveBoard` 单一路径），但按 §6 的代码风格（函数短小、注释解释「为什么」、引用章节号）与 4.2 的签名重写；`checkGoal`（3.6 关卡目标）与 `calcStars`（3.7 三星评分）**退回 Step 12** —— Step 4 的禁止项明确包含「实现三星评分」，原素材把它们提前实现了。
  2. **`calcCascadeBonus` 取「第 2 层起给分」的读法**：第 1 层是交换本身造成的消除，不算「连消」；第 2 层 +30、第 3 层 +60…… 依据有两条：3.5 的「连消每次 +30，依次为 30、60、90、120」按语义是*后续*连消的递增值；参考项目 game2 的 `score = removed × 10 + max(0, chains − 1) × 25` 同样从第二波才给加分。签名保留 4.2 的 `(cascadeLevel, baseScore)`：`baseScore` 当前不参与计算（3.5 是固定递增值），保留它是为了将来按消除规模调整比例时不动签名与调用点。
  3. **`calcSpecialMultiplier` 在 Step 4 就实现为查表**：虽然本步的游戏流程只会传出 `normal`（恒为 ×1），但 ROADMAP 的 Step 7-12 范围里**没有任何一步允许修改 `score.js`**，若把倍数的接入留到那时将无处落地；而倍数表本身早在 Step 0 就登记在 `CONFIG.SCORE_CONFIG.specialMultipliers`。因此本步只把「查表函数」写对，特殊元素的**生成、激活与组合**仍严格留给 Step 7-10（Step 4 禁止项针对的是后者）。
  4. **契约扩展（4.2 未定义的形状，集中登记）**：
     - `GameState = { level, board, gameOver, rng }`；**分数不另存一份**，统一读 `level.currentScore`（4.4 的 Level 已含该字段），杜绝双真相源。
     - `SwapResult` 在 4.2 的五个字段之外追加 `resolve`（`resolveBoard` 的完整结果，含每层快照与轨迹）与 `afterSwap`（交换后、结算前的棋盘快照）。前者供分层回放，后者让 UI 能画出「这一手造成的匹配」而不必自行重建棋盘。
     - `ResolveResult = { cascades, levels, cleared, spawned, capped, scoreDelta, levelScores }`；`levelScores` 是逐层计分明细，供 UI 与测试核对 3.5 公式。
     - `createGame(levelConfig, options)` 的 `options.rng`：注入补充新格子的随机源，使「级联层数/精确分数」可断言（参考项目同样支持注入种子）。
     - `level.consumeStep(level)`：2.3 规定 level.js 的职责含「步数消耗」，而 4.2 未给签名，故补一个最小函数（4.3.3 的调用点在 `game.trySwap`）。
  5. **`getRemainingStepBonus` 实现但不接入**：3.5 的剩余步数转化发生在「关卡结束时」，而 Step 4 的结束条件是步数用尽（此时剩余为 0，转化恒为 0），接入与否行为相同；Step 12 做达标结算时再接。**`checkGoal`/`calcStars` 不写空壳**，避免被误读为已实现。
  6. **关卡配置在 `app.js` 内构造**（`buildLevelConfig()`）：数值全部取自 `CONFIG` 已登记的键（`BOARD_SIZE`/`COLOR_COUNT`/`LEVEL_DEFAULTS`/`GOAL_TYPE`），**不新增附录 B 键**（新增配置项需先改宪法并获批准）。集中到关卡表属 Step 12/14 的工作。
  7. **HUD 与结束面板画在 Canvas 上**：Step 4 的范围**不含 `index.html` 与 `styles.css`**，因此不新增 DOM 结构与样式表；画布顶部划出 13% 的 HUD 带（分数/步数/最高分，5.5 要求常驻可见），其余为正方形棋盘区，「步数用尽」面板与「再来一局」按钮同样由 Canvas 绘制（5.5：页面内 UI，禁止 alert）。
  8. **「再来一局」按钮用洋红 `#ff4fd8`**：原色 `#4ecb71` 与绿色糖果**完全相同**，人眼与像素检测都无法与糖果区分；换成调色板外的颜色后既能一眼认出，也让验证脚本可以据像素定位按钮。
  9. **`getState` 深冻结**（数组、行、格子逐层 `Object.freeze`）；但**逐帧渲染直接读 `GameState`** 而不每帧调 `getState` —— 后者每帧会深拷贝 64 个格子，与 15 节的内存预算冲突；`app.js` 是唯一读者且从不改写棋盘，已在文件头注释说明。
  10. **行数超限**：`app.js` 674 行（拆分已获批、定于 Step 5 前）、`board.js` 355 行（拆分属待批准事项，见 D015 第 9 条）。
  11. **死局率实测**：200 局模拟（每局最多 30 次有效交换）得到 **0.102%** 的局面无可行交换（5902 个局面中 6 个），30 步完成率 194/200。这既说明「死局确实存在、Step 6 的必要性成立」，也说明 Step 4 的浏览器整局验证在真实环境下基本不会被死局卡住。
- 影响：`score.js`、`level.js`、`game.js`、`app.js`、`tests/score.test.js`、`tests/level.test.js`、`tests/game.test.js`。`config.js`、`board.js`、`match.js` 本步未改动。
- 替代方案：保留外部那份压缩实现（用户已否决：会留下 §6 风格违规、Step 4 禁止项、`calcSpecialMultiplier` 恒返回 1 使 Step 7-10 无法计分）；把 `checkGoal`/`calcStars` 一起实现（否决：Step 4 禁止项）；把 HUD 做成 DOM（否决：需要改范围外的 `index.html`/`styles.css`）；每帧调 `getState` 渲染（否决：与 15 节内存预算冲突）。

---

## D015：Step 3 的消除循环落点、契约扩展与可测性

- 日期：2026-09-19
- 背景：Step 3 要实现「消除 → 下落 → 填充 → 级联」，但宪法 4.2 把「整条消除循环」放在了 `game.js` 的 `resolveBoard`（Step 4 才允许改 `game.js`），而 Step 3 的验收又要求 `tests/integration.test.js` 能断言**最终棋盘与级联层数** —— 循环若写在 `app.js`，集成测试就无法导入（`app.js` 依赖 DOM）。此外有若干 4.2 未定义的细节必须现在定下来。
- 决策：
  1. **消除循环落在 `board.js`**，新增导出 `resolveCascades(board, colorCount, options?)`（4.2 的 board.js 清单里没有它，属**契约扩展**，在此登记）。理由：Step 3 不许改 `game.js`；`app.js` 无法被 Node 测试；而 `board.js` 是棋盘机制的自然归属。Step 4 的 `game.resolveBoard` 将**在其上叠加**计分、步数、状态快照，而不是重写一遍循环（因此 `resolveCascades` 不是临时过渡代码，而是长期底层入口）。
  2. **给 `refillBoard` / `resolveCascades` 增加可选的 `rng` 参数**（默认 `Math.random`），用于测试注入确定性随机源。4.2 的签名未包含该参数，属**契约扩展**。依据：参考项目 game2 的 `createBoard(rows, cols, colors, seed)` 与 `makeRandomGem(colors, rng = Math.random)` 同样支持注入随机源，是「可测试性」的通行做法。副作用：`options.rng` 使「级联层数」这类断言可以写成确定值，而不是「跑出来多少算多少」。
  3. **级联层数上限 = 棋盘格数**（8×8 → 64 层），用于「禁止无限重试」的同类保护。4.2 未定义该上限，而**新增配置键必须同步宪法附录 B（需批准）**，因此本步不复用也不新增配置项，取一个由棋盘尺寸导出的、任何真实级联都远达不到的宽松上界；`capped` 标志返回给调用方，`app.js` 会 `log('warn')`。
  4. **不采纳参考实现的对角下落**：AlexKutepov 的 `BoardPhysics` 除直落外还有 `calculateDiagonalFalls`（正上方无格子时改从斜上方落）。宪法 4.3 只规定「下落填充」，故本项目只做直落，`REFERENCES.md` 的该条借鉴要点在此**明确不采纳**。
  5. **障碍物在重力下的语义（本步暂定，Step 11/13 定稿）**：动物格 = `color !== null`（含冰块/藤蔓里的动物，3.4「冰块内的动物可以移动并消除」）；空洞 = `color === null && obstacle === null`；**纯障碍格（雪块/巧克力）= 屏障**，不下落、不被穿越，并把该列切成若干段分别压缩。依据：3.4「障碍物……占据格子，影响下落」+ 参考实现把不可承载格（`canHoldChip=false`）当作下落查找的终点。**未决项**：藤蔓中的动物在重力下是否跟随下落（3.4 只说了「不能移动」）留给 Step 13。
  6. **清除时保留 `obstacle`/`obstacleLayers`，只把 `color` 置空，并复位 `type`/`direction`**：3.4 规定冰块不因里面的动物被消除而消失；而空格必须保持 4.1「color 为 null 表示空格或纯障碍」的不变式，不能留下「无颜色却仍是条纹/包装」的格子。特殊元素的**激活**流程属 Step 7，届时在清除前扩展。
  7. **`app.js` 的分层回放让时间语义落到既有配置键上**：交换后的高亮帧停留 `ANIMATION_CONFIG.clearDuration`（该键的语义就是「消除动画时长」），每层级联之间间隔 `ANIMATION_CONFIG.cascadeGap`（键的语义就是「级联间隔」）；`fallDuration` 暂不使用，留给 Step 5 的位移补间。逻辑在 `resolveCascades` 中**同步算完**，回放只画历史快照，符合 5.4「先更新状态，再播放动画」。
  8. **回放期间锁定输入**（`view.playback`）：否则玩家能在画面尚未追上逻辑时继续交换，导致所见与状态错位。
  9. **行数超限登记**：`app.js` 458 行、`board.js` 355 行，均超出宪法 6 节「模块不超过 300 行」的目标。`app.js` 的拆分已获用户批准、定于 Step 5 前执行；`board.js` 若同样要拆，需要新增 2.2 节未登记的文件，**属待批准事项**（建议与 Step 5 的 `app.js` 拆分一并处理，例如把下落/填充抽到 `gravity.js`）。
- 影响：`board.js`、`app.js`、`tests/integration.test.js`。`match.js`、`config.js` 本步**未改动**（Step 3 允许但无必要）。
- 替代方案：把循环写进 `app.js`（否决：集成测试无法导入 DOM 模块，等于放弃 Step 3 的自动化验收）；把循环写进 `game.js`（否决：Step 3 范围不含 `game.js`，跨 Step 修改）；新增 `MAX_CASCADE_LEVELS` 配置键（否决：需先改附录 B）；不做 `rng` 注入、改为断言随机结果（否决：级联层数不可断言，测试会变成「跑出来是多少就是多少」）；采纳对角下落（否决：宪法 4.3 未规定，属自行发明规则）。

---

## D014：Step 2 的规则空白与实现取舍（含参考项目冲突一处）

- 日期：2026-09-19
- 背景：Step 2（触摸交换 + 匹配检测）是第一个含游戏逻辑的 Step，落地时遇到宪法未覆盖或需明确读法的 8 个点；同时按 `REFERENCES.md` §2.1 Step 2 的强制要求重读了参考项目源码，发现一处规则冲突。
- 参考核实结果（2026-09-19，GitHub API + raw 源码实读；两仓库均**无 LICENSE**，按 `REFERENCES.md` §5 只借鉴思路、不复制代码）：
  - `rola2005-klc/game2` 实测 7 个文件（`index.html`、`style.css`、`app.js`、`game.js`、`test.js`、`mobile-ui.test.js`、`README.md`）。其 `game.js` 用**数字二维数组**、`createBoard` 用「过滤左边两格/上面两格同色」+ 最多 200 次重试保证开局无三连且存在可行交换、无效交换通过**返回原棋盘副本**实现回退、`hasPossibleMove` 只枚举「右」「下」两个方向。本项目按 4.1 的 `cell[][]` 重新实现，未沿用其数据结构与命名。
  - `AlexKutepov/Match3-algorithm-TS-Cocos-creator` 实测含 `Systems/MatchDetector.ts`（8.3KB）、`Systems/BoardPhysics.ts`、`Core/Board.ts` 等；`MatchDetector` 用 `processedH/processedV` 两个 Set 保证一段只上报一次，并用「只检查被交换的两个位置」判定 `wouldMatchAfterSwap`（O(1) 局部判定）与 `hasValidMoves`。本项目用「只在段起点产出」达到同样去重效果（无需额外 Set）；那套局部判定属性能优化，8×8 规模下未采用，留给 Step 5/6 实测后再决定。
- 决策：
  1. **条纹方向冲突（宪法 vs 参考实现）**：`MatchDetector.getBonusType` 让条纹方向**垂直于**匹配方向（`isHorizontal → LineVertical`）。宪法 3.2 明定「横向四连生成横向条纹（消除整行）」，按 `AGENTS.md` 第 17 节「文件冲突以宪法为准」，本项目**采用宪法读法**（匹配方向 = 爆破方向），不采纳参考实现。Step 7 实现条纹时必须按此执行。
  2. **6 连及以上的直线**：3.2 只定义了 3/4/5 连。按开心消消乐惯例，`长度 ≥5` 一律判为 `line5`（魔力鸟），不新增形状枚举（`MATCH_SHAPE` 只有 5 个值）。
  3. **十字形（3+3 共中心，5 格）**：宪法只有 `L` 与 `T` 两个枚举。判为 `T`（交叉点落在两条臂的中间，与 T 的判定规则一致），不新增 `CROSS`。
  4. **`detectMatchShape` 的严格性**：只有「两条臂都 ≥3 格、交叉点存在、无游离格」的交叉才算包装糖果形状（3.2 要求 L/T 型 **5 连**），否则返回 `null`；这样 4 格的伪「L」不会被误判为包装糖果。
  5. **障碍物的 color 语义**：3.4 说冰块内的动物「可以移动并消除」、藤蔓「困住小动物」，故 `ice`/`vine` 格保留 `color`；雪块与巧克力是**占格障碍**（3.4「消除雪块旁边的小动物」「巧克力被相邻消除波及」），格内没有动物，`color` 置 `null`。障碍物的**行为**（层数减少、影响下落、阻止交换）仍属 Step 11/13。
  6. **createBoard 复用 `shuffleMaxTries` 作为重试上限**：`createBoard` 需要「无初始三连 + 至少一个可行交换」两个约束（后者对应 3.8 的可玩性要求，参考项目也这么做），但宪法没有为此定义配置键。**新增配置键必须改宪法附录 B（需用户批准）**，因此本步**读取**已有的 `CONFIG.ANIMATION_CONFIG.shuffleMaxTries`（语义同属「重排/生成的最大尝试次数」，全项目仅此一处复用）。若你希望改为独立键（如 `GENERATION_MAX_TRIES`），需先改附录 B。
  7. **`hasPossibleMove` 的判定口径**：要求匹配组**包含被交换的两个格子之一**，而不是「交换后棋盘上存在任意匹配」。棋盘若已残留匹配（Step 2 无消除，有效交换后会留下匹配），后者会把任意交换都算成可行。
  8. **交换编排暂放 `app.js`**：4.2 的 `game.trySwap` 属 Step 4，而 Step 2 不允许修改 `game.js`，故「快照 → 交换 → 检测 → 回退」这段编排暂放 `app.js` 的 `attemptSwap`，Step 4 迁入 `game.js`。步数计数器同样属 Step 4，因此本步「无效交换不扣步数」自然成立、无法被验证，已如实记录。
  9. **`app.js` 达 401 行，超出宪法 6 节「模块不超过 300 行」的目标，本轮不拆**：拆成 `render.js` / `input.js` 会新增文件，而 2.2 节目录清单未登记这两个文件 —— 按第 11 节，改宪法需用户明确批准。**待批准事项**：Step 5（动画打磨，`app.js` 还会显著增长）之前，建议把渲染与输入拆成两个文件并同步 2.2 节；在获批之前保持单文件并在此登记偏差。
- 影响：`board.js`、`match.js`、`app.js`、`tests/board.test.js`、`tests/match.test.js`。
- 替代方案：采纳参考实现的条纹方向（否决：违反 3.2，且第 17 节规定冲突以宪法为准）；为 6 连/十字新增枚举（否决：改 `MATCH_SHAPE` 属附录 B-2 枚举变更，需用户批准且无必要）；新增 `GENERATION_MAX_TRIES` 配置键（否决：触发附录 B 同步义务，需先获批准，本步用读取复用绕开）；`hasPossibleMove` 用宽松判定（否决：会误报可行交换）；拆 `app.js`（否决：擅自改目录结构）。

---

## D013：Step 1 的三处取舍（渲染常量归属、占位颜色、旧 meta 标签）

- 日期：2026-09-19
- 背景：Step 1（棋盘渲染）遇到三个必须先定的口子：
  1. ROADMAP Step 1 的范围只允许改 `index.html` / `styles.css` / `app.js`，而宪法 2.3 与 9 节规定 `config.js` 是唯一存放可调数值的文件 —— 调色板与 DPR 上限该放哪；
  2. Step 1 要求「每格显示一个随机颜色」，但宪法 9 节禁止在 4.1 的 `cell[][]` 之外另立棋盘数据结构，而 `board.js` 属逻辑模块、本 Step 禁止修改；
  3. Chrome 对 Step 0 写入的 `apple-mobile-web-app-capable` 发出弃用警告，与 Step 0/1 的「控制台无 warning」验收相冲突。
- 决策：
  1. 渲染常量（`MAX_DPR`、`BOARD_MARGIN`、`MIN/MAX_BOARD_PX`、圆角与半径比例、`BASE_COLORS` 调色板）暂留在 `app.js`，并在代码中显式注释「只影响观感、不参与游戏规则」。本 Step 不动 `config.js`；日后若集中管理，必须同时更新宪法附录 B 并保持两边一致。
  2. 用 `Uint8Array` 承载「占位颜色索引」作为绘制输入，代码注释显式声明它**不是**棋盘状态，`board.js` 的 `cell[][]` 由 Step 2/3 提供后删除该数组。
  3. `index.html` 补 `<meta name="mobile-web-app-capable" content="yes">`（保留 apple 版供 iOS 使用）。
- 影响：`app.js`、`index.html`。逻辑模块（含 `config.js`）零改动。
- 替代方案：把调色板写进 `config.js`（否决：超出 Step 1 范围，且立即触发附录 B 同步义务，属跨 Step 混合修改）；调用 `board.js` 的 `createBoard` 生成显示棋盘（否决：逻辑模块本 Step 禁止修改，且等于在 `app.js` 内实现棋盘规则）；删掉 apple 版 meta 只留新版（否决：iOS 独占 Web App 模式仍依赖 apple 版）。

---

## D012：Step 0 收口时统一首次提交、package.json 与原生目录策略

- 日期：2026-09-19
- 背景：Step 0 最终审查发现三处初始约束冲突：`AGENTS.md` 第 16 节要求提交信息使用 `[stepN]`，而 ROADMAP 旧文写 `[init]`；宪法 2.2 节写 `package.json` 仅含 `type` 与 scripts，实际文件还含可选元数据；`.gitignore` 又忽略了 Step 18 明确要求新增的 `android/` 与 `ios/` 原生工程。
- 决策：按文件优先级采用 `[step0] 项目骨架与宪法 v1.3` 作为首次提交；删除 `package.json` 的可选元数据，只保留 `type` 与 scripts；未来跟踪 `android/`、`ios/` 原生源码，仅忽略其缓存和构建产物。
- 影响：`ROADMAP.md`、`prompts.md`、`package.json`、`.gitignore`、首次 Git 提交。
- 替代方案：继续使用 `[init]`（否决：低优先级文件不能覆盖宪法）；修改宪法以保留 package 元数据（否决：这些元数据对当前零依赖骨架不是必需）；忽略整个原生目录（否决：Step 18 无法形成可审查、可回滚的提交）。

---

## D011：附录 B 只登记数值，字符串常量另立附录 B-2

- 日期：2026-09-18
- 背景：审查报告 M4 指出：`config.js` 导出 `CELL_TYPE`、`OBSTACLE_TYPE`、`DIRECTION`、`MATCH_SHAPE`、`GOAL_TYPE`、`STORAGE_KEYS` 六个字符串常量对象，宪法 6 节要求它们必须集中在 `config.js`，但附录 B 只登记数值，导致宪法 17 节「附录 B 与 `config.js` 必须一致」长期处于未披露的不一致状态。报告给出两个选项：「把六个枚举也登记进附录 B」或「明确声明附录 B 只登记数值」。
- 决策：**两个都做**——附录 B 保持「可调数值」定位不动，另立**附录 B-2「字符串常量登记表」**登记六个常量对象。理由：这些是枚举而非可调值，混进数值表会让「改数值要同步附录 B」这条规则失去信号；完全不登记又违反 17 节。
- 影响：`AGENTS.md` 附录 B 追加 9 行数值键 + 新增 B-2 表；17 节交叉引用规则补「数值见附录 B，字符串常量见附录 B-2」。
- 替代方案：只登记进附录 B 主表（否决：混淆两种变更语义）；只声明「附录 B 只登记数值」而不登记枚举（否决：`STORAGE_KEYS` 的值改了会破坏玩家存档兼容，必须有一处可查的登记）。

---

## D010：按审查报告做全局一致性修复（S1–S3 / M1–M6 / L1–L5）

- 日期：2026-09-18
- 背景：用户提交《项目文件审查报告》，列出 14 条问题。按独立审计流程逐条核实原始文件后：**13 条成立，1 条（L3）为误报**，另发现 **1 处报告漏掉的同类问题**（宪法第 8 节工作流第 1 条的「会话开始必读文件」清单同样漏了 `REFERENCES.md` 与 `DECISIONS.md`）。
- 决策：
  1. **S1/S2/S3**（严重，硬伤）：`REFERENCES.md` 在宪法中补登记 6 处 —— 2.2 节目录、第 8 节工作流第 1 条、8.3 节、第 12 节、第 17 节表格、第 17 节交叉引用规则。D003 从「未落实的决策」变为已落实。
  2. **M1/M2/M5**：`ROADMAP.md` Step 0 范围补 `REFERENCES.md`；Step 6 把「允许修改 `shuffleMaxTries`」改为「允许读取，改默认值须记录」；Step 16 标注 `assets/` 启用时点。
  3. **M3**：`AGENTS.md.orig-u200b` 不进宪法目录（它是临时备份不是项目资产），改为在 `.gitignore` 增 `AGENTS.md.orig-*` 规则，确认新版后手动删除。
  4. **M4**：见 D011。
  5. **M6**：`REFERENCES.md` §3.5 补测量环境：三个数字来自**另一项目**（PvZ 塔防，Chrome、1000×630、DPR 2、峰值 26 实体），**本项目尚未复现**，只能当方向性红线用。
  6. **L1–L5**：优先级补 `REFERENCES.md`；README 列 script 名、命令表加定位说明；PROGRESS 把 9 个键列全（L3 属清晰度优化，非缺陷）。
- 影响：`AGENTS.md` v1.2 → **v1.3**、`ROADMAP.md` v1.2 → **v1.3**、`REFERENCES.md` v1.0.1 → **v1.0.2**；共 17 处文本替换（含本文件），全部带 `assert count == 1` 保护。
- 附带修正：ROADMAP Step 0 的首次提交信息版本号由 `v1.2` 改为 `v1.3`（宪法已升版，提交信息必须与之一致）。
- 替代方案：只修「严重」三条、其余记入待办（否决：M1 会导致 Agent 严格按 Step 0 执行时漏掉 `REFERENCES.md`；M6 不标注环境会让后续 Step 把别项目的数字当本项目基线）。

---

## D009：零素材策略 —— 不引入任何外部美术/音频/图标资源

- 日期：2026-09-18
- 背景：参考项目中 candy-crush 用 SVG 素材 + 8 个 MP3，bazhanius 用 Material Icons 字体。直接沿用会引入三类风险：素材许可证与代码许可证不同（MIT 只覆盖代码）、`file://` / 离线环境加载失败、打包体积膨胀。
- 决策：第一阶段所有美术（动物、特殊元素、障碍物）用 Canvas 程序化绘制；音频在 Step 16 用 `AudioContext` 合成或使用自制/已授权素材，且素材授权必须在 `REFERENCES.md` §5 单独登记。
- 影响：`app.js` 内需要 `drawX(ctx, ...)` 系列绘制函数；`assets/` 在 Step 16 之前保持空置。
- 替代方案：直接引用 candy-crush 的 SVG（否决：素材授权不明，且与「无外部依赖」原则冲突）。

---

## D008：参考项目列表更新 —— 移除失效仓库，补充上游项目

- 日期：2026-09-18
- 背景：`REFERENCES.md` 原表列出的 `youssefmyh/Match3Algorithm`（C++）经 GitHub API 核实返回 **404**，仓库已不存在。同时 bazhanius 的 README 显式声明其基于 `rembound/Match-3-Game-HTML5`。
- 决策：
  1. 移除 `youssefmyh/Match3Algorithm`，其「匹配算法思路参考」职责转由 `AlexKutepov/Match3-algorithm-TS-Cocos-creator` 承担。
  2. 补充 `rembound/Match-3-Game-HTML5`（MIT，80 星）作为基础三消参考。
  3. 表内所有许可证/星标字段改为实测值，并标注核实日期与核实方式。
- 影响：`REFERENCES.md` §1、§3.4、§4、§5、§6。
- 替代方案：保留 404 仓库并标注「待确认」（否决：把不存在的仓库留在参考表里会误导后续 Step）。

---

## D007：修复 `AGENTS.md` 的格式缺陷（不改任何规则内容）

- 日期：2026-09-18
- 背景：原始 `AGENTS.md` 存在三处格式缺陷，影响可读性与工具链：
  1. 全文件被一对 ` ```markdown ` 代码围栏包裹（第 1 行开、文末闭），导致整个宪法被渲染为「代码块里的 markdown」；
  2. 文末残留 1 行孤立围栏 + 5 行空表格（附录 B 残渣，v1.2 修订说明声称已清理，实际未清）；
  3. 第 263 行含一个不可见字符 U+200B（零宽空格），会让文件读取工具误判为「潜在注入」而拒绝加载整个文件，也会破坏代码块与正则匹配。
- 决策：只清理上述三处**格式**问题，**不改动任何条款文字、编号、数值**。原始文件保留为 `AGENTS.md.orig-u200b`（未删除）。
- 影响：`AGENTS.md` 全文可被工具正常读取；条款语义零变化。
- 替代方案：保持原样（否决：U+200B 会持续让读取工具拒载）。
- **备份去留（2026-09-18 第二轮补充）**：`AGENTS.md.orig-u200b` 不写入宪法 2.2 节目录（它是临时备份，不是项目资产），改由 `.gitignore` 的 `AGENTS.md.orig-*` 规则忽略，待用户确认新版无误后手动删除并在 PROGRESS 记录。

---

## D006：新增 9 个配置键，等待 `AGENTS.md` 附录 B 同步

- 日期：2026-09-18
- 背景：`config.js` 落盘时发现宪法内部有两处空洞，必须补配置项才能不留魔法数字/魔法字符串：
  1. `AGENTS.md` 第 14 节的 collect 目标用动物名作键（`targets: { frog: 10, hippo: 25 }`），但 4.1 的 `cell.color` 是 `0-5` 数字索引 —— 缺映射表，`level.js` 无法解析目标；
  2. 3.4 节规定冰块上限 3 层、雪块上限 5 层、藤蔓/巧克力 1 层，这些是「可调数值」但附录 B 未登记；
  3. 6 节要求「特殊元素类型的字符串常量必须集中定义于 `config.js`」，附录 B 却只登记数值，缺字符串常量与 `localStorage` 键名。
- 决策：先在 `config.js` 提供 `COLOR_NAMES`、`OBSTACLE_CONFIG`、`ANIMATION_CONFIG.reducedMotion`、`STORAGE_KEYS`，并在文件头与文件尾用注释标注「待同步附录 B」。
- 影响：`config.js`。**未同步前，宪法 17 节「附录 B 与 config.js 必须一致」处于临时不一致状态**，需用户批准后补表（附录 B 增补行已备好，见本文件末尾附录）。
- 替代方案：不在 config.js 里定义（否决：会违反宪法 0.7「禁止散落魔法数字」）。
- **落实情况（2026-09-18 第二轮）**：9 个数值键已写入 `AGENTS.md` 附录 B，字符串常量部分由 D011 以附录 B-2 落实，临时不一致状态**已解除**。

---

## D005：`tests/run-all.js` 改为自动发现，`assert.js` 扩展为「断言 + 用例注册表」

- 日期：2026-09-18
- 背景：原设计 `run-all.js` 用 8 行静态 `import './xxx.test.js'`。在 Step 0 阶段这 8 个文件只有注释、**第一个 import 就会抛 `ERR_MODULE_NOT_FOUND`**，导致 Step 0 的验收项「`node tests/run-all.js` 可执行」在骨架阶段必然失败；后续每加一个测试文件还要改入口文件。
- 决策：
  1. `assert.js` 保留 `assertEqual` / `assertTrue` / `assertFalse` / `assertDeepEqual`（+ `assertThrows`），并新增 `test(name, fn)` 注册表、`setFile()`、`recordLoadError()`、`summarize()`。
  2. `run-all.js` 扫描 `tests/*.test.js` 后动态导入：无测试文件正常退出（退出码 0）、新文件免登记、单文件语法错误只记为「加载失败」而不断整轮。
  3. 单文件仍可 `node tests/board.test.js` 直接跑（文件末尾 `if (!globalThis.__XXL_TEST_BUNDLE__) summarize();`）。
  4. 失败时 `process.exitCode = 1`，可用作 CI 门禁。
- 影响：`tests/assert.js`、`tests/run-all.js`，以及所有测试文件的收尾约定（写入每个占位测试文件的注释模板）。
- 替代方案：保留静态 import 清单（否决：Step 0 无法验收，且每步都要改入口）。

---

## D004：引入 `package.json`（仅 `{"type":"module"}`）与「ESM 必须走 http」运行方式

- 日期：2026-09-18
- 背景：`config.js` 用 `export const CONFIG`、测试文件用 `import`，即 ES Module。由此产生两个硬约束：
  1. Node 默认按 CommonJS 解析 `.js`，`node tests/run-all.js` 会直接抛 `SyntaxError: Cannot use import statement outside a module` —— 必须有 `package.json` 的 `"type": "module"`（或把每个文件改名 `.mjs`）；
  2. 浏览器在 `file://` 下加载 ES Module 会被 CORS 拦截（`Cross origin requests are only supported for protocol schemes: http, https…`），**双击 `index.html` 打不开**。
- 决策：新增根目录 `package.json`，只含 `name/version/private/description/type/scripts`，**零依赖**；运行方式统一为 `python -m http.server 8000`（手机真机用局域网 IP）；`ROADMAP.md` 新增第 0.9 条说明，`README.md` 同步。
- 影响：新增 `package.json`（`AGENTS.md` 2.2 节目录清单未列，需用户批准后补一行）；`ROADMAP.md` Step 0 范围与测试项；`README.md` 快速开始。
- 替代方案：改用经典 `<script>` + 全局命名空间（否决：测试无法直接 `import` 逻辑模块，`node` 侧要么 `vm` 里 eval 要么引入构建工具，反而更重）；全改 `.mjs`（否决：`index.html` 侧仍要写 `.mjs` 后缀，且与 2.2 节目录命名不一致）。
- **落实情况（2026-09-18 第二轮）**：已获批准，`package.json` 行已写入 `AGENTS.md` 2.2 节，状态由「待批准」转为「已登记」。

---

## D003：建立 REFERENCES.md 作为外部参考索引

- 日期：2026-09-18
- 背景：需要系统化管理 GitHub 参考项目与逐 Step 借鉴方案。
- 决策：新建 `REFERENCES.md`，并在 `AGENTS.md` 第 17 节登记。
- 影响：`ROADMAP.md` 各 Step 增加「参考」字段；具体借鉴决策记入本文件。
- 替代方案：将参考方案并入 `AGENTS.md` 或 `ROADMAP.md`，被否决——会破坏宪法与路线图的清晰度。

## D002：棋盘数据结构统一为 cell[][]

- 日期：2026-09-18
- 背景：初版宪法中 4.1 与 4.2 数据结构不一致。
- 决策：统一为 `cell[][]`，`AGENTS.md` 4.1 为唯一真相源。
- 影响：`board.js`、`match.js`、`special.js` 全部按此实现。
- 替代方案：使用二维数字数组加旁路元数据，被否决——状态分散易出错。

## D001：确认宪法 v1.2 作为最高约束

- 日期：2026-09-18
- 背景：需要明确 Agent 行为的最高约束文件。
- 决策：以 `AGENTS.md` v1.2 为最高约束，优先级为「用户指令 > 宪法 > ROADMAP > AI 默认」。
- 影响：所有 Agent 会话必须先读宪法。
- 替代方案：无。

---

## 附录：登记项落实情况（D004 / D006 / D009 / D011）

以下登记项已于 2026-09-18 第二轮修复中写入 `AGENTS.md` v1.3，**不再是待批准状态**：

| 登记项 | 落点 | 状态 |
|---|---|---|
| `package.json` 目录行 | `AGENTS.md` 2.2 节 | ✅ 已写入（D004） |
| `assets/` 目录行 | `AGENTS.md` 2.2 节 | ✅ 已写入（D009） |
| `REFERENCES.md` 目录行 | `AGENTS.md` 2.2 节 | ✅ 已写入（S2） |
| `REFERENCES.md` 表格行 + 交叉引用规则 | `AGENTS.md` 第 17 节 | ✅ 已写入（S1） |
| 会话开始必读文件补全（含第 8 节工作流第 1 条） | `AGENTS.md` 第 8 节 / 8.1 / 8.3 / 12 | ✅ 已写入（S3 + 报告遗漏项） |
| 第 0 节优先级纳入 `REFERENCES.md` | `AGENTS.md` 第 0 节 | ✅ 已写入（L1） |
| 9 个数值型配置键 | `AGENTS.md` 附录 B | ✅ 已写入（D006） |
| 6 个字符串常量对象 | `AGENTS.md` 附录 B-2（新增） | ✅ 已写入（D011） |
| 修订记录 v1.3 行 | `AGENTS.md` 第 11 节 | ✅ 已写入（D010） |
