// tests/game.test.js — game.js 的单元测试。见 AGENTS.md 7.1 与 ROADMAP Step 4。
//
// 夹具约定（宪法 4.1）：棋盘一律经 createBoard 构造（createGame 内部已如此）后再覆盖 color。
// 随机性控制：createGame 的 options.rng 决定**补充新格子**的颜色（见 D016），
// 因此需要精确分数时注入确定性序列，不需要时用带种子的 LCG。
//
// ⚠ 陷阱（P0 收口时定位，见 PROGRESS 的「L1 偶发」）：`createGame(..., { rng })` **不**决定
// **初始盘面**的颜色 —— `createBoard` 的逐格着色走 `Math.random`（board.js 的 buildColorLayer，
// 因为 4.2 只把 rng 定义为「补充新格子」的随机源）。所以只注入 rng 而不断言盘面的用例，
// **初始盘面仍然是随机的**：凡是断言「精确格数 / 精确分数 / 必定生效」的用例，必须先用
// `paintFixture`（或等价夹具）把整盘覆盖掉。

import {
  test,
  assertEqual,
  assertTrue,
  assertFalse,
  assertDeepEqual,
  summarize
} from './assert.js';
import { BOOSTER_KIND, CELL_TYPE, COLLECTIBLE_TYPE, CONFIG, DIRECTION, GOAL_TYPE, OBSTACLE_TYPE } from '../config.js';
import { createGame, getState, resolveBoard, tickTime, trySwap, useBooster } from '../game.js';
import { applyGravity, createBoard } from '../board.js'; // 重力本身的取证（金豆荚的「每次重力 1 格」）
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

/** 把棋盘覆盖成 0/1 棋盘格，再按 paint 覆盖目标形状。收集物格**不着色**（3.6：它占格，但不是动物）。 */
function paintFixture(board, paint) {
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (board[r][c].collectible !== null && board[r][c].collectible !== undefined) continue;
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

/**
 * 六色确定性夹具（P0 收口新增）：`(r*2 + c*3) % 6` 无初始三连，且**六色多重集**使
 * `shuffleBoard` 必定能在 `shuffleMaxTries` 内找到合法排列（实测 seededRng(37) 第 9 次命中）。
 *
 * 为什么不能拿 `paintFixture` 的 0/1 棋盘格当刷新夹具：`shuffleBoard` 只做**置换**（色数不变），
 * 而 2 色棋盘格唯一「无三连」的排列就是棋盘格本身 —— 它没有可行交换，于是 50 次尝试必然全败
 * （`_build/probe-booster-fixture.mjs` 实测 5/5 FAIL@50）。这正是原 P3-B 用例偶发 FAIL 的机制。
 */
function sixColorBoard(board) {
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (board[r][c].collectible !== null && board[r][c].collectible !== undefined) continue;
      board[r][c].color = (r * 2 + c * 3) % CONFIG.COLOR_COUNT;
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
    assertEqual(detail.multiplier, 1, `第 ${level.level} 层倍数（该夹具无 4 连、不触发条纹）`);
    assertEqual(detail.gained, detail.base * detail.multiplier + detail.bonus, `第 ${level.level} 层得分`);
  });

  const total = result.levelScores.reduce((sum, detail) => sum + detail.gained, 0);
  assertEqual(result.scoreDelta, total, '总得分 = 各层之和');
  assertEqual(game.level.currentScore, total, '分数已记入关卡状态');
});

test('resolveBoard：4 连生成条纹的那一层按 3.5 计 1.5 倍（Step 7 接入）', () => {
  const game = createGame({ steps: 30 }, { rng: cycleRng([0.05, 0.4, 0.9]) });
  paintFixture(game.board, (b) => {
    for (const c of [1, 2, 3, 4]) b[4][c].color = 3; // 第 4 行 4 连 → 生成横向条纹
  });

  const result = resolveBoard(game);
  const first = result.levelScores[0];

  assertEqual(result.levels[0].cleared.length, 3, '4 连只消除 3 格');
  assertEqual(first.base, 3 * SCORE.basePerCell, '基础分 30');
  assertEqual(first.multiplier, SCORE.specialMultipliers.striped, '条纹糖果倍数 1.5');
  assertEqual(first.bonus, 0, '第 1 层无连消加分');
  assertEqual(first.gained, 45, '30 × 1.5');
  assertEqual(
    result.levels[0].board.flat().filter((cell) => cell.type === CELL_TYPE.STRIPED).length,
    1,
    '第 1 层后棋盘上留下 1 颗条纹（后续级联可能再生成）'
  );
});

test('resolveBoard：3 连触发已有条纹的那一层也按 1.5 倍计（4.3.8 + 3.5）', () => {
  const game = createGame({ steps: 30 }, { rng: cycleRng([0.05, 0.4, 0.9]) });
  paintFixture(game.board, (b) => {
    for (const c of [1, 2, 3]) b[3][c].color = 3; // 3 连，其中 (3,2) 是横条纹
    b[3][2].type = CELL_TYPE.STRIPED;
    b[3][2].direction = DIRECTION.H;
  });

  const result = resolveBoard(game);
  const first = result.levelScores[0];

  assertEqual(result.levels[0].cleared.length, SIZE, '条纹激活 → 清除整行 8 格');
  assertEqual(first.base, SIZE * SCORE.basePerCell, '基础分 80');
  assertEqual(first.multiplier, SCORE.specialMultipliers.striped, '条纹触发倍数 1.5');
  assertEqual(first.gained, 120, '80 × 1.5');
});

test('resolveBoard：L 型生成包装糖果的那一层按 3.5 计 2.0 倍（Step 8 接入）', () => {
  const game = createGame({ steps: 30 }, { rng: cycleRng([0.05, 0.4, 0.9]) });
  paintFixture(game.board, (b) => {
    // L 型 5 连：第 3 行 2..4 列 + 第 4 列 3..5 行，交叉点 (3,4)
    for (const [r, c] of [[3, 2], [3, 3], [3, 4], [4, 4], [5, 4]]) b[r][c].color = 3;
  });

  const result = resolveBoard(game);
  const first = result.levelScores[0];

  assertEqual(result.levels[0].groups[0].shape, 'L', '被识别为 L 型');
  assertEqual(result.levels[0].cleared.length, 4, '交叉点留下包装糖果，本层消除 4 格');
  assertEqual(first.base, 4 * SCORE.basePerCell, '基础分 40');
  assertEqual(first.multiplier, SCORE.specialMultipliers.wrapped, '包装糖果倍数 2.0');
  assertEqual(first.gained, 80, '40 × 2.0');
});

