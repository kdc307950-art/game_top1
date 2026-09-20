# PROGRESS — 项目进度日志

> 关联文件：`AGENTS.md`、`ROADMAP.md`、`DECISIONS.md`
> 使用方式：每次会话结束由 Agent 追加一条记录。新的记录在最上方。

---

## 2026-09-19（Step 7：条纹糖果 + 你反馈的两条问题的修正 + 糖果外观重做 + 宪法 v1.7）

### 一、你反馈的两条问题，都定位到了真实缺陷并修掉

1. **「4 连和五连的特殊魔法方块会消失」** —— 排查出**两个**独立原因：
   - **逻辑层**：`board.js` 的消除集合原本是「匹配组全体」，新生成的特效就在组内，于是**刚做出来就被本层消掉**。修法：`collectClearKeys` 在「匹配组展开」与「链式激活展开」两处都排除 `spawnKeys` → 本层新生成的特殊元素本层不参与消除。
   - **动画层**：`timeline.js` 用 `level.groups` 当消除键，新条纹在消除阶段被缩小淡出、下落阶段被隐藏，落定才突然出现 —— 观感仍是「一闪就没了」。修法：每层先用 `cell.id` 识别「本层刚升级的特效格」，把它们从消除键/隐藏集合剔除，并把这些格**打补丁**到消除前的快照上，使消除与下落阶段就直接按特效的样子绘制（纵向 4 连里那颗会下落的条纹也能正确补间）。
   - 说明：五连（魔力鸟 / 包装糖果）**尚未实现**（Step 8/9），你看到的「五连方块消失」应属同一类现象的其它表现；等 Step 9 落地时会用到同一套 `spawnKeys` + 补丁机制。若你在关卡里看到的是**别的东西**（比如 5 连后整行消失），请在 Step 8 前告诉我具体画面。
2. **「方块的 UI 没有根据参考项目搬运优化吗」** —— 在你选定「保持零素材、Canvas 程序化重做」并按预览图批准后实施：深色描边 + 底部内阴影 + 径向渐变主体 + **每形状内嵌图案**（圆→环、圆角方→双横带、三角→内三角、菱形→圆点、星→内星、六边形→双竖带）+ 左上高光；棋盘新增 64 个格位槽（参考项目的棋盘底盘语言，alpha 0.045 ≤ 0.1）。全部程序化绘制，**不引入任何外部素材**（D009）。

### 二、Step 7 功能落地

- **`match.js`**：`matchShapeToSpecial` 落地（4 连直线 → `striped`，其余形状本步返回 `null`，留给 Step 8/9）。
- **`special.js`**（30 行纯代码）：`getSpecialAffectedCells`（横条纹消整行 / 竖条纹消整列 / 非条纹只影响自身）、`createSpecial`（只处理 4 连；落点 `cells[floor((n−1)/2)]`，已被占用或纯障碍则不生成）、`activateSpecial`。
- **`board.js`**：`resolveCascades` 每层先按组生成特效（`spawnKeys`），再算消除集合（匹配组 ∪ 链式激活波及，排除 `spawnKeys`），`clearCells` 快照保留 `type/direction` 供上层按 3.5 判倍数。
- **`game.js`**：`multiplierForLevel` 接入 3.5 的条纹倍数 1.5（本层生成或触发条纹时；同层多特效按 3.2 优先级取值；组合倍数留给 Step 10）。
- **`app.js`**：交换日志追加 `触发条纹 N` 便于浏览器侧核对。
- **`render.js` + 新增 `candy.js`**：外观重做；条纹糖果叠 3 条白条纹 + 方向箭头（方向 = 爆破方向，5.4 要求可辨）；精灵图集从「6 色 × 6 形状」收敛为「每色 3 张」共 18 张。
- **宪法 v1.7（你已批准）**：外观代码让 `render.js` 达 338 行纯代码、超过 §6 的 300 行上限，故按 §6 拆出 `candy.js`（`render.js` 172 / `candy.js` 172），并把新文件与依赖方向（`render.js → candy.js` 单向）登记进 2.2/2.3。

### 三、验证方式（全部可复现）

- `node tests/run-all.js` → **88 用例 / 800 断言 / 0 加载错误 / PASS**。新增 `tests/special.test.js`（12 例：形状映射、影响范围与边界、生成位置/方向/不覆盖、激活、以及 4 连/纵向 4 连/3 连不生成/条纹被触发/两条纹连锁/复杂交叉簇的 `resolveCascades` 集成）与 `game.test.js` 2 例（生成层与触发层都按 1.5 倍计分）。
- **浏览器 `_build/verify-step7.mjs` → 39/39 PASS**：外观用像素取证（横/竖条纹各 3 条白带、row/col 跨度相反、6 色中心像素互不相同、每色都有相对暗的图案像素、普通糖果 0 个近白像素）；renderer 端到端（真实画布上只有条纹格出现白条纹且朝向正确）；逻辑端到端（真实 `trySwap` 造成 4 连 → 第 1 层留 1 颗横条纹、基础分 30 → 得分 45；新条纹既不在消除键也不在隐藏集合；消除阶段已按特效贴图；条纹被 3 连触发 → 清除整行 8 格）；真实一局回归 + 红线/视口回归。
- **既有套件回归（换外观后重跑）**：`verify-step5.mjs` **30/30 PASS**（含色盲剪影最差 IoU 0.851、帧时间均值 16.7ms）、`verify-step6.mjs` **25/25 PASS**（死局链路与重排提示胶囊像素仍在）。
- `python _build/consistency_check.py` → 全部通过；`app.js` 296 / `render.js` 172 / `candy.js` 172 / `timeline.js` 115 行纯代码，均在 §6 的 300 行内。

### 四、本轮自查修正（都是我的问题，不是产品问题）

- 4 个 `tests/special.test.js` 断言写错：把「最终棋盘」当成「第 1 层结论」（后续级联还会再生成条纹）、把条纹放在 3 连之外却指望它被触发、链式期望值忘了扣掉本层新生成并被保留的那颗（正确值 14 = 行 8 ∪ 列 8 − 1）。
- 2 个验证夹具写错：0/1 棋盘格里交换后落回的那颗会同色，会额外凑出一个 3 连（改用 `(r + 2c) % 3`）；「深色图案像素」用绝对亮度阈值会误判黄/橙（改为「相对该色最亮部位明显更暗」）。

### 五、遗留问题

- **真机复测仍待你执行**：iOS Safari / Android Chrome 的帧率、控制台洁净、减少动效帧数、色盲形状、无滚动缩放、无输入锁死。
- **视觉判断只能由你确认**：新糖果外观是否达到「像参考项目那样立体」的目标、条纹糖果的 3 条白条纹 + 箭头在真机小格子里是否清晰。
- 包装糖果（Step 8）、魔力鸟（Step 9）、组合效果（Step 10）未实现；`resolveSpecialCombo` 仍是 4.2 登记的未实现项。
- 「死局 + 重排失败 → 结束流程」的接线仍无可执行测试（D018 第 6 条）。

### 六、下一步

- 按 ROADMAP 进入 **Step 8（包装糖果）**：L/T 型 5 连生成 `wrapped`、激活消 3×3、边界裁剪，并接 3.5 的 2.0 倍；外观已在 `candy.js` 预留 `paintWrapped` 的方案（光晕 + 四角包装结，用径向渐变而非阴影模糊）。**建议先由你确认 Step 7 的可视效果**再开工。

