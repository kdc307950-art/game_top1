// tests/integration.test.js — 跨模块集成测试（Step 3：消除 → 下落 → 填充 → 级联）。见 AGENTS.md 7.1。
//
// 夹具约定（宪法 4.1 约束）：棋盘必须经 createBoard 构造后再覆盖 color。
// 随机性控制：resolveCascades / refillBoard 接受可选的 rng 注入（见 D015），
// 因此可以为「级联层数」写出确定性断言，而不是断言「跑出来是多少就是多少」。

import {
  test,
  assertEqual,
  assertTrue,
  assertFalse,
  assertDeepEqual,
  summarize
} from './assert.js';
import { CELL_TYPE, CONFIG, OBSTACLE_TYPE, STORAGE_KEYS } from '../config.js';
import {
  applyGravity,
  createBoard,
  refillBoard,
  resolveCascades
} from '../board.js';
import { findMatches } from '../match.js';

const SIZE = 8;
const COLORS = CONFIG.COLOR_COUNT;
const colorsOf = (board) => board.map((row) => row.map((cell) => cell.color));
const idsOf = (board) => board.map((row) => row.map((cell) => cell.id));

/** 0/1 棋盘格填充 + 可选目标形状（与 board/match 测试同一套夹具约定）。 */
function fixture(paint) {
  const board = createBoard(SIZE, SIZE, COLORS);
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      board[r][c].color = (r + c) % 2;
    }
  }
  if (paint) paint(board);
  return board;
}

function paint(board, cells, color) {
  for (const [r, c] of cells) board[r][c].color = color;
}

/** 确定性随机源：循环取给定值（必须是 [0,1)，用于映射到颜色索引）。 */
function cycleRng(values) {
  let index = 0;
  return () => values[index++ % values.length];
}

/**
 * 确定性伪随机源（LCG），用于「不关心具体颜色、只要求随机性正常」的用例。
 * 有种子 ⇒ 同一 seed 必然复现；分布正常 ⇒ 级联会自然终止，
 * 不会像固定的 3 色循环那样每层整行同色、一路滚到层数上限。
 */
function seededRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * 每次调用返回一个**全新**的确定性随机源：循环取 0.05 / 0.4 / 0.9 → 颜色 0 / 2 / 5。
 * 必须每次新建：生成器有内部游标，跨用例复用会让用例之间互相影响；
 * 而直接把它当 rng 传入（返回函数对象）会让随机值变成 NaN → 颜色恒为 0 → 无限级联。
 * 只在「补位次数固定且很少、需要精确控制颜色」的用例里使用。
 */
const noCascadeRng = () => cycleRng([0.05, 0.4, 0.9]);

/** 级联夹具：第 1 列 5-7 行三连，清除后 (4,1)=5 落到 (7,1)，与 (7,0)/(7,2)=5 形成第二层匹配。 */
function cascadeFixture() {
  return fixture((b) => {
    paint(b, [[5, 1], [6, 1], [7, 1]], 2);
    paint(b, [[4, 1], [7, 0], [7, 2]], 5);
  });
}

test('applyGravity：空洞被压到底部，返回精确下落轨迹', () => {
  const board = fixture();
  board[3][0].color = null;
  board[5][0].color = null;
  const before = colorsOf(board).map((row) => row[0]);

  const moves = applyGravity(board);

  assertEqual(moves.length, 4, '位移记录数量');
  assertDeepEqual(
    colorsOf(board).map((row) => row[0]),
    [null, null, before[0], before[1], before[2], before[4], before[6], before[7]],
    '第 0 列布局（两个空洞沉到顶部）'
  );
  assertTrue(moves.some((m) => m.from.r === 4 && m.to.r === 5), '应记录 4→5 的位移');
  assertTrue(moves.every((m) => m.from.c === 0), '位移只发生在第 0 列');
  assertTrue(moves.every((m) => m.to.r > m.from.r), '下落方向只能是向下');
});

test('applyGravity：纯障碍格是屏障，不下落也不被穿越（3.4）', () => {
  const board = fixture();
  const snowId = board[4][0].id;
  board[4][0].color = null;
  board[4][0].obstacle = OBSTACLE_TYPE.SNOW;
  board[4][0].obstacleLayers = 3;
  board[6][0].color = null; // 屏障下方出现空洞

  const moves = applyGravity(board);

  assertEqual(board[4][0].id, snowId, '雪块本身没有移动');
  assertEqual(board[4][0].obstacle, OBSTACLE_TYPE.SNOW, '雪块仍在原格');
  assertEqual(moves.length, 1, '只有屏障下方的那一格位移');
  assertTrue(moves[0].from.r === 5 && moves[0].to.r === 6, `位移应是 5→6，实际 ${JSON.stringify(moves[0])}`);
  assertTrue(moves.every((m) => m.from.r > 4), '屏障上方的格子不得穿到屏障下方');
});