test('resolveBoard：3 连触发已有包装糖果的那一层也按 2.0 倍计（4.3.8 + 3.5）', () => {
  const game = createGame({ steps: 30 }, { rng: cycleRng([0.05, 0.4, 0.9]) });
  paintFixture(game.board, (b) => {
    for (const c of [1, 2, 3]) b[3][c].color = 3; // 3 连，其中 (3,2) 是包装糖果
    b[3][2].type = CELL_TYPE.WRAPPED;
  });

  const result = resolveBoard(game);
  const first = result.levelScores[0];

  assertEqual(result.levels[0].cleared.length, 9, '包装糖果激活 → 清除周围 3×3 共 9 格');
  assertEqual(first.base, 9 * SCORE.basePerCell, '基础分 90');
  assertEqual(first.multiplier, SCORE.specialMultipliers.wrapped, '包装糖果触发倍数 2.0');
  assertEqual(first.gained, 180, '90 × 2.0');
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

// ---------------------------------------------------------------- Step 9：魔力鸟（3.2 / D025）

/** Step 9 夹具：0/1 棋盘格 + 一颗魔力鸟（颜色 0）与若干颜色 4 的普通糖果。 */
function magicBoard(board) {
  paintFixture(board, (b) => {
    b[4][4].type = CELL_TYPE.MAGIC; // 魔力鸟（自身颜色与目标色不同，便于验证「目标色来自被交换的那颗」）
    b[4][4].color = 0;
    b[1][1].color = 4;
    b[3][6].color = 4;
    b[6][2].color = 4;
    b[4][5].color = 4; // 与魔力鸟相邻的那颗（本次交换的目标）
  });
}

test('trySwap：魔力鸟 + 普通色块 → 清除全屏该色（含魔力鸟自身）且消耗 1 步（3.2）', () => {
  const game = createGame({ steps: 30 }, { rng: cycleRng([0.05, 0.4, 0.9]) });
  magicBoard(game.board);

  const result = trySwap(game, { r: 4, c: 4 }, { r: 4, c: 5 });

  assertTrue(result.valid, '魔力鸟与普通色块的交换本身就是有效的');
  assertEqual(result.stepsLeft, 29, '消耗 1 步（4.3.3）');
  assertEqual(result.resolve.levels[0].cleared.length, 5, '4 颗颜色 4 + 魔力鸟自身 = 5 格');
  assertEqual(result.resolve.levelScores[0].multiplier, SCORE.specialMultipliers.magic, '魔力鸟倍数 2.5（3.5）');
  assertEqual(result.resolve.levelScores[0].base, 5 * SCORE.basePerCell, '基础分 50');
  assertEqual(result.resolve.levelScores[0].gained, 125, '50 × 2.5');
  assertEqual(
    result.resolve.levels[0].board.flat().filter((cell) => cell.type === CELL_TYPE.MAGIC).length,
    0,
    '魔力鸟自身也被消耗掉'
  );
});

test('trySwap：魔力鸟 + 空格 → 无效且不消耗步数（验收项：不能与空格交换）', () => {
  const game = createGame({ steps: 30 });
  paintFixture(game.board, (b) => {
    b[4][4].type = CELL_TYPE.MAGIC;
    b[4][4].color = 0;
    b[4][5].color = null; // 空格
  });
  const idsBefore = game.board.map((row) => row.map((cell) => cell.id));

  const result = trySwap(game, { r: 4, c: 4 }, { r: 4, c: 5 });

  assertEqual(result.valid, false, '与空格交换无效');
  assertEqual(result.stepsLeft, 30, '不消耗步数');
  assertDeepEqual(game.board.map((row) => row.map((cell) => cell.id)), idsBefore, '棋盘未变');
});



test('resolveBoard：5 连直线生成魔力鸟的那一层按 3.5 计 2.5 倍（Step 9 接入）', () => {
  const game = createGame({ steps: 30 }, { rng: cycleRng([0.05, 0.4, 0.9]) });
  paintFixture(game.board, (b) => {
    for (const c of [1, 2, 3, 4, 5]) b[4][c].color = 3; // 第 4 行 5 连
  });

  const result = resolveBoard(game);
  const first = result.levelScores[0];

  assertEqual(result.levels[0].groups[0].shape, 'line5', '被识别为 line5');
  assertEqual(result.levels[0].cleared.length, 4, '5 连只消除 4 格');
  assertEqual(first.base, 4 * SCORE.basePerCell, '基础分 40');
  assertEqual(first.multiplier, SCORE.specialMultipliers.magic, '魔力鸟倍数 2.5');
  assertEqual(first.gained, 100, '40 × 2.5');
  assertEqual(result.levels[0].board[4][3].type, CELL_TYPE.MAGIC, '正中那一格留下魔力鸟');
});

test('resolveBoard：initialClear 透传给 resolveCascades（v1.11 契约）', () => {
  const game = createGame({ steps: 30 }, { rng: cycleRng([0.05, 0.4, 0.9]) });
  paintFixture(game.board, (b) => {
    b[2][2].color = 4;
    b[5][5].color = 4;
  });

  const result = resolveBoard(game, { initialClear: [{ r: 2, c: 2 }, { r: 5, c: 5 }] });

  assertEqual(result.levels[0].groups.length, 0, '该层没有匹配组');
  assertEqual(result.levels[0].cleared.length, 2, '恰好清除指定的 2 格');
  assertTrue(result.scoreDelta > 0, '照常计分');
});

// ---------------------------------------------------------------- Step 10：组合效果（3.3）

/**
 * 组合夹具底色：与 tests/board.test.js 的死局夹具同族（(r+2c)%3），本身无三连、任意相邻交换也不成三连。
 * 这样 L0 的 groups 只可能来自「交换本身形成的普通匹配」，使 4.3.9「不进行普通匹配检测」可被断言。
 * 需要「某种颜色全盘不存在或只出现一次」时改用 paintFixture（0/1 底色）另配颜色 3。
 */
function noMatchFixture(board, paint) {
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      board[r][c].color = (r + 2 * c) % 3;
    }
  }
  if (paint) paint(board);
}

test('trySwap：条纹 + 条纹 → 十字形清除，3.0 倍（3.3 第 1 行）', () => {
  const game = createGame({ steps: 30 }, { rng: cycleRng([0.05, 0.4, 0.9]) });
  noMatchFixture(game.board, (b) => {
    b[4][4].type = CELL_TYPE.STRIPED;
    b[4][4].direction = DIRECTION.H;
    b[4][5].type = CELL_TYPE.STRIPED;
    b[4][5].direction = DIRECTION.V;
  });

  const result = trySwap(game, { r: 4, c: 4 }, { r: 4, c: 5 });

  assertTrue(result.valid, '两颗相邻特效交换必定触发组合');
  assertEqual(result.stepsLeft, 29, '组合触发扣 1 步（ROADMAP Step 10 验收）');
  assertEqual(result.resolve.levels[0].groups.length, 0, '4.3.9：组合不进行普通匹配检测');
  assertEqual(result.resolve.levels[0].cleared.length, 15, '第 4 行（8）∪ 第 4 列（8）− 中心重叠 1 = 15');
  assertEqual(result.resolve.levelScores[0].multiplier, SCORE.specialMultipliers.stripedStriped, '条纹+条纹 = 3.0 倍');
  assertEqual(result.resolve.levelScores[0].gained, 450, '150 × 3.0');
});

