# AGENTS.md — 手机版消消乐项目 Agent 宪法（开心消消乐规则版）

> 版本：v1.4
> 适用范围：本项目所有 AI Agent 会话
> 修订原则：只增不改，改动必须记入第 11 节修订记录
> 配套文件：`ROADMAP.md`（路线图）、`REFERENCES.md`（外部参考与逐 Step 借鉴方案）、`PROGRESS.md`（进度日志）、`DECISIONS.md`（决策记录）、`prompts.md`（提示词库）

---

## 修订说明（v1.3 → v1.4 关键变更）

本次修订把 Step 2-4 落地过程中产生的**契约扩展与规则口径**正式写入宪法（此前只记在 `DECISIONS.md`），并为 Step 5 的模块拆分登记目录与边界。不改动任何既有游戏规则数值。

1. **4.2 补齐结构定义**：`GameState`、`SwapResult`（追加 `resolve` / `afterSwap`）、`ResolveResult`、`ResolveLevel`、`LevelScore`、`GameSnapshot`、`MoveRecord` 此前只有名字没有形状，现逐项写明；`createGame` 增加可选 `options.rng`，`refillBoard` / `resolveCascades` 增加可选 `rng`（只用于注入随机源，便于确定性测试）。
2. **4.2 补 `board.resolveCascades` 与 `level.consumeStep`**：两者分别承担 4.2 未命名的「整条消除循环」与「步数消耗」（2.3 规定 level.js 的职责含步数消耗），`game.resolveBoard` / `game.trySwap` 在其上叠加计分与状态。
3. **3.5 明确连消口径**：第 1 次消除（交换本身造成的消除）不计连消，自第 2 层起第 n 层加 `(n − 1) × 30`，依次 30、60、90、120。
4. **2.2 / 2.3 登记 Step 5 的模块拆分**：`app.js` 拆为 `app.js`（编排/动画调度/存档）+ `render.js`（绘制与几何）+ `input.js`（手势与视口守卫），并写明三者的边界与「`localStorage` 仍只在 `app.js`」。

---

## 修订说明（v1.2 → v1.3 关键变更）

本次修订只做**登记性补齐与一致性修复**，不改动任何游戏规则：

1. **补齐 `REFERENCES.md` 的宪法地位**：2.2 节目录、第 8 节工作流、8.3 节会话流程、第 12 节初始提示词、第 17 节配套文件表与交叉引用规则，六处全部登记（S1/S2/S3）。
2. **2.2 节目录补 `package.json` 与 `assets/`**：前者为 ES Module 的必要条件（D004），后者为 Step 16 音频资源预留（D009）。
3. **第 0 节优先级纳入 `REFERENCES.md`**：用户指令 > 宪法 > `ROADMAP.md` > `REFERENCES.md` > AI 默认习惯。
4. **附录 B 补 9 个配置键，并新增 B-2 字符串常量登记表**：解决「附录 B 与 `config.js` 必须一致」的长期不一致（D006/D011）。
5. **8.1 第 1 条补 `DECISIONS.md`**：会话开始时必须读历史决策，避免重走已否决的路线。

---

## 修订说明（v1.1 → v1.2 关键变更）

本次修订在 v1.1 基础上做以下优化：

1. **补全 `game.js` 接口契约**：v1.1 中 4.2 节遗漏了 `game.js` 对外接口，本次补全。
2. **补全附录 B 配置项**：补入 `LEVEL_DEFAULTS` 与 `BOARD_SIZE` 关联条目，并清理 v1.1 末尾的空表格残渣。
3. **与 ROADMAP 双向引用**：第 1 节各阶段、第 12 节提示词、附录 Step 编号与 `ROADMAP.md` 对齐。
4. **新增第 17 节“配套文件与交叉引用”**：明确各配套文件的职责与维护方式。
5. **补充关卡数据结构契约**：新增 4.4 节，定义 `Level` 与 `LevelConfig` 结构，与 14 节示例对齐。
6. **修正若干措辞**：统一术语，消除歧义。
7. **更新修订记录**：新增 v1.2 条目。

---

## 修订说明（v1.0 → v1.1 关键变更）

1. 统一棋盘数据结构为 `cell[][]`，4.1 为唯一真相源。
2. 藤蔓统一归入第三阶段。
3. `game.js` 补入第 9 节逻辑模块禁止列表。
4. `tests/` 补全为覆盖 8 个逻辑模块。
5. 全篇统一使用“魔力鸟”。
6. 倍数、分数等自创数值明确标注为“项目约定值”。
7. 新增术语表、关卡配置示例、性能与动画预算、提交与回滚规范、配置项集中表。
8. 4.2 节接口补全参数与返回值类型；第 7 节补测试用例示例；第 8 节补失败与回滚流程。
9. 移动端 UX 补充安全区适配、方向锁定、低功耗、色盲友好。
10. 附录 B 新增“配置项集中表”。

---

## 0. 元规则

本文件是本项目 AI Agent 的最高开发约束。
优先级：用户明确指令 > 本宪法 > `ROADMAP.md` > `REFERENCES.md` > AI 默认习惯。

你的角色：资深移动端 H5 游戏工程师 + 严格测试者 + 消消乐规则专家。
你的目标：用 vibe coding 小步构建一个可玩的手机版消消乐，游戏规则对标开心消消乐，而不是一次性生成不可维护的 Demo。

核心原则：

1. 每次只做一件事。
2. 先读文件，再计划，再编码，再验证。
3. 不确定必须问，禁止猜测 API、需求或数据结构。
4. 小步修改，小步提交，保持随时可运行。
5. 不追求炫技，优先可玩、可测、可维护。
6. 游戏规则的实现必须可追溯至本宪法第 3 节或附录 A，禁止自行发明规则。
7. 凡本宪法未明确规定的数值、阈值、时长，必须集中定义在 `config.js`，禁止散落魔法数字。
8. 任务粒度以 `ROADMAP.md` 的 Step 为准，禁止跨 Step 混合修改。

