// tests/game.test.js — game.js 的单元测试。见 AGENTS.md 7.1 与 ROADMAP Step 4。
//
// 夹具约定（宪法 4.1）：棋盘一律经 createBoard 构造（createGame 内部已如此）后再覆盖 color。
// 随机性控制：createGame 的 options.rng 决定补充新格子的颜色（见 D016），
// 因此需要精确分数时注入确定性序列，不需要时用带种子的 LCG。

import {
  test,
  assertEqual,
  assertTrue,
  assertFalse,
  assertDeepEqual,
  summarize
} from './assert.js';
import { CONFIG, OBSTACLE_TYPE } from '../config.js';
import { createGame, getState, resolveBoard, trySwap } from '../game.js';
import { hasPossibleMove } from '../shuffle.js'; // Step 6.1：从 board.js 移到 shuffle.js
import { findMatches } from '../match.js';

const SIZE = CONFIG.BOARD_SIZE;
const SCORE = CONFIG.SCORE_CONFIG;
const idsOf = (board) => board.map((row) => row.map((cell) => cell.id));

/** 循环取给定值的确定性随机源（每次调用返回全新生成器，避免用例间串扰）。 */
function cycleRng(values) {
  let index = 0;
  return () => values[index++ % values.length];
}

/** 带种子的 LCG：分布正常，级联会自然收敛。 */
function seededRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** 把棋盘覆盖成 0/1 棋盘格，再按 paint 覆盖目标形状。 */
function paintFixture(board, paint) {
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      board[r][c].color = (r + c) % 2;
    }
  }
  if (paint) paint(board);
}

/**
 * 单层夹具：(4,0)(4,1) 已是色 2，(4,2)=1 且 (5,2)=2。
 * 交换 (4,2)↔(5,2) 后第 4 行形成 2,2,2 —— 清除后上方 4 格各下落 1 格，顶部补 3 格。
 * 配合 cycleRng([0.05,0.4,0.9])（补位色 0/2/5）恰好只有 1 层级联，故分数可直接断言。
 */
function singleLevelBoard(board) {
  paintFixture(board, (b) => {
    b[4][0].color = 2;
    b[4][1].color = 2;
    b[4][2].color = 1;
    b[5][2].color = 2;
  });
}

/** 死局夹具：任意相邻交换都不产生匹配（同 tests/board.test.js）。 */
function deadlockBoard(board) {
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      board[r][c].color = (r + 2 * c) % 3;
    }
  }
}

test('createGame：按关卡配置建局，棋盘无初始匹配且有可行交换', () => {
  const game = createGame({ steps: 20 });
  assertEqual(game.level.remainingSteps, 20, '剩余步数');
  assertEqual(game.level.currentScore, 0, '初始分数');
  assertFalse(game.gameOver, '未结束');
  assertEqual(game.board.length, SIZE, '行数');
  assertEqual(findMatches(game.board).length, 0, '无初始匹配');
  assertTrue(hasPossibleMove(game.board), '存在可行交换');
});

test('createGame：缺省字段回落到 CONFIG 的已登记键', () => {
  const game = createGame();
  assertEqual(game.level.rows, CONFIG.BOARD_SIZE, 'rows');
  assertEqual(game.level.cols, CONFIG.BOARD_SIZE, 'cols');
  assertEqual(game.level.colorCount, CONFIG.COLOR_COUNT, 'colorCount');
  assertEqual(game.level.steps, CONFIG.LEVEL_DEFAULTS.steps, 'steps');
  assertDeepEqual(game.level.starThresholds, CONFIG.LEVEL_DEFAULTS.starThresholds, 'starThresholds');
  assertEqual(game.level.goal.target, CONFIG.LEVEL_DEFAULTS.starThresholds[0], '默认分数目标取一星阈值');
});