test('refillBoard：只填充空洞并返回新生成格子', () => {
  const board = fixture();
  board[0][0].color = null;
  board[1][3].color = null;
  board[7][7].color = null;
  const oldIds = board.flat().map((cell) => cell.id);

  const spawned = refillBoard(board, COLORS, cycleRng([0.1, 0.4, 0.9]));

  assertEqual(spawned.length, 3, '新生成格子数 = 空洞数');
  assertEqual(board.flat().filter((cell) => cell.color === null).length, 0, '不再残留空洞');
  assertTrue(spawned.every((cell) => Number.isInteger(cell.color)), '新格子都有颜色');
  assertTrue(spawned.every((cell) => !oldIds.includes(cell.id)), '新格子 id 不与旧格子重复');
});

test('无匹配的棋盘：resolveCascades 返回 0 层且棋盘完全不变', () => {
  const board = fixture();
  const beforeIds = idsOf(board);

  const result = resolveCascades(board, COLORS);

  assertEqual(result.cascades, 0, '级联层数');
  assertEqual(result.levels.length, 0, 'levels 长度');
  assertEqual(result.cleared.length, 0, '消除格数');
  assertFalse(result.capped, '不应触发层数上限');
  assertDeepEqual(idsOf(board), beforeIds, '棋盘未被改动');
});

test('完整流程：中部消除 → 上方下落 → 顶部生成新格子（验收项）', () => {
  // 第 4 行 0-2 列三连；清除后上方 4 格各下落 1 格，空洞出现在顶部并由新格子补齐
  const board = fixture((b) => paint(b, [[4, 0], [4, 1], [4, 2]], 2));

  const result = resolveCascades(board, COLORS, { rng: noCascadeRng() });

  assertEqual(result.cascades, 1, '受控随机源下应恰好 1 层');
  assertEqual(result.cleared.length, 3, '第 1 层消除 3 格');
  assertEqual(result.levels[0].moves.length, 12, '3 列 × 上方 4 格全部下落 1 格');
  assertEqual(result.levels[0].spawned.length, 3, '顶部生成 3 个新格子');
  assertTrue(
    result.levels[0].moves.every((m) => m.to.r - m.from.r === 1),
    '本次下落距离都是 1 格'
  );

  // 新格子必须落在顶部（第 0 行）——「顶部生成新格子」
  const spawnedIds = new Set(result.levels[0].spawned.map((cell) => cell.id));
  const spawnedRows = [];
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (spawnedIds.has(board[r][c].id)) spawnedRows.push(r);
    }
  }
  assertDeepEqual(spawnedRows.sort(), [0, 0, 0], '新格子都出现在第 0 行');

  // 结算后的不变量
  assertEqual(findMatches(board).length, 0, '最终棋盘无匹配');
  assertEqual(board.flat().filter((cell) => cell.color === null).length, 0, '最终棋盘无空洞');
});

test('下落造成的二层连消被识别，级联层数可追踪', () => {
  // 第 1 列 5-7 行先成三连；清除后上方 (4,1)=5 落到 (7,1)，
  // 与 (7,0)=5、(7,2)=5 形成第二层三连
  const board = cascadeFixture();

  const result = resolveCascades(board, COLORS, { rng: seededRng(20260919) });

  assertTrue(result.cascades >= 2, `至少应有 2 层级联，实际 ${result.cascades}`);
  assertFalse(result.capped, '正常随机源下不应触发层数上限');

  // 「下落填充后如再形成匹配，继续级联消除」：下落把 (4,1)=5 带到 (7,1)，
  // 它在**第 2 层或更晚**被识别为匹配的一部分（交换当下并不存在这一组）
  const fallLevel = result.levels.find(
    (level) =>
      level.level >= 2 &&
      level.groups.some((group) => group.cells.length >= 3 && group.cells.some((p) => p.r === 7 && p.c === 1))
  );
  assertTrue(Boolean(fallLevel), '下落对齐产生的 (7,0)(7,1)(7,2) 匹配应被识别');
  assertTrue(fallLevel.cleared.length >= 3, '该层至少消除 3 格');
  assertEqual(result.levels.length, result.cascades, 'levels 长度与级联层数一致');
  result.levels.forEach((level, index) => {
    assertEqual(level.level, index + 1, `第 ${index + 1} 层的层号`);
  });
});

test('每层不变量：无纯障碍时 spawned 数恒等于 cleared 数', () => {
  const board = cascadeFixture();

  const result = resolveCascades(board, COLORS, { rng: seededRng(7) });

  assertTrue(result.levels.length > 0, '夹具应产生至少 1 层');
  for (const level of result.levels) {
    assertEqual(level.spawned.length, level.cleared.length, `第 ${level.level} 层的补充数量`);
    assertTrue(result.cleared.length >= result.spawned.length, '总消除数不小于总生成数（障碍物不补充）');
  }
});

test('消除结束后：无匹配、无空洞、cell.id 全局唯一', () => {
  const board = cascadeFixture();

  const result = resolveCascades(board, COLORS, { rng: seededRng(42) });

  assertFalse(result.capped, '正常随机源下应自然收敛');
  assertEqual(findMatches(board).length, 0, '最终无匹配');
  assertEqual(board.flat().filter((cell) => cell.color === null).length, 0, '最终无空洞');
  const ids = new Set(board.flat().map((cell) => cell.id));
  assertEqual(ids.size, SIZE * SIZE, '唯一 id 数量');
});