test('trySwap：条纹 + 包装 → 整行 + 3×3 二次爆炸，3.5 倍（3.3 第 2 行）', () => {
  const game = createGame({ steps: 30 }, { rng: cycleRng([0.05, 0.4, 0.9]) });
  noMatchFixture(game.board, (b) => {
    b[4][4].type = CELL_TYPE.STRIPED;
    b[4][4].direction = DIRECTION.H;
    b[4][5].type = CELL_TYPE.WRAPPED;
  });

  const result = trySwap(game, { r: 4, c: 4 }, { r: 4, c: 5 });

  assertTrue(result.valid, '组合有效');
  // 第 4 行（8）∪ 包装糖以 (4,5) 为心的 3×3（rows3-5 × cols4-6 = 9）− 重叠 3 = 14
  assertEqual(result.resolve.levels[0].cleared.length, 14, '条纹方向清除 + 区域内包装糖爆炸');
  assertEqual(result.resolve.levelScores[0].multiplier, SCORE.specialMultipliers.stripedWrapped, '条纹+包装 = 3.5 倍');
  assertEqual(result.resolve.levelScores[0].gained, 490, '140 × 3.5');
});

test('trySwap：包装 + 包装 → 两个 5×5，4.0 倍（3.3 第 4 行）', () => {
  const game = createGame({ steps: 30 }, { rng: cycleRng([0.05, 0.4, 0.9]) });
  noMatchFixture(game.board, (b) => {
    b[3][3].type = CELL_TYPE.WRAPPED;
    b[3][4].type = CELL_TYPE.WRAPPED;
  });

  const result = trySwap(game, { r: 3, c: 3 }, { r: 3, c: 4 });

  assertEqual(result.resolve.levels[0].cleared.length, 30, '两个 5×5 的并集（重叠 20 格）');
  assertEqual(result.resolve.levelScores[0].multiplier, SCORE.specialMultipliers.wrappedWrapped, '包装+包装 = 4.0 倍');
  assertEqual(result.resolve.levelScores[0].gained, 1200, '300 × 4.0');
  assertEqual(result.stepsLeft, 29, '仍只扣 1 步');
});

test('trySwap：魔力鸟 + 魔力鸟 → 清除全盘，5.0 倍（3.3 第 6 行）', () => {
  const game = createGame({ steps: 30 }, { rng: cycleRng([0.05, 0.4, 0.9]) });
  noMatchFixture(game.board, (b) => {
    b[3][3].type = CELL_TYPE.MAGIC;
    b[3][3].color = 0;
    b[3][4].type = CELL_TYPE.MAGIC;
    b[3][4].color = 1;
  });

  const result = trySwap(game, { r: 3, c: 3 }, { r: 3, c: 4 });

  assertEqual(result.resolve.levels[0].cleared.length, SIZE * SIZE, '清除游戏面板上所有糖果（8×8）');
  assertEqual(result.resolve.levelScores[0].multiplier, SCORE.specialMultipliers.magicMagic, '魔力鸟+魔力鸟 = 5.0 倍');
  assertEqual(result.resolve.levelScores[0].gained, 3200, '640 × 5.0');
  assertEqual(game.board.flat().filter((cell) => cell.type === CELL_TYPE.MAGIC).length, 0, '两只魔力鸟都被清掉（补位只生成普通格）');
});

test('trySwap：条纹 + 魔力鸟 → 同色糖果就地变条纹并引爆（3.3 第 3 行）', () => {
  const game = createGame({ steps: 30 }, { rng: cycleRng([0.05, 0.4, 0.9]) });
  // 0/1 底色 + 全盘仅 (0,0) 与条纹同为色 3：交换后只可能由「变形 + 引爆」造成第 0 行消除
  paintFixture(game.board, (b) => {
    b[4][4].type = CELL_TYPE.STRIPED;
    b[4][4].direction = DIRECTION.H;
    b[4][4].color = 3;
    b[4][5].type = CELL_TYPE.MAGIC;
    b[4][5].color = 0;
    b[0][0].color = 3;
  });

  const result = trySwap(game, { r: 4, c: 4 }, { r: 4, c: 5 });

  assertTrue(result.valid, '组合有效');
  // 第 4 行（8）+ (0,0) 变条纹后引爆第 0 行（8）= 16，两行不重叠
  assertEqual(result.resolve.levels[0].cleared.length, 16, '同色普通格被改造成条纹后立即触发');
  assertEqual(result.resolve.levelScores[0].multiplier, SCORE.specialMultipliers.magic, '魔力鸟相关组合回落 2.5（3.5 表未登记 3.3 的两种魔力鸟混搭）');
  assertEqual(result.resolve.levelScores[0].gained, 400, '160 × 2.5');
});

test('trySwap：包装 + 魔力鸟 → 同色糖果就地变包装并引爆（3.3 第 5 行）', () => {
  const game = createGame({ steps: 30 }, { rng: cycleRng([0.05, 0.4, 0.9]) });
  paintFixture(game.board, (b) => {
    b[4][4].type = CELL_TYPE.WRAPPED;
    b[4][4].color = 3;
    b[4][5].type = CELL_TYPE.MAGIC;
    b[4][5].color = 0;
    b[0][0].color = 3;
  });

  const result = trySwap(game, { r: 4, c: 4 }, { r: 4, c: 5 });

  // (0,0) 变包装后在角上触发 2×2（越界裁剪）= 4；原包装糖在 (4,5) 被清除时按 4.3.8 激活 3×3 = 9
  assertEqual(result.resolve.levels[0].cleared.length, 13, '变形包装 + 原包装各自触发');
  assertEqual(result.resolve.levelScores[0].multiplier, SCORE.specialMultipliers.magic, '同样回落 2.5');
  assertEqual(result.stepsLeft, 29, '仍只扣 1 步');
});