test('trySwap：有效交换扣 1 步并结算分数（4.3.3）', () => {
  const game = createGame({ steps: 30, colorCount: CONFIG.COLOR_COUNT }, { rng: cycleRng([0.05, 0.4, 0.9]) });
  singleLevelBoard(game.board);

  const result = trySwap(game, { r: 4, c: 2 }, { r: 5, c: 2 });

  assertTrue(result.valid, '应判定为有效交换');
  assertEqual(result.cascades, 1, '受控随机源下恰好 1 层');
  assertEqual(result.scoreDelta, 3 * SCORE.basePerCell, '3 个动物 × 10 分，第 1 层无连消加分');
  assertEqual(game.level.currentScore, 3 * SCORE.basePerCell, '分数已累计到关卡状态');
  assertEqual(result.stepsLeft, 29, '扣 1 步');
  assertFalse(result.gameOver, '还有步数');
  assertEqual(findMatches(game.board).length, 0, '结算后棋盘不残留匹配');
  assertTrue(Array.isArray(result.afterSwap) || result.afterSwap !== null, '应返回交换后快照供回放');
});

test('trySwap：无效交换回退、不扣步数、棋盘逐格不变（4.3.2）', () => {
  const game = createGame({ steps: 30 });
  deadlockBoard(game.board);
  const before = idsOf(game.board);

  const result = trySwap(game, { r: 0, c: 0 }, { r: 0, c: 1 });

  assertFalse(result.valid, '死局棋盘上的交换无效');
  assertEqual(result.scoreDelta, 0, '不加分');
  assertEqual(result.stepsLeft, 30, '不扣步数');
  assertEqual(game.level.remainingSteps, 30, '关卡步数未变');
  assertDeepEqual(idsOf(game.board), before, '棋盘恢复原状');
  assertEqual(result.resolve, null, '无效交换没有结算产物');
});

test('trySwap：非相邻、越界、不可移动的格子一律无效且不扣步数', () => {
  const game = createGame({ steps: 30 });
  const stepsBefore = game.level.remainingSteps;

  assertFalse(trySwap(game, { r: 0, c: 0 }, { r: 2, c: 0 }).valid, '非相邻（隔一格）');
  assertFalse(trySwap(game, { r: 0, c: 0 }, { r: 0, c: 0 }).valid, '同一格');
  assertFalse(trySwap(game, { r: 0, c: 0 }, { r: -1, c: 0 }).valid, '越界');

  game.board[3][3].obstacle = OBSTACLE_TYPE.VINE; // 3.4：藤蔓中的动物不能移动
  assertFalse(trySwap(game, { r: 3, c: 3 }, { r: 3, c: 4 }).valid, '藤蔓格');

  assertEqual(game.level.remainingSteps, stepsBefore, '步数始终未变');
});

test('trySwap：步数用尽 → gameOver，之后不再接受任何交换', () => {
  const game = createGame({ steps: 1 }, { rng: cycleRng([0.05, 0.4, 0.9]) });
  singleLevelBoard(game.board);

  const result = trySwap(game, { r: 4, c: 2 }, { r: 5, c: 2 });
  assertTrue(result.valid, '最后一次有效交换');
  assertEqual(result.stepsLeft, 0, '步数归零');
  assertTrue(result.gameOver, '进入结束状态');
  assertTrue(getState(game).gameOver, '快照反映结束状态');

  const boardAfter = idsOf(game.board);
  const late = trySwap(game, { r: 0, c: 0 }, { r: 0, c: 1 });
  assertFalse(late.valid, '结束后拒绝交换');
  assertEqual(late.stepsLeft, 0, '步数保持 0');
  assertDeepEqual(idsOf(game.board), boardAfter, '结束后棋盘不再变化');
});

