// tests/settlement.test.js — settlement.js 的单元测试（Step 20，v1.25）。
// 见 AGENTS.md 7.1 / 2.3 / 3.5 / 3.6 第 7 条。
//
// 覆盖四组性质（都是可在 Node 里逐项判定的，不依赖浏览器）：
//   ① 受控伪随机：固定种子 → 同一串数（可复现、可巡检）；
//   ② 转化：只落在朴素动物格上、数量 = min(剩余步数, 可用格数)、类型都在登记表内；
//   ③ 引爆顺序：从棋盘底部到顶部；
//   ④ 端到端：通关时剩余步数真的进入结算阶段，且结算发生在玩家最后一手之后。

import { test, assertEqual, assertTrue, assertFalse, assertDeepEqual, summarize } from './assert.js';
import { CELL_TYPE, COLLECTIBLE_TYPE, CONFIG, GOAL_TYPE, OBSTACLE_TYPE } from '../config.js';
import { createBoard } from '../board.js';
import { createGame, getState, trySwap } from '../game.js';
import {
  conversionCells,
  conversionPlan,
  detonationOrder,
  estimateSettlementScore,
  findCellById,
  mulberry32,
  settlementRngFor,
  settlementStepsScore,
  stepScoreRatio
} from '../settlement.js';

const SETTLE = CONFIG.SETTLEMENT_CONFIG;

/** 测试夹具：棋盘一律经 createBoard 构造（4.1 约束：不得直接构造裸数组传入逻辑函数）。 */
function fixture(paint) {
  const board = createBoard(8, 8, 5, [], []);
  if (paint) paint(board);
  return board;
}

const specialsOf = (board) => board.flat().filter((cell) => cell.type !== CELL_TYPE.NORMAL);
const keysOf = (list) => list.map((item) => `${item.r},${item.c}`).sort().join(' ');

test('mulberry32：同种子同序列、异种子异序列（受控伪随机的基础）', () => {
  const a = mulberry32(12345);
  const b = mulberry32(12345);
  const c = mulberry32(12346);
  const seqA = [a(), a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b(), b()];
  const seqC = [c(), c(), c(), c(), c()];
  assertDeepEqual(seqA, seqB, '同种子给出同一串数');
  assertFalse(keysOf([]) === undefined && seqA.join() === seqC.join(), '异种子给出不同的串（第 5 位之前）');
  assertTrue(seqA.every((v) => v >= 0 && v < 1), `取值都在 [0,1)：${seqA.join(',')}`);
});

test('settlementRngFor：种子随关卡变化（同一关每次结算完全一致）', () => {
  const run = (seed) => {
    const rnd = mulberry32(seed);
    return [rnd(), rnd(), rnd()].join(',');
  };
  assertEqual(run(SETTLE.seed + 3), run(SETTLE.seed + 3), '同一关：同结果');
  assertFalse(run(SETTLE.seed + 3) === run(SETTLE.seed + 4), '不同关：不同结果');
  assertEqual(typeof settlementRngFor(7), 'function', '返回可调用的随机源');
  assertEqual(settlementRngFor(7)(), settlementRngFor(7)(), '同一关的两次构造给出同一串（首个数相同）');
});

test('conversionCells：只接受「朴素动物格」，障碍物/收集物/特效/空格一律排除', () => {
  const board = fixture((b) => {
    b[0][0].obstacle = OBSTACLE_TYPE.ICE;          // 覆层障碍（冰里有动物）也排除
    b[0][0].obstacleLayers = 1;
    b[0][1].obstacle = OBSTACLE_TYPE.VINE;
    b[0][1].obstacleLayers = 1;
    b[0][2].obstacle = OBSTACLE_TYPE.SNOW;         // 占格障碍：格内本来就没有动物
    b[0][2].obstacleLayers = 1;
    b[0][2].color = null;
    b[0][3].collectible = COLLECTIBLE_TYPE.FRUIT;  // 收集物：不可消除、不参与匹配
    b[0][3].color = null;
    b[0][4].type = CELL_TYPE.STRIPED;              // 已经是特效
    b[0][4].direction = 'h';
    b[1][0].color = null;                          // 空格
  });

  const cells = conversionCells(board);
  const excluded = ['0,0', '0,1', '0,2', '0,3', '0,4', '1,0'];
  assertTrue(excluded.every((key) => !keysOf(cells).includes(key)), `被排除的格子确实不在候选里：${keysOf(cells).slice(0, 40)}`);
  assertEqual(cells.length, 64 - excluded.length, '候选数 = 64 − 6');
  assertTrue(cells.every((pos) => board[pos.r][pos.c].color !== null), '候选格都有动物');
});

