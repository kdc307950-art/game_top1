// tests/special.test.js — special.js 的单元测试。见 AGENTS.md 7.1 与 ROADMAP Step 7。
//
// 范围：Step 7 只做条纹糖果（4 连直线生成、被消除时激活消整行/整列）。
// Step 8 的包装糖果与 Step 9 的魔力鸟都在本文件覆盖；组合效果（Step 10）不在覆盖范围。
//
// 夹具约定（宪法 4.1）：棋盘一律经 createBoard 构造后再覆盖 color。
// 断言只针对**第 1 层**（levels[0]）：它完全由夹具决定，与补充新格子的随机源无关。
// Step 9 起：魔力鸟的目标颜色来自「被交换的那颗普通糖果」，故其清除集合由 game.trySwap 交给
// board.resolveCascades 的 initialClear，本文件只测 getMagicTargets 与匹配层的排除。

import { test, assertEqual, assertTrue, assertFalse, assertDeepEqual, summarize } from './assert.js';
import { CELL_TYPE, CONFIG, DIRECTION, MATCH_SHAPE } from '../config.js';
import { cloneBoard, createBoard, resolveCascades } from '../board.js';
import {
  activateSpecial,
  createSpecial,
  getMagicTargets,
  getSpecialAffectedCells
} from '../special.js';
import { matchShapeToSpecial } from '../match.js';
import { buildPhases, motionDurations } from '../timeline.js';

const SIZE = 8;
/** 让补充的新格子尽量不产生新匹配，便于把断言锁定在第 1 层。 */
const NO_CASCADE_RNG = () => 0.99;

/**
 * 循环随机源：按固定色序依次补充新格子，避免「同一列补满同色 → 无尽级联」。
 * 恒定 rng 在纵向 4 连夹具里会让整列的补充格同色，级联一直消到上限（capped=true），
 * 虽然第 1 层断言仍成立，但会让用例跑到 64 层且失去可读性，故纵向/横向用例改用本函数。
 */
function cycleRng(colors) {
  let i = 0;
  return () => {
    const value = colors[i % colors.length];
    i += 1;
    return value / CONFIG.COLOR_COUNT;
  };
}
const STEADY_COLORS = [3, 0, 1, 2, 4, 5];

/** 0/1 棋盘格填充（横竖都没有相邻同色），再按 paint 覆盖目标形状。 */
function fixture(paint) {
  const board = createBoard(SIZE, SIZE, CONFIG.COLOR_COUNT);
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      board[r][c].color = (r + c) % 2;
    }
  }
  if (paint) paint(board);
  return board;
}

const typeAt = (board, r, c) => board[r][c].type;
const stripedAt = (board) => {
  const found = [];
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (board[r][c].type === CELL_TYPE.STRIPED) found.push({ r, c, direction: board[r][c].direction });
    }
  }
  return found;
};

test('matchShapeToSpecial：4 连 → 条纹、L/T 型 → 包装（Step 8）；其余形状返回 null', () => {
  assertEqual(matchShapeToSpecial(MATCH_SHAPE.LINE4, DIRECTION.H), CELL_TYPE.STRIPED, '横向 4 连');
  assertEqual(matchShapeToSpecial(MATCH_SHAPE.LINE4, DIRECTION.V), CELL_TYPE.STRIPED, '纵向 4 连');
  assertEqual(matchShapeToSpecial(MATCH_SHAPE.LINE3, DIRECTION.H), null, '3 连不产生特殊元素');
  assertEqual(matchShapeToSpecial(MATCH_SHAPE.LINE5, DIRECTION.H), CELL_TYPE.MAGIC, '5 连直线 → 魔力鸟（3.2）');
  assertEqual(matchShapeToSpecial(MATCH_SHAPE.L, null), CELL_TYPE.WRAPPED, 'L 型 → 包装糖果（3.2）');
  assertEqual(matchShapeToSpecial(MATCH_SHAPE.T, null), CELL_TYPE.WRAPPED, 'T 型 → 包装糖果（3.2）');
});

