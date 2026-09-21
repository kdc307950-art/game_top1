// board.js — 棋盘数据结构、交换、下落、填充、克隆。见 AGENTS.md 2.3 / 4.2 / 4.1。
//
// 纯逻辑模块：不碰 DOM / Canvas / localStorage（宪法 9 节）。
// 棋盘结构唯一真相源是 4.1 的 cell[][]，禁止使用二维数字数组。
//
// 【Step 6.1 纯重构】可移动性判定、死局检测与重排已移到 `shuffle.js`（职责分离，逻辑零改动）：
//   - 本文件：createBoard / swapCells / cloneBoard / applyGravity / refillBoard / resolveCascades
//   - shuffle.js：isCellMovable / hasPossibleMove / shuffleBoard
//   本文件单向依赖 shuffle.js 的 hasPossibleMove（createBoard 需要它校验「开局至少有一个可行交换」）。
//
// 实现思路借鉴（REFERENCES.md §2.1 Step 2/3，两个参考项目均无 LICENSE，只借鉴思路、不复制代码）：
//   - game2：生成时过滤「左边两格同色 / 上面两格同色」以杜绝初始三连；重试直到存在可行交换；
//     无效交换通过返回原棋盘快照实现回退；相邻对只需检查「右」「下」两个方向；
//     级联用「找匹配 → 置空 → 压缩 → 补充 → 再找」的循环。
//   - AlexKutepov 的 BoardPhysics：每列自下而上扫描、为每个空洞向上找最近的可落格；
//     其 `FallMove { from, to }` 与本文件 MoveRecord 同构；不可承载格（canHoldChip=false）
//     终止该列的下落查找 —— 本项目对应「纯障碍格是屏障」。该实现另有**对角下落**变体，
//     但宪法 4.3 只规定「下落填充」，故**不采纳**对角下落（见 D015）。

import { CELL_TYPE, COLLECTIBLE_TYPE, CONFIG, OBSTACLE_TYPE } from './config.js';
import { findAllMatchGroups, findMatches } from './match.js';
// Step 7：4 连生成条纹糖果、被消除时优先激活（3.2 / 4.3.8）
import { activateSpecial, createSpecial } from './special.js';
// Step 6.1 纯重构：可移动性/死局检测/重排移到 shuffle.js（职责分离）；
// createBoard 仍需 hasPossibleMove 校验「开局至少有一个可行交换」，故此处单向依赖 shuffle.js。
import { hasPossibleMove } from './shuffle.js';
// Step 11：层数管理在 obstacles.js（2.3），board.js 只负责「哪些格子本层受损」与「障碍物属于格子」。
import { damageObstacle } from './obstacles.js';

// 4.1：cell.color 为 null 表示空格或纯障碍。
// 3.4（v1.12）：障碍物分两类 ——
//   覆层障碍 ice/vine：格内有动物（color 非 null），动物照常参与匹配；动物被消除后该格补位，
//     障碍物留在原格（3 层冰因此需要三次消除）。故这类格在「没有动物」时是**空洞**而不是屏障。
//   占格障碍 snow/choc：格内没有动物（color 为 null），不参与匹配、不补位、不下落，
//     把所在列切成上下互不相通的两段（3.4「占据格子，影响下落」）。
// 该分工记入 DECISIONS.md D014 第 5 条，v1.12 起为宪法明文。
const BLOCKING_OBSTACLE_TYPES = new Set([OBSTACLE_TYPE.SNOW, OBSTACLE_TYPE.CHOC]);

// 3.4（v1.12）：冻/雪块的受损判定用上下左右四邻域（与 3.1「只允许交换上下左右相邻格子」一致）
const NEIGHBORS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// 少于 3 色时无法保证「无初始三连」，见 createBoard 的兜底说明
const MIN_COLOR_COUNT = 3;

// 收集物类型的合法取值（3.6 / 4.1 v1.18）：非法类型一律忽略，避免静默写入非法状态
const COLLECTIBLE_TYPES = new Set(Object.values(COLLECTIBLE_TYPE));