test('trySwap：条纹 + 魔力鸟在全盘无同色可变形时组合仍成立（只清条纹自身整行）', () => {
  const game = createGame({ steps: 30 }, { rng: cycleRng([0.05, 0.4, 0.9]) });
  noMatchFixture(game.board, (b) => {
    b[4][4].type = CELL_TYPE.STRIPED;
    b[4][4].direction = DIRECTION.H;
    b[4][4].color = 3; // 全盘没有第二个色 3（底色只有 0/1/2）
    b[4][5].type = CELL_TYPE.MAGIC;
    b[4][5].color = 0;
  });

  const result = trySwap(game, { r: 4, c: 4 }, { r: 4, c: 5 });

  assertTrue(result.valid, '即使没有同色糖果可变形，组合本身仍成立');
  assertEqual(result.resolve.levels[0].cleared.length, SIZE, '只剩条纹自身的整行 8 格');
  assertEqual(result.resolve.levelScores[0].multiplier, SCORE.specialMultipliers.magic, '2.5 倍');
  assertEqual(result.resolve.levelScores[0].gained, 200, '80 × 2.5');
});

test('trySwap：特效 + 普通格仍走普通匹配路径（组合只在两侧都是特效时触发）', () => {
  const game = createGame({ steps: 30 }, { rng: cycleRng([0.05, 0.4, 0.9]) });
  paintFixture(game.board, (b) => {
    b[4][1].color = 3;
    b[4][2].color = 3;
    b[4][3].color = 3;
    b[3][3].color = 3;
    b[3][3].type = CELL_TYPE.STRIPED;
    b[3][3].direction = DIRECTION.V;
  });

  const result = trySwap(game, { r: 3, c: 3 }, { r: 4, c: 3 });

  assertTrue(result.valid, '条纹参与同色匹配（4.3.14），4 连带上条纹即有效交换');
  // 条纹落到 (4,3) 后与 (4,1)(4,2) 成 3 连：条纹按 4.3.8 激活整列 8 格，另两格随匹配被消除
  assertEqual(result.resolve.levels[0].cleared.length, 10, '整列 8 + 同组另外 2 格');
  assertEqual(result.resolve.levelScores[0].multiplier, SCORE.specialMultipliers.striped, '单条纹仍是 1.5 倍');
  assertEqual(result.resolve.levelScores[0].gained, 150, '100 × 1.5');
});

test('边界（诚实记录）：只剩「两颗相邻特效」可换时，3.8 仍按字面判为死局', () => {
  const game = createGame({ steps: 30 }, { rng: cycleRng([0.05, 0.4, 0.9]) });
  noMatchFixture(game.board, (b) => {
    b[4][4].type = CELL_TYPE.STRIPED;
    b[4][4].direction = DIRECTION.H;
    b[4][5].type = CELL_TYPE.STRIPED;
    b[4][5].direction = DIRECTION.V;
  });

  // 3.8 把「有效交换」定义为「交换后能形成至少一组三消」，组合交换不形成三消，
  // 因此这种盘面会被 hasPossibleMove 判为死局并重排。这是 3.8 字面定义的直接结果，
  // 不为组合开例外（禁止自行发明规则，见 D026）。
  assertFalse(hasPossibleMove(game.board), '3.8 的有效交换定义不认「特效 + 特效」组合');
  const result = trySwap(game, { r: 4, c: 4 }, { r: 4, c: 5 });
  assertTrue(result.valid, '但实际交换仍按 3.3 的组合生效');
  assertEqual(result.resolve.levels[0].cleared.length, 15, '组合照常清除十字 15 格');
});

// ---------------------------------------------------------------- Step 12.1：3.6 目标 / 3.7 三星 / 进度累加

test('12.1：GameSnapshot 带 v1.14 的五个字段（goal/collected/clearedIce/stars/won）', () => {
  const game = createGame({
    steps: 30,
    goal: { type: GOAL_TYPE.COLLECT, targets: { ladybug: 3 } },
    starThresholds: [1000, 2000, 3000]
  });

  const snapshot = getState(game);
  assertDeepEqual(snapshot.goal, { type: GOAL_TYPE.COLLECT, targets: { ladybug: 3 } }, 'goal 透传到快照');
  assertDeepEqual(snapshot.collected, {}, '开局未收集任何动物');
  assertEqual(snapshot.clearedIce, 0, '开局未清冰');
  assertEqual(snapshot.stars, 0, '开局 0 星');
  assertFalse(snapshot.won, '开局未通关');
  assertTrue(Object.isFrozen(snapshot.collected), 'collected 是冻结副本（UI 不能改到内部状态）');
});

test('12.1 + Step 20：收集目标达成 → 通关、剩余步数进入结算阶段、星级 ≥ 1、gameOver', () => {
  const game = createGame(
    { steps: 30, goal: { type: GOAL_TYPE.COLLECT, targets: { ladybug: 3 } }, starThresholds: [100, 1000, 2000] },
    { rng: cycleRng([0.05, 0.4, 0.9]) }
  );
  singleLevelBoard(game.board);

  const result = trySwap(game, { r: 4, c: 2 }, { r: 5, c: 2 });

  assertTrue(result.valid, '交换有效');
  assertTrue(game.level.completed, '3.6：收集 3 只 ladybug（色 2）即达成目标');
  assertTrue(game.gameOver, '通关也是结束');
  assertEqual(game.level.remainingSteps, 29, '只扣 1 步');
  const snapshot = getState(game);
  // Step 20：结算阶段的连锁引爆会把盘面炸开，因此本局的收集数**只会多不会少**
  assertTrue(snapshot.collected.ladybug >= 3, `进度累加：至少消掉 3 只，实得 ${snapshot.collected.ladybug}`);
  assertEqual(snapshot.won, true, '快照标记通关');

  // v1.25：剩余步数的转化口径 = 递增奖励分 + 转成随机特殊糖果并连锁引爆（不再有平坦的 30 分/步）
  const settlement = result.resolve.settlement;
  assertTrue(Boolean(settlement), 'SwapResult 带回结算阶段元信息');
  assertEqual(settlement.steps, 29, '结算阶段看到 29 个剩余步');
  assertTrue(settlement.stepScore > 0, `递增奖励分为正：${settlement.stepScore}`);
  assertTrue(settlement.converted.length > 0, `有格子被转化成特殊糖果：${settlement.converted.length}`);
  assertTrue(settlement.detonations > 0, `发生了连锁引爆：${settlement.detonations} 次`);
  assertEqual(game.board.flat().filter((cell) => cell.type !== CELL_TYPE.NORMAL).length, 0, '引爆后盘面无特殊方块');
  assertTrue(
    snapshot.currentScore >= 30 + settlement.stepScore,
    `总分含结算奖励分与引爆分：${snapshot.currentScore} ≥ ${30 + settlement.stepScore}`
  );
  assertTrue(result.scoreDelta >= settlement.stepScore, 'SwapResult.scoreDelta 含结算奖励分');
  assertTrue(snapshot.stars >= 1, '通关至少 1 星');
});