test('相同随机序列下结果可复现（消除随机性后的确定性）', () => {
  const build = () => fixture((b) => paint(b, [[4, 0], [4, 1], [4, 2]], 2));
  const first = build();
  const second = build();

  resolveCascades(first, COLORS, { rng: noCascadeRng() });
  resolveCascades(second, COLORS, { rng: noCascadeRng() });

  assertDeepEqual(colorsOf(first), colorsOf(second), '两次运行的颜色布局一致');
});

test('随机源持续产生匹配时，级联被层数上限截断（不会无限循环）', () => {
  const board = createBoard(SIZE, SIZE, 3);
  for (const row of board) {
    for (const cell of row) cell.color = 0; // 整盘同色：每层都必定有匹配
  }

  const result = resolveCascades(board, 1, { rng: () => 0 });

  assertTrue(result.capped, '应触发层数上限');
  assertEqual(result.cascades, SIZE * SIZE, '上限 = 棋盘格数');
  assertEqual(result.cleared.length, SIZE * SIZE * SIZE * SIZE, '每层都清空整盘');
});

test('L 型 5 连：合并后只算 1 组 5 格，交叉点生成包装糖果（Step 8）', () => {
  const board = fixture((b) => paint(b, [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]], 2));

  const result = resolveCascades(board, COLORS, { rng: noCascadeRng() });
  const first = result.levels[0];

  assertEqual(first.groups.length, 1, '合并后应只算 1 组');
  assertEqual(first.groups[0].cells.length, 5, '横竖两段共享交叉点，去重后是 5 格（不是 6 格）');
  assertEqual(first.cleared.length, 4, '交叉点留下来变成包装糖果，本层只消除其余 4 格（Step 8 起）');
  // 同列的 (1,0)(2,0) 被消除后，幸存的交叉点被重力压到第 2 行
  assertEqual(first.board[2][0].type, CELL_TYPE.WRAPPED, '包装糖果留在第 0 列（下落后第 2 行）');
  assertTrue(first.moves.length > 0, '第 0 列出现空洞，需要下落');
});

test('纯障碍格不会被消除或替换（雪块保留）', () => {
  const board = fixture((b) => paint(b, [[3, 0], [3, 1], [3, 2]], 2));
  board[0][0].color = null;
  board[0][0].obstacle = OBSTACLE_TYPE.SNOW;
  board[0][0].obstacleLayers = 2;
  const snowId = board[0][0].id;

  const result = resolveCascades(board, COLORS, { rng: noCascadeRng() });

  assertEqual(board[0][0].id, snowId, '雪块 id 未变');
  assertEqual(board[0][0].obstacle, OBSTACLE_TYPE.SNOW, '雪块仍在');
  assertEqual(board[0][0].obstacleLayers, 2, '雪块层数未被改动');
  assertEqual(board[0][0].color, null, '雪块格内仍然没有动物');
  assertEqual(result.levels[0].cleared.length, 3, '第一层只消除了三连的 3 格');
});



// ---------------------------------------------------------------- Step 12.2：存档层容错（v1.16 的 storage.js）

test('storage：最高分与每关星级的读写、脏数据与不可用都会回落（不抛错）', async () => {
  const { createStorage } = await import('../storage.js');
  const logs = [];
  const memory = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (memory.has(k) ? memory.get(k) : null),
      setItem: (k, v) => memory.set(k, v)
    }
  };
  const storage = createStorage((level, message) => logs.push([level, message]));

  assertEqual(storage.readBestScore(), 0, '空存档 → 0');
  storage.writeBestScore(1234);
  assertEqual(storage.readBestScore(), 1234, '写入后可读回');

  memory.set(STORAGE_KEYS.BEST_SCORE, 'not-a-number');
  assertEqual(storage.readBestScore(), 0, '脏数据 → 0');

  assertDeepEqual(storage.readLevelStars(), {}, '空星级表');
  const stars = {};
  assertDeepEqual(storage.recordLevelStars(stars, 7, 2), { best: 2, updated: true }, '首次记录');
  assertDeepEqual(storage.recordLevelStars(stars, 7, 1), { best: 2, updated: false }, '更差成绩沿用旧纪录');
  assertDeepEqual(storage.readLevelStars(), { 7: 2 }, '落盘后可读回');
  memory.set(STORAGE_KEYS.LEVEL_STARS, '[1,2,3]');
  assertDeepEqual(storage.readLevelStars(), {}, '数组脏数据 → 空表');

  globalThis.window = { localStorage: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } };
  assertEqual(storage.readBestScore(), 0, 'localStorage 不可用 → 0');
  assertDeepEqual(storage.readLevelStars(), {}, 'localStorage 不可用 → 空表');
  assertTrue(logs.every(([level]) => level === 'warn'), '只记 warn，不抛错');
  delete globalThis.window;
});

if (!globalThis.__XXL_TEST_BUNDLE__) summarize();