let nextCellId = 1;

/**
 * 4.2：createBoard(rows, cols, colorCount, obstacles?, collectibles?) —— 生成可玩棋盘。
 * 保证：无初始三连（否则开局就会自动消除）、且至少存在一个有效交换（3.8 的可玩性要求）。
 * 重试上限复用 CONFIG.ANIMATION_CONFIG.shuffleMaxTries（读取，不修改其默认值，见 D014）。
 * obstacles 只落障碍物元数据；障碍物的行为（层数减少、影响下落）属 Step 11/13。
 * collectibles（v1.19，3.6 的水果关/金豆荚关）只落「收集物」元数据：它占格、color 为 null、随重力下落。
 */
export function createBoard(rows, cols, colorCount, obstacles = [], collectibles = []) {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new Error(`createBoard: 非法尺寸 ${rows}×${cols}`);
  }
  if (!Number.isInteger(colorCount) || colorCount < MIN_COLOR_COUNT) {
    throw new Error(`createBoard: colorCount 至少为 ${MIN_COLOR_COUNT}，收到 ${colorCount}`);
  }

  const blocking = collectBlockingObstacleKeys(rows, cols, obstacles);
  const maxTries = Math.max(1, CONFIG.ANIMATION_CONFIG.shuffleMaxTries);

  let board = null;
  for (let attempt = 0; attempt < maxTries; attempt += 1) {
    board = buildColorLayer(rows, cols, colorCount, blocking);
    applyObstacles(board, obstacles);
    applyCollectibles(board, collectibles);
    if (findMatches(board).length === 0 && hasPossibleMove(board)) return board;
  }

  // 兜底：色数过小时（colorCount < 3）可能始终无法同时满足两个约束，
  // 此时返回最后一轮候选而不是抛错，让上层（Step 6 的死局流程）处理。
  return board;
}

/** 4.2：swapCells(board, a, b) —— 原地交换两格（不论是否构成消除，合法性由调用方判定）。 */
export function swapCells(board, a, b) {
  if (!isInside(board, a.r, a.c) || !isInside(board, b.r, b.c)) {
    throw new Error(`swapCells: 位置越界 (${a.r},${a.c}) ↔ (${b.r},${b.c})`);
  }
  const cellA = board[a.r][a.c];
  const cellB = board[b.r][b.c];
  board[a.r][a.c] = cellB;
  board[b.r][b.c] = cellA;
  // 3.4/3.8：障碍物属于「格子」而不是动物 —— 交换只移动动物，冰块留在原格（重排同理）。
  swapObstacleFields(cellA, cellB);
}

/** 3.4/3.8：把两个 cell 的障碍物字段互换，使障碍物在「格对象被搬走」后仍留在原位置。 */
function swapObstacleFields(cellA, cellB) {
  const obstacle = cellA.obstacle;
  const layers = cellA.obstacleLayers;
  cellA.obstacle = cellB.obstacle;
  cellA.obstacleLayers = cellB.obstacleLayers;
  cellB.obstacle = obstacle;
  cellB.obstacleLayers = layers;
}

/** 3.4：把某位置的障碍物字段还原成快照值（传入 null 表示该位置没有障碍物）。 */
function restoreObstacle(cell, snapshot) {
  cell.obstacle = snapshot ? snapshot.obstacle : null;
  cell.obstacleLayers = snapshot ? snapshot.obstacleLayers : 0;
}

/** 4.2：cloneBoard(board) —— 深拷贝，供测试与无效交换的回退使用。 */
export function cloneBoard(board) {
  return board.map((row) => row.map((cell) => ({ ...cell })));
}
// ---------------------------------------------------------------------------
// Step 3：消除 → 下落 → 填充 → 级联
//
// 三个名词（与 4.1 的 color/obstacle 语义对应，见 D014）：
//   动物格    color !== null（含冰块/藤蔓里的动物，3.4：冰块内的动物可以移动）
//   洞 hole   color === null 且 obstacle === null：空格，需要被填充
//   屏障      color === null 且 obstacle !== null：纯障碍（雪块/巧克力），
//             占据格子且不下落，并把该列切成若干段（3.4「占据格子，影响下落」）
// ---------------------------------------------------------------------------

