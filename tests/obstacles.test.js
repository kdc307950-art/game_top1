// tests/obstacles.test.js — obstacles.js 的单元测试，兼 Step 11（冰块与雪块）的棋盘级集成用例。
// 见 AGENTS.md 2.3 / 3.4 / 4.2 与 ROADMAP Step 11。
//
// 夹具约定（宪法 4.1）：棋盘一律经 createBoard/createGame 构造后再覆盖字段。
// 3.4（v1.12）的三条口径在本文件被逐条钉住：
//   ① 冰块内的动物被消除 → 动物消失并从上方补位，冰块保留且 −1 层（3 层冰需要三次消除）；
//   ② 同一级联层内每格障碍物最多 −1 层（与有几颗相邻动物被消除、特效扫过几格无关）；
//   ③ ice/vine 是覆层障碍（格内有动物）、snow/choc 是占格障碍（格内没有动物、把列切成两段）。

import {
  test,
  assertEqual,
  assertTrue,
  assertFalse,
  assertDeepEqual,
  summarize
} from './assert.js';
import { CELL_TYPE, CONFIG, OBSTACLE_TYPE } from '../config.js';
import { applyGravity, createBoard, resolveCascades, swapCells } from '../board.js';
import { createGame, resolveBoard, trySwap } from '../game.js';
import { findMatches } from '../match.js';
import { shuffleBoard, isCellMovable } from '../shuffle.js';
import { createObstacle, damageObstacle, getObstacleScore, isObstacleCleared } from '../obstacles.js';

const SIZE = CONFIG.BOARD_SIZE;
const SCORE = CONFIG.SCORE_CONFIG;

/** 循环取给定值的确定性随机源（每次调用返回全新生成器，避免用例间串扰）。 */
function cycleRng(values) {
  let index = 0;
  return () => values[index++ % values.length];
}

/** 带种子的 LCG：分布正常，重排/补位会自然收敛（与 board.test.js 的 seededRng 同族）。 */
function seededRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** 无匹配底色：(r+2c)%3，本身无三连、任意相邻交换也不成三连（与 board.test.js 的死局夹具同族）。 */
function noMatchFixture(board, paint) {
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      board[r][c].color = (r + 2 * c) % 3;
      board[r][c].obstacle = null;
      board[r][c].obstacleLayers = 0;
    }
  }
  if (paint) paint(board);
}

const putIce = (board, r, c, layers, color) => {
  board[r][c].obstacle = OBSTACLE_TYPE.ICE;
  board[r][c].obstacleLayers = layers;
  if (color !== undefined) board[r][c].color = color;
};

const putSnow = (board, r, c, layers) => {
  board[r][c].obstacle = OBSTACLE_TYPE.SNOW;
  board[r][c].obstacleLayers = layers;
  board[r][c].color = null; // 3.4：占格障碍格内没有动物
};

// Step 13（v1.17）：藤蔓是覆层障碍（格内有动物，只是不能交换且永不被清除）
const putVine = (board, r, c, color) => {
  board[r][c].obstacle = OBSTACLE_TYPE.VINE;
  board[r][c].obstacleLayers = 1;
  if (color !== undefined) board[r][c].color = color;
};

// Step 13（v1.17）：巧克力是占格障碍、单层，与雪块同一条受损路径
const putChoc = (board, r, c) => {
  board[r][c].obstacle = OBSTACLE_TYPE.CHOC;
  board[r][c].obstacleLayers = 1;
  board[r][c].color = null;
};

// ---------------------------------------------------------------- 4.2 契约

test('createObstacle：层数按 3.4 上限裁剪、下限为 1，未登记类型返回 null', () => {
  assertDeepEqual(createObstacle(OBSTACLE_TYPE.ICE, 9), { type: OBSTACLE_TYPE.ICE, layers: 3 }, '冰块上限 3');
  assertDeepEqual(createObstacle(OBSTACLE_TYPE.SNOW, 0), { type: OBSTACLE_TYPE.SNOW, layers: 1 }, '下限 1');
  assertDeepEqual(createObstacle(OBSTACLE_TYPE.SNOW, 4), { type: OBSTACLE_TYPE.SNOW, layers: 4 }, '区间内原样');
  assertDeepEqual(createObstacle(OBSTACLE_TYPE.VINE, 2), { type: OBSTACLE_TYPE.VINE, layers: 1 }, '藤蔓 1 层');
  assertEqual(createObstacle('bogus', 2), null, '未登记类型 → null（不抛错打断整局）');
});