---

## 1. 项目目标

> 与 `ROADMAP.md` 第 1 节“阶段总览”保持一致。

### 第一阶段：核心可玩版（对应 ROADMAP Step 0 - Step 6）

- 8×8 棋盘，6 种颜色。
- 移动端触摸滑动交换相邻格子。
- 横向或纵向连续 3 个及以上同色消除。
- 消除后下落填充，顶部生成新格子。
- 支持级联消除（连消）。
- 计分、步数限制、游戏结束。
- localStorage 保存最高分。
- 手机浏览器可玩，禁止页面滚动和缩放。

### 第二阶段：开心消消乐核心机制（对应 ROADMAP Step 7 - Step 12）

- 特殊元素：条纹糖果、包装糖果、魔力鸟。
- 特殊元素组合效果。
- 障碍物：冰块、雪块。
- 关卡目标系统：收集动物、消除冰块、达到指定分数。
- 三星评分系统。

### 第三阶段：扩展机制（对应 ROADMAP Step 13 - Step 18）

- 更多障碍物：藤蔓、巧克力、绳索。
- 关卡类型：水果关、时间关、金豆荚关。
- 道具系统：刷新、加五步、小木锤。
- 音效、震动反馈、粒子动画。
- Capacitor 打包为 Android/iOS。

---

## 2. 技术栈与目录

### 2.1 技术栈

- HTML5 Canvas
- Vanilla JavaScript，ES2020+
- CSS
- 无框架、无构建工具、无外部依赖，除非用户明确批准。

### 2.2 目录结构

```
/
  index.html
  styles.css
  config.js        # 全局配置：颜色数、倍数、时长、关卡默认值
  game.js          # 对外统一接口，组合调用其他模块
  board.js         # 棋盘数据结构、交换、下落、填充、死局检测
  match.js         # 匹配检测（横向、纵向、L/T 型）
  special.js       # 特殊元素生成、激活、组合效果
  score.js         # 计分系统、连消倍数
  obstacles.js     # 障碍物逻辑（冰块、雪块、藤蔓、巧克力）
  level.js         # 关卡目标、步数限制、三星评分
  app.js           # 应用编排：视图状态、动画调度、调用游戏逻辑、localStorage 读写
  render.js         # Canvas 绘制与几何：画布尺寸/DPR、棋盘与 HUD 布局、6 色形状、结束面板
  input.js          # 触摸/鼠标手势识别与视口守卫：只产出手势，不碰游戏状态
  tests/
    assert.js
    run-all.js
    board.test.js
    match.test.js
    special.test.js
    score.test.js
    obstacles.test.js
    level.test.js
    game.test.js
    integration.test.js
  AGENTS.md
  ROADMAP.md
  PROGRESS.md
  DECISIONS.md
  prompts.md
  REFERENCES.md    # 外部参考项目与逐 Step 借鉴方案
  README.md
  .gitignore
  package.json     # 仅含 {"type": "module"} 与 scripts，零依赖（见 DECISIONS.md D004）
  assets/          # 音频等资源，Step 16 起启用；零素材策略下仅限自制或已授权素材（见 D009）
```

### 2.3 模块边界

- `config.js`：唯一允许存放可调数值的文件。
- `game.js`：对外统一接口，组合调用其他逻辑模块，不碰 DOM。
- `board.js`：棋盘状态、交换验证、下落、填充、死局检测。
- `match.js`：匹配检测，返回匹配组及其形状（直线、L 型、T 型）。
- `special.js`：根据匹配形状生成特殊元素，处理激活和组合。
- `score.js`：基础分、特效倍数、连消倍数计算。
- `obstacles.js`：障碍物创建、消除、层数管理。
- `level.js`：关卡配置、目标追踪、步数消耗、三星判定。
- `app.js`：应用编排——持有视图状态、调度动画时间线、调用游戏逻辑，并**唯一**允许读写 `localStorage`。
- `render.js`：Canvas 绘制与几何计算（画布尺寸与 DPR、棋盘与 HUD 布局、形状与配色、结束面板）。只接收「场景描述」对象，不读游戏状态、不绑定事件、不碰存档。
- `input.js`：触摸与鼠标手势识别（滑动阈值、主轴锁定、视口守卫），只产出 `{ kind, x0, y0, x1, y1 }` 手势事件；不认识棋盘、不碰游戏状态与存档。
- `index.html`：只放结构、viewport、引入脚本。
- `styles.css`：移动端布局、禁止滚动、Canvas 样式。
- `tests/`：各模块的算法单元测试与集成测试。

---

## 3. 核心游戏规则（开心消消乐对标）

### 3.1 基础消除规则

- 三个相同的色块成同一直线（横竖均可）即可消除并产生分数。
- 只允许交换上下左右相邻格子。
- 交换后如果没有匹配，必须回退，不消耗步数。
- 只有有效交换才扣步数。
- 匹配检测必须同时检查横向和纵向。
- 下落填充后必须继续级联检测，直到无新匹配。

### 3.2 特殊元素生成规则

**条纹糖果（直线特效）**：四个同色糖果排成一行或一列（4 连）生成，消除一整行或一整列。条纹的方向决定爆破方向：横向四连生成横向条纹（消除整行），纵向四连生成纵向条纹（消除整列）。本项目以此为准；若需对标特定版本，须在关卡配置中显式声明。

**包装糖果（爆炸特效）**：五个同色糖果排成 T 型或 L 型（5 连非直线）生成，消除周围 3×3 共 9 格范围。

**魔力鸟**：五个同色糖果连成一条直线（5 连直线）生成。魔力鸟与任意普通色块对调，可消除全屏该颜色所有色块。

生成优先级（当一次消除可同时满足多种形状时）：魔力鸟 > 包装糖果 > 条纹糖果。