/**
 * 4.2：applyGravity(board, options?) —— **原地**让动物下落（3.1「消除后下落填充」），返回下落轨迹。
 * MoveRecord = { id, from: {r,c}, to: {r,c}, color }（4.2 未给出 MoveRecord 结构，见 D015）；
 * 只记录真正发生位移的格子，供动画使用（Step 5 按下落距离缩放时长）。
 *
 * v1.19（3.6 的水果关 / 金豆荚关）：收集物**与动物一同参与下落**，区别只在单层下落格数 ——
 * 动物的落格数不限，收集物受 `options.collectibleFall`（缺省 `COLLECTIBLE_CONFIG`）限制，
 * 于是「金豆荚每次消除只下落 1 格」由重力本身表达，而不是靠动画假装。具体分两步：
 *   ① 收集物把所在静态段切成若干「动物子段」，每个子段各自压实 —— 收集物因此对上方格子
 *      充当本层屏障（上方动物压不下来，只能停在它上面）；
 *   ② 收集物自下而上各下移至多 `fallPerStep` 格，且只能吃它正下方的**连续空洞** ——
 *      子段压实后正下方空出的格数就是它这一步能走的距离，下一层若被新动物填上就停住。
 * 这也是为什么「消除它下方的动物」才能推动它下落（3.6 v1.18 的原文口径）。
 */
export function applyGravity(board, options = {}) {
  if (!board || board.length === 0) return [];
  const rows = board.length;
  const cols = board[0].length;
  const fallPerStep = options.collectibleFall ?? CONFIG.COLLECTIBLE_CONFIG;
  const moves = [];

  for (let c = 0; c < cols; c += 1) {
    let segmentEnd = rows - 1;
    // r 递减到 -1 是为了让「列顶端」也被当作一条边界，从而统一处理最后一段
    for (let r = rows - 1; r >= -1; r -= 1) {
      if (r >= 0 && !isBarrierCell(board[r][c])) continue;
      if (segmentEnd > r) settleSegment(board, c, r + 1, segmentEnd, moves, fallPerStep);
      segmentEnd = r - 1;
    }
  }

  return moves;
}

/**
 * 在一个静态段内结算下落：先按「收集物为界」的子段压实动物，再让收集物按单层上限下移。
 * 顺序不能颠倒 —— 收集物必须在**填充之前**落进子段刚腾出的空洞，否则新补的动物会挡在它下面（D035 第 3 条）。
 */
function settleSegment(board, c, start, end, moves, fallPerStep) {
  const pivots = [];
  for (let r = start; r <= end; r += 1) {
    if (isCollectible(board[r][c])) pivots.push(r);
  }

  // ① 动物子段：收集物之间（含段首尾）的区间各自压实
  const bounds = subSegmentsOf(start, end, pivots);
  for (const [from, to] of bounds) compactAnimals(board, c, from, to, moves);

  // ② 收集物自下而上：每个最多下移 fallPerStep[type] 格，只吃正下方的连续空洞
  const landed = [];
  for (let i = pivots.length - 1; i >= 0; i -= 1) {
    const from = pivots[i];
    const limit = collectibleFallLimit(board[from][c], fallPerStep);
    let to = from;
    while (to < end && to - from < limit && isHole(board[to + 1][c])) to += 1;
    moveCell(board, c, from, to, moves);
    landed.unshift(to);
  }

  // ③ 收集物让位后再压实它上方的子段：否则它原来那一格会空着等新动物，
  //    观感上像是「凭空出现在收集物上方」，而正确的规则是上方的动物压下来（3.1 的重力）。
  let upperStart = start;
  for (const landedAt of landed) {
    compactAnimals(board, c, upperStart, landedAt - 1, moves);
    upperStart = landedAt + 1;
  }
  compactAnimals(board, c, upperStart, end, moves);
}