test('damageObstacle：逐层减少，层数归零时障碍物消失并返回 cleared', () => {
  const board = createBoard(SIZE, SIZE, CONFIG.COLOR_COUNT);
  putSnow(board, 3, 3, 3);

  assertDeepEqual(damageObstacle(board, 3, 3, 1), { cleared: false, layersRemoved: 1 }, '3 → 2');
  assertEqual(board[3][3].obstacleLayers, 2, '层数 2');
  assertDeepEqual(damageObstacle(board, 3, 3, 2), { cleared: true, layersRemoved: 2 }, '一次打 2 层直接清掉');
  assertEqual(board[3][3].obstacle, null, '层数归零 → obstacle 清空');
  assertEqual(board[3][3].obstacleLayers, 0, '层数归零 → 计为 0');
});

test('damageObstacle：无障碍物、越界与 amount ≤ 0 都是幂等的空操作', () => {
  const board = createBoard(SIZE, SIZE, CONFIG.COLOR_COUNT);
  putIce(board, 2, 2, 2, 1);

  assertDeepEqual(damageObstacle(board, 0, 0), { cleared: false, layersRemoved: 0 }, '无 obstacle');
  assertDeepEqual(damageObstacle(board, 99, 99), { cleared: false, layersRemoved: 0 }, '越界');
  assertDeepEqual(damageObstacle(board, 2, 2, 0), { cleared: false, layersRemoved: 0 }, 'amount = 0');
  assertDeepEqual(damageObstacle(board, 2, 2, -1), { cleared: false, layersRemoved: 0 }, 'amount < 0');
  assertEqual(board[2][2].obstacleLayers, 2, '以上都不该改动层数');
});

test('getObstacleScore：冰块/雪块每层 1000、巧克力每块 1000，藤蔓与非法入参为 0（3.5 v1.17）', () => {
  assertEqual(getObstacleScore(OBSTACLE_TYPE.ICE, 3), 3 * SCORE.icePerLayer, '冰块 3 层');
  assertEqual(getObstacleScore(OBSTACLE_TYPE.SNOW, 2), 2 * SCORE.snowPerLayer, '雪块 2 层');
  assertEqual(getObstacleScore(OBSTACLE_TYPE.VINE, 1), 0, '藤蔓不计分（它永不被清除）');
  assertEqual(getObstacleScore(OBSTACLE_TYPE.CHOC, 1), SCORE.chocPerLayer, '巧克力每块 1000 分');
  assertEqual(getObstacleScore('bogus', 5), 0, '未登记类型');
  assertEqual(getObstacleScore(OBSTACLE_TYPE.ICE, -2), 0, '负层数');
  assertEqual(getObstacleScore(OBSTACLE_TYPE.ICE, Number.NaN), 0, 'NaN');
});

test('isObstacleCleared：有障碍 false，清空后 true，越界视为已清除', () => {
  const board = createBoard(SIZE, SIZE, CONFIG.COLOR_COUNT);
  putIce(board, 4, 4, 1, 3);

  assertFalse(isObstacleCleared(board, 4, 4), '1 层冰未清除');
  damageObstacle(board, 4, 4, 1);
  assertTrue(isObstacleCleared(board, 4, 4), '清空后为 true');
  assertTrue(isObstacleCleared(board, 0, 0), '本来就没有障碍物');
  assertTrue(isObstacleCleared(board, -1, 99), '越界视为已清除');
});

// ---------------------------------------------------------------- 3.4 冰块

test('3.4：冰块内的动物被消除后，动物补位而冰块保留并 −1 层', () => {
  const game = createGame({ steps: 30 }, { rng: cycleRng([0.05, 0.4, 0.9]) });
  noMatchFixture(game.board, (b) => {
    putIce(b, 4, 4, 3, 5);
    b[4][3].color = 5;
    b[4][5].color = 5;
  });

  const result = resolveCascades(game.board, CONFIG.COLOR_COUNT, { rng: cycleRng([0.05, 0.4, 0.9]) });

  assertEqual(result.levels[0].cleared.length, 3, '行 4 三连被消除');
  assertDeepEqual(result.damaged, [{ r: 4, c: 4, type: OBSTACLE_TYPE.ICE, layersRemoved: 1, cleared: false }], '冰块 −1 层');
  assertEqual(game.board[4][4].obstacle, OBSTACLE_TYPE.ICE, '冰块仍在原格');
  assertEqual(game.board[4][4].obstacleLayers, 2, '3 层 → 2 层');
  assertTrue(game.board[4][4].color !== null, '该格已从上方补位（新动物生在冰里）');
});