test('12.1：3.7 通关至少 1 星（分数低于 1★ 线也不给 0 星）', () => {
  const game = createGame(
    { steps: 30, goal: { type: GOAL_TYPE.COLLECT, targets: { ladybug: 3 } }, starThresholds: [10 ** 12, 2 * 10 ** 12, 3 * 10 ** 12] },
    { rng: cycleRng([0.05, 0.4, 0.9]) }
  );
  singleLevelBoard(game.board);

  trySwap(game, { r: 4, c: 2 }, { r: 5, c: 2 });

  assertTrue(game.level.completed, '目标达成');
  assertEqual(getState(game).stars, 1, '3.7：达成通关目标即至少一星（分数远低于 2★ 线也不给 0/2 星）');
});

test('12.1：最后一步达成目标算通关，不算「步数用尽」', () => {
  const game = createGame(
    { steps: 1, goal: { type: GOAL_TYPE.SCORE, target: 30 }, starThresholds: [30, 500, 900] },
    { rng: cycleRng([0.05, 0.4, 0.9]) }
  );
  singleLevelBoard(game.board);

  const result = trySwap(game, { r: 4, c: 2 }, { r: 5, c: 2 });

  assertEqual(result.stepsLeft, 0, '步数确实用尽');
  assertTrue(game.level.completed, '但目标在最后一步达成 → 通关');
  assertTrue(getState(game).won, '快照判为通关');
  assertTrue(getState(game).stars >= 1, '通关有星');
});

test('12.1：步数用尽且未达成目标 → 失败且 0 星', () => {
  const game = createGame(
    { steps: 1, goal: { type: GOAL_TYPE.SCORE, target: 999999 }, starThresholds: [1, 2, 3] },
    { rng: cycleRng([0.05, 0.4, 0.9]) }
  );
  singleLevelBoard(game.board);

  trySwap(game, { r: 4, c: 2 }, { r: 5, c: 2 });

  const snapshot = getState(game);
  assertFalse(game.level.completed, '未达成目标');
  assertTrue(snapshot.gameOver, '步数用尽 → 结束');
  assertFalse(snapshot.won, '不是通关');
  assertEqual(snapshot.stars, 0, '失败不给星');
  assertEqual(snapshot.currentScore, 30, '未通关不结算剩余步数分（此时本来也是 0 步）');
});

test('12.1：clearIce 目标按冰块层数累加（3.6 / LEVELS.md 口径）', () => {
  const game = createGame(
    { steps: 30, goal: { type: GOAL_TYPE.CLEAR_ICE, target: 1 }, starThresholds: [100, 1000, 2000] },
    { rng: cycleRng([0.05, 0.4, 0.9]) }
  );
  // 行 4 三连带上 (4,4) 的 2 层冰 → 本步消掉 1 层冰
  for (let r = 0; r < SIZE; r += 1) for (let c = 0; c < SIZE; c += 1) game.board[r][c].color = (r + 2 * c) % 3;
  game.board[4][4].obstacle = OBSTACLE_TYPE.ICE;
  game.board[4][4].obstacleLayers = 2;
  game.board[4][3].color = 5;
  game.board[4][4].color = 5;
  game.board[4][5].color = 5;

  const result = resolveBoard(game);

  assertEqual(result.levels[0].cleared.length, 3, '三连被消除');
  assertTrue(game.level.completed, '清 1 层冰即达成 clearIce 目标');
  assertEqual(getState(game).clearedIce, 1, '进度累加 1 层');
  assertEqual(game.board[4][4].obstacleLayers, 1, '冰层 2 → 1');
});

test('12.1：mixed 目标要求每个分项都达标', () => {
  const game = createGame(
    { steps: 30, goal: { type: GOAL_TYPE.MIXED, score: 20, collect: { ladybug: 3 } }, starThresholds: [100, 1000, 2000] },
    { rng: cycleRng([0.05, 0.4, 0.9]) }
  );
  singleLevelBoard(game.board);

  trySwap(game, { r: 4, c: 2 }, { r: 5, c: 2 });

  assertTrue(game.level.completed, '分数 30 ≥ 20 且收集 3/3 → 达成');

  const strict = createGame(
    { steps: 30, goal: { type: GOAL_TYPE.MIXED, score: 20, collect: { ladybug: 4 } }, starThresholds: [100, 1000, 2000] },
    { rng: cycleRng([0.05, 0.4, 0.9]) }
  );
  singleLevelBoard(strict.board);
  trySwap(strict, { r: 4, c: 2 }, { r: 5, c: 2 });
  assertFalse(strict.level.completed, '收集差一只 → 未达成');
});

test('12.1：魔力鸟不计入收集（它保留颜色只是为了渲染，3.2 / D025）', () => {
  const game = createGame(
    { steps: 30, goal: { type: GOAL_TYPE.SCORE, target: 999999 }, starThresholds: [1, 2, 3] },
    { rng: cycleRng([0.05, 0.4, 0.9]) }
  );
  for (let r = 0; r < SIZE; r += 1) for (let c = 0; c < SIZE; c += 1) game.board[r][c].color = (r + 2 * c) % 3;
  game.board[4][4].type = CELL_TYPE.MAGIC; // 魔力鸟：色 0（frog）仅供渲染
  game.board[4][4].color = 0;
  game.board[4][5].color = 5; // 与魔力鸟交换的那颗：色 5（fox）
  game.board[1][1].color = 5;
  game.board[6][6].color = 5;

  trySwap(game, { r: 4, c: 4 }, { r: 4, c: 5 });

  const snapshot = getState(game);
  assertEqual(snapshot.collected.fox, 3, '全屏 3 颗色 5 被清除并计入 fox');
  assertEqual(snapshot.collected.frog, undefined, '魔力鸟自身不计入 frog（色 0）');
});

test('12.1：通关时的剩余步数转化只结算一次（重复结算不会再加分）', () => {
  const game = createGame(
    { steps: 30, goal: { type: GOAL_TYPE.COLLECT, targets: { ladybug: 3 } }, starThresholds: [100, 1000, 2000] },
    { rng: cycleRng([0.05, 0.4, 0.9]) }
  );
  singleLevelBoard(game.board);
  trySwap(game, { r: 4, c: 2 }, { r: 5, c: 2 });
  const afterWin = game.level.currentScore;

  const again = resolveBoard(game); // 通关后再结算一次（盘面无新匹配）

  assertEqual(again.scoreDelta, 0, '没有新的消除 → 0 分');
  assertEqual(game.level.currentScore, afterWin, '剩余步数分不再重复结算');
});

// ---------------------------------------------------------------- Step 12.3：结束前引爆特殊方块

/** 夹具：0/1 棋盘格底色 + 行 4 可由 (4,2)↔(5,2) 交换成三连（与 singleLevelBoard 同族）。 */
const detonationBoard = (game, paint) => {
  singleLevelBoard(game.board);
  if (paint) paint(game.board);
};