test('getSpecialAffectedCells：横向条纹波及整行，纵向条纹波及整列（3.2）', () => {
  const board = fixture();
  const row = getSpecialAffectedCells(board, 3, 5, CELL_TYPE.STRIPED, DIRECTION.H);
  assertEqual(row.length, SIZE, '整行格子数');
  assertDeepEqual(row, [0, 1, 2, 3, 4, 5, 6, 7].map((c) => ({ r: 3, c })), '第 3 行全部列');

  const col = getSpecialAffectedCells(board, 3, 5, CELL_TYPE.STRIPED, DIRECTION.V);
  assertEqual(col.length, SIZE, '整列格子数');
  assertDeepEqual(col, [0, 1, 2, 3, 4, 5, 6, 7].map((r) => ({ r, c: 5 })), '第 5 列全部行');

  // 边界：第 0 行 / 最后一行同样覆盖整行整列
  assertEqual(getSpecialAffectedCells(board, 0, 0, CELL_TYPE.STRIPED, DIRECTION.H).length, SIZE, '首行');
  assertEqual(getSpecialAffectedCells(board, 7, 7, CELL_TYPE.STRIPED, DIRECTION.V).length, SIZE, '末列');

  // 普通格「波及」的就是它自己；魔力鸟的波及依赖「目标颜色」，本签名只返回它自己（见 D025）
  assertDeepEqual(getSpecialAffectedCells(board, 2, 2, CELL_TYPE.NORMAL, null), [{ r: 2, c: 2 }], '普通格');
});

test('getSpecialAffectedCells：包装糖果波及 3×3 共 9 格，贴边与角落按棋盘裁剪（Step 8 验收项）', () => {
  const board = fixture();

  const center = getSpecialAffectedCells(board, 3, 4, CELL_TYPE.WRAPPED, null);
  assertEqual(center.length, 9, '棋盘内部 = 3×3 共 9 格');
  const expected = [];
  for (let r = 2; r <= 4; r += 1) for (let c = 3; c <= 5; c += 1) expected.push({ r, c });
  assertDeepEqual(center, expected, '以内侧为中心（按行优先顺序）恰好覆盖周围 9 格');

  assertEqual(getSpecialAffectedCells(board, 0, 0, CELL_TYPE.WRAPPED, null).length, 4, '左上角被裁剪为 4 格');
  assertEqual(getSpecialAffectedCells(board, 0, 4, CELL_TYPE.WRAPPED, null).length, 6, '上边缘被裁剪为 6 格');
  assertEqual(getSpecialAffectedCells(board, 7, 7, CELL_TYPE.WRAPPED, null).length, 4, '右下角被裁剪为 4 格');
  assertEqual(getSpecialAffectedCells(board, 7, 3, CELL_TYPE.WRAPPED, null).length, 6, '下边缘被裁剪为 6 格');

  // 越界坐标不应该返回任何格子（防御性：调用方传入非法坐标时不能凭空产生格子）
  assertEqual(getSpecialAffectedCells(board, -1, -1, CELL_TYPE.WRAPPED, null).length, 0, '越界坐标');
});

test('createSpecial：4 连在靠近中间的落点生成条纹糖果，方向 = 匹配方向（3.2 / D014）', () => {
  const board = fixture();
  const group = { cells: [1, 2, 3, 4].map((c) => ({ r: 4, c })), shape: MATCH_SHAPE.LINE4, direction: DIRECTION.H };
  const idBefore = board[4][2].id;
  const colorBefore = board[4][2].color;

  const pos = createSpecial(board, group);

  assertDeepEqual(pos, { r: 4, c: 2 }, '落点取该段靠近中间的格子（4 连 → 第 2 格）');
  assertEqual(typeAt(board, 4, 2), CELL_TYPE.STRIPED, '类型变为条纹');
  assertEqual(board[4][2].direction, DIRECTION.H, '方向 = 匹配方向（横向 4 连 → 横向条纹）');
  assertEqual(board[4][2].id, idBefore, '沿用原格子（id 不变，动画可追踪）');
  assertEqual(board[4][2].color, colorBefore, '颜色保留');
  assertEqual(typeAt(board, 4, 1), CELL_TYPE.NORMAL, '同组其他格子不受影响');
});

