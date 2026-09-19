// board.js — 棋盘状态、交换验证、下落、填充、死局检测。见 AGENTS.md 2.3 / 4.2 / 4.1。
//
// 纯逻辑模块：不碰 DOM / Canvas / localStorage（宪法 9 节）。
// 棋盘结构唯一真相源是 4.1 的 cell[][]，禁止使用二维数字数组。
//
// 【Step 2（ROADMAP）已实现】createBoard / swapCells / cloneBoard / isCellMovable / hasPossibleMove
// 【后续 Step 实现，本步不写】
//   - applyGravity / refillBoard → Step 3（消除、下落、填充、级联）
//   - shuffleBoard               → Step 6（死局检测与重排）
// 实现思路借鉴（REFERENCES.md §2.1 Step 2，只借鉴思路、不复制代码）：
//   - game2：生成时过滤「左边两格同色 / 上面两格同色」以杜绝初始三连；重试直到存在可行交换；
//     无效交换通过返回原棋盘快照实现回退；相邻对只需检查「右」「下」两个方向。

import { CELL_TYPE, CONFIG, OBSTACLE_TYPE } from './config.js';
import { findMatches } from './match.js';

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

/**
 * 4.2：isCellMovable(board, r, c) —— 该格能否被交换。
 * 空格 / 纯障碍（color 为 null）不能交换；3.4 规定藤蔓中的动物不能移动。
 * 冰块不在此列：3.4 明确冰块内的动物「可以移动并消除」。
 */
export function isCellMovable(board, r, c) {
  if (!isInside(board, r, c)) return false;
  const cell = board[r][c];
  if (cell.color === null || cell.color === undefined) return false;
  return cell.obstacle !== OBSTACLE_TYPE.VINE;
}

/**
 * 4.2：hasPossibleMove(board) —— 是否存在「交换后能形成至少一组三消」的相邻对（3.8）。
 * 判定要求匹配组包含被交换的两个格子之一：棋盘已存在遗留匹配时不能把任意交换都算作可行。
 * 只检查「右」与「下」两个方向即可覆盖所有相邻对。
 */
export function hasPossibleMove(board) {
  if (!board || board.length === 0) return false;
  const rows = board.length;
  const cols = board[0].length;
  const offsets = [
    [0, 1],
    [1, 0]
  ];

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (!isCellMovable(board, r, c)) continue;
      for (const [dr, dc] of offsets) {
        const nr = r + dr;
        const nc = c + dc;
        if (!isInside(board, nr, nc) || !isCellMovable(board, nr, nc)) continue;

        // 原地交换 → 检测 → 立即换回（匹配检测不会抛错，交换必然成对发生）
        swapCells(board, { r, c }, { r: nr, c: nc });
        const createsMatch = findMatches(board).some((group) =>
          group.cells.some((pos) => (pos.r === r && pos.c === c) || (pos.r === nr && pos.c === nc))
        );
        swapCells(board, { r, c }, { r: nr, c: nc });

        if (createsMatch) return true;
      }
    }
  }
  return false;
}

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
