// tests/special.test.js — special.js 的单元测试。见 AGENTS.md 7.1 与 ROADMAP Step 7。
//
// 范围：Step 7 只做条纹糖果（4 连直线生成、被消除时激活消整行/整列）。
// 包装糖果（Step 8）、魔力鸟（Step 9）、组合效果（Step 10）不在本文件覆盖范围。
//
// 夹具约定（宪法 4.1）：棋盘一律经 createBoard 构造后再覆盖 color。
// 断言只针对**第 1 层**（levels[0]）：它完全由夹具决定，与补充新格子的随机源无关。

import { test, assertEqual, assertTrue, assertFalse, assertDeepEqual, summarize } from './assert.js';
import { CELL_TYPE, CONFIG, DIRECTION, MATCH_SHAPE } from '../config.js';
import { cloneBoard, createBoard, resolveCascades } from '../board.js';
import {
  activateSpecial,
  createSpecial,
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

test('matchShapeToSpecial：4 连直线 → 条纹糖果；其余形状本步返回 null（Step 8/9）', () => {
  assertEqual(matchShapeToSpecial(MATCH_SHAPE.LINE4, DIRECTION.H), CELL_TYPE.STRIPED, '横向 4 连');
  assertEqual(matchShapeToSpecial(MATCH_SHAPE.LINE4, DIRECTION.V), CELL_TYPE.STRIPED, '纵向 4 连');
  assertEqual(matchShapeToSpecial(MATCH_SHAPE.LINE3, DIRECTION.H), null, '3 连不产生特殊元素');
  assertEqual(matchShapeToSpecial(MATCH_SHAPE.LINE5, DIRECTION.H), null, '5 连直线属 Step 9（魔力鸟）');
  assertEqual(matchShapeToSpecial(MATCH_SHAPE.L, null), null, 'L 型属 Step 8（包装糖果）');
  assertEqual(matchShapeToSpecial(MATCH_SHAPE.T, null), null, 'T 型属 Step 8（包装糖果）');
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

  // 非条纹类型：波及的就是它自己（包装/魔力鸟属 Step 8/9）
  assertDeepEqual(getSpecialAffectedCells(board, 2, 2, CELL_TYPE.NORMAL, null), [{ r: 2, c: 2 }], '普通格');
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

test('createSpecial：纵向 4 连生成纵向条纹；非 4 连形状不生成', () => {
  const board = fixture();
  const vertical = { cells: [1, 2, 3, 4].map((r) => ({ r, c: 6 })), shape: MATCH_SHAPE.LINE4, direction: DIRECTION.V };
  assertDeepEqual(createSpecial(board, vertical), { r: 2, c: 6 }, '落点');
  assertEqual(board[2][6].direction, DIRECTION.V, '纵向 4 连 → 纵向条纹');

  const line3 = { cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }], shape: MATCH_SHAPE.LINE3, direction: DIRECTION.H };
  assertEqual(createSpecial(board, line3), null, '3 连不生成');
  assertEqual(createSpecial(board, { cells: [], shape: MATCH_SHAPE.LINE4, direction: DIRECTION.H }), null, '空组');
  assertEqual(createSpecial(board, { cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 0, c: 3 }], shape: MATCH_SHAPE.LINE5, direction: DIRECTION.H }), null, '5 连直线属 Step 9');
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

if (!globalThis.__XXL_TEST_BUNDLE__) summarize();