test('createSpecial：纵向 4 连 → 纵向条纹；3 连不生成；5 连直线 → 正中一格的魔力鸟', () => {
  const board = fixture();
  const vertical = { cells: [1, 2, 3, 4].map((r) => ({ r, c: 6 })), shape: MATCH_SHAPE.LINE4, direction: DIRECTION.V };
  assertDeepEqual(createSpecial(board, vertical), { r: 2, c: 6 }, '落点');
  assertEqual(board[2][6].direction, DIRECTION.V, '纵向 4 连 → 纵向条纹');

  const line3 = { cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }], shape: MATCH_SHAPE.LINE3, direction: DIRECTION.H };
  assertEqual(createSpecial(board, line3), null, '3 连不生成');
  assertEqual(createSpecial(board, { cells: [], shape: MATCH_SHAPE.LINE4, direction: DIRECTION.H }), null, '空组');
  const line5 = { cells: [0, 1, 2, 3, 4].map((c) => ({ r: 6, c })), shape: MATCH_SHAPE.LINE5, direction: DIRECTION.H };
  assertDeepEqual(createSpecial(board, line5), { r: 6, c: 2 }, '5 连直线的魔力鸟落在正中一格');
  assertEqual(typeAt(board, 6, 2), CELL_TYPE.MAGIC, '类型为魔力鸟');
  assertEqual(board[6][2].direction, null, '魔力鸟没有方向（4.1）');
});

test('createSpecial：落点已是特殊元素时不覆盖（让它按 4.3.8 正常激活）', () => {
  const board = fixture();
  board[4][2].type = CELL_TYPE.STRIPED;
  board[4][2].direction = DIRECTION.V;
  const group = { cells: [1, 2, 3, 4].map((c) => ({ r: 4, c })), shape: MATCH_SHAPE.LINE4, direction: DIRECTION.H };
  assertEqual(createSpecial(board, group), null, '不覆盖已有特殊元素');
  assertEqual(board[4][2].direction, DIRECTION.V, '原有方向保持不变');
});

test('activateSpecial：条纹返回整行/整列；普通格返回空（无特效可激活）', () => {
  const board = fixture();
  board[5][5].type = CELL_TYPE.STRIPED;
  board[5][5].direction = DIRECTION.V;
  assertEqual(activateSpecial(board, 5, 5).length, SIZE, '纵向条纹 → 整列');
  assertDeepEqual(activateSpecial(board, 0, 0), [], '普通格没有可激活的特效');
});

// ---------------------------------------------------------------- Step 8：包装糖果

/** L 型夹具：第 3 行 2..4 列 + 第 4 列 3..5 行，交叉点 (3,4) 同时是两条臂的端点。 */
const L_CELLS = [{ r: 3, c: 2 }, { r: 3, c: 3 }, { r: 3, c: 4 }, { r: 4, c: 4 }, { r: 5, c: 4 }];
/** T 型夹具：第 3 行 2..4 列 + 第 3 列 2..4 行，交叉点 (3,3) 在横臂中间、竖臂中间。 */
const T_CELLS = [{ r: 2, c: 3 }, { r: 3, c: 2 }, { r: 3, c: 3 }, { r: 3, c: 4 }, { r: 4, c: 3 }];

function wrappedAt(board) {
  const found = [];
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (board[r][c].type === CELL_TYPE.WRAPPED) found.push({ r, c, direction: board[r][c].direction });
    }
  }
  return found;
}

test('createSpecial：L 型 5 连在交叉点生成包装糖果，direction 为 null（3.2 / 4.1）', () => {
  const board = fixture();
  const group = { cells: L_CELLS, shape: MATCH_SHAPE.L, direction: null };
  const idBefore = board[3][4].id;

  const pos = createSpecial(board, group);

  assertDeepEqual(pos, { r: 3, c: 4 }, '落点 = 交叉点（两条臂的公共格）');
  assertEqual(typeAt(board, 3, 4), CELL_TYPE.WRAPPED, '类型变为包装糖果');
  assertEqual(board[3][4].direction, null, '包装糖果没有方向（4.1）');
  assertEqual(board[3][4].id, idBefore, '沿用原格子（id 不变）');
  assertEqual(typeAt(board, 3, 3), CELL_TYPE.NORMAL, '同组其他格子不受影响');
});

