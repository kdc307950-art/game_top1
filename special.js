// special.js — 特殊元素的生成、激活、组合效果。见 AGENTS.md 2.3 / 3.2 / 3.3 / 4.2。
//
// 纯逻辑模块：不碰 DOM / Canvas / localStorage（宪法 9 节）。
//
// 【Step 7】条纹糖果：4 连直线生成，激活消除一整行或一整列（方向 = 匹配方向，D014 第 1 条）。
// 【Step 8】包装糖果：L/T 型 5 连生成，激活消除周围 3×3 共 9 格（3.2 / 附录 A），贴边时按棋盘裁剪。
// 【Step 9】魔力鸟：5 连直线生成，**与任意普通色块交换时**清除全屏该颜色（3.2 / D025）。
//   它的目标颜色来自被交换的那颗普通糖果，故不在 getSpecialAffectedCells 里表达 ——
//   那条 4.2 签名没有「目标颜色」参数；改用专门的 getMagicTargets(board, color)，
//   由 game.trySwap 计算 initialClear 交给 board.resolveCascades（v1.11 登记的两条纯追加）。
//   被其它特效波及时（例如被条纹扫到）不额外触发全屏清除，只按普通格子被消除（保守口径，见 D025）。
// 【Step 10】resolveSpecialCombo：两颗相邻特殊元素交换的组合效果（3.3 六种）。
//   本函数只负责「就地改造需要变形的格子」+「返回要清除的坐标」；扣步数与计分都在 game.js，
//   波及范围内的其它特效由 board.resolveCascades 的 seeds 机制继续链式展开（见 D026）。

import { CELL_TYPE, DIRECTION } from './config.js';
import { matchShapeToSpecial } from './match.js';

const MIN_ARM = 3; // 3.2：L/T 型的两条臂各至少 3 格（3+3−1 = 5 连）
const WRAPPED_SPAN = 1; // 3.2：包装糖果消除周围 3×3，即以自身为中心 ±1 格
const COMBO_SPAN = 2; // 3.3：包装 + 包装「范围约 5×5」，即以各自为中心 ±2 格

/**
 * 3.3 的四个「有倍数登记」的组合键，与 `CONFIG.SCORE_CONFIG.specialMultipliers` 的键一一对应
 * （3.5 倍数表）。集中定义在这里供 special.js 与 game.js 共用，避免两处各写一份字符串。
 */
export const COMBO_TYPES = Object.freeze({
  STRIPED_STRIPED: 'stripedStriped',
  STRIPED_WRAPPED: 'stripedWrapped',
  WRAPPED_WRAPPED: 'wrappedWrapped',
  MAGIC_MAGIC: 'magicMagic'
});

/** 4.2：getSpecialAffectedCells(board, r, c, type, direction) —— 该特效波及的格子集合。 */
export function getSpecialAffectedCells(board, r, c, type, direction) {
  if (!isInside(board, r, c)) return []; // 越界中心没有任何可波及的格子（防御性）
  if (type === CELL_TYPE.STRIPED) return stripedCells(board, r, c, direction);
  if (type === CELL_TYPE.WRAPPED) return wrappedCells(board, r, c);
  // 魔力鸟的波及范围取决于「被交换的那颗普通糖果的颜色」，本签名表达不了 → 只有它自己（见 D025）
  return [{ r, c }];
}

/**
 * 4.2（v1.11 追加）：getMagicTargets(board, color) —— 全屏与该颜色相同的格子坐标。
 * 供 3.2 的魔力鸟交换使用：调用方把「这些格子 + 魔力鸟自身」一起交给 board.resolveCascades。
 * **只按颜色筛选，与格子类型无关**（冰块下的动物也算目标，3.4 允许消除其上动物）——
 * 因此魔力鸟自身可能因为颜色巧合而落进结果，调用方要去重（Set）；它的颜色与目标色不同时由调用方另外补上。
 */
export function getMagicTargets(board, color) {
  const targets = [];
  if (!Array.isArray(board) || color === null || color === undefined) return targets;
  board.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell && cell.color === color) targets.push({ r, c });
    });
  });
  return targets;
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
  // 形状 → 类型由 match.js 的 4.2 契约函数决定（4 连→条纹 / L,T→包装 / 5 连直线→魔力鸟）
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

/**
 * 4.2：resolveSpecialCombo(board, a, b) —— 两颗相邻特殊元素交换后的组合效果（3.3 六种）。
 *
 * 调用点：`game.trySwap` 在 `swapCells` **之后**、且确认 a/b 两侧都是特殊元素时调用（4.3.9）。
 * 职责：① 就地改造需要变形的格子（3.3 的「全屏同色变条纹/包装」）；② 返回要清除的坐标集合，
 * 由调用方作为 `resolveCascades({ initialClear })` 传入 —— 波及范围内的其它特效会继续**链式展开**
 * （board.js 的 seeds 机制），因此「条纹 + 包装」要求的二次爆炸不需要在这里重复实现（见 D026）。
 * 扣步数、计分、死局检测都在 game.js，本函数不碰它们。返回空数组表示这不是有效组合。
 */