test('3.4：3 层冰需要三次消除（每次消除只 −1 层）', () => {
  const game = createGame({ steps: 30 }, { rng: cycleRng([0.05, 0.4, 0.9]) });
  let layers = 3;

  for (let round = 1; round <= 3; round += 1) {
    // 每一轮重新摆一次行 4 的三连（含冰块格）并保留当前剩余层数，模拟玩家三次消除同一格
    noMatchFixture(game.board, (b) => {
      b[4][3].color = 5;
      b[4][4].color = 5;
      b[4][5].color = 5;
      putIce(b, 4, 4, layers, 5);
    });

    const result = resolveCascades(game.board, CONFIG.COLOR_COUNT, { rng: cycleRng([0.05, 0.4, 0.9]) });
    const hit = result.damaged.find((d) => d.r === 4 && d.c === 4);

    assertEqual(hit.layersRemoved, 1, `第 ${round} 次消除只打 1 层`);
    layers -= 1;
    assertEqual(game.board[4][4].obstacleLayers, layers, `第 ${round} 次后剩 ${layers} 层`);
  }

  assertEqual(game.board[4][4].obstacle, null, '三次之后冰块消失');
  assertTrue(game.board[4][4].color !== null, '冰块消失后该格照常补位');
});

test('3.4：同一级联层内，雪块最多 −1 层（两颗相邻动物同时被消除也只算一次）', () => {
  const game = createGame({ steps: 30 }, { rng: cycleRng([0.05, 0.4, 0.9]) });
  noMatchFixture(game.board, (b) => {
    putSnow(b, 4, 4, 3);
    b[4][1].color = 5; b[4][2].color = 5; b[4][3].color = 5; // 行 4 三连：(4,3) 与雪块相邻
    b[1][4].color = 4; b[2][4].color = 4; b[3][4].color = 4; // 列 4 三连：(3,4) 也与雪块相邻
  });

  const result = resolveCascades(game.board, CONFIG.COLOR_COUNT, { rng: cycleRng([0.05, 0.4, 0.9]) });

  assertEqual(result.levels[0].groups.length, 2, '同层两组匹配');
  assertEqual(result.levels[0].cleared.length, 6, '共消除 6 颗动物，其中 2 颗与雪块相邻');
  assertEqual(result.damaged.length, 1, '雪块只入账一次');
  assertEqual(result.damaged[0].layersRemoved, 1, '只 −1 层（不是 −2）');
  assertEqual(game.board[4][4].obstacleLayers, 2, '3 层 → 2 层');
});

test('3.4：特效范围扫过雪块格 → −1 层（条纹整行也不例外）', () => {
  const game = createGame({ steps: 30 }, { rng: cycleRng([0.05, 0.4, 0.9]) });
  noMatchFixture(game.board, (b) => {
    putSnow(b, 4, 4, 3);
    b[4][0].type = CELL_TYPE.STRIPED;
    b[4][0].direction = 'h';
    b[4][0].color = 5;
  });

  const result = resolveCascades(game.board, CONFIG.COLOR_COUNT, {
    rng: cycleRng([0.05, 0.4, 0.9]),
    initialClear: [{ r: 4, c: 0 }]
  });

  assertEqual(result.levels[0].cleared.length, SIZE - 1, '整行 8 格中 7 格是动物（雪块格没有动物）');
  assertEqual(result.damaged.length, 1, '雪块入账一次');
  assertEqual(result.damaged[0].type, OBSTACLE_TYPE.SNOW, '计入雪块');
  assertEqual(game.board[4][4].obstacleLayers, 2, '整行扫过也只 −1 层');
});

test('3.4：雪块层数归零后该格变成可填充的空格并被补位', () => {
  const game = createGame({ steps: 30 }, { rng: cycleRng([0.05, 0.4, 0.9]) });
  noMatchFixture(game.board, (b) => {
    putSnow(b, 4, 4, 1);
    b[4][1].color = 5; b[4][2].color = 5; b[4][3].color = 5;
  });

  const result = resolveCascades(game.board, CONFIG.COLOR_COUNT, { rng: cycleRng([0.05, 0.4, 0.9]) });

  assertEqual(result.damaged[0].cleared, true, '这一次伤害把雪块清掉');
  assertEqual(game.board[4][4].obstacle, null, '障碍物消失');
  assertEqual(game.board[4][4].obstacleLayers, 0, '层数为 0');
  assertTrue(game.board[4][4].color !== null, '该格从此可被填充（占格障碍消失后列不再被截断）');
});