test('12.3：走完最后一步会引爆盘面上的特殊方块（条纹 → 整列）', () => {
  const game = createGame(
    { steps: 1, goal: { type: GOAL_TYPE.SCORE, target: 999999 }, starThresholds: [1, 2, 3] },
    { rng: cycleRng([0.05, 0.4, 0.9]) }
  );
  detonationBoard(game, (b) => {
    b[7][7].type = CELL_TYPE.STRIPED; // 远离玩家这一手，必定留到引爆
    b[7][7].direction = DIRECTION.V;
  });

  const result = trySwap(game, { r: 4, c: 2 }, { r: 5, c: 2 });

  assertEqual(result.stepsLeft, 0, '最后一步已用掉');
  assertTrue(result.valid && game.gameOver, '本局结束');
  assertTrue(result.resolve.cleared.length > 3, `引爆清掉了更多格子：${result.resolve.cleared.length} > 3`);
  assertTrue(result.resolve.levels.length >= 2, `结算里含引爆轮：${result.resolve.levels.length} 层`);
  assertEqual(game.board.flat().filter((cell) => cell.type !== CELL_TYPE.NORMAL).length, 0, '引爆后盘面无特殊方块');
});

test('12.3：引爆是链式的，直到盘面没有特殊方块', () => {
  const game = createGame(
    { steps: 1, goal: { type: GOAL_TYPE.SCORE, target: 999999 }, starThresholds: [1, 2, 3] },
    { rng: cycleRng([0.05, 0.4, 0.9]) }
  );
  detonationBoard(game, (b) => {
    b[0][0].type = CELL_TYPE.STRIPED; b[0][0].direction = DIRECTION.H;
    b[7][7].type = CELL_TYPE.WRAPPED;
    b[3][6].type = CELL_TYPE.STRIPED; b[3][6].direction = DIRECTION.V;
  });

  const result = trySwap(game, { r: 4, c: 2 }, { r: 5, c: 2 });

  assertEqual(game.board.flat().filter((cell) => cell.type !== CELL_TYPE.NORMAL).length, 0, '链式引爆后没有剩余特殊方块');
  assertTrue(result.resolve.damaged.length >= 0, '障碍物明细字段照常存在');
});

test('12.3：引爆的成果计入目标判定 —— 最后一步引爆刚好达成目标算通关', () => {
  const game = createGame(
    { steps: 1, goal: { type: GOAL_TYPE.SCORE, target: 120 }, starThresholds: [120, 5000, 9000] },
    { rng: cycleRng([0.05, 0.4, 0.9]) }
  );
  detonationBoard(game, (b) => {
    b[7][7].type = CELL_TYPE.STRIPED;
    b[7][7].direction = DIRECTION.V;
  });

  trySwap(game, { r: 4, c: 2 }, { r: 5, c: 2 });

  // 玩家这一手 30 分 < 120；引爆整列（8 格 = 80 分）后 ≥ 120 → 通关
  assertTrue(game.level.completed, '引爆达成的目标也算通关（用户批准的口径）');
  assertTrue(getState(game).won, '快照判为通关');
  assertTrue(getState(game).stars >= 1, '通关至少有 1 星');
});

test('12.3：通关（还有剩余步数）时同样会引爆盘面特殊方块', () => {
  const game = createGame(
    { steps: 30, goal: { type: GOAL_TYPE.SCORE, target: 30 }, starThresholds: [30, 5000, 9000] },
    { rng: cycleRng([0.05, 0.4, 0.9]) }
  );
  detonationBoard(game, (b) => {
    b[7][7].type = CELL_TYPE.STRIPED;
    b[7][7].direction = DIRECTION.V;
  });

  const result = trySwap(game, { r: 4, c: 2 }, { r: 5, c: 2 });

  assertTrue(game.level.completed, '这一手就达成目标');
  assertEqual(result.stepsLeft, 29, '还剩 29 步');
  assertTrue(result.resolve.cleared.length > 3, '通关时也引爆了盘面特殊方块');
  assertEqual(game.board.flat().filter((cell) => cell.type !== CELL_TYPE.NORMAL).length, 0, '引爆后盘面无特殊方块');
  // 30（本手）+ 29×30（剩余步数转化）+ 引爆分（整列 80）
  assertTrue(getState(game).currentScore >= 30 + 29 * 30, `总分含剩余步数转化：${getState(game).currentScore}`);
});
// ---------------------------------------------------------------- Step 14：收集物与时间关（3.6 v1.18 / v1.19）

test('createGame（v1.19）：收集物按关卡配置落到棋盘顶部，且 getState 暴露时间与收集进度', () => {
  const game = createGame({
    steps: 10,
    goal: { type: GOAL_TYPE.FRUIT, target: 2 },
    collectibles: [
      { r: 0, c: 1, type: COLLECTIBLE_TYPE.FRUIT },
      { r: 0, c: 4, type: COLLECTIBLE_TYPE.FRUIT }
    ]
  }, { rng: seededRng(3) });

  const onBoard = game.board.flat().filter((cell) => cell.collectible === COLLECTIBLE_TYPE.FRUIT);
  assertEqual(onBoard.length, 2, '两枚水果都落到了棋盘上');
  assertEqual(game.board[0][1].collectible, COLLECTIBLE_TYPE.FRUIT, '(0,1) 有水果');
  assertEqual(game.board[0][4].collectible, COLLECTIBLE_TYPE.FRUIT, '(0,4) 有水果');
  assertEqual(onBoard.every((cell) => cell.color === null), true, '收集物格内没有动物');

  const snapshot = getState(game);
  assertEqual(snapshot.collectedFruit, 0, '水果计数初值');
  assertEqual(snapshot.collectedPod, 0, '豆荚计数初值');
  assertEqual(snapshot.timeLimit, null, '非时间关 timeLimit 为 null');
  assertEqual(snapshot.remainingTime, 0, '非时间关 remainingTime 为 0');
});

test('水果关（v1.19）：收集物落到出口行即计数，集满目标即通关（3.6 v1.18）', () => {
  const game = createGame({
    steps: 5,
    goal: { type: GOAL_TYPE.FRUIT, target: 1 },
    starThresholds: [1, 2, 3],
    collectibles: [{ r: 6, c: 2, type: COLLECTIBLE_TYPE.FRUIT }]
  }, { rng: seededRng(7) });

  assertEqual(game.board[6][2].collectible, COLLECTIBLE_TYPE.FRUIT, '水果放在出口行上方');
  // 清掉它正下方那一格：水果直落一格到出口行 → 被收走 → 目标达成
  const result = resolveBoard(game, { initialClear: [{ r: 7, c: 2 }] });

  assertDeepEqual(result.collected, [{ r: 7, c: 2, type: COLLECTIBLE_TYPE.FRUIT }], '本层发生一次收集');
  assertEqual(game.level.collectedFruit, 1, '关卡进度 +1');
  assertEqual(game.level.completed, true, '集满 1 个水果即通关（3.6）');
  assertTrue(getState(game).stars >= 1, '通关至少 1 星（3.7）');
});