export function resolveSpecialCombo(board, a, b) {
  const cellA = board[a.r]?.[a.c];
  const cellB = board[b.r]?.[b.c];
  if (!cellA || !cellB) return [];
  if (cellA.type === CELL_TYPE.NORMAL || cellB.type === CELL_TYPE.NORMAL) return [];

  const combo = comboKeyOf(cellA.type, cellB.type);
  const stripedAt = cellA.type === CELL_TYPE.STRIPED ? a : cellB.type === CELL_TYPE.STRIPED ? b : null;
  const wrappedAt = cellA.type === CELL_TYPE.WRAPPED ? a : cellB.type === CELL_TYPE.WRAPPED ? b : null;

  if (combo === COMBO_TYPES.STRIPED_STRIPED) {
    // 3.3：同时触发两个直线爆破 → 十字形清除（各自按自己的方向展开）
    return [...stripedCells(board, a.r, a.c, cellA.direction), ...stripedCells(board, b.r, b.c, cellB.direction)];
  }
  if (combo === COMBO_TYPES.STRIPED_WRAPPED) {
    // 3.3：条纹方向全行/列清除，并对清除区域内再触发包装糖 3×3 爆炸
    const striped = stripedAt === a ? cellA : cellB;
    return [...stripedCells(board, stripedAt.r, stripedAt.c, striped.direction), { r: wrappedAt.r, c: wrappedAt.c }];
  }
  if (combo === COMBO_TYPES.WRAPPED_WRAPPED) {
    // 3.3：两个包装糖果各触发一次强化爆炸，范围约 5×5
    return [...wrappedCells(board, a.r, a.c, COMBO_SPAN), ...wrappedCells(board, b.r, b.c, COMBO_SPAN)];
  }
  if (combo === COMBO_TYPES.MAGIC_MAGIC) {
    // 3.3：清除游戏面板上所有糖果
    return allAnimalCells(board);
  }

  // 条纹 + 魔力鸟 / 包装 + 魔力鸟：把「与那颗特效同色」的普通糖果全部变成对应特效再引爆（3.3）。
  // 目标色取**那颗条纹/包装糖果的颜色**（与 D025 第 3 条「目标色来自被交换的另一颗」一致）。
  const partnerAt = stripedAt ?? wrappedAt;
  const partner = partnerAt === a ? cellA : cellB;
  if (!partnerAt || partner.color === null || partner.color === undefined) return [];
  const type = stripedAt ? CELL_TYPE.STRIPED : CELL_TYPE.WRAPPED;
  const transformed = transformColor(board, partner.color, type);
  // 两颗参与交换的特效本身也要被清除（变形只覆盖普通糖果）
  return [...transformed, { r: partnerAt.r, c: partnerAt.c }, { r: a.r, c: a.c }, { r: b.r, c: b.c }];
}

/** 3.3：由两颗特效的类型推出组合键；不是组合（含任一侧为普通格）时返回 null。 */
function comboKeyOf(typeA, typeB) {
  const has = (type) => typeA === type || typeB === type;
  const both = (type) => typeA === type && typeB === type;
  if (both(CELL_TYPE.MAGIC)) return COMBO_TYPES.MAGIC_MAGIC;
  if (both(CELL_TYPE.WRAPPED)) return COMBO_TYPES.WRAPPED_WRAPPED;
  if (has(CELL_TYPE.STRIPED) && has(CELL_TYPE.WRAPPED)) return COMBO_TYPES.STRIPED_WRAPPED;
  if (both(CELL_TYPE.STRIPED)) return COMBO_TYPES.STRIPED_STRIPED;
  if (has(CELL_TYPE.MAGIC) && has(CELL_TYPE.STRIPED)) return 'magicStriped';
  if (has(CELL_TYPE.MAGIC) && has(CELL_TYPE.WRAPPED)) return 'magicWrapped';
  return null;
}

/** 3.3：把全屏该颜色的**普通糖果**变成指定特效（已是特效的格子不动），返回这些坐标。 */
function transformColor(board, color, type) {
  const positions = [];
  board.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (!cell || cell.color !== color || cell.type !== CELL_TYPE.NORMAL) return;
      cell.type = type;
      // 条纹需要方向：按行列奇偶交替，保证结果确定且可测（3.3 未规定朝向）
      cell.direction = type === CELL_TYPE.STRIPED ? ((r + c) % 2 === 0 ? DIRECTION.H : DIRECTION.V) : null;
      positions.push({ r, c });
    });
  });
  return positions;
}

/** 3.3（魔力鸟 + 魔力鸟）：棋盘上所有带动物的格子。 */
function allAnimalCells(board) {
  const positions = [];
  board.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell && cell.color !== null && cell.color !== undefined) positions.push({ r, c });
    });
  });
  return positions;
}

/** 中心格是否在棋盘内（越界时不产生任何波及格子，避免凭空造出坐标）。 */
function isInside(board, r, c) {
  const rows = board.length;
  const cols = rows > 0 ? board[0].length : 0;
  return r >= 0 && c >= 0 && r < rows && c < cols;
}

/** 3.2：条纹糖果消除一整行（横向）或一整列（纵向）。 */
function stripedCells(board, r, c, direction) {
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

/** 3.2：包装糖果消除周围 (2×span+1)² 格（默认 3×3）；贴边（含角落）时按棋盘范围裁剪。 */
function wrappedCells(board, r, c, span = WRAPPED_SPAN) {
  const rows = board.length;
  const cols = rows > 0 ? board[0].length : 0;
  const affected = [];
  for (let y = r - span; y <= r + span; y += 1) {
    for (let x = c - span; x <= c + span; x += 1) {
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