/** 以收集物为界把一个静态段切成若干「动物子段」（收集物自身不属于任何子段）。 */
function subSegmentsOf(start, end, pivots) {
  const bounds = [];
  let subStart = start;
  for (const pivot of pivots) {
    bounds.push([subStart, pivot - 1]);
    subStart = pivot + 1;
  }
  bounds.push([subStart, end]);
  return bounds;
}

/** 收集物的单层下落格数上限（3.6 v1.18；键名与附录 B 一致：`fruitFallPerStep` / `podFallPerStep`）。 */
function collectibleFallLimit(cell, fallPerStep) {
  const limit = Number(fallPerStep?.[`${cell.collectible}FallPerStep`]);
  if (!Number.isFinite(limit) || limit < 0) return Number.MAX_SAFE_INTEGER;
  return Math.floor(limit);
}

/** 把一段静态段内的动物压到底部并记录位移（收集物已按子段边界排除在外）。 */
function compactAnimals(board, c, start, end, moves) {
  if (start > end) return;
  let write = end;
  for (let r = end; r >= start; r -= 1) {
    const cell = board[r][c];
    if (!carriesAnimal(cell)) continue; // 空洞：跳过，等上面的动物压下来
    moveCell(board, c, r, write, moves);
    write -= 1;
  }
  for (let r = write; r >= start; r -= 1) {
    const slot = board[r][c];
    const keep = snapshotObstacle(slot);
    board[r][c] = makeCell(null);
    restoreObstacle(board[r][c], keep);
  }
}

/**
 * 把一个格子从 (from,c) 搬到 (to,c) 并记录位移；from === to 时什么也不做。
 * 3.4/3.8：障碍物属于**格子**而不是动物 —— 两端的障碍物字段各自快照后还原，
 * 冰块因此不会随动物下落（重排同理：3.8 要求重排不改变障碍物布局）。
 */
function moveCell(board, c, from, to, moves) {
  if (from === to) return;
  const cell = board[from][c];
  const srcObstacle = snapshotObstacle(cell);
  const destObstacle = snapshotObstacle(board[to][c]);
  board[to][c] = cell;
  board[from][c] = makeCell(null);
  restoreObstacle(board[to][c], destObstacle);
  restoreObstacle(board[from][c], srcObstacle); // 动物离开的格子若原本带冰，留下「带冰的空洞」等待补位
  moves.push({ id: cell.id, from: { r: from, c }, to: { r: to, c }, color: cell.color });
}

function snapshotObstacle(cell) {
  return cell && cell.obstacle !== null && cell.obstacle !== undefined
    ? { obstacle: cell.obstacle, obstacleLayers: cell.obstacleLayers }
    : null;
}

/**
 * 4.2：refillBoard(board, colorCount, rng?) —— **原地**填充所有空洞，返回新生成的格子（4.2）。
 * 新格子的颜色完全随机（不规避匹配）：这正是级联的来源（3.1「级联检测直到无新匹配」）。
 * rng 为可选随机源（默认 Math.random），只用于测试注入确定性序列，见 D015。
 */
export function refillBoard(board, colorCount, rng = Math.random) {
  const spawned = [];
  if (!board || board.length === 0) return spawned;
  const rows = board.length;
  const cols = board[0].length;

  for (let c = 0; c < cols; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      const slot = board[r][c];
      if (!isHole(slot)) continue;
      const cell = makeCell(randomColor(colorCount, rng));
      // 3.4：覆层障碍（冰块）的格子补位时障碍物留在原格 —— 新动物直接生在冰里
      const keep = slot.obstacle === null || slot.obstacle === undefined
        ? null
        : { obstacle: slot.obstacle, obstacleLayers: slot.obstacleLayers };
      restoreObstacle(cell, keep);
      board[r][c] = cell;
      spawned.push(cell);
    }
  }

  return spawned;
}