### 3.3 特殊元素组合效果

两个相邻的特殊元素交换时触发组合效果：

| 组合 | 效果 |
|---|---|
| 条纹 + 条纹 | 同时触发两个直线爆破，形成十字形清除 |
| 条纹 + 包装 | 条纹方向全行/列清除，并对清除区域内再触发包装糖 3×3 爆炸 |
| 条纹 + 魔力鸟 | 将所有同色糖果转变为条纹糖果并立即触发 |
| 包装 + 包装 | 两个包装糖果各触发一次强化爆炸，范围约 5×5 |
| 包装 + 魔力鸟 | 将全屏同色糖果转变为包装糖果并触发 |
| 魔力鸟 + 魔力鸟 | 清除游戏面板上所有糖果 |

组合效果优先级：魔力鸟相关组合 > 包装 + 包装 > 条纹 + 包装 > 条纹 + 条纹。

### 3.4 障碍物规则

**冰块**：被冻在透明冰块内的动物可以移动并消除。冰块最多可叠加 3 层。消除冰块上面的小动物（普通消除与特效消除均可）连带消除一层冰块。每消除一层冰块得 1000 分。

**雪块**：最多可叠加 5 层。消除雪块旁边的小动物可以消除一层雪块，特效也可以消除一层雪块。

**藤蔓（第三阶段）**：被困的小动物不能移动，只能通过交换未被困的小动物进行关联消除。

**巧克力（第三阶段）**：单层，被相邻消除或特效波及时消除。

障碍物不参与三消匹配，但占据格子，影响下落和交换。障碍物只能通过相邻位置的消除来被动减少层数。藤蔓中的动物不能被交换，但可以被相邻消除波及。

### 3.5 计分规则

基础消除：每个动物 10 分。

特效消除倍数（项目约定值，集中定义于 `config.js`，可调）：

| 触发类型 | 倍数 |
|---|---|
| 条纹糖果（4 消） | 基数 × 1.5 |
| 包装糖果（L/T 型） | 基数 × 2.0 |
| 魔力鸟（5 消直线） | 基数 × 2.5 |
| 条纹 + 条纹 | 基数 × 3.0 |
| 条纹 + 包装 | 基数 × 3.5 |
| 包装 + 包装 | 基数 × 4.0 |
| 魔力鸟 + 魔力鸟 | 基数 × 5.0 |

障碍物得分：冰块每层 1000 分，雪块每层 1000 分，宝石 1500 分。

连续消除（连消）加分：**第 1 次消除（交换本身造成的消除）不计连消**；自第 2 层起每次递增一档，第 n 层（n ≥ 2）加 `(n − 1) × 30` 分，依次为 30、60、90、120。冰块连消每次 +1000 分，同样自第 2 层起依次叠加。

剩余步数转化：关卡结束时，每剩余一步约转化为 30 分连续消除加分。

> 以上所有数值均为项目约定值，集中在 `config.js` 的 `SCORE_CONFIG` 中定义。修改数值必须同步更新本表与附录 B。

### 3.6 关卡目标系统

每个关卡必须配置至少一种通关目标，步数用尽时若目标未达成则游戏失败。

目标类型：

- **分数目标**：在限定步数内达到指定分数。例如“7000 分以上”。
- **收集动物**：消除指定种类和数量的动物。
- **消除冰块**：消除指定数量的冰块。
- **混合目标**：同时满足多个条件。

### 3.7 三星评分系统

每个关卡配置三个分数阈值：一星（通关最低分）、二星、三星。

达成通关目标即获得一星。分数达到二星阈值获得二星，达到三星阈值获得三星。三星评分不依赖于步数剩余量，仅取决于最终得分。

### 3.8 死局检测与重排

每次消除和填充完成后，必须检测棋盘上是否存在至少一个有效交换（交换后能形成至少一组三消）。

如果无可行交换，必须自动重排棋盘（shuffle）或结束游戏。重排不消耗步数，且必须满足：

1. 重排后的棋盘不存在初始三连。
2. 重排后的棋盘存在至少一个有效交换。
3. 重排不得改变障碍物布局。
4. 重排尝试次数上限为 50 次；超过上限则判定为关卡异常，进入游戏结束流程。

---

## 4. 数据与算法契约

### 4.1 棋盘状态（唯一真相源）

棋盘为二维 `cell` 对象数组：

```js
cell = {
  color: 0-5,                                        // 颜色索引，null 表示空格或纯障碍
  type: 'normal' | 'striped' | 'wrapped' | 'magic',  // 元素类型
  direction: 'h' | 'v' | null,                       // 条纹方向
  obstacle: null | 'ice' | 'snow' | 'vine' | 'choc', // 障碍物类型
  obstacleLayers: 0-5,                               // 障碍物剩余层数
  id: number                                         // 唯一标识，用于动画追踪
}
```

棋盘本身：

```js
board = cell[][]  // board[row][col]
```

约束：

- `board` 一经创建，行列数不可变。
- 所有模块读写棋盘必须使用此结构，禁止使用二维数字数组作为棋盘。
- 如需简化表达（如测试夹具），必须通过 `createBoard` 构造，不得直接构造裸数组传入逻辑函数。

### 4.2 模块接口契约

以下签名中，`Cell` 指 4.1 定义的 cell 对象，`Board` 指 `Cell[][]`，`Pos` 指 `{r: number, c: number}`。

**config.js**

- 导出 `CONFIG`：包含 `BOARD_SIZE`、`COLOR_COUNT`、`SCORE_CONFIG`、`ANIMATION_CONFIG`、`LEVEL_DEFAULTS`。
- 禁止在逻辑模块内直接写数值。

**game.js**

- `createGame(levelConfig: LevelConfig, options?: { rng?: () => number }): GameState`
- `trySwap(state: GameState, a: Pos, b: Pos): SwapResult`
- `resolveBoard(state: GameState): ResolveResult`（消除 → 下落 → 填充 → 级联，返回轨迹供动画使用）
- `getState(state: GameState): GameSnapshot`（返回**深拷贝并冻结**的不可变快照，供 UI 读取）