// ---------------------------------------------------------------- 障碍物属于格子

test('3.4/3.8：重力不搬动冰块 —— 冰留在原格，动物落下去', () => {
  const board = createBoard(SIZE, SIZE, CONFIG.COLOR_COUNT);
  noMatchFixture(board, (b) => {
    putIce(b, 4, 4, 2, 5);
    b[5][4].color = null; // 冰块格正下方一个空洞
    b[5][4].obstacle = null;
  });

  const colorAbove = board[3][4].color;
  applyGravity(board);

  assertEqual(board[4][4].obstacle, OBSTACLE_TYPE.ICE, '冰块留在 (4,4)');
  assertEqual(board[4][4].obstacleLayers, 2, '层数不变');
  assertEqual(board[4][4].color, colorAbove, '上方动物落进了冰格 —— 冰不动，动物照常下落');
  assertEqual(board[5][4].color, 5, '原来在冰里的动物落到了 (5,4)');
  assertEqual(board[5][4].obstacle, null, '动物没有把冰块带走');
});

test('3.4/3.8：交换只移动动物，冰块留在原格', () => {
  const board = createBoard(SIZE, SIZE, CONFIG.COLOR_COUNT);
  noMatchFixture(board, (b) => {
    putIce(b, 4, 4, 2, 5);
    b[4][5].color = 4;
  });

  swapCells(board, { r: 4, c: 4 }, { r: 4, c: 5 });

  assertEqual(board[4][4].obstacle, OBSTACLE_TYPE.ICE, '冰块没有被换走');
  assertEqual(board[4][4].obstacleLayers, 2, '层数不变');
  assertEqual(board[4][4].color, 4, '换进来的是原 (4,5) 的动物');
  assertEqual(board[4][5].obstacle, null, '目标格不会凭空多出冰块');
  assertEqual(board[4][5].color, 5, '换出去的是原 (4,4) 的动物');
});

test('3.8：重排不改变障碍物布局（位置与层数都不变）', () => {
  const board = createBoard(SIZE, SIZE, CONFIG.COLOR_COUNT);
  // 6 色死局底色：只有 ≥4 色时才存在「无三连且有可行交换」的排列（3 色盘面重排必然失败，
  // 见 board.test.js 的 deadlockBoard6 说明）；本用例检的是「重排是否搬动障碍物」。
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) board[r][c].color = (r + 2 * c) % 6;
  }
  putIce(board, 2, 3, 2, 5);
  putSnow(board, 5, 6, 4);

  const shuffled = shuffleBoard(board, { rng: seededRng(20260920) });

  assertTrue(shuffled, '重排应成功');
  assertEqual(board[2][3].obstacle, OBSTACLE_TYPE.ICE, '冰块仍在 (2,3)');
  assertEqual(board[2][3].obstacleLayers, 2, '冰块层数不变');
  assertEqual(board[5][6].obstacle, OBSTACLE_TYPE.SNOW, '雪块仍在 (5,6)');
  assertEqual(board[5][6].obstacleLayers, 4, '雪块层数不变');
  assertEqual(board[5][6].color, null, '占格障碍格里依然没有动物');
});

// ---------------------------------------------------------------- 匹配层

test('3.4：雪块不参与匹配，并把同色串切成两段', () => {
  const board = createBoard(SIZE, SIZE, CONFIG.COLOR_COUNT);
  noMatchFixture(board, (b) => {
    putSnow(b, 4, 4, 2);
    b[4][2].color = 5; b[4][3].color = 5; b[4][5].color = 5; b[4][6].color = 5;
  });

  assertEqual(findMatches(board).length, 0, '两侧各只有 2 颗同色，中间被雪块截断');
});

test('3.4：冰块内的动物照常参与匹配', () => {
  const board = createBoard(SIZE, SIZE, CONFIG.COLOR_COUNT);
  noMatchFixture(board, (b) => {
    putIce(b, 4, 4, 2, 5);
    b[4][2].color = 5;
    b[4][3].color = 5;
  });

  const groups = findMatches(board);
  assertEqual(groups.length, 1, '3 连成立');
  assertEqual(groups[0].cells.length, 3, '3 颗同色');
  assertTrue(groups[0].cells.some((p) => p.r === 4 && p.c === 4), '冰块格是匹配组的一员');
});

