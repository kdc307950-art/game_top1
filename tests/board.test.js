// tests/board.test.js — board.js 的单元测试。见 AGENTS.md 7.1 与 ROADMAP Step 2 / Step 6。
//
// 夹具约定（宪法 4.1 约束）：棋盘必须经 createBoard 构造后再覆盖 color，
// 不得直接构造裸数组传入逻辑函数。
// Step 6 起本文件还覆盖「死局检测与重排」在 game.js 中的接入（resolveBoard 的 deadlock 字段）。

import {
  test,
  assertEqual,
  assertTrue,
  assertFalse,
  assertDeepEqual,
  assertThrows,
  summarize
} from './assert.js';
import { CELL_TYPE, CONFIG, OBSTACLE_TYPE } from '../config.js';
import {
  createBoard,
  swapCells,
  cloneBoard,
  isCellMovable,
  hasPossibleMove,
  shuffleBoard
} from '../board.js';
import { createGame, resolveBoard } from '../game.js';
import { findMatches } from '../match.js';

const SIZE = 8;
const COLORS = CONFIG.COLOR_COUNT;
const idsOf = (board) => board.map((row) => row.map((cell) => cell.id));
const colorsOf = (board) => board.map((row) => row.map((cell) => cell.color));

/** 带种子的 LCG：重排测试需要确定性，又需要正常分布（否则重排永远失败）。 */
function seededRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** 6 色死局盘：`(r + 2c) % 6` —— 行列相邻都不同色（无三连），且任意相邻交换都凑不出三连。 */
function deadlockBoard6(board) {
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      board[r][c].color = (r + 2 * c) % 6;
    }
  }
  return board;
}


/**
 * 死局夹具（满足 3.8 的反面：不存在任何有效交换）。
 * 颜色取 (r + 2c) % 3：同行相邻相差 2、同列相邻相差 1（模 3 均不为 0），
 * 因此现存无三连；且任意单次相邻交换都无法凑出三连同色 —— 由下面的用例断言。
 */
function deadlockBoard() {
  const board = createBoard(SIZE, SIZE, 3);
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      board[r][c].color = (r + 2 * c) % 3;
    }
  }
  return board;
}

/**
 * 「只差一次交换」夹具：在死局棋盘上挖出一个待补位。
 * (0,0)(0,1) 同色 0，(0,2) 为 1，(1,2) 为 0 → 交换 (0,2)↔(1,2) 后第 0 行出现 0,0,0。
 * (0,3) 特意改成 1：否则它本来就是 0，交换后会形成 4 连，验不到「正好 3 连」。
 */
function nearWinBoard() {
  const board = deadlockBoard();
  board[0][1].color = 0;
  board[0][3].color = 1;
  board[1][2].color = 0;
  return board;
}

test('createBoard 生成 8×8 棋盘，格子字段符合 4.1', () => {
  const board = createBoard(SIZE, SIZE, COLORS);
  assertEqual(board.length, SIZE, '行数');
  assertEqual(board[0].length, SIZE, '列数');
  for (const row of board) {
    for (const cell of row) {
      assertTrue(Number.isInteger(cell.color) && cell.color >= 0 && cell.color < COLORS, 'color 取值');
      assertEqual(cell.type, CELL_TYPE.NORMAL, 'type');
      assertEqual(cell.direction, null, 'direction');
      assertEqual(cell.obstacle, null, 'obstacle');
      assertEqual(cell.obstacleLayers, 0, 'obstacleLayers');
      assertTrue(Number.isInteger(cell.id), 'id');
    }
  }
});

test('createBoard 拒绝非法参数', () => {
  assertThrows(() => createBoard(SIZE, SIZE, 2), '色数少于 3 应抛错');
  assertThrows(() => createBoard(0, SIZE, COLORS), '行数为 0 应抛错');
  assertThrows(() => createBoard(SIZE, SIZE, 2.5), '非整数色数应抛错');
});

test('createBoard 连开 20 盘：均无初始三连、且都存在可行交换', () => {
  for (let i = 0; i < 20; i += 1) {
    const board = createBoard(SIZE, SIZE, COLORS);
    assertEqual(findMatches(board).length, 0, `第 ${i + 1} 盘不应有初始三连`);
    assertTrue(hasPossibleMove(board), `第 ${i + 1} 盘应存在可行交换`);
  }
});