结构定义（v1.4 补齐；此前只登记了函数名）：

```js
GameState = { level: Level, board: Board, gameOver: boolean, rng: () => number }
// 分数不另存字段：统一读 level.currentScore（4.4），避免两处真相源。
// rng 只用于「补充新格子」的随机源：生产为 Math.random，测试可注入确定性序列。

SwapResult = {
  valid: boolean, cascades: number, scoreDelta: number, stepsLeft: number, gameOver: boolean,
  resolve: ResolveResult | null,   // 供 UI 分层回放；无效交换时为 null
  afterSwap: Board | null          // 交换后、结算前的棋盘快照；无效交换时为 null
}

ResolveResult = {
  cascades: number,
  levels: ResolveLevel[],
  cleared: Cell[],                 // 展平后的被消除格子（含 color，供计分）
  spawned: Cell[],
  capped: boolean,                 // 是否触发级联层数上限（上限 = 棋盘格数，见 ROADMAP Step 3）
  scoreDelta: number,
  levelScores: LevelScore[]        // 逐层计分明细，供 UI 与测试核对 3.5 公式
}

ResolveLevel = { level: number, groups: MatchGroup[], cleared: Cell[], moves: MoveRecord[], spawned: Cell[], board: Board }
LevelScore   = { level: number, base: number, multiplier: number, bonus: number, gained: number }

GameSnapshot = {
  levelId: number, rows: number, cols: number, colorCount: number,
  totalSteps: number, remainingSteps: number, currentScore: number, gameOver: boolean,
  board: Board
}
```

**board.js**

- `createBoard(rows: number, cols: number, colorCount: number, obstacles?: ObstacleSpec[]): Board`（保证无初始三连且至少存在一个可行交换）
- `swapCells(board: Board, a: Pos, b: Pos): void`（原地交换）
- `applyGravity(board: Board): MoveRecord[]`（原地压缩并返回下落轨迹，供动画使用）
  - `MoveRecord = { id: number, from: Pos, to: Pos, color: number }`（只记录真正发生位移的格子；`id` 对应 4.1 的 `cell.id`，供动画追踪）
- `refillBoard(board: Board, colorCount: number, rng?: () => number): Cell[]`（原地填充空洞并返回新生成格子）
- `resolveCascades(board: Board, colorCount: number, options?: { rng?: () => number }): ResolveResult`（反复「消除 → 下落 → 填充」直到无新匹配；`game.resolveBoard` 在其上叠加计分与状态，不复写循环）
- `hasPossibleMove(board: Board): boolean`
- `shuffleBoard(board: Board): boolean`（返回是否成功）
- `isCellMovable(board: Board, r: number, c: number): boolean`
- `cloneBoard(board: Board): Board`（深拷贝，供测试与回退使用）

**match.js**

- `findMatches(board: Board): MatchGroup[]`，`MatchGroup = { cells: Pos[], shape: Shape, direction: 'h' | 'v' | null }`
- `detectMatchShape(cells: Pos[]): Shape`，`Shape = 'line3' | 'line4' | 'line5' | 'L' | 'T'`
- `matchShapeToSpecial(shape: Shape, direction: 'h' | 'v' | null): 'striped' | 'wrapped' | 'magic' | null`
- `findAllMatchGroups(board: Board): MatchGroup[]`（含重叠合并）

**special.js**

- `createSpecial(board: Board, matchGroup: MatchGroup): Pos`
- `activateSpecial(board: Board, r: number, c: number): Pos[]`
- `resolveSpecialCombo(board: Board, a: Pos, b: Pos): Pos[]`
- `getSpecialAffectedCells(board: Board, r: number, c: number, type: string, direction: string | null): Pos[]`

**score.js**

- `calcBaseScore(matchedCells: Cell[]): number`
- `calcSpecialMultiplier(type: string, comboType: string | null): number`
- `calcCascadeBonus(cascadeLevel: number, baseScore: number): number`
- `calcFinalScore(baseScore: number, multiplier: number, cascadeBonus: number): number`

**obstacles.js**

- `createObstacle(type: string, layers: number): Obstacle`
- `damageObstacle(board: Board, r: number, c: number, amount: number): { cleared: boolean, layersRemoved: number }`
- `getObstacleScore(type: string, layersRemoved: number): number`
- `isObstacleCleared(board: Board, r: number, c: number): boolean`

**level.js**

- `createLevel(config: LevelConfig): Level`（按 4.4 校验 `goal` 必填、`starThresholds` 为三元组且非递减）
- `consumeStep(level: Level): number`（扣 1 步并返回剩余步数，已为 0 时保持 0；4.3.3 的调用点在 `game.trySwap`）
- `checkGoal(level: Level, board: Board, score: number, collected: Record<string, number>): boolean`
- `calcStars(score: number, thresholds: [number, number, number]): 0 | 1 | 2 | 3`
- `getRemainingStepBonus(stepsLeft: number): number`

### 4.3 算法规则

1. 只允许交换上下左右相邻格子。
2. 交换后如果没有匹配，必须回退，不消耗步数。
3. 只有有效交换才扣步数。
4. 匹配检测必须同时检查横向和纵向。
5. 检测匹配时，必须识别连续长度：3 连（普通消除）、4 连（条纹）、5 连直线（魔力鸟）、L/T 型 5 连（包装糖果）。
6. 下落填充后必须继续级联检测，直到无新匹配。
7. 如果无可行交换，必须重排或结束游戏，且遵守 3.8 的重排约束。
8. 特殊元素在消除时优先激活其效果，再检查级联。
9. 两个特殊元素相邻交换时，触发组合效果，不进行普通匹配检测。
10. 障碍物不参与匹配，但占据格子，影响下落路径。
11. 藤蔓中的动物不能被交换，但可以被相邻消除波及。
12. 所有核心逻辑必须是纯函数或可测试函数。
13. 一次消除同时满足多种特殊形状时，按 3.2 优先级生成一种特殊元素，不重复生成。

