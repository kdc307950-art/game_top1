// match.js — 匹配检测，返回匹配组及其形状。见 AGENTS.md 2.3 / 4.2 / 3.1 / 3.2。
//
// 纯逻辑模块：不碰 DOM / Canvas / localStorage（宪法 9 节）。
//
// 实现思路（REFERENCES.md §2.1 Step 2）。两个参考项目均无许可证，按 §5 只借鉴思路、不复制代码：
//   - game2 的「按连续段扫描」：横向/纵向各自逐段推进，一段只上报一次；
//   - AlexKutepov 的「一次遍历 + 已处理集合」：本实现用「只在段起点产出」达到同样效果，
//     不需要额外 Set，扫描仍然是 O(rows × cols)。
//
// 4.2 的 `matchShapeToSpecial` 把形状映射到特殊元素类型（条纹/包装/魔力鸟）。
// 【Step 7】4 连直线 → 条纹；【Step 8】L/T 型 → 包装糖果；「魔力鸟（5 连直线）」属 Step 9，
// 本步明确禁止实现，故 line5 仍返回 null。

import { CELL_TYPE, DIRECTION, MATCH_SHAPE } from './config.js';

const MIN_MATCH_LENGTH = 3; // AGENTS.md 3.1：三个相同色块成同一直线即可消除
const LINE_4_LENGTH = 4; // 3.2：4 连 → 条纹糖果
const LINE_5_LENGTH = 5; // 3.2：5 连直线 → 魔力鸟

/**
 * 4.2：findMatches(board) —— 返回所有匹配段（横/竖各段独立，不合并重叠）。
 * 供 board.hasPossibleMove 等只需要「是否存在匹配」的场景使用。
 */
export function findMatches(board) {
  const groups = [];
  if (!board || board.length === 0) return groups;

  const rows = board.length;
  const cols = board[0].length;

  for (let r = 0; r < rows; r += 1) {
    let c = 0;
    while (c < cols) {
      const color = colorAt(board, r, c);
      if (color === null) {
        c += 1;
        continue;
      }
      let end = c + 1;
      while (end < cols && colorAt(board, r, end) === color) end += 1;
      if (end - c >= MIN_MATCH_LENGTH) {
        groups.push(makeLineGroup(r, c, end - c, DIRECTION.H));
      }
      c = end;
    }
  }

  for (let c = 0; c < cols; c += 1) {
    let r = 0;
    while (r < rows) {
      const color = colorAt(board, r, c);
      if (color === null) {
        r += 1;
        continue;
      }
      let end = r + 1;
      while (end < rows && colorAt(board, end, c) === color) end += 1;
      if (end - r >= MIN_MATCH_LENGTH) {
        groups.push(makeLineGroup(r, c, end - r, DIRECTION.V));
      }
      r = end;
    }
  }

  return groups;
}

/**
 * 4.2：findAllMatchGroups(board) —— 含重叠合并。
 * 组成 L/T 型的两段（共享一个格子）合并为一组，其 shape 由 detectMatchShape 判定，
 * direction 对直线形状为 'h'/'v'，对 L/T 为 null（4.2 契约）。
 */
export function findAllMatchGroups(board) {
  const runs = findMatches(board);
  if (runs.length === 0) return [];

  // 并查集：任何共享格子的两段属于同一组
  const parent = runs.map((_, index) => index);
  const findRoot = (index) => {
    let current = index;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]];
      current = parent[current];
    }
    return current;
  };
  const union = (a, b) => {
    const rootA = findRoot(a);
    const rootB = findRoot(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };

  const owner = new Map();
  runs.forEach((run, index) => {
    for (const pos of run.cells) {
      const key = posKey(pos.r, pos.c);
      if (owner.has(key)) union(owner.get(key), index);
      else owner.set(key, index);
    }
  });

  const buckets = new Map();
  runs.forEach((run, index) => {
    const root = findRoot(index);
    if (!buckets.has(root)) buckets.set(root, []);
    buckets.get(root).push(run);
  });

  return [...buckets.values()].map((groupRuns) => {
    const cells = mergeCells(groupRuns);
    return { cells, shape: detectMatchShape(cells), direction: directionOf(cells) };
  });
}

/**
 * 4.2：matchShapeToSpecial(shape, direction) —— 形状 → 特殊元素类型。
 *   4 连直线 → 条纹糖果（3.2 / 附录 A）。方向不入参判定：3.2 规定
 *   「横向四连生成横向条纹（消除整行），纵向四连生成纵向条纹（消除整列）」，
 *   即**条纹方向 = 匹配方向**（与参考实现相反，见 D014 第 1 条），所以 `direction` 原样沿用。
 *   L/T 型 → 包装糖果（Step 8，3.2「五个同色糖果排成 T 型或 L 型」）。
 *   line5（魔力鸟）属 Step 9，本步禁止实现，返回 null。
 * 一次消除同时满足多种形状时按 3.2 的优先级只生成一种，优先级在 game.multiplierForLevel 与
 * board.resolveCascades 的逐组处理中体现（同一层多组各生成各的，互不覆盖）。
 */