---

## 2026-09-19（Step 6.1：纯重构拆出 shuffle.js + 宪法 v1.6）

### 完成项

- **拆分**：`board.js` 417 → **309 行**（纯代码约 205），只保留 createBoard / swapCells / cloneBoard / applyGravity / refillBoard / resolveCascades；新增 **`shuffle.js`** 130 行，承载 isCellMovable / hasPossibleMove / shuffleBoard。逻辑与行为零改动。
- **依赖方向**：固定为 `board.js → shuffle.js` 单向（createBoard 需要 hasPossibleMove 校验开局可玩性）；`shuffle.js` 只依赖 `config.js` 与 `match.js`。为避免 `board ↔ shuffle` 模块环，`hasPossibleMove` 内联了三行置换（不调用 `board.swapCells`），理由写在文件头，与 `hud.js` 就地实现 `roundRectPath` 同类。
- **不保留兼容转发**：调用方（`game.js`、两个测试文件）一次性改完，避免「4.2 说这些函数属于谁」变模糊。
- **宪法 v1.6**：2.2 目录、2.3 边界（含依赖方向）、4.2 三条契约从 board.js 块移到新增的 shuffle.js 块、第 11 节修订记录。

### 验证方式

- `node tests/run-all.js` → **74 用例 / 742 断言 / 0 加载错误 / PASS** —— 与重构前**完全相同的计数**，这是「逻辑零 diff」的直接证据。
- **浏览器 Step 5 套件（重构后）→ 30/30 PASS**（帧率均值 16.7ms、p95 16.7ms；形状剪影最差 IoU 0.846）。
- **浏览器 Step 6 套件（重构后）→ 25/25 PASS**（死局链路：第 8 次尝试重排成功、不消耗步数、shuffle 阶段 64 格位移与提示文案；退化盘/全同色盘失败与还原；提示胶囊像素 3450；完整一局出现「游戏结束」+ 最高分持久化）。
- **「tests 零 diff」的准确说明**：测试**导入路径**必须改（`tests/board.test.js`、`tests/game.test.js` 各一行、以及 `_build/verify-step6.mjs` 的页面内 import），这是文件移动的必然结果；**用例数与断言数不变**才是行为零 diff 的证据（见 D019 第 4 条）。
- **本轮自查修正 1 处验证脚本缺陷**：Step 6 套件的整局循环用全局 `infoLogs().find(...)` 取「本次交换」的日志，实际命中的是本局**第一条**交换日志 → 按错误的级联层数估算等待 → 动画未播完就再滑动 → 被输入锁吞掉（输入锁本身是设计行为，不是 bug）→ 循环提前耗尽、走不到「游戏结束」。已改为「标记 + 切片」。

### 遗留问题

- 真机（iOS/Android）跑一局 + 色盲模拟确认仍**待你执行**；视觉观感（形状/节奏/重排动画是否好看）也无法由我目视确认。
- D018 第 6 条登记的「死局且重排失败 → 结束流程」接线仍无可执行测试（原因与替代验证见该条）。
- 关卡目标（3.6）、三星评分（3.7）、剩余步数转化接入属 Step 12；障碍物属 Step 11/13。

### 下一步

- 第一阶段（核心可玩版，Step 0-6）功能已齐：8×8 棋盘、滑动交换、3/4/5 连与 L/T 识别、消除下落填充级联、计分步数结束最高分、动画与色盲友好、死局重排**全部落地并验证**。可由你验收第一阶段并确认是否打 `phase-1-done` 标签。
- 第二阶段自 **Step 7（条纹糖果）** 开始：允许改 `special.js`、`match.js`、`board.js`、`game.js`、`app.js`、`config.js`、`tests/special.test.js`；`matchShapeToSpecial`（4.2 已登记、Step 2 起一直留空）届时落地；注意 D014 第 1 条已定：**本项目条纹方向 = 匹配方向**（与参考实现相反，以宪法 3.2 为准）。

---

## 2026-09-19（Step 5 补完：hud.js/timeline.js 拆分 + 宪法 v1.5 + Step 6：死局检测与重排）

### 一、Step 5 补完（按你批准的顺序执行）

- **新增 `hud.js`**（118 行）：HUD（分数/步数/最高分）、结束面板、重排提示；只接收场景数据，不读游戏状态、不碰 `localStorage`、不绑事件。
- **新增 `timeline.js`**（104 行）：动画时间线调度（阶段划分、时长计算、rAF 回放、`stop/running`）；只接收阶段列表与回调。
- `render.js` 381 → **294 行**（只留棋盘层与几何，单向依赖 `hud.js` 取 `HUD_RATIO/hudCells`）；`app.js` 418 → **364 行（纯代码 283）**。`localStorage` 仍只在 `app.js`。
- **未改** `index.html`：`render.js`/`hud.js`/`input.js`/`timeline.js` 都由 `app.js` 以 ESM `import` 引入，HTML 无需新增引脚本行。
- 验证：`run-all` 65 用例 / 704 断言全绿；浏览器 Step 5 套件 **30/30 PASS**（动画 8 帧 vs 减少动效 4 帧、帧率均值 16.7ms、形状剪影最差 IoU 0.846）；逻辑模块与 `tests/` `git diff` 为空。

### 二、宪法 v1.5（你批准「写进宪法」）

- **2.2/2.3**：登记 `hud.js`、`timeline.js` 及其边界（并注明 `render.js` 单向依赖 `hud.js`）。
- **4.2**：`shuffleBoard(board, options?: { rng?, maxTries? })`；`ResolveResult.deadlock` 与 `DeadlockResolution = { tries, shuffled, before, after }`。
- **11**：新增 v1.5 修订说明与记录行。附录 B 未新增键（本步未新增配置项）。

### 三、Step 6：死局检测与重排

- `board.js`：新增 `shuffleBoard`（Fisher–Yates + 上限重试；只重排普通动物格；失败还原原排列；`options.rng`/`options.maxTries`/`options.stats`）。
- `game.js`：`resolveBoard` 内新增 `ensurePlayable`（3.8：每次消除与填充完成后检测；无可行交换则重排），结果写入 `ResolveResult.deadlock`；`trySwap` 增加「死局且重排失败 → 进入结束流程」的结束条件（3.8 约束 4）。
- `hud.js`/`render.js`/`timeline.js`/`app.js`：新增重排提示胶囊（5.5）与 `shuffle` 动画阶段（按 `cell.id` 对位出每格起止位置），结束面板按原因显示「步数用尽」/「无可消除组合」。
- `tests/board.test.js`：新增 9 个用例（死局盘重排成功、障碍物布局不变、同种子可复现、超限失败并还原、少于两格立即失败、`resolveBoard` 检测与不消耗步数、退化盘失败上报、正常盘不误判、整盘同色不算死局）。

### 验证方式

- `node tests/run-all.js` → **74 用例 / 742 断言 / 0 加载错误 / PASS**。
- **浏览器 Step 6 套件**（`_build/verify-step6.mjs`）→ 5 阶段 **25 项 PASS**：
  - 死局链路（浏览器内 `import` 真实模块）：`(r+2c)%6` 死局盘 → `resolveBoard` 检测到死局并重排成功（第 8 次尝试）、**不消耗步数**、重排后实际棋盘无三连且有可行交换；`buildPhases` 追加 `shuffle` 阶段（文案「无可消除组合，正在重排…」、64 格位移、时长 200ms 取自配置）。
  - 失败路径：退化盘 `shuffled=false, tries=0`；全同色盘尝试到上限 5 次失败并**还原棋盘**。
  - 新增渲染代码：提示胶囊在离屏画布上确实画出（胶囊底色像素 3307，静止帧为 0）；插值帧与静止帧像素不同。
  - 完整一局（30 步真实滑动）：出现「游戏结束」、结束面板、最高分持久化、全程无未捕获异常。