### 4.4 关卡数据结构契约

```js
LevelConfig = {
  id: number,
  rows: number,
  cols: number,
  colorCount: number,
  steps: number,
  goal: GoalSpec,
  starThresholds: [number, number, number],
  obstacles: ObstacleSpec[]
}

GoalSpec =
  | { type: 'score',    target: number }
  | { type: 'collect',  targets: Record<string, number> }
  | { type: 'clearIce', target: number }
  | { type: 'mixed',    score?: number, collect?: Record<string, number>, clearIce?: number }

ObstacleSpec = { r: number, c: number, type: 'ice' | 'snow' | 'vine' | 'choc', layers: number }

Level = LevelConfig & {
  remainingSteps: number,
  collected: Record<string, number>,
  clearedIce: number,
  currentScore: number
}
```

约束：

- `goal` 与 `starThresholds` 必填。
- `starThresholds` 必须是三元组，且非递减。
- 具体示例见第 14 节。

---

## 5. 移动端 UX 约束

### 5.1 视口与滚动

- `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">`
- `body` 和 Canvas 设置 `touch-action: none`。
- 禁止页面滚动、下拉刷新、双指缩放。
- 使用 `env(safe-area-inset-*)` 适配刘海屏与 Home Indicator。

### 5.2 渲染

- Canvas 按 `devicePixelRatio` 适配，保持棋盘为正方形。
- 竖屏为主，横屏时给出提示或等比缩放，不重新布局。
- 动画帧率目标 60fps，低端机不得低于 30fps。

### 5.3 触摸交互

- 主交互使用 `touchstart` + `touchend` 判断滑动方向。
- 滑动阈值 20-30px，定义于 `ANIMATION_CONFIG`。
- 点击两次交换作为后备方案，但主交互必须是滑动。
- 触摸过程中锁定方向，避免斜向误判。

### 5.4 动画与反馈

- 动画不能阻塞逻辑更新；先更新状态，再播放动画。
- 特殊元素必须有明显的视觉区分（条纹方向箭头、包装糖果光晕、魔力鸟彩色光芒）。
- 障碍物必须有清晰的层数显示（冰块半透明叠加、雪块白色覆盖）。
- 连消时必须有分数飘字动画和连击提示。
- 色盲友好：颜色之外，普通动物必须有可区分的形状或图案。

### 5.5 UI 与提示

- 游戏结束用页面内 UI，禁止使用 `alert` 作为正式界面。
- 关卡目标、剩余步数、当前分数必须常驻可见。
- 无可行交换时，必须给出明确提示，再进行重排。

---

## 6. 代码风格

- 使用 `const` / `let`，禁止 `var`。
- 函数短小，单一职责。
- 纯函数优先，副作用集中在 `app.js`。
- 命名清晰：变量和函数 `camelCase`，常量 `UPPER_SNAKE_CASE`。
- 每个模块目标不超过 300 行；超过则拆分为更小的文件。
- 注释解释“为什么”，不解释“是什么”。游戏规则相关的注释必须引用本宪法章节号，例如 `// 见 3.2 生成优先级`。
- 不保留调试用 `console.log`；正式日志使用 `app.js` 中的 `log(level, msg)`。
- 不提交密钥、token、个人数据。
- 不擅自格式化整个文件；只改必要范围。
- 特殊元素类型的字符串常量必须集中定义于 `config.js`，禁止散落魔法字符串。
- 所有可调数值必须来自 `config.js`，禁止硬编码。

---

## 7. 测试与验证

### 7.1 自动化测试

每个算法函数必须有测试或可运行断言。测试文件覆盖：

```bash
node tests/run-all.js
```

或逐一运行：

```bash
node tests/board.test.js
node tests/match.test.js
node tests/special.test.js
node tests/score.test.js
node tests/obstacles.test.js
node tests/level.test.js
node tests/game.test.js
node tests/integration.test.js
```

关键测试用例示例：

- `match.test.js`：构造横向 3 连、4 连、5 连、L 型、T 型，断言 `shape` 与 `matchShapeToSpecial` 返回。
- `special.test.js`：构造两个相邻条纹，断言十字爆破坐标集合。
- `score.test.js`：给定匹配组，断言基础分、倍数、连消加分之和。
- `board.test.js`：构造死局棋盘，断言 `hasPossibleMove` 为 false，`shuffleBoard` 后为 true。
- `integration.test.js`：模拟一次完整交换 → 消除 → 下落 → 级联流程，断言最终棋盘状态与分数。

### 7.2 手动验证

打开 `index.html` 手动验证核心路径：

- 棋盘正常显示。
- 滑动可交换。
- 无效交换会回退。
- 3 连可消除。
- 4 连生成条纹糖果，激活后消除整行/列。
- L/T 型 5 连生成包装糖果，激活后消除 9 格。
- 5 连直线生成魔力鸟，激活后消除全屏同色。
- 条纹 + 条纹触发十字爆破。
- 消除后下落并补充。
- 级联消除正常。
- 步数正确减少。
- 冰块/雪块层数正确减少。
- 关卡目标追踪正确。
- 三星评分计算正确。
- 游戏结束和最高分正常。

### 7.3 错误检查

- 检查控制台无新增错误。
- 修 bug 时：先写失败用例，再修代码，最后确认用例通过。
- 禁止声称“已完成”而没有实际验证。

---

## 8. Agent 工作流

每次任务必须按以下格式执行：

1. 读取相关文件，至少包括 `AGENTS.md`、`ROADMAP.md` 当前 Step 及其「参考」栏指向的 `REFERENCES.md` 章节、`PROGRESS.md` 最近记录、`DECISIONS.md`（避免重走已被否决的路线）。
2. 输出 1-3 行计划：
   - 改哪些文件
   - 为什么改
   - 验收标准是什么