test('createBoard 的 cell.id 在单盘内唯一', () => {
  const board = createBoard(SIZE, SIZE, COLORS);
  const ids = new Set(board.flat().map((cell) => cell.id));
  assertEqual(ids.size, SIZE * SIZE, '唯一 id 数量');
});

test('createBoard 应用 obstacles：冰块保留动物、雪块占格无动物、层数按 3.4 上限裁剪', () => {
  const board = createBoard(SIZE, SIZE, COLORS, [
    { r: 1, c: 1, type: OBSTACLE_TYPE.ICE, layers: 2 },
    { r: 2, c: 2, type: OBSTACLE_TYPE.SNOW, layers: 9 },
    { r: 3, c: 3, type: OBSTACLE_TYPE.CHOC, layers: 0 }
  ]);
  assertEqual(board[1][1].obstacle, OBSTACLE_TYPE.ICE, '冰块类型');
  assertEqual(board[1][1].obstacleLayers, 2, '冰块层数');
  assertTrue(Number.isInteger(board[1][1].color), '3.4：冰块内的动物仍然存在');
  assertEqual(board[2][2].obstacle, OBSTACLE_TYPE.SNOW, '雪块类型');
  assertEqual(board[2][2].color, null, '3.4：雪块占格，格内没有动物');
  assertEqual(board[2][2].obstacleLayers, CONFIG.OBSTACLE_CONFIG.snow.maxLayers, '雪块层数裁剪到上限');
  assertEqual(board[3][3].color, null, '3.4：巧克力占格，格内没有动物');
  assertEqual(board[3][3].obstacleLayers, 1, '层数下限为 1');
});

test('swapCells 原地交换两格内容', () => {
  const board = createBoard(SIZE, SIZE, COLORS);
  const idA = board[0][0].id;
  const idB = board[0][1].id;
  swapCells(board, { r: 0, c: 0 }, { r: 0, c: 1 });
  assertEqual(board[0][0].id, idB, 'a 位置换成 b 的内容');
  assertEqual(board[0][1].id, idA, 'b 位置换成 a 的内容');
});

test('swapCells 对越界位置抛错', () => {
  const board = createBoard(SIZE, SIZE, COLORS);
  assertThrows(() => swapCells(board, { r: 0, c: 0 }, { r: SIZE, c: 0 }), '越界应抛错');
});

test('cloneBoard 是深拷贝：改副本不影响原棋盘', () => {
  const board = createBoard(SIZE, SIZE, COLORS);
  const copy = cloneBoard(board);
  copy[0][0].color = 99;
  copy[0][0].obstacle = OBSTACLE_TYPE.ICE;
  assertTrue(copy[0][0].color === 99, '副本已改');
  assertFalse(board[0][0].color === 99, '原棋盘不受影响');
  assertEqual(board[0][0].obstacle, null, '原棋盘障碍物不受影响');
  assertFalse(copy[0][0] === board[0][0], '不是同一个对象引用');
});

test('isCellMovable：普通格可换，空格/纯障碍不可换，藤蔓不可换（3.4）', () => {
  const board = createBoard(SIZE, SIZE, COLORS);
  assertTrue(isCellMovable(board, 0, 0), '普通格可交换');
  board[0][0].color = null;
  assertFalse(isCellMovable(board, 0, 0), '空格/纯障碍不可交换');
  board[0][0].color = 3;
  board[0][0].obstacle = OBSTACLE_TYPE.VINE;
  assertFalse(isCellMovable(board, 0, 0), '3.4：藤蔓中的动物不能移动');
  board[0][0].obstacle = OBSTACLE_TYPE.ICE;
  assertTrue(isCellMovable(board, 0, 0), '3.4：冰块内的动物可以移动');
  assertFalse(isCellMovable(board, 9, 9), '越界视为不可交换');
});

test('hasPossibleMove 在死局棋盘上返回 false（3.8）', () => {
  const board = deadlockBoard();
  assertEqual(findMatches(board).length, 0, '死局夹具本身不含现成匹配');
  assertFalse(hasPossibleMove(board), '死局棋盘不应存在可行交换');
});

test('hasPossibleMove 在「只差一次交换」的棋盘上返回 true', () => {
  const board = nearWinBoard();
  assertEqual(findMatches(board).length, 0, '夹具仍不含现成匹配');
  assertTrue(hasPossibleMove(board), '应存在可行交换');
});

test('有效交换：交换后形成的 3 连被识别（交换不回退）', () => {
  const board = nearWinBoard();
  swapCells(board, { r: 0, c: 2 }, { r: 1, c: 2 });
  const groups = findMatches(board);
  assertEqual(groups.length, 1, '交换后应恰好出现 1 组匹配');
  assertDeepEqual(
    groups[0].cells,
    [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }],
    '匹配坐标'
  );
});