- **浏览器 Step 5 套件回归 30/30 PASS**（Step 6 改动后重跑）。
- **本轮自查修正 2 处**：① 3 色死局盘无法在 50 次内重排出无三连局面（`e^{-10.6}` 量级），改用具 6 色死局盘做「应成功」夹具 —— 这个发现同时说明 3.8 的关卡异常分支是真实路径（D018 第 7 条）；② 我写的两处断言前提有误（覆盖颜色时冲掉雪块的「无动物」语义；把「整盘同色」误当成死局，实际它处处可交换）。

### 遗留问题

- **D018 第 6 条**：`state.gameOver = stuck`（死局且重排失败 → 结束流程）这一行**没有可执行测试**，只有代码审查；原因与替代验证方式已如实登记。
- 重排的**视觉效果未经人眼确认**（我无视觉工具）；程序化只能证明「胶囊被画出、插值帧与静止帧不同」。
- 真机（iOS/Android）跑一局 + 色盲模拟确认仍**待你执行**；本机 headless + 软件渲染的帧率数字不能当真机基线。
- `board.js` 的纯重构拆分（Step 6.1）见下一条记录。

### 下一步

- **Step 6.1**：按你的顺序做纯重构，把 `board.js` 拆为 `board.js`（数据结构/交换/下落/填充/克隆）+ `shuffle.js`（死局检测、重排、可移动性），逻辑零 diff，宪法升 v1.6 登记新文件。

---

## 2026-09-19（宪法 v1.4 + Step 5：移动端适配 + 动画打磨）

### 前置：宪法升级到 v1.4（用户批准「写进宪法」）

把 Step 2-4 只记在 `DECISIONS.md` 的契约扩展与规则口径正式写入宪法，并为本步的拆分登记目录与边界：

- **4.2**：补齐 `GameState` / `SwapResult`（含 `resolve`、`afterSwap`）/ `ResolveResult` / `ResolveLevel` / `LevelScore` / `GameSnapshot` / `MoveRecord` 的结构；登记 `createGame(levelConfig, options.rng)`、`refillBoard(..., rng)`、`resolveCascades(...)`、`level.consumeStep`。
- **3.5**：明确连消口径 —— 第 1 次消除不计连消，第 n 层（n ≥ 2）加 `(n − 1) × 30`，依次 30/60/90/120。
- **2.2 / 2.3**：登记 `render.js` 与 `input.js` 及其边界（`localStorage` 仍只在 `app.js`）。
- **11**：新增 v1.4 修订记录行与修订说明。附录 B 无新增键（本步未新增配置项）。

### 完成项（Step 5）

- **按已批准计划完成拆分**：`app.js` 674 → **418 行**（编排 + 动画调度 + 存档 + 日志）；新增 `render.js`（381 行，绘制与几何）与 `input.js`（111 行，手势与视口守卫）。三者边界与 2.3 一致，逻辑模块零改动。
- **动画（时长全部来自 `ANIMATION_CONFIG`）**：每层级联拆为「消除 `clearDuration` → 下落 `fallDuration`（按距离缩放到 150–250ms 区间）→ 落定 `cascadeGap`」，由 rAF 时间线播放历史快照（`afterSwap` / `levels[i].board` / `MoveRecord`）。逻辑在 `game.trySwap` 内同步算完，动画只回放 —— 5.4「动画不阻塞逻辑更新」成立。
- **色盲友好（5.4）**：6 色各自绑定一种形状（圆/圆角方/三角/菱形/五角星/六边形）。
- **减少动效（5.4）**：`ANIMATION_CONFIG.reducedMotion` 或系统媒体查询任一为真时，消除/下落时长归零、保留级联间隔；`styles.css` 增加媒体查询兜底 + `-webkit-user-drag: none`。
- **性能（REFERENCES §3.5 三条红线）**：`shadowBlur` 计数 0；静态图层与 36 个糖果精灵烘焙到离屏 canvas，每帧只 `drawImage`（逐格画路径需 ~350 次调用，会超 15 节 200 次预算）；修饰性底色 0.06。HUD 分数改用 `levelScores` 逐层累加显示。
- **范围**：改动 `AGENTS.md`、`app.js`、`styles.css`，新增 `render.js`、`input.js`；`config.js` 与全部逻辑模块、`tests/` 未改动（`config.js` 的现有 `ANIMATION_CONFIG` 已够用，故未改）。

### 验证方式

- `node tests/run-all.js` → **65 用例 / 704 断言 / 0 加载错误 / PASS**（逻辑模块未改，回归全绿）。
- **真实浏览器验证**（`_build/verify-step5.mjs`，Chrome headless + CDP，390×844 DPR3）：7 阶段 **30 项全部 PASS**：
  - 动画确实发生：一次交换期间采样到 **14 个不同画面**（正常动效）vs **2 个**（模拟 `prefers-reduced-motion: reduce` 后），证明补间来自配置且该偏好生效。
  - 帧率：页内 rAF 采样器在动画期间测得 **平均 16.7ms（≈60fps）/ p95 16.7ms / 最差 16.8ms**（测量窗口内不做像素回读，避免探针自身开销污染结论）。
  - 色盲：6 种形状灰度剪影最差 IoU = **0.856**（阈值 < 0.90）；同时报告 6 色灰度亮度最小间隔仅 **2.3** —— 说明「仅靠灰度不可分，必须靠形状」，这正是 5.4 的要求。
  - 回归：有效交换加分扣步、无效交换回退且不消耗步数、横向为主斜滑判为 `(4,4)↔(4,5)`、越界滑动忽略、无滚动缩放、后备缓冲 = CSS 边长 × DPR、全流程控制台无 error/warning 且无未捕获异常。
- **本轮自查出并修复的真实缺陷（1 个）**：`startTimeline(result, ...)` 把 `SwapResult` 当作 `ResolveResult` 用（`levels` 实际在 `result.resolve.levels`），抛 `TypeError` 后时间线从未建立 —— 现象是「画面完全不更新 + 输入永久锁定」。用页内 `window.onerror` 收集 + CDP 异常事件定位（`app.js:249`）后修复。
- **验证脚本自身修了 3 处缺陷**：① 「清空 consoleLog」与 CDP 事件投递竞态，会把上一条日志当成本次结果、也可能吞异常 → 改为「标记索引 + 切片」，并把异常收集到**永不清空**的独立数组，每阶段追加异常断言；② 剪影采样窗口用固定 ±12 画布像素（在 DPR3 下只覆盖糖果中心），导致 6 种形状剪影全等（IoU=1.000）→ 改为按格子尺寸缩放采样；③ 开机日志断言写死为 1 条（本步新增了「动效设置」日志）→ 改为按内容匹配。

### 遗留问题