/**
 * Step 3 追加导出（不在 4.2 的 board.js 清单内，见 D015）：
 * resolveCascades(board, colorCount, options?) —— 反复「消除 → 下落 → 填充」直到无新匹配。
 * 同步执行完整逻辑（5.4：先更新状态，再播放动画），把每层结算后的棋盘快照一并返回，供 UI 回放。
 *
 * 返回：{
 *   cascades  级联层数（第 1 层 = 本次消除的第一波；无匹配时为 0）
 *   levels    每层 { level, groups, cleared, moves, spawned, board(快照) }
 *   cleared   展平后的被消除格子快照（含 color，供 Step 4 计分）
 *   spawned   展平后的新生成格子
 *   capped    是否触发了层数上限（3.8「禁止无限重试」的同类保护）
 * }
 * 层数上限取棋盘格数：任何真实级联都远达不到（每层至少消除 3 格），因此它是一个
 * 宽松但确定的终止保证；4.2 未定义该上限，故不新增配置键（见 D015）。
 *
 * v1.11 追加 `options.initialClear`：第一层先把这些坐标并进消除集合（3.2 的魔力鸟交换用），
 * 之后照常走「生成特效 → 下落 → 填充 → 级联」。缺省时不改变任何既有行为。
 */
export function resolveCascades(board, colorCount, options = {}) {
  const rng = typeof options.rng === 'function' ? options.rng : Math.random;
  const initialKeys = keysOf(options.initialClear);
  const rows = board.length;
  const cols = rows > 0 ? board[0].length : 0;
  const maxLevels = Math.max(1, rows * cols);

  const levels = [];
  const cleared = [];
  const spawned = [];
  const damaged = [];
  // v1.19（3.6）：本局被收走的收集物（水果/金豆荚落到出口行即计数）
  const collected = [];
  const exitRow = exitRowOf(rows);

  for (let level = 1; level <= maxLevels; level += 1) {
    const groups = findAllMatchGroups(board);
    const forced = level === 1 ? initialKeys : null;
    if (groups.length === 0 && (!forced || forced.size === 0)) break;

    // 3.2：先按形状在落点生成特殊元素（条纹 / 包装 / 魔力鸟各由 matchShapeToSpecial 决定）。
    // 这些格子**本层不参与消除**——这正是「4 连留下一颗条纹糖果」的实现方式。
    const spawnKeys = new Set();
    for (const group of groups) {
      const pos = createSpecial(board, group);
      if (pos) spawnKeys.add(posKey(pos.r, pos.c));
    }

    // 4.3.8：特殊元素在消除时优先激活其效果（可链式），再进入下落与级联。
    // `forced`（initialClear）的格子同样作为**激活种子**进入队列（D026）：被波及的条纹/包装会继续
    // 展开 —— 这正是 3.3「条纹 + 包装 → 清除区域内再触发包装糖爆炸」的实现方式。
    const keys = collectClearKeys(board, groups, spawnKeys, forced);
    if (forced) {
      // 外部指定要清除的格子（魔力鸟交换 / 特殊元素组合）；本层新生成的特效不被它消掉
      for (const key of forced) if (!spawnKeys.has(key)) keys.add(key);
    }
    // 3.4：障碍物受损必须在 clearCells **之前**结算 —— 此时棋盘还是「消除前」的状态，
    // 才分得清哪些格是动物（冰块由其上的动物被消除而受损，雪块由旁边的动物被消除而受损）。
    const levelDamaged = damageObstacles(board, keys);
    const removed = clearCells(board, keys);
    const moves = applyGravity(board, { collectibleFall: options.collectibleFall });
    // v1.19（3.6）：出口判定在**下落之后、填充之前** —— 出口格因此能在同一层被补上动物（D035 第 4 条）
    const levelCollected = collectAtExit(board, exitRow);
    const created = refillBoard(board, colorCount, rng);

    cleared.push(...removed);
    spawned.push(...created);
    damaged.push(...levelDamaged);
    collected.push(...levelCollected);
    levels.push({
      level,
      groups,
      cleared: removed,
      damaged: levelDamaged,
      collected: levelCollected,
      moves,
      spawned: created,
      board: cloneBoard(board)
    });
  }

  return { cascades: levels.length, levels, cleared, spawned, damaged, collected, capped: levels.length >= maxLevels };
}