// ---------------------------------------------------------------- 与 game.js 的接线

test('trySwap：冰块格参与三连 → 有效交换、只扣 1 步、冰块 −1 层并计 1000 分', () => {
  const game = createGame({ steps: 30 }, { rng: cycleRng([0.05, 0.4, 0.9]) });
  noMatchFixture(game.board, (b) => {
    putIce(b, 4, 4, 2, 5); // 冰块格：色 5
    b[4][2].color = 5;     // 行 4 已有两颗色 5，(4,3) 保持底色，交换后才成三连
    b[3][3].color = 5;
  });
  assertEqual(findMatches(game.board).length, 0, '交换前盘面无匹配');

  const result = trySwap(game, { r: 3, c: 3 }, { r: 4, c: 3 });

  assertTrue(result.valid, '交换后形成三连 → 有效');
  assertEqual(result.stepsLeft, 29, '只扣 1 步');
  assertEqual(game.board[4][4].obstacleLayers, 1, '冰块 2 层 → 1 层');
  assertEqual(result.resolve.levelScores[0].base, 30, '基础分仍是 3 颗动物 × 10');
  assertEqual(result.resolve.levelScores[0].multiplier, 1, '普通消除没有特效倍数');
  assertEqual(result.resolve.levelScores[0].obstacle, 1000, '层数分另算：1 层 × 1000');
  assertEqual(result.resolve.levelScores[0].gained, 30 + 1000, 'gained = base × 倍数 + 连消 + 层数分');
});

test('3.5：层数分不参与特效倍数，冰块连消另加 (n−1) × 1000', () => {
  // 注入口令：前三次补位都补色 5，使第 1 层消除后立刻在列 0 顶端再成三连 → 第 2 层也打冰
  const game = createGame({ steps: 30 }, { rng: cycleRng([0.9, 0.9, 0.9, 0.05, 0.4, 0.9]) });
  noMatchFixture(game.board, (b) => {
    putIce(b, 0, 0, 3, 5);
    b[1][0].color = 5;
    b[2][0].color = 5;
  });

  const resolved = resolveBoard(game);

  assertEqual(resolved.cascades, 2, '恰好两层：第二层由补位色 5 再次成三连');
  assertEqual(resolved.levelScores[0].obstacle, 1000, '第 1 层：1 层冰 × 1000（第 1 层没有连消加分）');
  assertEqual(resolved.levelScores[0].gained, 30 + 1000, 'gained = 30 + 1000');
  assertEqual(resolved.levelScores[1].bonus, (2 - 1) * SCORE.cascadeStep, '普通连消 30/档照旧');
  assertEqual(resolved.levelScores[1].obstacle, 1000 + (2 - 1) * SCORE.cascadeIceStep, '层数分 1000 + 冰块连消 1000');
  assertEqual(resolved.levelScores[1].gained, 30 + 30 + 2000, 'gained = base + 连消 + 层数分');
  assertEqual(resolved.scoreDelta, 1030 + 2060, '本次结算总分');
  assertEqual(game.board[0][0].obstacleLayers, 1, '3 层冰被打了两次 → 剩 1 层');
});

// ---------------------------------------------------------------- Step 13：藤蔓与巧克力（v1.17）

test('3.4 v1.17：藤蔓永不被清除 —— damageObstacle 对藤蔓一律零伤害、也不计分', () => {
  const board = createBoard(SIZE, SIZE, CONFIG.COLOR_COUNT);
  noMatchFixture(board, (b) => putVine(b, 2, 2, 3));
  assertFalse(isObstacleCleared(board, 2, 2), '藤蔓存在');
  assertDeepEqual(damageObstacle(board, 2, 2, 5), { cleared: false, layersRemoved: 0 }, '多少伤害都不减层');
  assertEqual(board[2][2].obstacle, OBSTACLE_TYPE.VINE, '藤蔓仍在原格');
  assertEqual(board[2][2].obstacleLayers, 1, '层数仍是 1');
  assertEqual(getObstacleScore(OBSTACLE_TYPE.VINE, 1), 0, '藤蔓不计分（3.5 v1.17）');
});