test('createSpecial：T 型 5 连同样在交叉点生成包装糖果', () => {
  const board = fixture();
  assertDeepEqual(createSpecial(board, { cells: T_CELLS, shape: MATCH_SHAPE.T, direction: null }), { r: 3, c: 3 }, '落点 = 交叉点');
  assertEqual(typeAt(board, 3, 3), CELL_TYPE.WRAPPED, '类型为包装糖果');
});

test('createSpecial：交叉点已是特殊元素时不覆盖；非法交叉形状不生成', () => {
  const board = fixture();
  board[3][4].type = CELL_TYPE.STRIPED;
  board[3][4].direction = DIRECTION.H;
  assertEqual(createSpecial(board, { cells: L_CELLS, shape: MATCH_SHAPE.L, direction: null }), null, '不覆盖已有特效');
  assertEqual(board[3][4].type, CELL_TYPE.STRIPED, '原有类型保持不变');

  // 交叉点缺失（只有一条臂）→ 不生成（防御性：crossCenter 返回 null）
  const broken = { cells: [{ r: 3, c: 2 }, { r: 3, c: 3 }, { r: 3, c: 4 }], shape: MATCH_SHAPE.L, direction: null };
  assertEqual(createSpecial(fixture(), broken), null, '交叉点缺失时跳过生成');
});

test('resolveCascades：L 型 5 连消除 4 格、在交叉点留下 1 颗包装糖果（验收项）', () => {
  const board = fixture((b) => {
    for (const pos of L_CELLS) b[pos.r][pos.c].color = 3;
  });

  const result = resolveCascades(board, CONFIG.COLOR_COUNT, { rng: cycleRng(STEADY_COLORS) });
  const first = result.levels[0];

  assertEqual(first.groups.length, 1, '恰好 1 组匹配');
  assertEqual(first.groups[0].shape, MATCH_SHAPE.L, '被识别为 L 型');
  assertEqual(first.cleared.length, 4, 'L 型 5 连只消除 4 格（交叉点留下来变成特效）');
  // 交叉点 (3,4) 生成包装糖果；本层又消掉了同列的 (4,4)(5,4)，幸存格被重力压到底部，
  // 因此快照里它在第 5 行（与 Step 7 纵向 4 连同理：位置按快照读，而不是按生成时的坐标猜）。
  assertDeepEqual(wrappedAt(first.board), [{ r: 5, c: 4, direction: null }], '同列留下 1 颗包装糖果（下落后第 5 行）');
  assertFalse(result.capped, '不该触发级联上限');
});

test('resolveCascades：包装糖果被 3 连触发时消除周围 3×3（4.3.8）', () => {
  const board = fixture((b) => {
    for (const c of [1, 2, 3]) b[3][c].color = 3;
    b[3][2].type = CELL_TYPE.WRAPPED; // 包装糖果在 3 连之内 → 被带上触发
    b[3][2].direction = null;
  });

  const result = resolveCascades(board, CONFIG.COLOR_COUNT, { rng: cycleRng(STEADY_COLORS) });
  const first = result.levels[0];

  // 3 连本身 ⊂ 3×3（第 2..4 行 × 第 1..3 列），因此本层恰好清 9 格
  assertEqual(first.cleared.length, 9, '包装糖果波及 3×3 = 9 格');
  assertEqual(first.cleared.filter((cell) => cell.type === CELL_TYPE.WRAPPED).length, 1, '其中包含那颗包装糖果');
  assertEqual(wrappedAt(first.board).length, 0, '本层不再生成新的包装糖果');
});