test('conversionPlan：数量 = min(剩余步数, 可用格数)，落点不重复且都在候选里', () => {
  const board = fixture();
  const plan = conversionPlan(board, 5, settlementRngFor(1));
  assertEqual(plan.length, 5, '5 个剩余步 → 5 颗特殊糖果');
  assertEqual(new Set(keysOf(plan).split(' ')).size, 5, '落点互不重复');
  const allowed = new Set(keysOf(conversionCells(board)).split(' '));
  assertTrue(plan.every((item) => allowed.has(`${item.r},${item.c}`)), '落点都在候选集合里');
  assertEqual(conversionPlan(board, 0, settlementRngFor(1)).length, 0, '0 步 → 不转化');
  assertEqual(conversionPlan(board, 999, settlementRngFor(1)).length, 64, '步数超过可用格数时夹到可用格数');
  assertEqual(keysOf(plan).length > 0 && plan.every((item) => item.type !== CELL_TYPE.NORMAL), true, '转出来的都是特效');
  assertTrue(
    plan.every((item) => (item.type === CELL_TYPE.STRIPED ? item.direction === 'h' || item.direction === 'v' : item.direction === null)),
    '条纹带方向，包装/魔力鸟不带方向'
  );
});

test('conversionPlan：同种子同棋盘 → 完全一致（结算可复现）', () => {
  const first = conversionPlan(fixture(), 12, settlementRngFor(9));
  const second = conversionPlan(fixture(), 12, settlementRngFor(9));
  assertDeepEqual(second, first, '同一关 + 同一步数 → 同一张转化表');
  const other = conversionPlan(fixture(), 12, settlementRngFor(10));
  assertFalse(JSON.stringify(other) === JSON.stringify(first), '换一关 → 转化表不同');
});

test('conversionPlan：四种形态都会出现，且条纹的横/竖方向都按权重被抽到', () => {
  const seen = new Set();
  for (const id of [1, 2, 3, 4, 5]) {
    for (const item of conversionPlan(fixture(), 64, settlementRngFor(id))) {
      seen.add(item.direction ? `${item.type}-${item.direction}` : item.type);
    }
  }
  const keys = SETTLE.specialWeights;
  assertTrue(keys.stripedH > 0 && keys.stripedV > 0 && keys.wrapped > 0 && keys.magic > 0, '权重表四种形态都为正');
  for (const shape of ['striped-h', 'striped-v', 'wrapped', 'magic']) {
    assertTrue(seen.has(shape), `抽到了 ${shape}（权重表登记的形态）`);
  }
});

test('detonationOrder：从棋盘底部到顶部，只列特殊糖果', () => {
  const board = fixture((b) => {
    b[7][7].type = CELL_TYPE.STRIPED; b[7][7].direction = 'v';
    b[7][1].type = CELL_TYPE.WRAPPED;               // 同一行：c 升序
    b[0][0].type = CELL_TYPE.MAGIC;                 // 最顶上一行最后爆
    b[3][5].type = CELL_TYPE.STRIPED; b[3][5].direction = 'h';
  });

  const order = detonationOrder(board);
  assertDeepEqual(order, [{ r: 7, c: 1 }, { r: 7, c: 7 }, { r: 3, c: 5 }, { r: 0, c: 0 }], '底 → 顶，行内 c 升序');
  for (let i = 1; i < order.length; i += 1) {
    assertTrue(order[i - 1].r >= order[i].r, `第 ${i} 项不低于上一行（从底部到顶部）`);
  }
  assertEqual(detonationOrder(fixture()).length, 0, '没有特殊糖果时队列为空');
});

test('findCellById：按 id 找到格子的当前位置（引爆期间格子会随重力移动）', () => {
  const board = fixture();
  const id = board[5][3].id;
  assertDeepEqual(findCellById(board, id), { r: 5, c: 3 }, '找得到');
  assertEqual(findCellById(board, -1), null, '找不到时返回 null');
});