export function matchShapeToSpecial(shape, direction) {
  if (shape === MATCH_SHAPE.LINE4) return CELL_TYPE.STRIPED;
  if (shape === MATCH_SHAPE.L || shape === MATCH_SHAPE.T) return CELL_TYPE.WRAPPED;
  return null;
}

/**
 * 4.2：detectMatchShape(cells) —— 由格子集合判定形状。
 *   同一行 / 同一列      → line3 / line4 / line5（长度 ≥5 一律 line5，见 D014）
 *   行列交叉（含十字形） → 'L'（交叉点在两条线的端点）/ 'T'（否则，含十字）
 * 只有「两条臂都 ≥3 格」的交叉才算包装糖果形状（3.2 要求 L/T 型 5 连）。
 * 不是合法匹配形状（不足 3 格、有游离格、交叉点缺失、臂长不足）时返回 null。
 */
export function detectMatchShape(cells) {
  if (!Array.isArray(cells) || cells.length < MIN_MATCH_LENGTH) return null;

  const rows = new Set(cells.map((pos) => pos.r));
  const cols = new Set(cells.map((pos) => pos.c));
  if (rows.size === 1) return shapeOfLine(cells.length);
  if (cols.size === 1) return shapeOfLine(cells.length);

  const rowCounts = countBy(cells, 'r');
  const colCounts = countBy(cells, 'c');
  const mainRow = argMax(rowCounts);
  const mainCol = argMax(colCounts);

  // 交叉形状必须：交叉点存在、没有游离格、两条臂都至少 3 格
  if (!cells.some((pos) => pos.r === mainRow && pos.c === mainCol)) return null;
  if (rowCounts.get(mainRow) < MIN_MATCH_LENGTH || colCounts.get(mainCol) < MIN_MATCH_LENGTH) return null;
  if (!cells.every((pos) => pos.r === mainRow || pos.c === mainCol)) return null;

  const rowSpan = spanOf(cells.filter((pos) => pos.r === mainRow).map((pos) => pos.c));
  const colSpan = spanOf(cells.filter((pos) => pos.c === mainCol).map((pos) => pos.r));
  const isEnd = (span, value) => value === span.min || value === span.max;

  return isEnd(rowSpan, mainCol) && isEnd(colSpan, mainRow) ? MATCH_SHAPE.L : MATCH_SHAPE.T;
}

/** 直线形状：3 → line3，4 → line4，≥5 → line5。 */
function shapeOfLine(length) {
  if (length >= LINE_5_LENGTH) return MATCH_SHAPE.LINE5;
  if (length === LINE_4_LENGTH) return MATCH_SHAPE.LINE4;
  return MATCH_SHAPE.LINE3;
}

function makeLineGroup(r, c, length, direction) {
  const cells = [];
  for (let step = 0; step < length; step += 1) {
    cells.push(direction === DIRECTION.H ? { r, c: c + step } : { r: r + step, c });
  }
  return { cells, shape: shapeOfLine(length), direction };
}

/** 合并若干段的格子：按 (r, c) 排序去重，保证结果与段的扫描顺序无关。 */
function mergeCells(groupRuns) {
  const seen = new Map();
  for (const run of groupRuns) {
    for (const pos of run.cells) {
      seen.set(posKey(pos.r, pos.c), { r: pos.r, c: pos.c });
    }
  }
  return [...seen.values()].sort((a, b) => (a.r - b.r) || (a.c - b.c));
}

/** 直线形状返回 'h'/'v'，其余（L/T）按 4.2 返回 null。 */
function directionOf(cells) {
  if (cells.every((pos) => pos.r === cells[0].r)) return DIRECTION.H;
  if (cells.every((pos) => pos.c === cells[0].c)) return DIRECTION.V;
  return null;
}

/** 读取可匹配颜色；空格、纯障碍、越界一律视为不可匹配（返回 null）。 */
function colorAt(board, r, c) {
  const row = board[r];
  if (!row) return null;
  const cell = row[c];
  if (!cell) return null;
  return cell.color === undefined ? null : cell.color;
}

function countBy(cells, field) {
  const counts = new Map();
  for (const pos of cells) counts.set(pos[field], (counts.get(pos[field]) ?? 0) + 1);
  return counts;
}

function argMax(counts) {
  let best = null;
  let bestCount = -1;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = value;
    }
  }
  return best;
}

function spanOf(values) {
  return { min: Math.min(...values), max: Math.max(...values) };
}

function posKey(r, c) {
  return `${r},${c}`;
}
