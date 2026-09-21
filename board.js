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

import { CELL_TYPE, CONFIG, OBSTACLE_TYPE } from './config.js';
import { findAllMatchGroups, findMatches } from './match.js';
// Step 7：4 连生成条纹糖果、被消除时优先激活（3.2 / 4.3.8）
import { activateSpecial, createSpecial } from './special.js';
// Step 6.1 纯重构：可移动性/死局检测/重排移到 shuffle.js（职责分离）；
// createBoard 仍需 hasPossibleMove 校验「开局至少有一个可行交换」，故此处单向依赖 shuffle.js。
import { hasPossibleMove } from './shuffle.js';

// 4.1：cell.color 为 null 表示空格或纯障碍。
// 3.4 的语义差别：冰块内的动物可以移动并消除、藤蔓困住的是动物，所以这两类障碍的格子
// 保留 color；雪块与巧克力是占格障碍（3.4「消除雪块旁边的小动物」「巧克力被相邻消除波及」），
// 格子内没有动物，color 为 null。该读法记入 DECISIONS.md D014。
const PURE_OBSTACLE_TYPES = new Set([OBSTACLE_TYPE.SNOW, OBSTACLE_TYPE.CHOC]);

// 少于 3 色时无法保证「无初始三连」，见 createBoard 的兜底说明
const MIN_COLOR_COUNT = 3;

let nextCellId = 1;

/**
 * 4.2：createBoard(rows, cols, colorCount, obstacles?) —— 生成可玩棋盘。
 * 保证：无初始三连（否则开局就会自动消除）、且至少存在一个有效交换（3.8 的可玩性要求）。
 * 重试上限复用 CONFIG.ANIMATION_CONFIG.shuffleMaxTries（读取，不修改其默认值，见 D014）。
 * obstacles 只落障碍物元数据；障碍物的行为（层数减少、影响下落）属 Step 11/13。
 */
export function createBoard(rows, cols, colorCount, obstacles = []) {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new Error(`createBoard: 非法尺寸 ${rows}×${cols}`);
  }
  if (!Number.isInteger(colorCount) || colorCount < MIN_COLOR_COUNT) {
    throw new Error(`createBoard: colorCount 至少为 ${MIN_COLOR_COUNT}，收到 ${colorCount}`);
  }

  const blocking = collectPureObstacleKeys(rows, cols, obstacles);
  const maxTries = Math.max(1, CONFIG.ANIMATION_CONFIG.shuffleMaxTries);

  let board = null;
  for (let attempt = 0; attempt < maxTries; attempt += 1) {
    board = buildColorLayer(rows, cols, colorCount, blocking);
    applyObstacles(board, obstacles);
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
  const temp = board[a.r][a.c];
  board[a.r][a.c] = board[b.r][b.c];
  board[b.r][b.c] = temp;
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
 * 4.2：applyGravity(board) —— **原地**让动物下落（3.1「消除后下落填充」），返回下落轨迹。
 * MoveRecord = { id, from: {r,c}, to: {r,c}, color }（4.2 未给出 MoveRecord 结构，见 D015）；
 * 只记录真正发生位移的格子，供动画使用（Step 5 按下落距离缩放时长）。
 */
export function applyGravity(board) {
  if (!board || board.length === 0) return [];
  const rows = board.length;
  const cols = board[0].length;
  const moves = [];

  for (let c = 0; c < cols; c += 1) {
    let segmentEnd = rows - 1;
    // r 递减到 -1 是为了让「列顶端」也被当作一条边界，从而统一处理最后一段
    for (let r = rows - 1; r >= -1; r -= 1) {
      if (r >= 0 && !isBarrierCell(board[r][c])) continue;
      if (segmentEnd > r) compactSegment(board, c, r + 1, segmentEnd, moves);
      segmentEnd = r - 1;
    }
  }

  return moves;
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
      if (!isHole(board[r][c])) continue;
      const cell = makeCell(randomColor(colorCount, rng));
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
    const removed = clearCells(board, keys);
    const moves = applyGravity(board);
    const created = refillBoard(board, colorCount, rng);

    cleared.push(...removed);
    spawned.push(...created);
    levels.push({ level, groups, cleared: removed, moves, spawned: created, board: cloneBoard(board) });
  }

  return { cascades: levels.length, levels, cleared, spawned, capped: levels.length >= maxLevels };
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

/** 在一段（两根屏障之间）内把动物压到底部，并记录位移。 */
function compactSegment(board, c, start, end, moves) {
  let write = end;
  for (let r = end; r >= start; r -= 1) {
    const cell = board[r][c];
    if (!carriesAnimal(cell)) continue; // 空洞：跳过，等上面的动物压下来
    if (write !== r) {
      board[write][c] = cell;
      board[r][c] = makeCell(null);
      moves.push({ id: cell.id, from: { r, c }, to: { r: write, c }, color: cell.color });
    }
    write -= 1;
  }
  for (let r = write; r >= start; r -= 1) board[r][c] = makeCell(null);
}

function randomColor(colorCount, rng) {
  const value = Number(rng());
  const index = Math.floor((Number.isFinite(value) ? value : 0) * colorCount);
  return Math.min(Math.max(index, 0), colorCount - 1);
}

const carriesAnimal = (cell) => Boolean(cell) && cell.color !== null && cell.color !== undefined;
const isHole = (cell) => Boolean(cell) && !carriesAnimal(cell) && cell.obstacle === null;
const isBarrierCell = (cell) => Boolean(cell) && !carriesAnimal(cell) && cell.obstacle !== null;

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
    if (PURE_OBSTACLE_TYPES.has(spec.type)) cell.color = null; // 3.4：雪块/巧克力格内没有动物
  }
}

function clampLayers(value, maxLayers) {
  const layers = Number.isFinite(value) ? Math.trunc(value) : 1;
  return Math.min(Math.max(layers, 1), maxLayers);
}

function collectPureObstacleKeys(rows, cols, obstacles) {
  const keys = new Set();
  for (const spec of obstacles) {
    if (!spec || !PURE_OBSTACLE_TYPES.has(spec.type)) continue;
    if (spec.r < 0 || spec.c < 0 || spec.r >= rows || spec.c >= cols) continue;
    keys.add(posKey(spec.r, spec.c));
  }
  return keys;
}

function makeCell(color) {
  return {
    color,
    type: CELL_TYPE.NORMAL,
    direction: null,
    obstacle: null,
    obstacleLayers: 0,
    id: nextCellId++
  };
}

function isInside(board, r, c) {
  return Boolean(board) && r >= 0 && c >= 0 && r < board.length && c < board[r].length;
}

function posKey(r, c) {
  return `${r},${c}`;
}