/** 3.6（v1.19）：底部出口所在行 —— 取配置值并夹到棋盘内，非 8 行的棋盘也能用。 */
function exitRowOf(rows) {
  const configured = Math.trunc(Number(CONFIG.COLLECTIBLE_CONFIG.exitRow));
  if (!Number.isFinite(configured)) return rows - 1;
  return Math.min(Math.max(configured, 0), rows - 1);
}

/**
 * 3.6（v1.19）：把位于出口行的收集物收走，返回收集事件 `CollectibleHit[]`。
 * 该格被清成长空后由 `refillBoard` 补位；下一层若还有收集物落到出口行会再次触发。
 */
function collectAtExit(board, exitRow) {
  const hits = [];
  const cols = board[0]?.length ?? 0;
  for (let c = 0; c < cols; c += 1) {
    const cell = board[exitRow]?.[c];
    if (!isCollectible(cell)) continue;
    hits.push({ r: exitRow, c, type: cell.collectible });
    board[exitRow][c] = makeCell(null);
  }
  return hits;
}

/** 把 Pos[] 转成 `"r,c"` 键集；忽略非法项（越界或非整数坐标）。 */
function keysOf(positions) {
  const keys = new Set();
  if (!Array.isArray(positions)) return keys;
  for (const pos of positions) {
    if (!pos || !Number.isInteger(pos.r) || !Number.isInteger(pos.c)) continue;
    keys.add(posKey(pos.r, pos.c));
  }
  return keys;
}

/**
 * 本层要清除的格子集合 = 匹配组 ∪ 组内特殊元素激活波及的格子（链式，直到没有新的）。
 * `seeds`（initialClear，可选）也会进入队列：其中的特效会继续展开（3.3 的二次爆炸靠它实现）。
 * 本层新生成的特殊元素（spawnKeys）不参与清除，也不会立刻自我引爆。
 */
function collectClearKeys(board, groups, spawnKeys, seeds) {
  const keys = new Set();
  const queue = [];
  const push = (pos) => {
    const key = posKey(pos.r, pos.c);
    if (spawnKeys.has(key) || keys.has(key)) return;
    keys.add(key);
    queue.push(pos);
  };

  for (const group of groups) for (const pos of group.cells) push(pos);
  if (seeds) for (const key of seeds) push(keyToPos(key));

  while (queue.length > 0) {
    const pos = queue.shift();
    const cell = board[pos.r]?.[pos.c];
    if (!cell || cell.type === CELL_TYPE.NORMAL) continue; // 普通格没有额外波及
    for (const hit of activateSpecial(board, pos.r, pos.c)) push(hit);
  }
  return keys;
}

/** `"r,c"` 键 → Pos（键由 posKey 生成，格式固定）。 */
function keyToPos(key) {
  const comma = key.indexOf(',');
  return { r: Number(key.slice(0, comma)), c: Number(key.slice(comma + 1)) };
}

/**
 * 3.4（v1.12）：本层「被波及」的障碍物各减 1 层，返回受损明细（ObstacleDamage[]）。
 * 一层 = 一次被波及：同一个级联层内每格障碍物最多计一次，与该层清掉多少颗相邻动物、
 * 特效扫过多少格无关（用户批准口径）。判定来源：
 *   ① 自身坐标在清除集合里的障碍物格 —— 覆层障碍（冰块）由其上的动物被消除而受损，
 *      占格障碍（雪块/巧克力）由特效范围覆盖到该格（或相邻动物被消除，见 ②）而受损；
 *      **藤蔓除外**：v1.17 口径下它永不被清除，权威判定在 `obstacles.damageObstacle`；
 *   ② 与「本层被消除的动物格」上下左右相邻的**占格障碍**（3.4「消除雪块旁边的小动物」）。
 */