3. 只改必要代码，保持小步 diff。
4. 运行测试或手动验证。
5. 汇报：
   - 改了什么
   - 如何验证
   - 下一步建议

如果任务跨多个文件，先说明影响面。
如果需求模糊，先问 1-3 个关键问题，不要直接开写。

### 8.1 任务卡模板

```text
任务：
范围：
验收：
测试：
禁止：
前置依赖：
```

“前置依赖”一栏必须引用 `ROADMAP.md` 中的 Step 编号。

### 8.2 失败与回滚

- 若测试连续 2 次失败且原因不明，停止修改，向用户汇报，不得强行绕过。
- 每次小步修改前，确认当前工作区可运行；若不可运行，先恢复到最近可运行状态。
- 禁止使用 `git reset --hard` 或删除文件的方式回滚，除非用户明确授权。

### 8.3 会话开始与结束

- 会话开始时，先读 `AGENTS.md`、`ROADMAP.md` 当前 Step、`REFERENCES.md` 对应章节、`PROGRESS.md` 最近记录、`DECISIONS.md` 全部条目。
- 会话结束时，在 `PROGRESS.md` 追加一条记录；出现非显然决策时同时在 `DECISIONS.md` 追加。

---

## 9. 禁止事项

- 禁止一次性生成整个游戏。
- 禁止跨 Step 混合修改（见 0.8）。
- 禁止擅自引入依赖、框架、构建工具。
- 禁止在游戏逻辑模块（`config.js`、`game.js`、`board.js`、`match.js`、`special.js`、`score.js`、`obstacles.js`、`level.js`）中操作 DOM、Canvas、localStorage。
- 禁止删除或重写用户未要求修改的文件。
- 禁止为了让测试通过而硬编码结果。
- 禁止用 `alert` 做正式 UI。
- 禁止提交密钥、token、个人数据。
- 禁止在没有验证的情况下说“应该可以”。
- 禁止忽略移动端触摸和滚动问题。
- 禁止自行发明开心消消乐中不存在的规则或特殊元素类型。
- 禁止在没有规则依据的情况下修改计分公式。
- 禁止在逻辑模块中硬编码可调数值，必须走 `config.js`。
- 禁止在 4.1 之外另立棋盘数据结构。

---

## 10. 完成定义

一个任务完成必须同时满足：

- 代码可运行。
- 验收标准满足（对应 `ROADMAP.md` 该 Step 的“验收”）。
- 测试通过或手动验证通过（对应 `ROADMAP.md` 该 Step 的“测试”）。
- 无新增控制台错误。
- 变更说明清晰。
- 没有违反本宪法中的禁止事项。
- 如果涉及游戏规则，规则实现与本宪法第 3 节及附录 A 一致。
- 如果涉及数值改动，`config.js` 与附录 B 已同步。
- `PROGRESS.md` 已追加记录。

---

## 11. 宪法修改与修订记录

修改本文件必须得到用户明确批准。每次修改记录日期、原因和影响范围。

| 版本 | 日期     | 修改人 | 原因                                                         | 影响范围                 |
| ---- | -------- | ------ | ------------------------------------------------------------ | ------------------------ |
| v1.0 | （初始） | 用户   | 初始版本                                                     | 全文                     |
| v1.1 | （本次） | Agent  | 统一数据结构、补全禁止项、新增术语表与配置项表、强化可执行性 | 全文                     |
| v1.2 | 2026-09-18 | Agent  | 补全 game.js 接口与 4.4 关卡契约、与 ROADMAP 双向引用、清理附录 B 残渣 | 4.2、4.4、12、17、附录 B |
| v1.3 | 2026-09-18 | Agent  | 补齐 REFERENCES.md 的宪法地位（六处）、2.2 节目录补 package.json 与 assets/、第 0 节优先级纳入 REFERENCES.md、附录 B 补 9 键并新增 B-2 字符串常量表、通篇移除不可见字符与格式缺陷 | 2.2、第 0 节、第 8 节、8.1、8.3、12、17、附录 B、附录 B-2、修订记录 |
| v1.4 | 2026-09-19 | Agent  | 把 Step 2-4 的契约扩展与规则口径写入宪法：4.2 补齐 GameState/SwapResult/ResolveResult/ResolveLevel/LevelScore/GameSnapshot/MoveRecord 结构并登记 `options.rng`、`board.resolveCascades`、`level.consumeStep`；3.5 明确连消自第 2 层起计；2.2/2.3 登记 Step 5 的 `render.js`/`input.js` 拆分 | 2.2、2.3、3.5、4.2、11 |

---

## 12. 初始协作提示词

每次新会话，用户可以先对 Agent 说：

> 请先阅读 `AGENTS.md`、`ROADMAP.md`、`REFERENCES.md`、`PROGRESS.md`、`DECISIONS.md`。然后按 `ROADMAP.md` 的 Step 0 开始。只允许修改该 Step“范围”内列出的文件。先给计划，再改代码，最后告诉我如何验证。

后续 Step 使用 ROADMAP 中该 Step 自带的提示词模板。通用模板：

```text
任务：实现 <功能名>
范围：只允许修改 <文件列表>
验收：<可观察的行为>
测试：<运行哪些测试 / 手动验证步骤>
禁止：<本步明确不允许做的事>
前置依赖：<ROADMAP 中的 Step 编号>
```

---

## 13. 术语表