test('无效交换：交换不产生匹配，换回后与快照完全一致（4.3.2 回退）', () => {
  const board = deadlockBoard();
  const snapshot = cloneBoard(board);
  swapCells(board, { r: 0, c: 0 }, { r: 0, c: 1 });
  assertEqual(findMatches(board).length, 0, '死局棋盘的任意相邻交换都不产生匹配');
  swapCells(board, { r: 0, c: 0 }, { r: 0, c: 1 });
  assertDeepEqual(idsOf(board), idsOf(snapshot), '换回后 id 布局一致');
});

test('无效交换：用快照回退（app.js 使用的路径）后状态一致', () => {
  const board = deadlockBoard();
  const before = colorsOf(board);
  const snapshot = cloneBoard(board);
  swapCells(board, { r: 2, c: 2 }, { r: 2, c: 3 });
  const restored = snapshot;
  assertDeepEqual(colorsOf(restored), before, '快照恢复后颜色布局与原棋盘一致');
  assertDeepEqual(idsOf(restored), idsOf(snapshot), '快照恢复后 id 布局一致');
  assertEqual(findMatches(restored).length, 0, '恢复后的棋盘与原始状态一样无匹配');
});

// ---------------------------------------------------------------------------
// Step 6：死局检测与重排（3.8）
// ---------------------------------------------------------------------------

test('shuffleBoard：死局盘重排后无初始三连且有可行交换（3.8 约束 1、2）', () => {
  const board = deadlockBoard6(createBoard(SIZE, SIZE, 6));
  assertEqual(findMatches(board).length, 0, '前提：死局盘本身无三连');
  assertFalse(hasPossibleMove(board), '前提：死局盘无可行交换');

  const stats = { tries: 0 };
  const ok = shuffleBoard(board, { rng: seededRng(20260919), stats });

  assertTrue(ok, '6 色下应能在上限内重排出可玩局面');
  assertTrue(stats.tries >= 1, `应记录尝试次数，实际 ${stats.tries}`);
  assertEqual(findMatches(board).length, 0, '约束 1：重排后不存在初始三连');
  assertTrue(hasPossibleMove(board), '约束 2：重排后存在至少一个有效交换');
  assertEqual(new Set(idsOf(board).flat()).size, SIZE * SIZE, '重排只是置换格子对象，id 不应重复或丢失');
});

test('shuffleBoard：不改变障碍物布局（3.8 约束 3）', () => {
  const board = createBoard(SIZE, SIZE, COLORS);
  deadlockBoard6(board); // 先把动物格铺成死局盘
  // 再按 3.4 的语义挂上障碍物：雪块是纯障碍格（格内没有动物），冰块保留动物
  board[2][2].color = null;
  board[2][2].obstacle = OBSTACLE_TYPE.SNOW;
  board[2][2].obstacleLayers = 3;
  board[5][6].obstacle = OBSTACLE_TYPE.ICE;
  board[5][6].obstacleLayers = 2;
  const snowId = board[2][2].id;
  const iceId = board[5][6].id;
  const iceColor = board[5][6].color;

  const ok = shuffleBoard(board, { rng: seededRng(7) });

  assertTrue(ok, '含障碍物的死局盘也应能重排成功');
  assertEqual(board[2][2].id, snowId, '雪块格未被换走');
  assertEqual(board[2][2].obstacle, OBSTACLE_TYPE.SNOW, '雪块类型不变');
  assertEqual(board[2][2].obstacleLayers, 3, '雪块层数不变');
  assertEqual(board[2][2].color, null, '雪块格内仍然没有动物');
  assertEqual(board[5][6].id, iceId, '冰块格未被换走');
  assertEqual(board[5][6].color, iceColor, '冰块内的动物也不参与重排（障碍物与动物保持对应）');
  assertEqual(board[5][6].obstacleLayers, 2, '冰块层数不变');
});

