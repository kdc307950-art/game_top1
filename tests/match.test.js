// tests/match.test.js — match.js 的单元测试。见 AGENTS.md 7.1 与 ROADMAP Step 2。
//
// 夹具约定（宪法 4.1 约束）：棋盘必须经 createBoard 构造后再覆盖 color，
// 不得直接构造裸数组传入逻辑函数。

import { test, assertEqual, assertTrue, assertDeepEqual, summarize } from './assert.js';
import { CELL_TYPE, CONFIG, DIRECTION, MATCH_SHAPE } from '../config.js';
import { createBoard } from '../board.js';
import { findMatches, findAllMatchGroups, detectMatchShape } from '../match.js';

const SIZE = 8;
const FILL_COLORS = 2; // 填充：0/1 棋盘格（横竖都不可能有相邻同色）
const SHAPE_COLOR = 2; // 目标形状统一用色 2，与填充色不同 → 形状天然孤立

/** 生成夹具：0/1 棋盘格填充 + 可选的目标形状。 */
function fixture(paint) {
  const board = createBoard(SIZE, SIZE, CONFIG.COLOR_COUNT);
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      board[r][c].color = (r + c) % FILL_COLORS;
    }
  }
  if (paint) paint(board);
  return board;
}

function paint(board, cells, color = SHAPE_COLOR) {
  for (const [r, c] of cells) board[r][c].color = color;
}

const at = (r, c) => ({ r, c });

test('夹具可信性：0/1 棋盘格填充自身不含任何匹配', () => {
  assertEqual(findMatches(fixture()).length, 0, '填充不应产生匹配');
});

test('横向 3 连 → line3，方向 h，坐标按行顺序', () => {
  const board = fixture((b) => paint(b, [[2, 1], [2, 2], [2, 3]]));
  const groups = findMatches(board);
  assertEqual(groups.length, 1, '匹配组数量');
  assertEqual(groups[0].shape, MATCH_SHAPE.LINE3, 'shape');
  assertEqual(groups[0].direction, DIRECTION.H, 'direction');
  assertDeepEqual(groups[0].cells, [at(2, 1), at(2, 2), at(2, 3)], 'cells');
});

test('纵向 3 连 → line3，方向 v', () => {
  const board = fixture((b) => paint(b, [[1, 4], [2, 4], [3, 4]]));
  const groups = findMatches(board);
  assertEqual(groups.length, 1, '匹配组数量');
  assertEqual(groups[0].shape, MATCH_SHAPE.LINE3, 'shape');
  assertEqual(groups[0].direction, DIRECTION.V, 'direction');
  assertDeepEqual(groups[0].cells, [at(1, 4), at(2, 4), at(3, 4)], 'cells');
});

test('横向 4 连 → line4（条纹糖果形状，3.2）', () => {
  const board = fixture((b) => paint(b, [[2, 1], [2, 2], [2, 3], [2, 4]]));
  const groups = findMatches(board);
  assertEqual(groups.length, 1, '匹配组数量');
  assertEqual(groups[0].shape, MATCH_SHAPE.LINE4, 'shape');
  assertEqual(groups[0].direction, DIRECTION.H, 'direction');
});

test('纵向 4 连 → line4，方向 v', () => {
  const board = fixture((b) => paint(b, [[0, 1], [1, 1], [2, 1], [3, 1]]));
  const groups = findMatches(board);
  assertEqual(groups.length, 1, '匹配组数量');
  assertEqual(groups[0].shape, MATCH_SHAPE.LINE4, 'shape');
  assertEqual(groups[0].direction, DIRECTION.V, 'direction');
});

test('横向 5 连 → line5（魔力鸟形状，3.2）', () => {
  const board = fixture((b) => paint(b, [[5, 0], [5, 1], [5, 2], [5, 3], [5, 4]]));
  const groups = findMatches(board);
  assertEqual(groups.length, 1, '匹配组数量');
  assertEqual(groups[0].shape, MATCH_SHAPE.LINE5, 'shape');
  assertEqual(groups[0].direction, DIRECTION.H, 'direction');
});

test('纵向 5 连 → line5，方向 v', () => {
  const board = fixture((b) => paint(b, [[0, 6], [1, 6], [2, 6], [3, 6], [4, 6]]));
  const groups = findMatches(board);
  assertEqual(groups.length, 1, '匹配组数量');
  assertEqual(groups[0].shape, MATCH_SHAPE.LINE5, 'shape');
  assertEqual(groups[0].direction, DIRECTION.V, 'direction');
});

test('横向 6 连 → line5（≥5 一律按魔力鸟处理，见 D014）', () => {
  const board = fixture((b) => paint(b, [[5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5]]));
  const groups = findMatches(board);
  assertEqual(groups.length, 1, '匹配组数量');
  assertEqual(groups[0].shape, MATCH_SHAPE.LINE5, 'shape');
  assertEqual(groups[0].cells.length, 6, 'cells 长度');
});

test('L 型 5 连 → 两段合并为 1 组，shape L，direction null', () => {
  const board = fixture((b) => paint(b, [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]]));
  assertEqual(findMatches(board).length, 2, '原始扫描应为两段（横 + 竖）');
  const groups = findAllMatchGroups(board);
  assertEqual(groups.length, 1, '合并后应为 1 组');
  assertEqual(groups[0].shape, MATCH_SHAPE.L, 'shape');
  assertEqual(groups[0].direction, null, 'L 型方向为 null（4.2）');
  assertEqual(groups[0].cells.length, 5, '合并后格子数');
});