function damageObstacles(board, keys) {
  const hits = new Set();
  for (const key of keys) {
    const pos = keyToPos(key);
    const cell = board[pos.r]?.[pos.c];
    if (!cell) continue;
    // ① v1.17：藤蔓是永久锁格，不进候选（即使进来，damageObstacle 也会返回零伤害）
    if (cell.obstacle !== null && cell.obstacle !== undefined && cell.obstacle !== OBSTACLE_TYPE.VINE) hits.add(key);
    if (!carriesAnimal(cell)) continue; // ② 只有被消除的动物才谈得上「旁边的雪块」
    for (const [dr, dc] of NEIGHBORS) {
      const around = board[pos.r + dr]?.[pos.c + dc];
      if (!around || !isBarrierCell(around)) continue; // 只有占格障碍靠「旁边消除」受损
      hits.add(posKey(pos.r + dr, pos.c + dc));
    }
  }

  const damaged = [];
  for (const key of hits) {
    const pos = keyToPos(key);
    const type = board[pos.r][pos.c].obstacle; // 必须在减层前读类型：层数归零会清空 obstacle
    const { cleared, layersRemoved } = damageObstacle(board, pos.r, pos.c, 1);
    if (layersRemoved > 0) damaged.push({ r: pos.r, c: pos.c, type, layersRemoved, cleared });
  }
  return damaged;
}

/** 按位置集合清除格子，返回被清除格子的快照（不保留棋盘内的活动引用，见 15 节）。 */
function clearCells(board, keys) {
  const removed = [];
  for (const key of keys) {
    const comma = key.indexOf(',');
    const r = Number(key.slice(0, comma));
    const c = Number(key.slice(comma + 1));
    const cell = board[r]?.[c];
    if (!carriesAnimal(cell)) continue;
    // 快照保留 type/direction：上层据此判断本层是否触发了特殊元素（3.5 的倍数）
    removed.push({ ...cell });
    // 保留 obstacle/obstacleLayers（3.4：冰块本身不会因动物被消除而消失）
    cell.color = null;
    cell.type = CELL_TYPE.NORMAL;
    cell.direction = null;
  }
  return removed;
}

function randomColor(colorCount, rng) {
  const value = Number(rng());
  const index = Math.floor((Number.isFinite(value) ? value : 0) * colorCount);
  return Math.min(Math.max(index, 0), colorCount - 1);
}

const carriesAnimal = (cell) => Boolean(cell) && cell.color !== null && cell.color !== undefined;
// 3.4（v1.12）：只有**占格障碍**才是屏障。冰块/藤蔓属覆层障碍，动物被消除后该格是「带障碍物的空洞」，
// 必须照常补位（否则冰块格会永远空着且把所在列错误地截断 —— Step 11 修掉的潜伏缺陷）。
const isBarrierCell = (cell) => Boolean(cell) && !carriesAnimal(cell) && BLOCKING_OBSTACLE_TYPES.has(cell.obstacle);
// 3.6 / 4.1（v1.18）：收集物（水果/金豆荚）占格、不参与匹配、不可被消除；它**不是**空洞，
// 因此既不能被补位覆盖，也不能被当成屏障（它在重力里自成一类，见 applyGravity）。
const isCollectible = (cell) => Boolean(cell) && COLLECTIBLE_TYPES.has(cell.collectible);
const isHole = (cell) => Boolean(cell) && !carriesAnimal(cell) && !isBarrierCell(cell) && !isCollectible(cell);

// ---------------------------------------------------------------------------
// 内部实现
// ---------------------------------------------------------------------------

/** 逐格着色：候选色排除「会与左边两格 / 上面两格形成三连」的颜色。 */
function buildColorLayer(rows, cols, colorCount, blocking) {
  const board = [];
  for (let r = 0; r < rows; r += 1) {
    const row = [];
    for (let c = 0; c < cols; c += 1) {
      const cell = makeCell(null);
      if (!blocking.has(posKey(r, c))) {
        cell.color = pickColor(board, row, r, c, colorCount);
      }
      row.push(cell);
    }
    board.push(row);
  }
  return board;
}