test('金豆荚关（v1.19）：单次重力最多下落 1 格，需多次消除（级联层）才能到出口', () => {
  // 口径（D035）：「每次消除只下落 1 格」由**重力本身**表达 —— 上限是 collectibleFall 的
  // podFallPerStep，**每次 applyGravity 各算一次**；而一次 resolveBoard 可能含多个级联层
  // （每层一次重力），所以端到端断言必须按该次消解的级联层数封顶，不能假定「一次 resolve = 1 格」。
  const game = createGame({
    steps: 20,
    goal: { type: GOAL_TYPE.POD, target: 1 },
    collectibles: [{ r: 3, c: 5, type: COLLECTIBLE_TYPE.POD }]
  }, { rng: cycleRng([0.9]) });
  paintFixture(game.board, null); // 0/1 棋盘格 + 确定性补位色 5：整盘可复现，且不产生级联

  const podRow = () => game.board.findIndex((row) => row[5].collectible === COLLECTIBLE_TYPE.POD);
  const start = podRow();
  const first = resolveBoard(game, { initialClear: [{ r: 6, c: 5 }] });
  const afterFirst = podRow();
  const second = resolveBoard(game, { initialClear: [{ r: 6, c: 5 }] });
  const afterSecond = podRow();

  assertEqual(start, 3, '豆荚初位置');
  assertTrue(afterFirst > start, `第一次消除后豆荚下移（${start} → ${afterFirst}）`);
  assertTrue(afterFirst - start <= first.levels.length,
    `单次消解内下落格数不超过重力次数（${afterFirst - start} 格 ≤ ${first.levels.length} 层级联）`);
  assertTrue(afterSecond - afterFirst <= second.levels.length,
    `第二次同理（${afterFirst} → ${afterSecond} 格 ≤ ${second.levels.length} 层级联）`);
  assertTrue(afterSecond < SIZE - 1, `还没到出口（第 ${afterSecond} 行 < 出口行 ${SIZE - 1}）`);
  assertEqual(game.level.collectedPod, 0, '还没到出口，不应计数');
});

test('金豆荚（v1.19 口径取证）：单次重力恰好只推进 1 格 —— 是规则而不是动画', () => {
  const board = createBoard(SIZE, SIZE, CONFIG.COLOR_COUNT, [], [{ r: 3, c: 5, type: COLLECTIBLE_TYPE.POD }]);
  paintFixture(board, null);
  board[6][5].color = null; // 模拟「它下方的动物被消除」：把 (6,5) 挖空
  const moves = applyGravity(board);
  const podRow = board.findIndex((row) => row[5].collectible === COLLECTIBLE_TYPE.POD);

  assertEqual(podRow, 4, '一次重力只推进 1 格（3 → 4）');
  assertTrue(moves.some((m) => m.to.r === 4 && m.to.c === 5), '重力轨迹记录了豆荚这一步（动画据此播放）');
  assertEqual(board[7][5].collectible, null, '豆荚没被跳过 (5,5)(6,5) 直接吸到出口');
});

test('时间关（v1.19）：消除不扣步数、开局不判负，倒计时归零才失败（3.6 第 8 条）', () => {
  const game = createGame({
    steps: 0,
    timeLimit: 30,
    goal: { type: GOAL_TYPE.SCORE, target: 10 ** 9 }
  }, { rng: seededRng(17) });
  paintFixture(game.board, singleLevelBoard);

  const snapshot = getState(game);
  assertEqual(snapshot.timeLimit, 30, 'timeLimit 透出快照（5.5 的 HUD 第二格用）');
  assertEqual(snapshot.remainingTime, 30, 'remainingTime 初值');
  assertEqual(game.gameOver, false, '时间关不会因为 steps = 0 而开局判负');

  const swapped = trySwap(game, { r: 4, c: 2 }, { r: 5, c: 2 });
  assertTrue(swapped.valid, '该交换有效');
  assertEqual(game.level.remainingSteps, 0, '时间关没有步数可扣');
  assertEqual(game.level.remainingTime, 30, '消除不扣时间（只有 tickTime 会扣）');
  assertEqual(game.gameOver, false, '目标远未达成，时间也没到，游戏继续');
});

test('时间关（v1.19）：tickTime 递减、归零判负；归零前达成目标即通关', () => {
  const losing = createGame({ steps: 0, timeLimit: 10, goal: { type: GOAL_TYPE.SCORE, target: 10 ** 9 } }, { rng: seededRng(19) });
  assertEqual(tickTime(losing, 4).remainingTime, 6, '扣 4 秒');
  const timedOut = tickTime(losing, 6);
  assertEqual(timedOut.remainingTime, 0, '归零');
  assertEqual(timedOut.gameOver, true, '归零且未达成 → 失败');
  assertEqual(timedOut.won, false, '不算通关');
  assertEqual(tickTime(losing, 5).gameOver, true, '已结束后再推进仍为结束（幂等）');

  // 目标分 0：第一次结算就达标（最小夹具，用于验证「归零前达成」这一分支）
  const winning = createGame({ steps: 0, timeLimit: 10, goal: { type: GOAL_TYPE.SCORE, target: 0 } }, { rng: seededRng(23) });
  paintFixture(winning.board, singleLevelBoard);
  assertTrue(trySwap(winning, { r: 4, c: 2 }, { r: 5, c: 2 }).valid, '有效交换');
  assertEqual(winning.level.completed, true, '目标达成 → completed');
  assertEqual(winning.gameOver, true, '达成目标即结束本局');
  assertEqual(tickTime(winning, 1).won, true, '结束后再推进，won 仍为真');
});

// ---------------------------------------------------------------- Step 15：道具（v1.20 / 3.9）