- **模块行数仍未达标**：`app.js` 418 行（纯代码 329）、`render.js` 381 行（纯代码 313），均超 6 节「≤ 300 行」目标。拆分已让 `app.js` 从 674 降到 418，但仍需再拆一步；建议方案（拆出 `hud.js`）见 D017 第 9 条，**需要你批准再改 2.2 节目录**。
- **帧率数字是本机 headless + 软件渲染的结果**，不能当作真机基线（REFERENCES §3.5 有过同类警示）。真机（iOS/Android）跑一局与色盲模拟确认仍**待你手动执行**。
- 视觉观感（形状是否好看、动画节奏是否舒适）本会话仍无法由我确认 —— 无视觉工具，结论均来自程序化断言。
- `board.js` 355 行（纯代码 222）的拆分仍属**待批准事项**（D015 第 9 条）；`board.js` 属逻辑模块，本步不允许改动，因此未处理。
- 连消分数飘字与连击提示（5.4 的另一半）留给 Step 17 的粒子/视觉打磨；本步只做了 HUD 分数逐层累加。

### 下一步

- 进入 Step 6（死局检测与重排）：允许改 `board.js`、`game.js`、`app.js`、`tests/board.test.js`，允许**读取** `CONFIG.ANIMATION_CONFIG.shuffleMaxTries`。已实测死局率 **0.102%**（200 局模拟），本轮浏览器整局验证中未遇到死局，但 3.8 的四条重排约束（无初始三连、必须有可行交换、不改变障碍物布局、上限 50 次）必须逐条落地。

---

## 2026-09-19（Step 4：计分、步数、游戏结束、最高分）

### 事故与处理（必须先记录）

- 开工时发现 **四个文件被本会话之外的写入替换**：`score.js`（8:59:01）、`level.js`（8:59:30）、`game.js`（9:00:03）、`app.js`（9:00:29），均晚于 Step 3 提交 `420a5be`。前三份由 550/545 字节的占位注释变成压缩实现；`app.js` 被改成调用 `game.trySwap` 的半截接线，**日志仍引用 `result.cleared.length`/`result.spawned.length`，每次有效交换必然抛 `TypeError`**。
- `node tests/run-all.js` 当时仍报 41/41 PASS —— 因为 `tests/game.test.js`、`score.test.js`、`level.test.js` 还是空占位、从不 import 这三个模块。**这是「测试全绿」掩盖真实故障的一例**，已在此登记。
- 已向用户报告并取证（`git show HEAD:game.js` 证明仓库内仍是占位、`git status` 证明仅这四个文件被改），用户选择「按项目风格与 4.2 契约重写这三份 + 修好 app.js」。处理口径与理由见 **D016**。

### 完成项

- `score.js`（57 行）：`calcBaseScore` / `calcSpecialMultiplier` / `calcCascadeBonus` / `calcFinalScore` 四个 4.2 契约函数，全部查 `CONFIG.SCORE_CONFIG` 取值，无魔法数字。
- `level.js`（72 行）：`createLevel`（按 4.4 逐条校验 goal 与三元组非递减）、`consumeStep`、`getRemainingStepBonus`；`checkGoal`（3.6）与 `calcStars`（3.7）按 Step 4 禁止项与 Step 12 范围**明确不实现**。
- `game.js`（149 行）：`createGame` / `trySwap` / `resolveBoard` / `getState`，落地 4.3.2（无匹配回退且不扣步数）、4.3.3（只有有效交换扣 1 步）、3.5 计分接入；`getState` 返回深冻结快照。
- `app.js`（674 行）：游戏逻辑改由 `game.js` 承担；新增 Canvas HUD（分数/剩余步数/最高分常驻可见）、步数用尽结束面板与「再来一局」按钮；最高分经 `STORAGE_KEYS.BEST_SCORE`（`xxl_best_score`）读写 `localStorage`；级联回放结束后再弹面板。
- 三个测试文件从 0 用例补到：`score.test.js` 10 个、`level.test.js` 6 个、`game.test.js` 8 个。
- **范围**：本步改动 `score.js`、`level.js`、`game.js`、`app.js` 与三个测试文件；`config.js`、`board.js`、`match.js` 未改（无需改）。

### 验证方式

- `node tests/run-all.js` → **65 用例 / 704 断言 / 0 加载错误 / PASS**，退出码 0。逐文件：score 10/10、level 6/6、game 8/8、board 14/14、match 15/15、integration 12/12。
- 关键断言：`calcFinalScore` 与附录 A 速查表逐项一致（30 分基数 × 7 种倍数 = 45/60/75/90/105/120/150）；`calcCascadeBonus` 第 1 层 0、第 2 层起 30/60/90/120；`createLevel` 对 10 种非法配置抛错；`consumeStep` 减到 0 不变负；`trySwap` 有效交换**精确得到 30 分并扣 1 步**；死局棋盘上任意交换无效且**棋盘逐格（id）不变、步数不变**；步数用尽后 `gameOver` 且拒绝后续交换；`resolveBoard` 对每层核对 `base = 消除格数 × 10`、`bonus = (层−1) × 30`（种子锁定 2 层：3 格 + 15 格 = 210 分）；`getState` 深冻结且与内部状态隔离。
- **死局率实测**（200 局 × 最多 30 次交换的模拟）：5902 个局面中 6 个无可行交换 = **0.102%**，30 步完成率 194/200 —— 既确认 Step 6 的必要性，也说明整局验证基本不会被害。
- **真实浏览器整局验证**（`_build/verify-step4.mjs`，Chrome headless + CDP，390×844 DPR3）：7 阶段 **32 项全部 PASS**，其中：
  - 有效交换日志含「本步 +N 分（本局 N）」「剩余步数 29」，且 HUD 区像素随之变化（证明 HUD 真的重绘，不只是日志对）。
  - 无效交换日志注明「不消耗步数，剩余 29」，画布像素**逐字节等于**交换前；随后再有效交换得到「剩余步数 **28**」——用两步之差反证无效交换确实没扣步。
  - **真实打完整局**：脚本从像素反推棋盘、自行挑选有效交换并派发 CDP 触摸事件，直到出现「游戏结束：步数用尽。本局得分 1290，最高分 1290（新纪录）」；死局 0 次。
  - 结束面板：检测到「再来一局」按钮像素、棋盘区平均亮度下降 25% 以上；`localStorage.xxl_best_score` 存在且**等于本局得分**。
  - 点按按钮中心重开后：出现「新一局开始…步数 30」、按钮像素消失、棋盘恢复明亮、最高分保留。
  - 回归：横向为主斜滑 → `(4,4)↔(4,5)`；越界滑动显式忽略；无横纵向滚动、`overflow:hidden`、`touch-action:none`、后备缓冲 = CSS 边长 × DPR；全流程控制台无 error/warning（唯一噪声来自脚本自身 `getImageData`）。

### 遗留问题

- **`app.js` 674 行**（Step 5 前拆分已获批准）；`board.js` 355 行的拆分仍属**待批准事项**（D015 第 9 条）。
- **契约扩展尚未写入宪法**：`GameState`/`ResolveResult`/`SwapResult` 的追加字段、`options.rng`、`level.consumeStep` 都记在 D016 第 4 条，若希望写进 4.2 需你批准修改宪法。
- `calcCascadeBonus` 的「第 2 层起给分」读法虽有两处依据（3.5 语义 + game2 参考实现），但**宪法文字本身未明确**，属需要你确认的解释（D016 第 2 条）。
- 关卡目标（3.6）、三星评分（3.7）、剩余步数转化接入均属 Step 12；本步的 HUD 因此只显示分数/步数/最高分，未显示关卡目标。
- 障碍物在重力下的语义、以及死局重排仍分别属 Step 11/13 与 Step 6。
- 本次事故暴露出一个流程缺口：**空占位测试文件会让「测试全绿」失去意义**。建议后续每步都确认新模块至少被一个测试 import（本轮已通过补三个测试文件解决）。
- 视觉观感与真机手感仍未由你确认；未做真机（iOS/Android）实测。

