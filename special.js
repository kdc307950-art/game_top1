// special.js — 特殊元素的生成、激活、组合效果。见 AGENTS.md 2.3 / 3.2 / 3.3 / 4.2。
//
// 纯逻辑模块：不碰 DOM / Canvas / localStorage（宪法 9 节）。
//
// 【Step 7】条纹糖果：4 连直线生成，激活消除一整行或一整列（方向 = 匹配方向，D014 第 1 条）。
// 【Step 8】包装糖果：L/T 型 5 连生成，激活消除周围 3×3 共 9 格（3.2 / 附录 A），贴边时按棋盘裁剪。
// 【Step 9】魔力鸟（5 连直线 → 全屏同色）；【Step 10】resolveSpecialCombo（相邻特效交换的组合效果）。
//   这两步明确禁止在本步实现，故不留空壳函数 —— 空壳会被误读成「已实现」。

import { CELL_TYPE, DIRECTION } from './config.js';
import { matchShapeToSpecial } from './match.js';

const MIN_ARM = 3; // 3.2：L/T 型的两条臂各至少 3 格（3+3−1 = 5 连）
const WRAPPED_SPAN = 1; // 3.2：包装糖果消除周围 3×3，即以自身为中心 ±1 格

/** 4.2：getSpecialAffectedCells(board, r, c, type, direction) —— 该特效波及的格子集合。 */
export function getSpecialAffectedCells(board, r, c, type, direction) {
  if (!isInside(board, r, c)) return []; // 越界中心没有任何可波及的格子（防御性）
  if (type === CELL_TYPE.STRIPED) return stripedCells(board, r, c, direction);
  if (type === CELL_TYPE.WRAPPED) return wrappedCells(board, r, c);
  return [{ r, c }]; // 普通格「波及」的就是自己；魔力鸟属 Step 9
}

/**
 * 4.2：createSpecial(board, matchGroup) —— 按匹配形状就地生成特殊元素，返回生成位置（无则 null）。
 *
 * 落点规则（3.2 未规定落点，属实现口径）：
 *   - 4 连 → 该段**靠近中间**的格子（4 连取第 2 格），确定、可测试（D020）；
 *   - L/T 型 → **交叉点**（同时位于主行与主列、且两向都 ≥3 格的那一格），理由见 D023：
 *     3×3 以它为中心正好覆盖两条臂，且它就是玩家这一手交换所在的位置。
 * 若该格已经是特殊元素则跳过生成（让它在 4.3.8 下正常激活），避免覆盖已有特效。
 */
export function createSpecial(board, matchGroup) {
  if (!matchGroup || !Array.isArray(matchGroup.cells) || matchGroup.cells.length === 0) return null;
  // 形状 → 类型由 match.js 的 4.2 契约函数决定（Step 9 会在那里补魔力鸟）
  const type = matchShapeToSpecial(matchGroup.shape, matchGroup.direction);
  if (type === null) return null;

  const target = type === CELL_TYPE.WRAPPED ? crossCenter(matchGroup.cells) : middleCell(matchGroup.cells);
  if (!target) return null;
  const cell = board[target.r]?.[target.c];
  if (!cell || cell.color === null || cell.color === undefined) return null;
  if (cell.type !== CELL_TYPE.NORMAL) return null; // 已是特殊元素：不覆盖

  cell.type = type;
  // 4.1：direction 只对条纹有意义（横向四连 → 横向条纹，消除整行，见 D014 第 1 条）
  cell.direction = type === CELL_TYPE.STRIPED ? stripesDirection(matchGroup.direction) : null;
  return { r: target.r, c: target.c };
}

/** 4.2：activateSpecial(board, r, c) —— 激活该格的特殊元素，返回波及的格子集合。 */
export function activateSpecial(board, r, c) {
  const cell = board[r]?.[c];
  if (!cell || cell.type === CELL_TYPE.NORMAL) return [];
  return getSpecialAffectedCells(board, r, c, cell.type, cell.direction);
}

/** 中心格是否在棋盘内（越界时不产生任何波及格子，避免凭空造出坐标）。 */
function isInside(board, r, c) {
  const rows = board.length;
  const cols = rows > 0 ? board[0].length : 0;
  return r >= 0 && c >= 0 && r < rows && c < cols;
}

/** 3.2：条纹糖果消除一整行（横向）或一整列（纵向）。 */
function stripedCells(board, r, c, direction) {  const rows = board.length;
  const cols = rows > 0 ? board[0].length : 0;
  const affected = [];
  if (direction === DIRECTION.V) {
    for (let y = 0; y < rows; y += 1) affected.push({ r: y, c });
  } else {
    for (let x = 0; x < cols; x += 1) affected.push({ r, c: x });
  }
  return affected;
}

/** 3.2：包装糖果消除周围 3×3 共 9 格；贴边（含角落）时按棋盘范围裁剪。 */
function wrappedCells(board, r, c) {
  const rows = board.length;
  const cols = rows > 0 ? board[0].length : 0;
  const affected = [];
  for (let y = r - WRAPPED_SPAN; y <= r + WRAPPED_SPAN; y += 1) {
    for (let x = c - WRAPPED_SPAN; x <= c + WRAPPED_SPAN; x += 1) {
      if (y < 0 || x < 0 || y >= rows || x >= cols) continue;
      affected.push({ r: y, c: x });
    }
  }
  return affected;
}

/** 4 连的落点：该段靠中间的格子（4 格 → 第 2 格）。 */
function middleCell(cells) {
  return cells[Math.floor((cells.length - 1) / 2)];
}

/** 3.2 / D014：条纹方向 = 匹配方向（纵向匹配 → 纵向条纹，其余按横向处理）。 */
function stripesDirection(direction) {
  return direction === DIRECTION.V ? DIRECTION.V : DIRECTION.H;
}

/** L/T 型的落点：交叉点。找不到（形状不合法）时返回 null，由调用方跳过生成。 */
function crossCenter(cells) {
  const rowCount = countBy(cells, 'r');
  const colCount = countBy(cells, 'c');
  return cells.find((pos) => rowCount.get(pos.r) >= MIN_ARM && colCount.get(pos.c) >= MIN_ARM) ?? null;
}

function countBy(cells, field) {
  const counts = new Map();
  for (const pos of cells) counts.set(pos[field], (counts.get(pos[field]) ?? 0) + 1);
  return counts;
}