test('resolveCascades：角落的包装糖果按棋盘裁剪（角落 3×3 → 4 格）', () => {
  const board = fixture((b) => {
    for (const c of [0, 1, 2]) b[0][c].color = 3;
    b[0][0].type = CELL_TYPE.WRAPPED;
  });

  const result = resolveCascades(board, CONFIG.COLOR_COUNT, { rng: cycleRng(STEADY_COLORS) });

  // 角落 (0,0) 的 3×3 被裁剪为 4 格 {(0,0),(0,1),(1,0),(1,1)}，并入 3 连 {(0,0),(0,1),(0,2)} → 5 格
  assertEqual(result.levels[0].cleared.length, 5, '角落裁剪后共 5 格');
});

test('resolveCascades：横向 4 连消除 3 格并留下 1 颗横向条纹（验收项）', () => {
  const board = fixture((b) => {
    for (const c of [1, 2, 3, 4]) b[4][c].color = 3;
  });

  const result = resolveCascades(board, CONFIG.COLOR_COUNT, { rng: cycleRng(STEADY_COLORS) });

  assertEqual(result.levels[0].cleared.length, 3, '4 连只消除 3 格');
  assertFalse(result.levels[0].cleared.some((cell) => cell.type === CELL_TYPE.STRIPED), '被消除的格子不含条纹');
  assertEqual(result.levels[0].groups[0].shape, MATCH_SHAPE.LINE4, '该组形状为 line4');
  // 断言第 1 层快照：生成的特效本层不被消除，但会被重力压到底部（此处横向下落距离为 0）
  assertDeepEqual(stripedAt(result.levels[0].board), [{ r: 4, c: 2, direction: DIRECTION.H }], '棋盘上留下 1 颗横向条纹');
  assertFalse(result.capped, '不该触发级联上限');
});

test('resolveCascades：纵向 4 连留下纵向条纹（方向随匹配方向）', () => {
  const board = fixture((b) => {
    for (const r of [1, 2, 3, 4]) b[r][6].color = 3;
  });

  const result = resolveCascades(board, CONFIG.COLOR_COUNT, { rng: cycleRng(STEADY_COLORS) });

  assertEqual(result.levels[0].cleared.length, 3, '消除 3 格');
  // 纵向被消除的 3 格在同一列，幸存格会被重力压到底部：条纹从 r=2 落到 r=4
  assertDeepEqual(stripedAt(result.levels[0].board), [{ r: 4, c: 6, direction: DIRECTION.V }], '留下 1 颗纵向条纹');
  assertFalse(result.capped, '不该触发级联上限');
});

test('resolveCascades：普通 3 连不生成任何特殊元素（不越步实现）', () => {
  const board = fixture((b) => {
    for (const c of [1, 2, 3]) b[4][c].color = 3;
  });

  const result = resolveCascades(board, CONFIG.COLOR_COUNT, { rng: NO_CASCADE_RNG });

  assertEqual(result.levels[0].cleared.length, 3, '3 连消除 3 格');
  assertEqual(stripedAt(board).length, 0, '不应生成条纹');
});

test('resolveCascades：条纹被 3 连触发时消除整行（4.3.8 优先激活特效）', () => {
  // 条纹必须**在匹配组内**才会被触发（4.3.8）：把横条纹放在 (3,2)，3 连是 (3,1)(3,2)(3,3)
  const board = fixture((b) => {
    for (const c of [1, 2, 3]) b[3][c].color = 3;
    b[3][2].type = CELL_TYPE.STRIPED;
    b[3][2].direction = DIRECTION.H;
  });
  const rowBefore = board[3].map((cell) => cell.color);

  const result = resolveCascades(board, CONFIG.COLOR_COUNT, { rng: NO_CASCADE_RNG });
  const firstLevel = result.levels[0];

  // 第 1 层：3 连 (3,1)(3,2)(3,3) 触发；条纹在组内，按 4.3.8 优先激活，整行被清除
  assertEqual(firstLevel.groups.length, 1, '恰好 1 个匹配组');
  assertEqual(firstLevel.groups[0].shape, MATCH_SHAPE.LINE3, '3 连不生成新特效');
  assertEqual(stripedAt(firstLevel.board).length, 0, '本层没有新生成条纹');
  assertEqual(firstLevel.cleared.length, SIZE, `条纹被触发后应清除整行 8 格，实际 ${firstLevel.cleared.length}`);
  assertEqual(
    firstLevel.cleared.filter((cell) => cell.type === CELL_TYPE.STRIPED).length,
    1,
    '被清除的格子里包含那颗条纹（供上层按 3.5 应用 1.5 倍）'
  );
  assertEqual(rowBefore.length, SIZE, '夹具行长度自检');
});

