// tests/level.test.js — level.js 的单元测试。见 AGENTS.md 7.1 与 ROADMAP Step 4 / Step 12.1。
//
// Step 4 实现了 createLevel / consumeStep / getRemainingStepBonus；
// Step 12.1 补上 checkGoal（3.6 四种目标）与 calcStars（3.7 三星）。

import { test, assertEqual, assertTrue, assertFalse, assertDeepEqual, assertThrows, summarize } from './assert.js';
import { CONFIG, GOAL_TYPE, STORAGE_KEYS } from '../config.js';
import { calcStars, checkGoal, consumeStep, createLevel, getRemainingStepBonus } from '../level.js';

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

test('STORAGE_KEYS 与附录 B 登记值一致（最高分 + 每关星级，v1.14）', () => {
  assertEqual(STORAGE_KEYS.BEST_SCORE, 'xxl_best_score', '最高分存储键');
  assertEqual(STORAGE_KEYS.LEVEL_STARS, 'xxl_level_stars', '每关星级存档键');
});

// ---------------------------------------------------------------- Step 12.1：3.6 目标判定

test('createLevel：Level.completed 初值为 false（v1.14）', () => {
  assertFalse(createLevel(levelConfig()).completed, '开局未通关');
});

test('checkGoal：score 目标只比分数（3.6）', () => {
  const level = createLevel(levelConfig({ goal: { type: GOAL_TYPE.SCORE, target: 1000 } }));
  assertFalse(checkGoal(level, null, 999, {}), '差 1 分不算达成');
  assertTrue(checkGoal(level, null, 1000, {}), '刚好达成');
  assertTrue(checkGoal(level, null, 1500, {}), '超过也算');
  assertFalse(checkGoal(level, null, Number.NaN, {}), 'NaN 按 0 处理');
});

test('checkGoal：collect 目标要求每个列出的动物都达标（3.6）', () => {
  const level = createLevel(levelConfig({ goal: { type: GOAL_TYPE.COLLECT, targets: { frog: 5, hippo: 3 } } }));
  assertFalse(checkGoal(level, null, 0, { frog: 5, hippo: 2 }), '差一只不算');
  assertTrue(checkGoal(level, null, 0, { frog: 5, hippo: 3 }), '刚好达成');
  assertTrue(checkGoal(level, null, 0, { frog: 9, hippo: 3 }), '超出也算');
  assertFalse(checkGoal(level, null, 0, { frog: 5 }), '缺失的动物按 0 计');
  assertFalse(checkGoal(level, null, 0, {}), '空计数不算');
  assertFalse(checkGoal(level, null, 0, undefined), '未传计数按空处理');
});

test('checkGoal：clearIce 目标比冰块层数（level.clearedIce）', () => {
  const level = createLevel(levelConfig({ goal: { type: GOAL_TYPE.CLEAR_ICE, target: 6 } }));
  level.clearedIce = 5;
  assertFalse(checkGoal(level, null, 0, {}), '5 层未达标');
  level.clearedIce = 6;
  assertTrue(checkGoal(level, null, 0, {}), '6 层达标');
  level.clearedIce = 7;
  assertTrue(checkGoal(level, null, 0, {}), '超过也算');
});

test('checkGoal：mixed 要求列出的每个分项都达标，空 mixed 不算达成', () => {
  const level = createLevel(levelConfig({ goal: { type: GOAL_TYPE.MIXED, score: 500, collect: { frog: 2 }, clearIce: 3 } }));
  level.clearedIce = 3;
  assertFalse(checkGoal(level, null, 500, { frog: 1 }), '收集差一只 → 未达成');
  assertTrue(checkGoal(level, null, 500, { frog: 2 }), '三项都达标');
  assertFalse(checkGoal(level, null, 499, { frog: 2 }), '分数差 1 分 → 未达成');
  level.clearedIce = 2;
  assertFalse(checkGoal(level, null, 500, { frog: 2 }), '冰块差 1 层 → 未达成');

  const empty = createLevel(levelConfig({ goal: { type: GOAL_TYPE.MIXED } }));
  assertFalse(checkGoal(empty, null, 1e9, { frog: 99 }), '没有配置任何分项的 mixed 不算达成');
});

test('checkGoal：未知/非法目标一律返回 false（保守，不抛错打断整局）', () => {
  assertFalse(checkGoal(null, null, 0, {}), 'level 为空');
  assertFalse(checkGoal({ goal: null }, null, 0, {}), 'goal 为空');
  assertFalse(checkGoal({ goal: { type: 'nope' } }, null, 0, {}), '未知类型');
});

// ---------------------------------------------------------------- Step 12.1：3.7 三星

test('calcStars：分数落在哪一档就是几星（0 = 未达 1★ 线）', () => {
  const thresholds = [1000, 2000, 3000];
  assertEqual(calcStars(0, thresholds), 0, '0 分');
  assertEqual(calcStars(999, thresholds), 0, '1★ 线下一分');
  assertEqual(calcStars(1000, thresholds), 1, '刚好 1★');
  assertEqual(calcStars(1999, thresholds), 1, '1★ 区间');
  assertEqual(calcStars(2000, thresholds), 2, '刚好 2★');
  assertEqual(calcStars(2999, thresholds), 2, '2★ 区间');
  assertEqual(calcStars(3000, thresholds), 3, '刚好 3★');
  assertEqual(calcStars(99999, thresholds), 3, '远超 3★');
});

test('calcStars：非法入参按 0 星处理（不抛错）', () => {
  assertEqual(calcStars(5000, [1, 2]), 0, '阈值不是三元组');
  assertEqual(calcStars(5000, undefined), 0, '阈值缺失');
  assertEqual(calcStars(Number.NaN, [1, 2, 3]), 0, '分数 NaN');
});

if (!globalThis.__XXL_TEST_BUNDLE__) summarize();