function pickColor(board, currentRow, r, c, colorCount) {
  const banned = new Set();
  const left1 = currentRow[c - 1];
  const left2 = currentRow[c - 2];
  if (left1 && left2 && left1.color !== null && left1.color === left2.color) banned.add(left1.color);

  const above1 = board[r - 1] ? board[r - 1][c] : null;
  const above2 = board[r - 2] ? board[r - 2][c] : null;
  if (above1 && above2 && above1.color !== null && above1.color === above2.color) banned.add(above1.color);

  const choices = [];
  for (let color = 0; color < colorCount; color += 1) {
    if (!banned.has(color)) choices.push(color);
  }

  // 理论上 colorCount ≥ 3 时 choices 不会为空；为空说明色数过小，交给 createBoard 的重试兜底。
  if (choices.length === 0) return Math.floor(Math.random() * colorCount);
  return choices[Math.floor(Math.random() * choices.length)];
}

/** 把 ObstacleSpec 落到格子上：层数按 3.4 与 OBSTACLE_CONFIG 的上限裁剪。 */
function applyObstacles(board, obstacles) {
  for (const spec of obstacles) {
    if (!spec || !isInside(board, spec.r, spec.c)) continue;
    const limits = CONFIG.OBSTACLE_CONFIG[spec.type];
    if (!limits) continue; // 未登记的障碍物类型一律忽略，避免静默写入非法状态
    const layers = clampLayers(spec.layers, limits.maxLayers);
    const cell = board[spec.r][spec.c];
    cell.obstacle = spec.type;
    cell.obstacleLayers = layers;
    if (BLOCKING_OBSTACLE_TYPES.has(spec.type)) cell.color = null; // 3.4：占格障碍（雪块/巧克力）格内没有动物
  }
}

function clampLayers(value, maxLayers) {
  const layers = Number.isFinite(value) ? Math.trunc(value) : 1;
  return Math.min(Math.max(layers, 1), maxLayers);
}

function collectBlockingObstacleKeys(rows, cols, obstacles) {
  const keys = new Set();
  for (const spec of obstacles) {
    if (!spec || !BLOCKING_OBSTACLE_TYPES.has(spec.type)) continue;
    if (spec.r < 0 || spec.c < 0 || spec.r >= rows || spec.c >= cols) continue;
    keys.add(posKey(spec.r, spec.c));
  }
  return keys;
}

/**
 * 3.6 / 4.1（v1.18）：把 CollectibleSpec 落到格子上。
 * 收集物占格且格内**没有动物**（color 置 null），因此它天然不参与匹配、不可交换、不会被重排搬动；
 * 未登记的类型一律忽略（与 applyObstacles 的容错口径一致，不静默写入非法状态）。
 */
function applyCollectibles(board, collectibles) {
  for (const spec of collectibles) {
    if (!spec || !isInside(board, spec.r, spec.c)) continue;
    if (!COLLECTIBLE_TYPES.has(spec.type)) continue;
    const cell = board[spec.r][spec.c];
    if (isBarrierCell(cell)) continue; // 占格障碍（雪块/巧克力）与收集物不同类，不叠加
    cell.collectible = spec.type;
    cell.color = null;
    cell.type = CELL_TYPE.NORMAL;
    cell.direction = null;
  }
}

function makeCell(color) {
  return {
    color,
    type: CELL_TYPE.NORMAL,
    direction: null,
    obstacle: null,
    obstacleLayers: 0,
    collectible: null, // 4.1（v1.18）：可掉落的收集物；普通格子为 null
    id: nextCellId++
  };
}

function isInside(board, r, c) {
  return Boolean(board) && r >= 0 && c >= 0 && r < board.length && c < board[r].length;
}

function posKey(r, c) {
  return `${r},${c}`;
}