| 术语        | 含义                                         |
| ----------- | -------------------------------------------- |
| 动物 / 色块 | 棋盘上可消除的普通元素，由 `color` 区分      |
| 条纹糖果    | 4 连生成的特殊元素，消除整行或整列           |
| 包装糖果    | L/T 型 5 连生成的特殊元素，消除周围 9 格     |
| 魔力鸟      | 5 连直线生成的特殊元素，消除全屏同色         |
| 障碍物      | 冰块、雪块、藤蔓、巧克力等不可匹配元素       |
| 连消 / 级联 | 一次消除下落填充后再次形成的消除             |
| 死局        | 棋盘上不存在任何有效交换的状态               |
| 重排        | 在不改变障碍物布局的前提下重新排列普通元素   |
| 关卡目标    | 通关需满足的条件，如分数、收集数量、消除冰块 |
| 三星评分    | 依据最终分数判定 1-3 星                      |
| Step        | `ROADMAP.md` 中的最小可验收任务单元          |

---

## 14. 关卡配置示例

```js
const LEVEL_1 = {
  id: 1,
  rows: 8,
  cols: 8,
  colorCount: 6,
  steps: 30,
  goal: {
    type: 'score',
    target: 7000
  },
  starThresholds: [7000, 12000, 18000],
  obstacles: []
};

const LEVEL_2 = {
  id: 2,
  rows: 8,
  cols: 8,
  colorCount: 6,
  steps: 25,
  goal: {
    type: 'collect',
    targets: { frog: 10, hippo: 25 }
  },
  starThresholds: [8000, 14000, 20000],
  obstacles: [
    { r: 3, c: 3, type: 'ice', layers: 2 },
    { r: 3, c: 4, type: 'ice', layers: 2 },
    { r: 4, c: 3, type: 'snow', layers: 3 }
  ]
};

const LEVEL_3 = {
  id: 3,
  rows: 8,
  cols: 8,
  colorCount: 6,
  steps: 28,
  goal: {
    type: 'mixed',
    score: 9000,
    collect: { frog: 25, hippo: 25 },
    clearIce: 12
  },
  starThresholds: [9000, 15000, 22000],
  obstacles: []
};
```

---

## 15. 性能与动画预算

| 项目               | 目标                                                   |
| ------------------ | ------------------------------------------------------ |
| 帧率               | 60fps，低端机不低于 30fps                              |
| 单次消除动画时长   | 200-300ms                                              |
| 下落动画时长       | 150-250ms，按距离缩放                                  |
| 级联间隔           | 100-150ms                                              |
| 单帧绘制调用       | 不超过 200 次                                          |
| 棋盘更新与渲染解耦 | 必须先更新逻辑状态，再播放动画                         |
| 内存               | 单局新增对象可被 GC 回收，禁止长期持有已消除 cell 引用 |

所有时长定义于 `config.js` 的 `ANIMATION_CONFIG`。

---

## 16. 提交与回滚规范

- 每次小步修改后提交一次，提交信息格式：`[stepN] 简短描述`。
- 提交信息必须说明改动模块与验收方式。
- 禁止在一个提交中混合多个不相关改动。
- 若某次修改导致测试失败且 30 分钟内无法修复，必须回滚到上一个可运行提交。
- 回滚优先使用 `git revert`，禁止 `git reset --hard`，除非用户授权。
- 每个 Step 完成后建议打一次轻量 tag：`stepN-done`。

---

## 17. 配套文件与交叉引用

| 文件           | 职责                      | 谁维护                  | 何时更新             |
| -------------- | ------------------------- | ----------------------- | -------------------- |
| `AGENTS.md`    | 宪法，最高约束            | 用户批准后由 Agent 更新 | 规则或结构变更时     |
| `ROADMAP.md`   | Step 级任务清单与验收标准 | Agent 提议，用户批准    | 新增或调整 Step 时   |
| `REFERENCES.md` | 外部参考项目与逐 Step 借鉴方案 | Agent 提议，用户批准 | 新增参考项目或调整借鉴策略时 |
| `PROGRESS.md`  | 跨会话进度日志            | Agent 每次会话结束追加  | 每次会话结束         |
| `DECISIONS.md` | 关键决策记录              | Agent 每次决策后追加    | 出现非显然决策时     |
| `prompts.md`   | 复用提示词库              | Agent 建议，用户取舍    | 每个 Step 完成时     |
| `README.md`    | 项目门面                  | Agent 建议，用户确认    | 阶段变更或首次发布时 |

交叉引用规则：

- 宪法第 1 节与 ROADMAP 第 1 节必须一致。
- 宪法第 12 节与 ROADMAP 各 Step 的提示词模板必须一致。
- 宪法附录 B 与 `config.js` 必须一致（数值见附录 B，字符串常量见附录 B-2）。
- 宪法第 8 节、ROADMAP 第 0.8 条与 `REFERENCES.md` 的 Step 编号必须对齐。
- 任何文件之间的冲突，以宪法为准，并在 `DECISIONS.md` 记录冲突与解决方式。

---

## 附录 A：开心消消乐规则速查表

### 特殊元素生成

| 消除形状            | 生成元素 | 效果          |
| ------------------- | -------- | ------------- |
| 3 连（横/竖）       | 无       | 普通消除      |
| 4 连（横/竖直线）   | 条纹糖果 | 消除整行/整列 |
| 5 连（L 型或 T 型） | 包装糖果 | 消除周围 9 格 |
| 5 连（横/竖直线）   | 魔力鸟   | 消除全屏同色  |

### 特殊元素组合

| 组合            | 效果                       |
| --------------- | -------------------------- |
| 条纹 + 条纹     | 十字形双向直线爆破         |
| 条纹 + 包装     | 条纹方向清除 + 区域爆炸    |
| 条纹 + 魔力鸟   | 全屏同色变为条纹糖果并触发 |
| 包装 + 包装     | 强化爆炸，范围约 5×5       |
| 包装 + 魔力鸟   | 全屏同色变为包装糖果并触发 |
| 魔力鸟 + 魔力鸟 | 清除全屏所有糖果           |

### 计分速查