### 下一步

- 进入 Step 5（移动端适配 + 动画打磨）：允许改 `app.js`、`styles.css`、`config.js`（仅 `ANIMATION_CONFIG`）。**开工第一件事是按已批准的计划把 `app.js` 拆成 `render.js` 与 `input.js`，并同步更新 `AGENTS.md` 第 2.2 节与模块边界**（需你确认宪法改动文本）；随后做消除/下落的补间动画、色盲友好形状、安全区适配与帧率实测。

---

## 2026-09-19（Step 3：消除、下落、填充、级联）

### 前置：参考项目源码核实（`REFERENCES.md` §2.1 Step 3）

- 实读 `AlexKutepov/.../Systems/BoardPhysics.ts`（上轮只读了 `MatchDetector.ts`）。其 `FallMove { from, to, chip }` 与本项目 MoveRecord 同构；每列自下而上扫描、为空洞向上找最近可落格；不可承载格作为下落终点；下落时长按距离缩放。
- 明确**不采纳**其对角下落变体（`calculateDiagonalFalls`）—— 宪法 4.3 只规定「下落填充」，采纳即属自行发明规则（D015 第 4 条）。
- game2 的级联流程（找匹配 → 置空 → 压缩 → 补充 → 再找）与「返回原棋盘快照实现回退」在本步被沿用；其 `mulberry32`/`rng` 注入设计成为本步 `rng` 参数的依据（D015 第 2 条）。

### 完成项

- `board.js`（355 行）新增：`applyGravity`（原地压缩 + 返回 MoveRecord 轨迹，纯障碍格作为屏障分列）、`refillBoard`（原地补齐空洞并返回新格子）、`resolveCascades`（循环「消除 → 下落 → 填充」直到无新匹配，返回每层快照/轨迹/被消除格子，含 `capped` 上限标志）。`shuffleBoard` 仍属 Step 6，未实现。
- `app.js`（458 行）：有效交换后调用 `resolveCascades` **同步算完**整条级联，再按 `clearDuration` / `cascadeGap` 分层回放历史快照（5.4：先更新状态、再播放动画）；新增回放期间输入锁定；`drawBoard(board, matched)` 支持绘制指定快照。
- `tests/integration.test.js`（273 行）：从 0 用例扩到 12 个——重力轨迹、屏障行为、填充、0 层不变性、中部消除→下落→顶部补位、下落造成的二层连消、每层补充数不变量、结束不变量、可复现性、层数上限截断、L 型 5 格不重复计数、纯障碍不被清除。
- **范围零越界**：`match.js`、`config.js` 本步未改动（Step 3 允许但无必要）；`special.js`、`score.js`、`obstacles.js`、`level.js`、`game.js` 与其余测试文件的 `git diff` 输出为空。

### 验证方式

- `node tests/integration.test.js` → 12 用例 PASS；`node tests/run-all.js` → **41 用例 / 564 断言 / 0 加载错误 / PASS**，退出码 0。
- 关键确定性断言：受控随机源下「中部三连 → 上方 4 格各下落 1 格 → 顶部生成 3 格」**恰好 1 层**；下落对齐形成的 `(7,0)(7,1)(7,2)` 匹配出现在**第 2 层或更晚**（证明「下落填充后如再形成匹配则继续级联」）；每层 `spawned.length === cleared.length`；整盘同色 + 恒定随机源时级联被 **64 层上限**截断且 `capped === true`（证明不会无限循环）。
- **真实浏览器验证**（`_build/verify-step3.mjs`，Chrome headless + DevTools Protocol，390×844 DPR3）：8 阶段 **30 项全部 PASS**，含 Step 1/2 回归项：
  - 有效交换后**结算干净**：最终色类网格无三连、64 格无空槽、匹配高亮环清零 —— 这条同时消除了 Step 2 遗留的「有效交换后残留匹配」现象。
  - 级联回放**确实被看见**：以 ~60ms 间隔连续采样画布，捕获到 ≥2 个不同画面帧，且期间出现过匹配高亮。
  - **回放期间输入锁定**：紧接着的第二次滑动没有产生第二次交换日志。
  - 回归：无效交换像素级回退（哈希逐字节一致）、斜向主轴锁定、越界忽略且像素不变、无滚动缩放、后备缓冲 = CSS 边长 × DPR、全程控制台无 error/warning。
- 首轮脚本自身有 1 处缺陷并已自查修正后重跑：阶段 5 复用了阶段 4 之前的交换对快照（棋盘已变），导致第一次滑动无效、根本没进入回放，锁定无从验证；修正为重新加载并重新推算交换对，并新增「第一次滑动确实有效」的前置断言。
- 测试自身也修过 2 处夹具/工具缺陷：`NO_CASCADE_RNG` 误写成「每次调用返回新生成器」→ `rng()` 返回函数对象 → `NaN` → 颜色恒为 0 → 一路撞上限；以及 0/1 棋盘格夹具在**下落错位后**会凑出同色（如 `(3,0)=(3,2)=1` 与落下的 `(3,1)=1`），因此改用带种子 LCG 并把断言改为表述真实意图。

### 遗留问题

- **`app.js` 458 行 / `board.js` 355 行，均超宪法 6 节 300 行目标**。`app.js` 拆分已获批、定于 Step 5 前；`board.js` 若拆需新增 2.2 节未登记文件，列为**待批准事项**（DECISIONS D015 第 9 条）。
- `resolveCascades` 与 `rng` 参数属 **4.2 契约扩展**（D015 第 1、2 条）。若你希望把它们写进宪法 4.2，需要你批准修改宪法。
- 障碍物重力语义为**暂定**：纯障碍格作屏障（不下落、分段），冰块/藤蔓里的动物随重力下落；藤蔓在重力下是否移动留待 Step 13。
- 回放只是**分层快照**（无位移补间）：真正的消除/下落动画、`fallDuration` 的使用、色盲友好与帧率实测均属 Step 5。
- 视觉观感与人眼手感仍未由你确认（本会话无视觉工具，结论均来自程序化断言）。
- 未做真机（iOS/Android）触摸实测。

### 下一步

- 进入 Step 4（计分、步数、游戏结束、最高分）：允许改 `score.js`、`level.js`、`game.js`、`app.js`、`config.js` 与 `tests/score.test.js`、`tests/level.test.js`、`tests/game.test.js`。届时 `game.js` 的 `trySwap` / `resolveBoard` / `getState` 要落地，并把 `app.js` 里暂存的交换+级联编排迁移过去（D014 第 8 条、D015 第 1 条），`localStorage` 读写只留在 `app.js`。

---

## 2026-09-19（Step 2：触摸交换 + 匹配检测）

### 前置：参考项目源码核实（`REFERENCES.md` §2.1 Step 2 强制要求）