test('T 型 5 连 → shape T，5 格', () => {
  const board = fixture((b) => paint(b, [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]]));
  const groups = findAllMatchGroups(board);
  assertEqual(groups.length, 1, '组数');
  assertEqual(groups[0].shape, MATCH_SHAPE.T, 'shape');
  assertEqual(groups[0].cells.length, 5, '合并后格子数');
  assertTrue(groups[0].cells.some((pos) => pos.r === 1 && pos.c === 1), '应含竖臂上的格子');
});

test('十字形 5 连 → 归为 T（交叉点在两条线中间，见 D014）', () => {
  const board = fixture((b) => paint(b, [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]]));
  const groups = findAllMatchGroups(board);
  assertEqual(groups.length, 1, '组数');
  assertEqual(groups[0].shape, MATCH_SHAPE.T, 'shape');
  assertEqual(groups[0].cells.length, 5, '合并后格子数');
});

test('两处互不接触的匹配 → 合并后仍是 2 组，不被误并', () => {
  const board = fixture((b) => {
    paint(b, [[0, 0], [0, 1], [0, 2]]);
    paint(b, [[4, 4], [4, 5], [4, 6]]);
  });
  assertEqual(findMatches(board).length, 2, '原始段数');
  assertEqual(findAllMatchGroups(board).length, 2, '合并后组数');
});

test('相邻不同色不会误判为匹配（上下/左右交错）', () => {
  const board = fixture((b) => {
    paint(b, [[1, 1], [1, 2]], 3);
    paint(b, [[2, 1], [2, 2]], 4);
  });
  assertEqual(findMatches(board).length, 0, '2 格不成匹配，错位也不同色');
});

test('detectMatchShape 直接断言：直线、L、T', () => {
  assertEqual(detectMatchShape([at(0, 0), at(0, 1), at(0, 2)]), MATCH_SHAPE.LINE3, '横向 3');
  assertEqual(detectMatchShape([at(0, 0), at(1, 0), at(2, 0), at(3, 0)]), MATCH_SHAPE.LINE4, '纵向 4');
  assertEqual(detectMatchShape([at(0, 0), at(0, 1), at(0, 2), at(0, 3), at(0, 4)]), MATCH_SHAPE.LINE5, '横向 5');
  assertEqual(detectMatchShape([at(0, 0), at(0, 1), at(0, 2), at(1, 0), at(2, 0)]), MATCH_SHAPE.L, 'L 型');
  assertEqual(detectMatchShape([at(0, 0), at(0, 1), at(0, 2), at(1, 1), at(2, 1)]), MATCH_SHAPE.T, 'T 型');
});

test('detectMatchShape 对非法形状返回 null', () => {
  assertEqual(detectMatchShape([]), null, '空集合');
  assertEqual(detectMatchShape([at(0, 0), at(0, 1)]), null, '不足 3 格');
  assertEqual(detectMatchShape([at(0, 0), at(0, 1), at(0, 2), at(1, 0)]), null, '竖臂只有 2 格，不算包装糖果形状');
  assertEqual(detectMatchShape([at(0, 0), at(0, 1), at(5, 5)]), null, '有游离格，不构成单组形状');
});

// ---------------------------------------------------------------- Step 9：魔力鸟不参与同色匹配（4.3.14）

test('魔力鸟不参与同色匹配：它会把色段切断（3.2 / 4.3.14）', () => {
  const board = fixture((b) => {
    paint(b, [[2, 1], [2, 2], [2, 3]]); // 先造一条 3 连
    b[2][2].type = CELL_TYPE.MAGIC; // 中间那格变成魔力鸟（颜色仍是 2）
  });

  assertEqual(findMatches(board).length, 0, '被魔力鸟切断后不再是 3 连');
  assertEqual(findAllMatchGroups(board).length, 0, '合并后同样没有匹配组');
});

test('魔力鸟不参与同色匹配：两侧各 2 格也不算匹配', () => {
  const board = fixture((b) => {
    paint(b, [[5, 0], [5, 1], [5, 3], [5, 4]]);
    b[5][2].type = CELL_TYPE.MAGIC;
    b[5][2].color = 2;
  });

  assertEqual(findMatches(board).length, 0, '1+1 与 1+1 都不足 3 连');
});

test('条纹与包装糖果仍然参与同色匹配（只有魔力鸟被排除）', () => {
  const striped = fixture((b) => {
    paint(b, [[3, 1], [3, 2], [3, 3]]);
    b[3][2].type = CELL_TYPE.STRIPED;
  });
  assertEqual(findMatches(striped).length, 1, '条纹所在色段仍算 3 连（4.3.8 靠它触发）');

  const wrapped = fixture((b) => {
    paint(b, [[4, 1], [4, 2], [4, 3]]);
    b[4][2].type = CELL_TYPE.WRAPPED;
  });
  assertEqual(findMatches(wrapped).length, 1, '包装糖果所在色段仍算 3 连');
});

test('魔力鸟自己的颜色不会让它在别处凑出匹配', () => {
  const board = fixture((b) => {
    b[6][6].type = CELL_TYPE.MAGIC;
    b[6][6].color = 2;
    paint(b, [[6, 3], [6, 4]]); // 与魔力鸟同性色的两格，被 (6,5) 的填充色隔开
  });

  assertEqual(findMatches(board).length, 0, '含魔力鸟的任何组合都不构成匹配');
});

if (!globalThis.__XXL_TEST_BUNDLE__) await summarize();
