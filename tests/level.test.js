// tests/level.test.js — level.js 的单元测试。见 AGENTS.md 7.1 与 ROADMAP Step 4。
//
// Step 4 只实现 createLevel / consumeStep / getRemainingStepBonus；
// checkGoal（3.6）与 calcStars（3.7）属 Step 12，本文件不测也不留空壳。

import { test, assertEqual, assertTrue, assertDeepEqual, assertThrows, summarize } from './assert.js';
import { CONFIG, GOAL_TYPE, STORAGE_KEYS } from '../config.js';
import { consumeStep, createLevel, getRemainingStepBonus } from '../level.js';

/** 合法关卡配置（4.4 的 LevelConfig 形状）。 */
function levelConfig(overrides = {}) {
  return {
    id: 7,
    rows: CONFIG.BOARD_SIZE,
    cols: CONFIG.BOARD_SIZE,
    colorCount: CONFIG.COLOR_COUNT,
    steps: 12,
    goal: { type: GOAL_TYPE.SCORE, target: CONFIG.LEVEL_DEFAULTS.starThresholds[0] },
    starThresholds: [...CONFIG.LEVEL_DEFAULTS.starThresholds],
    obstacles: [],
    ...overrides
  };
}

test('createLevel：Level 字段符合 4.4（remainingSteps/collected/clearedIce/currentScore）', () => {
  const level = createLevel(levelConfig());
  assertEqual(level.id, 7, 'id');
  assertEqual(level.remainingSteps, 12, 'remainingSteps 初值 = steps');
  assertEqual(level.currentScore, 0, 'currentScore 初值');
  assertEqual(level.clearedIce, 0, 'clearedIce 初值');
  assertDeepEqual(level.collected, {}, 'collected 初值');
  assertDeepEqual(level.starThresholds, CONFIG.LEVEL_DEFAULTS.starThresholds, 'starThresholds');
});

test('createLevel：数组字段不与外部配置共享引用（关卡状态是本局私有状态）', () => {
  const config = levelConfig();
  const level = createLevel(config);
  level.starThresholds[0] = 1;
  level.obstacles.push({ r: 0, c: 0, type: 'ice', layers: 1 });
  assertEqual(config.starThresholds[0], CONFIG.LEVEL_DEFAULTS.starThresholds[0], '外部 starThresholds 未被改写');
  assertEqual(config.obstacles.length, 0, '外部 obstacles 未被改写');
});

test('createLevel：拒绝非法配置（4.4 约束逐条）', () => {
  assertThrows(() => createLevel(levelConfig({ goal: undefined })), '缺 goal');
  assertThrows(() => createLevel(levelConfig({ goal: { type: 'nope', target: 1 } })), '未知 goal.type');
  assertThrows(() => createLevel(levelConfig({ starThresholds: undefined })), '缺 starThresholds');
  assertThrows(() => createLevel(levelConfig({ starThresholds: [1, 2] })), '不是三元组');
  assertThrows(() => createLevel(levelConfig({ starThresholds: [3, 2, 1] })), '递减');
  assertThrows(() => createLevel(levelConfig({ starThresholds: [1, 'x', 3] })), '含非数字');
  assertThrows(() => createLevel(levelConfig({ steps: 0 })), 'steps 为 0');
  assertThrows(() => createLevel(levelConfig({ steps: 1.5 })), 'steps 非整数');
  assertThrows(() => createLevel(levelConfig({ rows: 0 })), 'rows 为 0');
  assertThrows(() => createLevel(undefined), '整体缺省');
});

test('consumeStep：每次减 1，减到 0 后不再变负（4.3.3）', () => {
  const level = createLevel(levelConfig({ steps: 3 }));
  assertEqual(consumeStep(level), 2, '第一次');
  assertEqual(consumeStep(level), 1, '第二次');
  assertEqual(consumeStep(level), 0, '第三次');
  assertEqual(consumeStep(level), 0, '已用尽时保持 0');
  assertEqual(level.remainingSteps, 0, '最终状态');
});

test('getRemainingStepBonus：每剩余一步按 stepBonus 转化（3.5）', () => {
  const step = CONFIG.SCORE_CONFIG.stepBonus;
  assertEqual(getRemainingStepBonus(0), 0, '0 步');
  assertEqual(getRemainingStepBonus(5), 5 * step, '5 步');
  assertEqual(getRemainingStepBonus(-4), 0, '负数按 0');
  assertEqual(getRemainingStepBonus(2.7), 2 * step, '小数向下取整');
  assertTrue(getRemainingStepBonus(undefined) === 0, 'undefined 按 0');
});

test('STORAGE_KEYS.BEST_SCORE 与附录 B 登记值一致（最高分键名）', () => {
  assertEqual(STORAGE_KEYS.BEST_SCORE, 'xxl_best_score', '最高分存储键');
});

if (!globalThis.__XXL_TEST_BUNDLE__) summarize();