test('shuffleBoard：同一随机源可复现，且失败时还原棋盘（3.8 约束 4）', () => {
  const first = deadlockBoard6(createBoard(SIZE, SIZE, 6));
  const second = deadlockBoard6(createBoard(SIZE, SIZE, 6));
  shuffleBoard(first, { rng: seededRng(42) });
  shuffleBoard(second, { rng: seededRng(42) });
  assertDeepEqual(colorsOf(first), colorsOf(second), '同种子两次重排结果一致');

  // 全同色盘：任何排列都必然含三连 → 上限内必然失败
  const stuck = createBoard(SIZE, SIZE, 6);
  for (const row of stuck) {
    for (const cell of row) cell.color = 0;
  }
  const before = idsOf(stuck);
  const stats = { tries: 0 };
  const ok = shuffleBoard(stuck, { rng: seededRng(1), maxTries: 5, stats });
  assertFalse(ok, '无法避免三连时应返回 false');
  assertEqual(stats.tries, 5, '应尝试到上限');
  assertDeepEqual(idsOf(stuck), before, '失败时棋盘恢复原状（不留「打过乱且含三连」的中间态）');
});

test('shuffleBoard：可重排格少于两格时直接失败', () => {
  const board = createBoard(SIZE, SIZE, COLORS);
  for (const row of board) {
    for (const cell of row) cell.color = null; // 全部清空：没有可置换的动物
  }
  assertFalse(shuffleBoard(board, { rng: seededRng(3) }), '无动物可置换时应返回 false');
  assertFalse(hasPossibleMove(board), '空盘自然没有可行交换');
});

test('resolveBoard：检测到死局时自动重排，且不消耗步数（3.8）', () => {
  const state = createGame({ steps: 30 }, { rng: seededRng(20260919) });
  deadlockBoard6(state.board);
  const stepsBefore = state.level.remainingSteps;

  const result = resolveBoard(state);

  assertEqual(result.cascades, 0, '死局盘没有可消除的匹配');
  assertTrue(Boolean(result.deadlock), '消除填充完成后应检测到死局');
  assertTrue(result.deadlock.shuffled, '应能在上限内重排成功');
  assertTrue(result.deadlock.tries >= 1, '应记录尝试次数');
  assertTrue(result.deadlock.before !== state.board, 'before 是快照而非活动棋盘');
  assertTrue(result.deadlock.after !== state.board, 'after 是快照而非活动棋盘');
  assertEqual(findMatches(state.board).length, 0, '重排后的实际棋盘无三连');
  assertTrue(hasPossibleMove(state.board), '重排后的实际棋盘可继续游戏');
  assertEqual(state.level.remainingSteps, stepsBefore, '3.8：重排不消耗步数');
});

test('resolveBoard：重排失败时 deadlock.shuffled 为 false（调用方据此进入结束流程）', () => {
  const state = createGame({ steps: 30 }, { rng: seededRng(5) });
  // 退化盘：几乎没有动物可供置换 → hasPossibleMove 为 false 且重排不可能成功
  for (const row of state.board) {
    for (const cell of row) cell.color = null;
  }
  const before = idsOf(state.board);

  const result = resolveBoard(state);

  assertTrue(Boolean(result.deadlock), '应检测到死局');
  assertFalse(result.deadlock.shuffled, '退化盘无法重排出可玩局面');
  assertEqual(result.deadlock.tries, 0, '可置换的动物少于两格时立即失败（不空转到上限）');
  assertDeepEqual(idsOf(state.board), before, '失败后棋盘保持原状');
});

test('正常盘不会被误判死局（hasPossibleMove 为真时不触发重排）', () => {
  const state = createGame({ steps: 30 }, { rng: seededRng(11) });
  const result = resolveBoard(state);
  assertEqual(result.deadlock, null, 'createBoard 保证有可行交换，故不应触发重排');
});

test('整盘同色不算死局：可行交换一直存在，因此不触发重排', () => {
  // 这条同时说明「无三连排列」与「死局」是两回事：
  // 整盘同色任何排列都有三连（shuffleBoard 必失败），但它每次交换都能产生匹配，故不是死局。
  const state = createGame({ steps: 30 }, { rng: seededRng(9) });
  for (const row of state.board) {
    for (const cell of row) cell.color = 0;
  }
  assertTrue(hasPossibleMove(state.board), '同色盘处处可交换');
  const result = resolveBoard(state);
  assertEqual(result.deadlock, null, '不是死局，不应触发重排');
});

test('正常盘不会被误判死局（hasPossibleMove 为真时不触发重排）', () => {
  const state = createGame({ steps: 30 }, { rng: seededRng(11) });
  const result = resolveBoard(state);
  assertEqual(result.deadlock, null, 'createBoard 保证有可行交换，故不应触发重排');
});


if (!globalThis.__XXL_TEST_BUNDLE__) summarize();