- 用 GitHub API + raw 源码实读两个仓库（`rola2005-klc/game2` 7 个文件、`AlexKutepov/Match3-algorithm-TS-Cocos-creator` 的 `MatchDetector.ts` 等）。上一轮遗留的「AlexKutepov 文件级细节未复核」**已解除**。
- 两仓库均**无 LICENSE**，按 `REFERENCES.md` §5 只借鉴思路、不复制代码；本项目按 4.1 的 `cell[][]` 与 4.2 的签名重新实现。
- 发现并记录一处规则冲突：参考实现让条纹方向垂直于匹配方向，与宪法 3.2 相反 → **以宪法为准**（D014 第 1 条）。`REFERENCES.md` 的措辞更新属「Agent 提议、用户批准」，本轮**未擅自改动**该文件。

### 完成项

- `match.js`（212 行）：`findMatches`（逐段扫描，只在段起点产出，天然去重）、`findAllMatchGroups`（并查集合并共享格子的段，L/T 归为一组）、`detectMatchShape`（直线 → line3/4/5；行列交叉 → L/T；非法形状 → null，且要求两条臂都 ≥3 格）。
- `board.js`（207 行）：`createBoard`（无初始三连 + 保证存在可行交换，重试上限复用 `shuffleMaxTries`）、`swapCells`、`cloneBoard`、`isCellMovable`、`hasPossibleMove`（判定要求匹配涉及被交换的格子）。`applyGravity`/`refillBoard`（Step 3）与 `shuffleBoard`（Step 6）按步骤划分**未实现**，已在文件头登记归属。
- `app.js`（401 行）：棋盘改为 `board.js` 的真实 `cell[][]`，**删除了 D013 中承诺删除的占位颜色索引**；新增 touchstart/touchend 滑动交换（阈值取自 `CONFIG.ANIMATION_CONFIG.swipeThreshold`）、主轴方向锁定、点击两次交换的后备交互、无效交换回退、匹配高亮环，并为桌面验证提供同一入口的鼠标事件（含触摸后 600ms 兼容鼠标事件抑制）。
- `tests/board.test.js`（192 行）与 `tests/match.test.js`（154 行）：从 0 用例扩到 **29 个用例 / 509 次断言**。
- **范围零越界**：`config.js`、`game.js`、`special.js`、`score.js`、`obstacles.js`、`level.js` 与其余测试文件均未改动（`git diff --name-only` 对上述文件输出为空）。

### 验证方式

- `node tests/board.test.js` → 14 用例 / 461 断言 PASS；`node tests/match.test.js` → 15 用例 / 48 断言 PASS；`node tests/run-all.js` → 29 用例 / 509 断言 / 0 加载错误 / PASS，退出码 0。
- 覆盖到的关键断言：横/纵 3、4、5、6 连的形状与方向；L 型、T 型、十字形的合并与判定；两处独立匹配不被误并；`detectMatchShape` 对 4 格伪 L 返回 null；`createBoard` 连开 20 盘均无初始三连且都有可行交换；`cell.id` 唯一；obstacles 的 species/层数裁剪；`swapCells` 越界抛错；`cloneBoard` 深拷贝；`isCellMovable` 的冰块（可移动）/藤蔓（不可移动）/空格三分支；死局棋盘 `hasPossibleMove === false`（夹具颜色 `(r+2c)%3`，同时断言夹具自身无匹配）；「只差一次交换」棋盘 `=== true` 且交换后正好识别出 3 连；无效交换换回后与快照逐格一致。
- **真实浏览器验证**（`_build/verify-step2.mjs`，Chrome headless + DevTools Protocol，390×844 DPR3）：10 个阶段 **29 项全部 PASS**。其中关键项：
  - 由**画布像素**反推 8×8 色类网格（hue 分类，最大偏差 < 8°），据此挑出「会 / 不会」产生三连的相邻对，再用 **CDP 触摸事件**沿真实交互路径滑动 —— 避免了「直接调用内部函数」这种无效验证。
  - 无效交换：日志为「交换无效，已回退」，且回退后**画布像素哈希与交换前完全一致**（逐字节级等价，而不只是「看起来没变」）。
  - 有效交换：日志为「交换有效」并报告形状，画布出现匹配高亮环，交换后棋盘确实含三连。
  - 斜向滑动：横向为主 → 判为 `(4,4)↔(4,5)`；纵向为主 → 判为 `(2,2)↔(3,2)`，验证 5.3 的方向锁定。
  - 点击两次交换：第一次点击出现选中环且不交换，第二次点相邻格触发交换且坐标正是 `(3,3)↔(3,4)`。
  - 越界滑动：日志显式提示「滑动超出棋盘边界，忽略」，不产生交换、不改变画布像素。
  - 鼠标滑动（桌面端路径）同样触发交换；无横纵向滚动、`overflow: hidden`、`touch-action: none`、后备缓冲 = CSS 边长 × DPR。
  - 全流程结束后控制台**无 error / warning / exception**（唯一噪声是本脚本 `getImageData` 触发的 `willReadFrequently` 提示，非 `app.js` 产生）。
- 首轮验证脚本自身有两处缺陷，已**自查并修正后重跑**：阶段 7 传入了零位移终点（实际测的是「点击」而非「越界滑动」）；阶段 6 只断言「某个轴」而未断言具体方向。修正后新增 3 项断言。

### 遗留问题

- **`app.js` 401 行，超出宪法 6 节「模块不超过 300 行」的目标**。拆文件会新增 2.2 节目录未登记的文件、属改宪法（需批准），因此本轮保持单文件并在 **D014 第 9 条**登记偏差；建议 Step 5 前获批拆分渲染/输入。
- **D014 第 6 条的配置键复用**：`createBoard` 读 `ANIMATION_CONFIG.shuffleMaxTries` 作为生成重试上限。若希望改为独立键，需先改宪法附录 B。
- Step 2 无消除（属 Step 3），因此**有效交换后棋盘会残留已识别的匹配**，此时再滑动可能出现「已存在的匹配被当成新匹配」的现象 —— 这是步骤划分下的预期状态，Step 3 接入消除后消失。本轮浏览器验证通过「每次测试前重新加载」规避了该干扰。
- **步数系统尚不存在**（属 Step 4），所以验收项「无效交换不扣步数」本步只能以「无计数器」的方式成立，缺少可分步验证的对象。
- 视觉观感与人眼手感仍待你在真机/桌面确认（本会话无视觉工具，结论均来自程序化断言）。
- 未做真机（iOS/Android）触摸实测；`touchend` 的合成鼠标事件抑制用的是 600ms 时间窗，真机上若有异常可再调。

### 下一步

- 进入 Step 3（消除、下落、填充、级联）：允许改 `board.js`、`match.js`、`app.js`、`config.js` 与 `tests/board.test.js`、`tests/match.test.js`、`tests/integration.test.js`；届时 `app.js` 的 `attemptSwap` 需要接上 `applyGravity` / `refillBoard`，并删除「有效交换后残留匹配」的临时状态。

---

## 2026-09-19（Step 1：棋盘渲染）

### 完成项