test('3.4/4.3.11：藤蔓格不可交换，冰块格照常可交换', () => {
  const board = createBoard(SIZE, SIZE, CONFIG.COLOR_COUNT);
  noMatchFixture(board, (b) => {
    putVine(b, 1, 1, 2);
    putIce(b, 1, 2, 1, 3);
  });
  assertFalse(isCellMovable(board, 1, 1), '藤蔓里的动物不能移动');
  assertTrue(isCellMovable(board, 1, 2), '冰块里的动物可以移动（3.4）');
});

test('3.4 v1.17：交换藤蔓格 → 直接拒绝、不扣步、棋盘回到交换前', () => {
  const game = createGame({ steps: 30 }, { rng: cycleRng([0.05, 0.4, 0.9]) });
  noMatchFixture(game.board, (b) => putVine(b, 4, 4, 5));
  const before = game.board.map((row) => row.map((cell) => cell.color));

  const result = trySwap(game, { r: 4, c: 3 }, { r: 4, c: 4 });

  assertFalse(result.valid, '藤蔓格参与 → 交换无效');
  assertEqual(result.stepsLeft, 30, '不消耗步数（3.1）');
  assertDeepEqual(game.board.map((row) => row.map((cell) => cell.color)), before, '棋盘已回退');
  assertEqual(game.board[4][4].obstacle, OBSTACLE_TYPE.VINE, '藤蔓不受交换影响');
});

test('3.4/4.3.11：藤蔓里的动物照常参与匹配（v1.17 不把藤蔓格排除出匹配）', () => {
  const board = createBoard(SIZE, SIZE, CONFIG.COLOR_COUNT);
  noMatchFixture(board, (b) => {
    putVine(b, 4, 4, 5);
    b[4][2].color = 5;
    b[4][3].color = 5;
  });

  const groups = findMatches(board);

  assertTrue(
    groups.some((g) => g.cells.some((p) => p.r === 4 && p.c === 4)),
    '（4,2)(4,3)(4,4) 的三连包含藤蔓格'
  );
});

test('3.4 v1.17：巧克力被相邻消除波及 → 整块清除并计 1000 分', () => {
  const game = createGame({ steps: 30 }, { rng: cycleRng([0.05, 0.4, 0.9]) });
  noMatchFixture(game.board, (b) => {
    putChoc(b, 5, 4); // 正上方 (4,4) 将被消除
    b[4][2].color = 5;
    b[4][3].color = 5;
    b[4][4].color = 5;
  });

  const resolved = resolveBoard(game);

  assertTrue(
    resolved.damaged.some((d) => d.r === 5 && d.c === 4 && d.type === OBSTACLE_TYPE.CHOC && d.cleared),
    '巧克力被整块清除（单层，一次到位）'
  );
  assertTrue(resolved.levelScores.some((s) => s.obstacle >= SCORE.chocPerLayer), '含 1000 分/块的巧克力分');
  assertEqual(game.board[5][4].obstacle, null, '格内不再有障碍物');
});

test('3.4 v1.17：清除集合覆盖巧克力格 → 整块清除（与雪块同一条受损路径）', () => {
  const game = createGame({ steps: 30 }, { rng: cycleRng([0.05, 0.4, 0.9]) });
  noMatchFixture(game.board, (b) => putChoc(b, 3, 3));

  const resolved = resolveBoard(game, { initialClear: [{ r: 3, c: 3 }] });

  assertTrue(
    resolved.damaged.some((d) => d.r === 3 && d.c === 3 && d.type === OBSTACLE_TYPE.CHOC && d.cleared),
    '被特效/清除集合扫过即整块清除'
  );
  assertEqual(game.board[3][3].obstacle, null, '障碍物消失');
});

test('3.8 v1.17：重排不搬动藤蔓与巧克力（位置与层数都不变）', () => {
  const board = createBoard(SIZE, SIZE, CONFIG.COLOR_COUNT);
  noMatchFixture(board, (b) => {
    putVine(b, 0, 0, 1);
    putChoc(b, 7, 7);
  });

  shuffleBoard(board, { rng: seededRng(7), maxTries: 50 });

  assertEqual(board[0][0].obstacle, OBSTACLE_TYPE.VINE, '藤蔓仍在 (0,0)');
  assertEqual(board[0][0].obstacleLayers, 1, '藤蔓层数不变');
  assertEqual(board[7][7].obstacle, OBSTACLE_TYPE.CHOC, '巧克力仍在 (7,7)');
  assertEqual(board[7][7].obstacleLayers, 1, '巧克力层数不变');
});

if (!globalThis.__XXL_TEST_BUNDLE__) summarize();