test('timeline：条纹波及的整行格子都进入消除与下落隐藏集合', () => {
  const board = fixture((b) => {
    for (const c of [1, 2, 3]) b[3][c].color = 3;
    b[3][2].type = CELL_TYPE.STRIPED;
    b[3][2].direction = DIRECTION.H;
  });
  const afterSwap = cloneBoard(board);
  const result = resolveCascades(board, CONFIG.COLOR_COUNT, { rng: NO_CASCADE_RNG });
  const phases = buildPhases(result, afterSwap, motionDurations(false));
  const clear = phases.find((phase) => phase.phase === 'clear' && phase.levelIndex === 0);
  const fall = phases.find((phase) => phase.phase === 'fall' && phase.levelIndex === 0);
  const expected = [0, 1, 2, 3, 4, 5, 6, 7].map((c) => `3,${c}`);

  assertEqual(clear.keys.size, SIZE, '消除动画覆盖条纹实际清除的整行');
  assertDeepEqual([...clear.keys].sort(), expected, '消除键与实际波及坐标一致');
  assertDeepEqual([...fall.hidden].sort(), expected, '下落阶段隐藏同一批已清除格子');
});

test('resolveCascades：两颗条纹同行时链式激活（行 ∪ 列）', () => {
  const board = fixture((b) => {
    // (3,2) 横条纹 + (3,5) 竖条纹，二者同一行
    b[3][2].type = CELL_TYPE.STRIPED;
    b[3][2].direction = DIRECTION.H;
    b[3][5].type = CELL_TYPE.STRIPED;
    b[3][5].direction = DIRECTION.V;
    b[3][2].color = 3;
    b[3][5].color = 3;
    for (const c of [0, 1]) b[3][c].color = 2; // 隔断列 0/1，让同色段从列 2 开始
    b[3][3].color = 3;
    b[3][4].color = 3;
  });

  const result = resolveCascades(board, CONFIG.COLOR_COUNT, { rng: NO_CASCADE_RNG });
  const clearedFirst = result.levels[0].cleared.length;

  // 链式结果 = 整行(8) ∪ 整列 5(8) = 15 格（(3,5) 处重叠 1 格），
  // 再减去本层**新生成并按规则保留**的那颗条纹（列 2..5 是 4 连 → 在 (3,3) 生成），
  // 见 board.js collectClearKeys 对 spawnKeys 的排除 → 14
  assertEqual(clearedFirst, 2 * SIZE - 1 - 1, `链式激活应清除 14 格，实际 ${clearedFirst}`);
});

test('resolveCascades：复杂交叉簇（形状无法判定）不生成条纹，但仍全部消除', () => {
  const board = fixture((b) => {
    // 行 3 的 0-4 列 + 列 1、列 3 的上下各一格 → 合并后含多个交叉点，detectMatchShape 返回 null
    for (const c of [0, 1, 2, 3, 4]) b[3][c].color = 3;
    b[2][1].color = 3;
    b[2][3].color = 3;
    b[4][1].color = 3;
    b[4][3].color = 3;
  });

  const result = resolveCascades(board, CONFIG.COLOR_COUNT, { rng: NO_CASCADE_RNG });

  assertEqual(result.levels[0].groups[0].shape, null, '形状无法判定为单个 line/L/T');
  assertEqual(stripedAt(board).length, 0, '不应生成条纹');
  assertEqual(result.levels[0].cleared.length, 9, '该簇 9 格全部消除');
});

// ---------------------------------------------------------------- Step 9：魔力鸟