| 项目            | 得分/倍数    |
| --------------- | ------------ |
| 普通动物        | 10 分/个     |
| 冰块每层        | 1000 分      |
| 雪块每层        | 1000 分      |
| 宝石            | 1500 分      |
| 条纹糖果触发    | 基数 × 1.5   |
| 包装糖果触发    | 基数 × 2.0   |
| 魔力鸟触发      | 基数 × 2.5   |
| 条纹 + 条纹     | 基数 × 3.0   |
| 条纹 + 包装     | 基数 × 3.5   |
| 包装 + 包装     | 基数 × 4.0   |
| 魔力鸟 + 魔力鸟 | 基数 × 5.0   |
| 连消（普通）    | +30/次递增   |
| 连消（冰块）    | +1000/次递增 |
| 剩余步数        | 约 30 分/步  |

### 障碍物速查

| 障碍物 | 最大层数 | 消除方式                            |
| ------ | -------- | ----------------------------------- |
| 冰块   | 3 层     | 消除其上动物或特效波及，连带减 1 层 |
| 雪块   | 5 层     | 消除旁边动物或特效波及，减 1 层     |
| 藤蔓   | 1 层     | 被相邻消除波及，动物不能交换        |
| 巧克力 | 1 层     | 被相邻消除波及                      |

---

## 附录 B：配置项集中表

所有可调数值必须来自 `config.js`，并在本表登记。

| 配置键                             | 含义               | 默认值               | 所属规则 |
| ---------------------------------- | ------------------ | -------------------- | -------- |
| `BOARD_SIZE`                       | 棋盘边长           | 8                    | 1        |
| `COLOR_COUNT`                      | 颜色数             | 6                    | 3.1      |
| `SCORE_CONFIG.basePerCell`         | 普通动物基础分     | 10                   | 3.5      |
| `SCORE_CONFIG.icePerLayer`         | 冰块每层得分       | 1000                 | 3.5      |
| `SCORE_CONFIG.snowPerLayer`        | 雪块每层得分       | 1000                 | 3.5      |
| `SCORE_CONFIG.gemScore`            | 宝石得分           | 1500                 | 3.5      |
| `SCORE_CONFIG.specialMultipliers`  | 特效倍数表         | 见 3.5               | 3.5      |
| `SCORE_CONFIG.cascadeStep`         | 普通连消递增       | 30                   | 3.5      |
| `SCORE_CONFIG.cascadeIceStep`      | 冰块连消递增       | 1000                 | 3.5      |
| `SCORE_CONFIG.stepBonus`           | 剩余步数转化       | 30                   | 3.5      |
| `ANIMATION_CONFIG.swipeThreshold`  | 滑动阈值（px）     | 25                   | 5.3      |
| `ANIMATION_CONFIG.clearDuration`   | 消除动画时长（ms） | 250                  | 15       |
| `ANIMATION_CONFIG.fallDuration`    | 下落动画时长（ms） | 200                  | 15       |
| `ANIMATION_CONFIG.cascadeGap`      | 级联间隔（ms）     | 120                  | 15       |
| `ANIMATION_CONFIG.shuffleMaxTries` | 重排最大尝试次数   | 50                   | 3.8      |
| `LEVEL_DEFAULTS.steps`             | 关卡默认步数       | 30                   | 3.6      |
| `LEVEL_DEFAULTS.starThresholds`    | 关卡默认三星阈值   | [7000, 12000, 18000] | 3.7      |
| `COLOR_NAMES`                      | 颜色索引 0-5 到动物名映射 | `['frog','hippo','ladybug','octopus','chick','fox']` | 3.6 / 13 |
| `OBSTACLE_CONFIG.ice.maxLayers`    | 冰块最大层数       | 3                    | 3.4      |
| `OBSTACLE_CONFIG.snow.maxLayers`   | 雪块最大层数       | 5                    | 3.4      |
| `OBSTACLE_CONFIG.vine.maxLayers`   | 藤蔓层数           | 1                    | 3.4      |
| `OBSTACLE_CONFIG.choc.maxLayers`   | 巧克力层数         | 1                    | 3.4      |
| `ANIMATION_CONFIG.reducedMotion`   | 跟随系统减少动效   | false                | 5.4      |
| `STORAGE_KEYS.BEST_SCORE`          | 最高分存储键       | `xxl_best_score`     | 3.5 / ROADMAP Step 4 |
| `STORAGE_KEYS.MUTED`               | 静音开关存储键     | `xxl_muted`          | ROADMAP Step 16 |
| `STORAGE_KEYS.BOOSTERS`            | 道具数量存储键     | `xxl_boosters`       | ROADMAP Step 15 |

新增或修改配置项时，必须同步更新本表与第 3 节相关条款。第 1 条（`COLOR_NAMES`）的映射顺序即 `cell.color` 索引语义，调整顺序等于改动所有关卡目标，属破坏性变更。

### 附录 B-2：字符串常量登记表

本表登记 `config.js` 导出的字符串常量对象（第 6 节要求：特殊元素类型的字符串常量必须集中定义于 `config.js`，禁止散落魔法字符串）。这些是**枚举常量**而非可调数值，改动会破坏存档兼容或历史测试夹具，因此同样必须登记。

| 常量对象         | 内容                                             | 所属规则     |
| ---------------- | ------------------------------------------------ | ------------ |
| `CELL_TYPE`      | `normal` / `striped` / `wrapped` / `magic`       | 4.1 / 3.2    |
| `OBSTACLE_TYPE`  | `ice` / `snow` / `vine` / `choc`                 | 4.1 / 3.4    |
| `DIRECTION`      | `h` / `v`                                        | 4.1 / 3.2    |
| `MATCH_SHAPE`    | `line3` / `line4` / `line5` / `L` / `T`          | 4.2 / 4.3    |
| `GOAL_TYPE`      | `score` / `collect` / `clearIce` / `mixed`       | 4.4 / 3.6    |
| `STORAGE_KEYS`   | 见附录 B 上表                                    | 2.3 / 9      |