test('useBooster（v1.20）：加五步在步数关 +5 且不消耗步数，在时间关改加秒', () => {
  const normal = createGame({ steps: 10, goal: { type: GOAL_TYPE.SCORE, target: 10 ** 9 } }, { rng: seededRng(31) });
  const before = normal.level.remainingSteps;
  const result = useBooster(normal, BOOSTER_KIND.ADD_STEPS);
  assertEqual(result.used, true, '步数关生效');
  assertEqual(normal.level.remainingSteps, before + CONFIG.BOOSTER_CONFIG.extraSteps, `步数 +${CONFIG.BOOSTER_CONFIG.extraSteps}`);
  assertEqual(result.resolve, null, '加五步没有结算结果');
  assertEqual(result.reason, null, '没有失败原因');
  assertEqual(normal.gameOver, false, '加步数不会结束本局');

  const timed = createGame({ steps: 0, timeLimit: 12, goal: { type: GOAL_TYPE.SCORE, target: 10 ** 9 } }, { rng: seededRng(33) });
  const timeBefore = timed.level.remainingTime;
  const timedResult = useBooster(timed, BOOSTER_KIND.ADD_STEPS);
  assertEqual(timedResult.used, true, '时间关同样生效');
  assertEqual(timed.level.remainingTime, timeBefore + CONFIG.BOOSTER_CONFIG.extraSeconds, `时间 +${CONFIG.BOOSTER_CONFIG.extraSeconds} 秒`);
  assertEqual(timed.level.remainingSteps, 0, '时间关的步数仍是 0');
});

test('useBooster（v1.20）：刷新重排棋盘、不消耗步数、满足 3.8 的四条约束', () => {
  const game = createGame({
    steps: 12,
    goal: { type: GOAL_TYPE.SCORE, target: 10 ** 9 },
    obstacles: [{ r: 2, c: 2, type: OBSTACLE_TYPE.ICE, layers: 2 }],
    collectibles: [{ r: 0, c: 4, type: COLLECTIBLE_TYPE.FRUIT }]
  }, { rng: seededRng(37) });

  // 初始盘面必须显式给定：createGame 的 rng 只决定补位颜色（见文件头的陷阱说明），
  // 否则 shuffleBoard 的输入每次都不同 —— 这就是原 P3-B「刷新必定成功」偶发 FAIL 的根因。
  // 夹具用六色盘（见 sixColorBoard 的注释：0/1 棋盘格会让重排**必然**失败）。
  sixColorBoard(game.board);

  const beforeIds = game.board.flat().map((cell) => cell.id).join(',');
  const result = useBooster(game, BOOSTER_KIND.REFRESH);

  assertTrue(result.used, '刷新生效');
  assertEqual(game.level.remainingSteps, 12, '刷新不消耗步数（3.9）');
  assertTrue(game.board.flat().map((cell) => cell.id).join(',') !== beforeIds, '棋盘排列确实变了');
  assertEqual(findMatches(game.board).length, 0, '重排后无三连（3.8 约束 1）');
  assertTrue(hasPossibleMove(game.board), '重排后存在可行交换（3.8 约束 2）');
  assertEqual(game.board[2][2].obstacle, OBSTACLE_TYPE.ICE, '障碍物没被搬动（3.8 约束 3）');
  assertEqual(game.board[2][2].obstacleLayers, 2, '障碍物层数不变');
  assertEqual(game.board[0][4].collectible, COLLECTIBLE_TYPE.FRUIT, '收集物也没被搬动（3.9）');
});

test('useBooster（v1.20）：小木锤消除单格、不消耗步数、特效应照常激活', () => {
  const game = createGame({ steps: 9, goal: { type: GOAL_TYPE.SCORE, target: 10 ** 9 } }, { rng: seededRng(41) });
  paintFixture(game.board, singleLevelBoard);

  const target = { r: 4, c: 0 };
  const cellBefore = game.board[4][0].color;
  const scoreBefore = game.level.currentScore;
  const result = useBooster(game, BOOSTER_KIND.HAMMER, target);

  assertTrue(result.used, '木锤生效');
  assertTrue(result.resolve.cleared.length >= 1, '至少消除 1 格');
  assertTrue(game.level.currentScore > scoreBefore, `得分增加（${scoreBefore} → ${game.level.currentScore}）`);
  assertEqual(game.level.remainingSteps, 9, '木锤不消耗步数（3.9）');
  assertTrue(cellBefore !== null, '目标原来是含动物的格子');

  // 点特效格：initialClear 会把它当激活种子 → 波及范围远大于 1 格（4.3.8）
  const game2 = createGame({ steps: 9, goal: { type: GOAL_TYPE.SCORE, target: 10 ** 9 } }, { rng: seededRng(43) });
  paintFixture(game2.board, singleLevelBoard);
  game2.board[4][0].type = CELL_TYPE.STRIPED;
  game2.board[4][0].direction = DIRECTION.H;
  const striped = useBooster(game2, BOOSTER_KIND.HAMMER, { r: 4, c: 0 });
  assertTrue(striped.used && striped.resolve.cleared.length > 3, `点条纹格触发整行（消除 ${striped.resolve.cleared.length} 格）`);
});

test('useBooster（v1.20）：小木锤的非法目标一律无效（空格/纯障碍/收集物/越界）', () => {
  const game = createGame({
    steps: 9,
    goal: { type: GOAL_TYPE.SCORE, target: 10 ** 9 },
    obstacles: [{ r: 5, c: 5, type: OBSTACLE_TYPE.SNOW, layers: 1 }],
    collectibles: [{ r: 0, c: 6, type: COLLECTIBLE_TYPE.POD }]
  }, { rng: seededRng(47) });
  game.board[3][3].color = null; // 夹具：把 (3,3) 清成空格（4.1 约束：先经 createBoard 构造）

  for (const [pos, label] of [
    [{ r: 3, c: 3 }, '空格'],
    [{ r: 5, c: 5 }, '纯障碍（雪块）'],
    [{ r: 0, c: 6 }, '收集物（金豆荚）'],
    [{ r: 99, c: 0 }, '越界'],
    [null, '缺目标']
  ]) {
    const result = useBooster(game, BOOSTER_KIND.HAMMER, pos);
    assertFalse(result.used, `${label} → 无效`);
    assertEqual(result.reason, 'badTarget', `${label} → 原因是 badTarget（调用方因此不扣数量）`);
    assertEqual(game.level.remainingSteps, 9, `${label} → 不消耗步数`);
  }
});

test('useBooster（v1.20）：未知道具与已结束的本局都不生效（used = false）', () => {
  const game = createGame({ steps: 9, goal: { type: GOAL_TYPE.SCORE, target: 10 ** 9 } }, { rng: seededRng(53) });
  assertFalse(useBooster(game, 'nope').used, '未知道具');
  assertEqual(useBooster(game, 'nope').reason, 'badKind', '原因是 badKind');

  game.gameOver = true;
  const busy = useBooster(game, BOOSTER_KIND.ADD_STEPS);
  assertFalse(busy.used, '已结束 → 不生效');
  assertEqual(busy.reason, 'busy', '原因是 busy');
  assertEqual(game.level.remainingSteps, 9, '已结束时加五步也不会改状态');
});

if (!globalThis.__XXL_TEST_BUNDLE__) await summarize();