- `app.js`：实现 8×8 棋盘渲染 —— 视口可用尺寸计算（扣除 `env(safe-area-inset-*)` 与两侧留白）、正方形边长钳制（220–720px）、按 `devicePixelRatio` 设置后备缓冲（上限 3×）、圆角棋盘底 + 每格一次径向渐变糖果。颜色从 `CONFIG.COLOR_COUNT` 随机取。
- `app.js`：视口守卫（`gesturestart` / `gesturechange` / `touchmove` 阻止默认行为），落实宪法 5.1「禁止滚动与缩放」，不涉及任何游戏交互。
- `app.js`：新增 `log(level, msg)`（宪法 6 节），启动打印一行 info 便于手动验证。
- `styles.css`：`#board` 兜底尺寸（`min(100%, 100vh − 安全区)`、`aspect-ratio: 1/1`、`max-width: 720px`），并抑制长按选择与 callout。
- `index.html`：补 `<meta name="mobile-web-app-capable">`，消除 Chrome 对 apple 版旧标签的弃用警告（见 D013）。
- **逻辑模块零改动**：`config.js`、`game.js`、`board.js`、`match.js`、`special.js`、`score.js`、`obstacles.js`、`level.js` 与 `tests/` 全部未修改。

### 验证方式

- `node --check app.js` → 退出码 0；`node tests/run-all.js` → 8 个测试文件、0 用例、`PASS`、退出码 0。
- 绘制预算实测：单帧 `fill` + `arc` 合计 **129 次** < 200（宪法 15 节）；`shadowBlur` 在 `app.js` 中出现 **0** 次（`REFERENCES.md` §3.5 红线第 1 条）。
- **本会话无视觉工具**（`read_image` 视觉引擎失败、`modlens` 未配置 provider），因此不使用截图做结论，改用 **Chrome headless + DevTools Protocol 在真实页面取证**。4 种视口全部通过：
  | 视口 | CSS 边长 | 后备缓冲 | 结果 |
  |---|---|---|---|
  | 390×844 DPR3（竖屏手机） | 358 | 1074×1074 | 9/9 通过 |
  | 844×390 DPR3（横屏） | 358 | 1074×1074 | 9/9 通过 |
  | 320×480 DPR2（小屏） | 288 | 576×576 | 9/9 通过 |
  | 1440×900 DPR1（桌面） | 720 | 720×720 | 9/9 通过 |
  逐项断言：棋盘为正方形、完整落在视口内、后备缓冲 = CSS 边长 × DPR、**64 个格子中心 hue 分类命中全部 6 种颜色**（最大分类偏差 < 8°）、无横向滚动、无纵向滚动、`body { overflow: hidden }`、`canvas { touch-action: none }`。
- 二次导航（不做任何 `getImageData` 回读）确认控制台仅 2 条 info（每次加载 1 条），**无 error / warning / exception**。首轮曾出现的 `apple-mobile-web-app-capable` 弃用警告已由 `mobile-web-app-capable` 修复；`getImageData willReadFrequently` 警告来自验证脚本自身，非 `app.js`。
- `python -m http.server 8000` 下 `/`、`/index.html`、`/styles.css`、`/app.js`、`/config.js` 均 200，`app.js` / `config.js` 以 `text/javascript` 返回（ESM 可加载）。
- 横竖屏之间的 64 格颜色布局**保持不变**，符合「颜色只在初始化时随机生成、resize 仅重排」的预期设计。

### 遗留问题

- **视觉观感未经人眼确认**：`app.js` 的配色、圆角、间距是否舒适，需用户在真机 / 桌面浏览器打开 `http://localhost:8000/` 后判断（headless 截图已生成于 `%TEMP%\xxl-step1-dpr*.png`，但本会话无法读取图像内容）。
- 渲染常量暂留在 `app.js` 而非 `config.js`，取舍见 **D013**。
- 色盲友好的形状/图案属 Step 5，本轮未做；占位颜色索引是临时数据，Step 2 接入 `board.js` 后必须删除。
- 未做真机触摸与滚动实测（触摸交互属 Step 2）。

### 下一步

- 进入 Step 2（触摸交换 + 匹配检测）：只允许改 `app.js`、`board.js`、`match.js`、`config.js`、`tests/board.test.js`、`tests/match.test.js`；开工前必须按 `REFERENCES.md` §2.1 Step 2 的核实状态重读 AlexKutepov 源码（上一轮未复核其文件级细节）。

---

## 2026-09-19（Step 0 收口与 Git 初始化）

### 完成项

- 只读审查全部初始文件，确认当前仍是 Step 0 骨架：8 个测试文件均为空占位，尚无游戏业务逻辑。
- 补建可进入版本控制的 `assets/README.md`，满足宪法 2.2 与 ROADMAP Step 0 的目录要求。
- 修正 `app.js` 占位注释对 DOM / Canvas / `localStorage` 职责的自相矛盾；清理 `config.js` 已完成登记后的过期「待同步」说明。
- 为 `index.html` 增加空 data favicon，避免浏览器额外请求 `/favicon.ico` 返回 404。
- 补齐 `ROADMAP.md`、`prompts.md`、`README.md` 对 `DECISIONS.md` 的会话必读要求，并补全 Step 0 任务卡字段。
- 按 D012 统一首次提交格式、`package.json` 精简规则与 Capacitor 原生目录跟踪策略。

### 验证方式

- `node tests/run-all.js`：8 个占位测试文件加载成功，0 个用例，退出码 0。该结果只证明骨架与测试入口可加载，不代表游戏逻辑已验证。
- 全部 JavaScript 文件通过 `node --check`。
- 本地 HTTP 页面加载完成，`index.html`、`styles.css`、`app.js` 均正常返回；浏览器控制台无 warning/error。
- 目录、文档交叉引用与 Git 状态在首次提交后复核。

### 遗留问题

- 当前页面只有 0×0 空 Canvas，不是可玩游戏；棋盘显示属于 Step 1。
- `_build/consistency_check.py` 是被忽略的本地辅助脚本：它会无条件把 `assets/` 判为存在，且 Windows 默认 GBK 下需用 UTF-8 模式运行，因此不能单独作为验收证据。
- 尚未做真机安装验证；Android/iOS 原生打包属于 Step 18。

### 下一步

- 进入 Step 1，只修改 `index.html`、`styles.css`、`app.js`，完成 8×8 棋盘显示与移动端画布适配，不加入交互和规则逻辑。

---

## 2026-09-18（第二轮：文件审查修复）

### 完成项

按《项目文件审查报告》逐条修复，**14 条中 13 条成立并已修，1 条为误报**（见下）：

- **S1**：`AGENTS.md` 第 17 节配套文件表补 `REFERENCES.md` 行，交叉引用规则补「第 8 节 / ROADMAP 0.8 / REFERENCES Step 编号必须对齐」。
- **S2**：`AGENTS.md` 2.2 节目录补 `REFERENCES.md`。
- **S3**：`AGENTS.md` 8.3 节与第 12 节补 `REFERENCES.md`、`DECISIONS.md`；**另补报告漏掉的第 8 节工作流第 1 条**（同属「会话开始必读文件」清单）。
- **M1**：`ROADMAP.md` Step 0 范围补 `REFERENCES.md`；验收项去掉「额外新增的 package.json」旧括号说明（已入宪法）；提交信息版本号 `v1.2` → `v1.3`。
- **M2**：`AGENTS.md` 2.2 节补 `assets/`（标注 Step 16 起启用）；Step 16 范围同步；`.gitignore` 注明 assets 必须入库。
- **M3**：`.gitignore` 增 `AGENTS.md.orig-*` 规则；D007 补备份去留说明（保留备查，确认后手动删）。
- **M4**：`AGENTS.md` 附录 B 补 9 个数值键，并**新增附录 B-2 字符串常量登记表**（6 个枚举对象），解决宪法 17 节「附录 B 与 config.js 必须一致」的长期不一致（D011）。
- **M5**：`ROADMAP.md` Step 6 范围改为「允许读取 `CONFIG.ANIMATION_CONFIG.shuffleMaxTries`；如需调整须先记 DECISIONS」。
- **M6**：`REFERENCES.md` §3.5 补**测量环境**与对照表（数据来自另一项目 PvZ 塔防：Chrome、1000×630 逻辑分辨率、DPR 2、峰值 26 实体；本项目尚未复现）。
- **L1**：第 0 节优先级补 `REFERENCES.md`。
- **L2**：`README.md` 列出两个 script 名与内容。
- **L4**：`README.md` 常用命令表补「操作建议 vs 宪法验收标准」的定位说明。
- **L5**：`REFERENCES.md` §1「新增的项目」改为「v1.0.1 新增（见 §6）」。
- **L3（误报）**：报告称 PROGRESS 用 `.*` 省略写法、应改为数字；实测原文已写「新增的 9 个配置键」，只是 `OBSTACLE_CONFIG.*` 的 `.*` 有歧义 → 本轮仍把 9 个键**逐一列全**，属清晰度优化，非缺陷修复。