test('getMagicTargets：返回全屏同色坐标（不含魔力鸟自身，也不含其它颜色）', () => {
  const board = fixture((b) => {
    b[2][3].color = 4;
    b[5][1].color = 4;
    b[0][7].color = 4;
    b[4][4].type = CELL_TYPE.MAGIC; // 魔力鸟自身颜色为 2（≠ 4）：按颜色筛选时不应出现
    b[4][4].color = 2;
  });

  const targets = getMagicTargets(board, 4);
  // 夹具是 0/1 棋盘格：颜色 4 只可能出现在我们显式设置的格子上
  assertDeepEqual(
    targets,
    [{ r: 0, c: 7 }, { r: 2, c: 3 }, { r: 5, c: 1 }],
    '按行列顺序返回全部颜色为 4 的格子（与格子类型无关，魔力鸟自身由调用方另加）'
  );
  assertEqual(getMagicTargets(board, 9).length, 0, '没有该颜色时返回空');
  assertEqual(getMagicTargets(board, null).length, 0, 'null 颜色返回空（防御性）');
});

test('getSpecialAffectedCells：魔力鸟只返回它自己（目标颜色由调用方给出，见 D025）', () => {
  const board = fixture();
  assertDeepEqual(getSpecialAffectedCells(board, 3, 3, CELL_TYPE.MAGIC, null), [{ r: 3, c: 3 }], '只有自身');
});

test('resolveCascades：5 连直线消除 4 格、在正中留下 1 颗魔力鸟', () => {
  const board = fixture((b) => {
    for (const c of [1, 2, 3, 4, 5]) b[4][c].color = 3;
  });

  const result = resolveCascades(board, CONFIG.COLOR_COUNT, { rng: cycleRng(STEADY_COLORS) });
  const first = result.levels[0];

  assertEqual(first.groups[0].shape, MATCH_SHAPE.LINE5, '被识别为 line5');
  assertEqual(first.cleared.length, 4, '5 连只消除 4 格（正中那一格留下来）');
  assertEqual(first.board.flat().filter((cell) => cell.type === CELL_TYPE.MAGIC).length, 1, '棋盘上留下 1 颗魔力鸟');
});

test('resolveCascades：initialClear 让第一层先清除给定坐标（魔力鸟交换用）', () => {
  const board = fixture((b) => {
    // 全盘 0/1 棋盘格（无匹配），只把 3 颗格子标成颜色 4，模拟「全屏同色」的目标
    b[1][2].color = 4;
    b[3][5].color = 4;
    b[6][0].color = 4;
  });

  const result = resolveCascades(board, CONFIG.COLOR_COUNT, {
    rng: cycleRng(STEADY_COLORS),
    initialClear: [{ r: 1, c: 2 }, { r: 3, c: 5 }, { r: 6, c: 0 }, { r: 0, c: 0 }]
  });
  const first = result.levels[0];

  assertEqual(first.groups.length, 0, '该层没有任何匹配组');
  assertEqual(first.cleared.length, 4, '恰好清除 initialClear 指定的 4 格');
  assertDeepEqual(
    first.cleared.map((cell) => cell.color).sort(),
    [0, 4, 4, 4],
    '被清除的格子就是那些颜色为 4 的格子 + 指定的一格颜色 0'
  );
  assertTrue(result.levels.length >= 1, '至少结算 1 层（后续是否级联由补充的新格子决定）');
  assertFalse(result.capped, '不该触发级联上限');
});

test('resolveCascades：initialClear 与同层匹配组一起生效（互不覆盖）', () => {
  const board = fixture((b) => {
    for (const c of [1, 2, 3]) b[6][c].color = 3; // 第 6 行 3 连
    b[0][0].color = 4; // 另一个颜色，靠 initialClear 清掉
  });

  const result = resolveCascades(board, CONFIG.COLOR_COUNT, {
    rng: cycleRng(STEADY_COLORS),
    initialClear: [{ r: 0, c: 0 }]
  });
  const first = result.levels[0];

  assertEqual(first.groups.length, 1, '该层有 1 个匹配组');
  assertEqual(first.cleared.length, 4, '3 连（3 格）+ initialClear（1 格）');
});

if (!globalThis.__XXL_TEST_BUNDLE__) summarize();