test('estimateSettlementScore：时间关（0 步）没有结算修正，余步越多修正越大', () => {
  assertEqual(estimateSettlementScore(5000, 0), 0, '时间关没有步数 → 没有结算奖励');
  assertEqual(estimateSettlementScore(5000, 1), 0, '只有 1 步时余步上限为 0');
  assertEqual(estimateSettlementScore(0, 30), 0, '基准分为 0 → 0');
  const mid = estimateSettlementScore(5000, 20);
  const high = estimateSettlementScore(5000, 34);
  assertTrue(mid > 0 && high >= mid, `步数预算更多 → 期望分不少于：${mid} → ${high}`);
  assertEqual(
    estimateSettlementScore(5000, 30),
    settlementStepsScore(Math.round(30 * SETTLE.typicalRemainingRatio), 5000),
    '期望分 = 典型余步（步数 × typicalRemainingRatio）的递增奖励分'
  );
  assertTrue(stepScoreRatio(1) > 0 && stepScoreRatio(1) < stepScoreRatio(6), '递增制：第 6 步高于第 1 步');
});

// ---------------------------------------------------------------- 端到端

/** 夹具：棋盘底为无三连的棋盘格，再把第 4 行铺成「交换 (4,2)↔(5,2) 即三连」。
 *  （与 tests/game.test.js 的 singleLevelBoard 同族，只是底色改成确定性棋盘格。） */
function paintWinningBoard(game) {
  const b = game.board;
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      b[r][c].color = (r + c) % 2;
      b[r][c].type = CELL_TYPE.NORMAL;
      b[r][c].direction = null;
      b[r][c].obstacle = null;
      b[r][c].obstacleLayers = 0;
      b[r][c].collectible = null;
    }
  }
  b[4][0].color = 2;
  b[4][1].color = 2;
  b[4][2].color = 1;
  b[5][2].color = 2;
}

/** 确定性补位随机源（与 tests/game.test.js 的 cycleRng 同构）：补位色 0/2/5 轮流，避免单色爆炸。 */
function cycleRng(values) {
  let index = 0;
  return () => values[index++ % values.length];
}

function winningGame(target = 30, steps = 30) {
  const game = createGame(
    { steps, goal: { type: GOAL_TYPE.SCORE, target }, starThresholds: [30, 5000, 9000] },
    { rng: cycleRng([0.05, 0.4, 0.9]) }
  );
  paintWinningBoard(game);
  return game;
}

test('端到端：通关时剩余步数进入结算阶段，且结算排在玩家最后一手之后', () => {
  const game = winningGame();
  const result = trySwap(game, { r: 4, c: 2 }, { r: 5, c: 2 });

  assertTrue(result.valid && game.level.completed, '这一手就达成目标');
  assertTrue(game.gameOver, '通关即结束');
  const settlement = result.resolve.settlement;
  assertTrue(Boolean(settlement), 'resolve 带回结算阶段');
  assertEqual(settlement.steps, result.stepsLeft, '结算阶段拿到的就是当前的剩余步数');
  assertEqual(settlement.converted.length, settlement.steps, '每个剩余步转化一颗特殊糖果');
  assertEqual(settlement.detonations > 0, true, '发生了连锁引爆');
  assertTrue(settlement.atIndex >= 1, '结算批次排在玩家最后一手之后（atIndex ≥ 1）');
  assertTrue(result.resolve.levels.length >= settlement.atIndex, 'levels 覆盖到引爆批次');
  assertEqual(specialsOf(game.board).length, 0, '结算结束后盘面无特殊糖果');
  assertTrue(
    settlement.converted.every((item) => item.type !== CELL_TYPE.NORMAL),
    '转化明细里都是特效'
  );
  assertTrue(getState(game).currentScore > 30, '最终分数含结算奖励分与引爆分');
});

test('端到端：未通关而步数用尽时不转化（没有余步），但盘面上的特殊糖果照样引爆', () => {
  const game = winningGame(999999, 1);
  game.board[7][7].type = CELL_TYPE.STRIPED;
  game.board[7][7].direction = 'v';

  const result = trySwap(game, { r: 4, c: 2 }, { r: 5, c: 2 });

  assertFalse(game.level.completed, '目标未达成');
  assertEqual(result.stepsLeft, 0, '步数用尽');
  const settlement = result.resolve.settlement;
  assertTrue(Boolean(settlement), '仍然进入结算阶段（3.6 第 7 条要求引爆盘面上的特殊糖果）');
  assertEqual(settlement.steps, 0, '没有余步可转化');
  assertEqual(settlement.stepScore, 0, '没有余步 → 奖励分为 0');
  assertEqual(settlement.converted.length, 0, '没有余步 → 不转化');
  assertTrue(settlement.detonations >= 1, '但盘面上的特殊糖果被引爆了');
  assertEqual(specialsOf(game.board).length, 0, '引爆后盘面无特殊糖果');
});

if (!globalThis.__XXL_TEST_BUNDLE__) await summarize();