文档版本变更：`AGENTS.md` v1.2 → **v1.3**、`ROADMAP.md` v1.2 → **v1.3**、`REFERENCES.md` v1.0.1 → **v1.0.2**。

### 验证方式

- 全部修改用 `str.replace` + `assert count == 1` 保护，**共 32 个修改点全部命中且唯一**（`AGENTS.md` 13、`ROADMAP.md` 7、`REFERENCES.md` 4、`README.md` 2、`.gitignore` 1、`PROGRESS.md` 2、`DECISIONS.md` 3 + 1 处末尾截断重写），无静默失败。
- 修改后文件体积核对：`AGENTS.md` 20,485 → 23,495 字符；`ROADMAP.md` 14,310 → 14,573；`REFERENCES.md` 12,577 → 13,165；`README.md` 1,984 → 2,199；`.gitignore` 281 → 404。
- **交叉引用自检（审查报告第 6 节要求）：`python _build/consistency_check.py` → 「全部通过 ✅」，退出码 0。** 覆盖 8 组检查：① 2.2 节目录 ↔ 磁盘（含 tests/ 子目录、未登记文件反向检查）；② 附录 B / B-2 ↔ `config.js` 实际导出（双向 diff + 幽灵键检测）；③ ROADMAP 19 个 Step ↔ `prompts.md` 19 条 ↔ 提示词块计数；④ 三阶段区间 ↔ 第 1 节阶段总览；⑤ 第 17 节登记文件 ↔ 实际存在；⑥ 全部文件的不可见字符与格式缺陷扫描；⑦ ESM 运行方式与版本号一致性；⑧ 审查报告 17 条修复项的逐条抽查。
  - 该脚本留在 `_build/consistency_check.py`（已被 `.gitignore` 忽略，不入库），后续每轮改文档后可直接复跑。

### 遗留问题

- 浏览器端仍未实测（Step 0 的「页面无报错」验收项待补验）。
- `git init` 与首次提交仍未执行。
- `AGENTS.md.orig-u200b` 仍在项目根目录（已被 `.gitignore` 忽略），待确认新版后删除。
- 审查报告第 7 节建议「按三轮分 6 个 commit」——**该建议前提不成立**：工作区尚未 `git init`，没有任何基线提交，分轮提交不可执行。建议改为：先 `git init` + 一次全量 `[init] 项目骨架与宪法 v1.3`，此后的修改再按「一步一提交」分轮。
- `_build/consistency_check.py` 未纳入版本控制，多人协作时无法共享；如需要共享，应移入 `tests/` 或建 `scripts/` 目录并同步宪法 2.2 节。

### 下一步

1. 跑交叉引用自检脚本，确认第 6 节输出的三处引用一致。
2. `git init` + 首次提交 `[init] 项目骨架与宪法 v1.3`。
3. 起服务器补验 Step 0 浏览器项 → 进 Step 1。

---

## 2026-09-18（第一轮：文件生成）

### 完成项

**文档层**

- 建立项目宪法 `AGENTS.md` v1.2（含 U+200B 清理与首尾包裹修复，见 D007）。
- `ROADMAP.md` 由 v1.1 升级为 **v1.2**：补全 Step 7-18 的提示词，新增第 0.9 条「运行方式（ESM 必须走 http）」，修正 Step 0 / 6 / 13 / 14 / 16 / 17 的范围与禁止项。
- `REFERENCES.md` 由「散文版」升级为 **结构化 v1.0.1**：许可证/星标/最后推送均为 2026-09-18 实测值，移除失效项目，新增性能红线 §3.5。
- 新建 `DECISIONS.md`（D001-D009）、`prompts.md`、`PROGRESS.md`、`README.md`。

**骨架层（Step 0）**

- `index.html`、`styles.css`：结构 + 移动端样式，viewport 与 `touch-action: none` 按宪法 5.1 落位。
- `config.js`：导出 `CONFIG`、`CELL_TYPE`、`OBSTACLE_TYPE`、`DIRECTION`、`MATCH_SHAPE`、`GOAL_TYPE`、`STORAGE_KEYS`，字段与附录 B 对齐。
- `package.json`：`"type": "module"`（ESM 必需），无任何依赖。
- `.gitignore`：新增 `_build/`（分块编写中间产物保留目录）。
- `tests/assert.js`：断言工具 + 用例注册表 + `summarize()`。
- `tests/run-all.js`：自动发现 `tests/*.test.js`，无测试文件时正常退出。
- 8 个逻辑占位模块与 8 个测试占位文件：只有说明注释，无业务逻辑。

### 验证方式

- `node tests/run-all.js` → 实测输出 `[run-all] 发现测试文件 8 个…` / `用例 0 个（通过 0 / 失败 0）` / `[assert] 结果：PASS`，退出码 **0**。
- `node tests/board.test.js` → 退出码 0（空占位，无用例）。
- 全部文件以 UTF-8 无 BOM、LF 换行写入。

### 遗留问题

- ~~`AGENTS.md` 附录 B 尚未登记 `config.js` 中新增的 9 个配置键~~ → **已于第二轮修复**：9 个数值键逐一列全，写入附录 B；新增附录 B-2 登记 6 个字符串常量对象（D006 / D011）。
- ~~`AGENTS.md` 2.2 节目录清单未包含 `package.json`~~ → **已于第二轮修复**：2.2 节现含 `package.json`、`REFERENCES.md`、`assets/`（D004 / S2 / M2）。
- `youssefmyh/Match3Algorithm` 已 404，参考列表已移除；若仍需要 C++ 版匹配算法参考，需另找项目，见 **D008**。
- AlexKutepov 仓库的**文件级细节未复核**（GitHub API 限流），Step 2 开工前必须重读源码。
- 浏览器端尚未实测（本轮只生成文件、未起服务器、未开浏览器），Step 0 的「页面无报错」验收项**待补验**。
- `git init` 与首次提交 `[init] 项目骨架与宪法 v1.2` **尚未执行**（用户要求先只生成文件）。

### 下一步

- 补验 Step 0：`python -m http.server 8000` → 打开 `http://localhost:8000/`，确认控制台零错误。
- `git init` + `.gitignore` 生效确认 + 首次提交。
- 进入 Step 1：棋盘渲染（只画不交互）。