test('resolveBoard：计分与 3.5 一致，并给出可逐层核对的明细', () => {
  // 注意：0/1 棋盘格里第 0、2 列图案完全相同，第 1 列下移后会整行对齐，
  // 因此这个夹具的第 2 层天然是十几格（与随机源无关）；下面只对**可控**的第 1 层
  // 以及「各层都服从 3.5 公式」做断言，具体数值由固定种子锁定，可复现。
  const game = createGame({ steps: 30 }, { rng: seededRng(20260919) });
  // 预置：第 1 列 5-7 行三连；清除后 (4,1)=5 落到 (7,1)，与 (7,0)/(7,2)=5 形成第 2 层
  paintFixture(game.board, (b) => {
    b[5][1].color = 2;
    b[6][1].color = 2;
    b[7][1].color = 2;
    b[4][1].color = 5;
    b[7][0].color = 5;
    b[7][2].color = 5;
  });

  const result = resolveBoard(game);

  assertFalse(result.capped, '正常随机源下应自然收敛');
  assertTrue(result.levels.length >= 2, `应至少 2 层级联，实际 ${result.levels.length}`);
  assertEqual(result.levels.length, result.levelScores.length, '逐层明细数量');

  // 第 1 层是可控的：清掉预置的竖三连，基础分 30、无连消加分
  assertEqual(result.levelScores[0].base, 3 * SCORE.basePerCell, '第 1 层基础分');
  assertEqual(result.levelScores[0].bonus, 0, '第 1 层不计连消');
  assertEqual(result.levelScores[0].gained, 30, '第 1 层得分');
  // 第 2 层：下落对齐形成的匹配，带 30 分连消加分（层数由固定种子锁定）
  assertEqual(result.levelScores[1].bonus, SCORE.cascadeStep, '第 2 层连消 +30');
  assertTrue(result.levelScores[1].base > 0, '第 2 层有基础分');

  // 逐层与 3.5 的公式核对（对任意层数成立）
  result.levels.forEach((level, index) => {
    const detail = result.levelScores[index];
    assertEqual(detail.level, level.level, '层号对应');
    assertEqual(detail.base, level.cleared.length * SCORE.basePerCell, `第 ${level.level} 层基础分`);
    assertEqual(detail.bonus, (level.level - 1) * SCORE.cascadeStep, `第 ${level.level} 层连消加分`);
    assertEqual(detail.multiplier, 1, `第 ${level.level} 层倍数（Step 4 无特殊元素）`);
    assertEqual(detail.gained, detail.base * detail.multiplier + detail.bonus, `第 ${level.level} 层得分`);
  });

  const total = result.levelScores.reduce((sum, detail) => sum + detail.gained, 0);
  assertEqual(result.scoreDelta, total, '总得分 = 各层之和');
  assertEqual(game.level.currentScore, total, '分数已记入关卡状态');
});

test('getState：返回不可变快照，与内部状态互相隔离', () => {
  const game = createGame({ steps: 30 });
  const snapshot = getState(game);

  assertTrue(Object.isFrozen(snapshot), '快照被冻结');
  assertTrue(Object.isFrozen(snapshot.board), '棋盘数组被冻结');
  assertTrue(Object.isFrozen(snapshot.board[0]), '棋盘行被冻结');
  assertTrue(Object.isFrozen(snapshot.board[0][0]), '格子被冻结');
  assertEqual(snapshot.remainingSteps, 30, '剩余步数');
  assertEqual(snapshot.totalSteps, 30, '总步数');
  assertEqual(snapshot.currentScore, 0, '分数');

  const firstId = snapshot.board[0][0].id;
  assertFalse(snapshot.board[0][0] === game.board[0][0], '快照持有的是副本而非内部对象');

  // 内部状态变化后，旧快照不受影响（快照语义而非实时视图）
  game.board[0][0].color = 99;
  game.level.remainingSteps = 5;
  assertEqual(snapshot.board[0][0].id, firstId, '旧快照的格子未被改写');
  assertEqual(snapshot.remainingSteps, 30, '旧快照的步数未被改写');
  assertEqual(getState(game).remainingSteps, 5, '新快照反映最新状态');
});

if (!globalThis.__XXL_TEST_BUNDLE__) summarize();
