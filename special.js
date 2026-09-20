// special.js — 特殊元素的生成、激活、组合效果。见 AGENTS.md 2.3 / 3.2 / 3.3 / 4.2。
//
// 纯逻辑模块：不碰 DOM / Canvas / localStorage（宪法 9 节）。
//
// 【Step 7】已实现条纹糖果：createSpecial（4 连落点生成并保留）/ activateSpecial /
//   getSpecialAffectedCells（消除一整行或一整列）。
// 【Step 8】包装糖果（L/T 型 5 连 → 3×3）；【Step 9】魔力鸟（5 连直线 → 全屏同色）；
// 【Step 10】resolveSpecialCombo（相邻特殊元素交换的组合效果）。
//   以上三步均明确禁止在本步实现，故不留空壳函数 —— 空壳会被误读成「已实现」。
//   方向口径（D014 第 1 条）：条纹方向 = 匹配方向，横向四连生成横向条纹（消除整行）。

import { CELL_TYPE, DIRECTION } from './config.js';
import { matchShapeToSpecial } from './match.js';

/** 4.2：getSpecialAffectedCells(board, r, c, type, direction) —— 该特效波及的格子集合。 */
export function getSpecialAffectedCells(board, r, c, type, direction) {
  if (type !== CELL_TYPE.STRIPED) return [{ r, c }]; // 普通格「波及」的就是自己；包装/魔力鸟属 Step 8/9

  const rows = board.length;
  const cols = rows > 0 ? board[0].length : 0;
  const affected = [];
  if (direction === DIRECTION.V) {
    for (let y = 0; y < rows; y += 1) affected.push({ r: y, c });
  } else {
    for (let x = 0; x < cols; x += 1) affected.push({ r, c: x });
  }
  return affected;
}

/**
 * 4.2：createSpecial(board, matchGroup) —— 按匹配形状就地生成特殊元素，返回生成位置（无则 null）。
 *
 * 落点规则（3.2 未规定落点，属实现口径，见 D020）：取该段**靠近中间**的格子（4 连 → 第 2 格），
 * 结果确定、可测试，视觉上也落在这一段中间。
 * 若该格已经是特殊元素则跳过生成（让它在 4.3.8 下正常激活），避免覆盖已有特效。
 */
export function createSpecial(board, matchGroup) {
  if (!matchGroup || !Array.isArray(matchGroup.cells) || matchGroup.cells.length === 0) return null;
  // 形状 → 类型由 match.js 的 4.2 契约函数决定（Step 8/9 在那里补包装与魔力鸟）
  if (matchShapeToSpecial(matchGroup.shape, matchGroup.direction) !== CELL_TYPE.STRIPED) return null;

  const cells = matchGroup.cells;
  const target = cells[Math.floor((cells.length - 1) / 2)];
  const cell = board[target.r]?.[target.c];
  if (!cell || cell.color === null || cell.color === undefined) return null;
  if (cell.type !== CELL_TYPE.NORMAL) return null; // 已是特殊元素：不覆盖

  cell.type = CELL_TYPE.STRIPED;
  // 3.2 / D014：条纹方向 = 匹配方向（横向四连 → 横向条纹，消除整行）
  cell.direction = matchGroup.direction === DIRECTION.V ? DIRECTION.V : DIRECTION.H;
  return { r: target.r, c: target.c };
}

/** 4.2：activateSpecial(board, r, c) —— 激活该格的特殊元素，返回波及的格子集合。 */
export function activateSpecial(board, r, c) {
  const cell = board[r]?.[c];
  if (!cell || cell.type === CELL_TYPE.NORMAL) return [];
  return getSpecialAffectedCells(board, r, c, cell.type, cell.direction);
}
