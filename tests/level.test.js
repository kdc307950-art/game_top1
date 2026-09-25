// tests/level.test.js — level.js 的单元测试。见 AGENTS.md 7.1 与 ROADMAP Step 4 / Step 12.1 / Step 20。
//
// Step 4 实现了 createLevel / consumeStep；Step 12.1 补上 checkGoal（3.6 四种目标）与 calcStars（3.7 三星）；
// Step 20（v1.25）把星阈值改成**统一动态派生** `computeStarThresholds`，并移除 `getRemainingStepBonus`。

import { test, assertEqual, assertTrue, assertFalse, assertDeepEqual, assertThrows, summarize } from './assert.js';
import { BOOSTER_KIND, COLLECTIBLE_TYPE, CONFIG, GOAL_TYPE, OBSTACLE_TYPE, STORAGE_KEYS } from '../config.js';
import {
  DEMO_LEVEL_ID,
  DEMO_LEVEL_IDS,
  LEVEL_COUNT,
  calcStars,
  checkGoal,
  collectibleSpecsFor,
  computeStarThresholds,
  computeStepBudget,
  computeTimeBudget,
  computeRainbowThreshold,
  consumeStep,
  consumeTime,
  createLevel,
  getLevelConfig,
  grantSteps,
  grantTime,
  HIDDEN_LEVEL_IDS,
  isLevelUnlocked,
  isRainbowEarned,
  isTianbianOpen,
  isTimeLevel,
  unlockStarsFor
} from '../level.js';
import { estimateSettlementScore, settlementStepsScore, stepScoreRatio } from '../settlement.js';

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

test('computeStarThresholds（Step 20）：1★ 不动，2★/3★ = 倍率 × 基准分 + 结算期望修正', () => {
  const round500 = (v) => Math.round(v / 500) * 500;
  const stars = CONFIG.STAR_CONFIG;
  const t = computeStarThresholds(10000, 30);
  const correction = round500(estimateSettlementScore(10000, 30) * stars.settlementCoverage);

  assertEqual(t[0], 10000, '1★ = 设计基准分（结算修正不上移 1★）');
  assertEqual(t[1], round500(10000 * stars.secondFactor) + correction, '2★ = 1.7× 基准分 + 修正');
  assertEqual(t[2], round500(10000 * stars.thirdFactor) + correction, '3★ = 2.5× 基准分 + 修正');
  assertTrue(t[0] <= t[1] && t[1] <= t[2], '三元组非递减（4.4 约束）');

  // 「统一动态」的两条性质：同一公式，输入随关卡变化
  assertTrue(computeStarThresholds(20000, 30)[2] > t[2], '基准分更高 → 3★ 更高');
  assertTrue(computeStarThresholds(10000, 34)[1] >= t[1], '步数预算更多 → 2★ 修正不少于');
  assertTrue(computeStarThresholds(10000, 30, { pod: true })[2] > t[2], '金豆荚关阈值更高（3.6 v1.18）');

  // 时间关没有步数 ⇒ 没有结算阶段 ⇒ 修正为 0
  assertEqual(
    computeStarThresholds(3000, 0)[1],
    round500(3000 * stars.secondFactor),
    'steps = 0（时间关）没有结算修正'
  );

  // 50 关的星阈值全部由这一条公式派生（不再手写）
  for (const id of [1, 12, 25, 40, 50]) {
    const cfg = getLevelConfig(id);
    assertDeepEqual(cfg.starThresholds, computeStarThresholds(cfg.starThresholds[0], cfg.steps, {
      pod: cfg.goal.type === GOAL_TYPE.POD
    }), `第 ${id} 关阈值可由公式复算`);
  }
});

test('settlement 的奖励分是递增制且量级受限（3.5 / Step 20）', () => {
  assertEqual(stepScoreRatio(1) < stepScoreRatio(6), true, '前 6 步逐级递增');
  assertEqual(stepScoreRatio(6), stepScoreRatio(99), '第 7 步起取末值（递增制封顶）');
  assertEqual(stepScoreRatio(0), 0, '非法下标按 0');
  assertEqual(settlementStepsScore(0, 5000), 0, '0 步 = 0 分');
  assertEqual(settlementStepsScore(-3, 5000), 0, '负数按 0');
  assertTrue(settlementStepsScore(5, 5000) < settlementStepsScore(6, 5000), '步数越多分越高');

  // 量纲护栏：**满余步的奖励分不超过该关 1★ 基准分**，否则结算阶段会单方面把每关推成三星
  for (const id of [1, 10, 20, 30, 40, 50]) {
    const cfg = getLevelConfig(id);
    const full = settlementStepsScore(Math.max(0, cfg.steps - 1), cfg.starThresholds[0]);
    assertTrue(full <= cfg.starThresholds[0], `第 ${id} 关满余步奖励分 ${full} ≤ 1★ 基准分 ${cfg.starThresholds[0]}`);
  }
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

// ---------------------------------------------------------------- Step 12.2：步数由难度派生

test('computeStepBudget：障碍越多/越厚/色数越多 → 步数越少（难度绑定）', () => {
  const goal = { type: GOAL_TYPE.SCORE, target: 10000 };
  const plain = computeStepBudget({ colorCount: 5, goal, obstacles: [] });
  const oneLayer = computeStepBudget({ colorCount: 5, goal, obstacles: [{ r: 1, c: 1, type: 'ice', layers: 1 }, { r: 1, c: 6, type: 'ice', layers: 1 }, { r: 6, c: 1, type: 'ice', layers: 1 }, { r: 6, c: 6, type: 'ice', layers: 1 }] });
  const fourLayers = computeStepBudget({ colorCount: 5, goal, obstacles: [{ r: 1, c: 1, type: 'ice', layers: 3 }, { r: 1, c: 6, type: 'ice', layers: 3 }, { r: 6, c: 1, type: 'ice', layers: 3 }, { r: 6, c: 6, type: 'ice', layers: 3 }] });
  const manyCells = computeStepBudget({
    colorCount: 5,
    goal,
    obstacles: Array.from({ length: 8 }, (_, i) => ({ r: Math.floor(i / 4) + 1, c: (i % 4) + 1, type: 'ice', layers: 1 }))
  });
  const sixColors = computeStepBudget({ colorCount: 6, goal, obstacles: [] });

  assertTrue(plain > oneLayer, `无阻碍 ${plain} > 1 层障碍 ${oneLayer}`);
  assertTrue(oneLayer > fourLayers, `1 层 ${oneLayer} > 4 层 ${fourLayers}`);
  assertTrue(oneLayer > manyCells, `1 格 ${oneLayer} > 2 格 ${manyCells}`);
  assertTrue(plain > sixColors, `5 色 ${plain} > 6 色 ${sixColors}`);
});

test('computeStepBudget：目标越大步数越多（四种目标都能折算）', () => {
  const small = computeStepBudget({ colorCount: 5, goal: { type: GOAL_TYPE.SCORE, target: 4000 }, obstacles: [] });
  const large = computeStepBudget({ colorCount: 5, goal: { type: GOAL_TYPE.SCORE, target: 8000 }, obstacles: [] });
  assertTrue(large > small, `分数目标 4000→${small}，8000→${large}`);

  const collectSmall = computeStepBudget({ colorCount: 5, goal: { type: GOAL_TYPE.COLLECT, targets: { frog: 4 } }, obstacles: [] });
  const collectLarge = computeStepBudget({ colorCount: 5, goal: { type: GOAL_TYPE.COLLECT, targets: { frog: 20 } }, obstacles: [] });
  assertTrue(collectLarge > collectSmall, `收集 4→${collectSmall}，20→${collectLarge}`);

  const iceSmall = computeStepBudget({ colorCount: 5, goal: { type: GOAL_TYPE.CLEAR_ICE, target: 4 }, obstacles: [] });
  const iceLarge = computeStepBudget({ colorCount: 5, goal: { type: GOAL_TYPE.CLEAR_ICE, target: 24 }, obstacles: [] });
  assertTrue(iceLarge > iceSmall, `消冰 4→${iceSmall}，24→${iceLarge}`);

  // 注意：分档会被 [min, max] 夹取，因此这里用不触发夹取的量级比较（夹取本身由下一个用例断言）
  const mid = computeStepBudget({ colorCount: 5, goal: { type: GOAL_TYPE.SCORE, target: 6000 }, obstacles: [] });
  const mixed = computeStepBudget({ colorCount: 5, goal: { type: GOAL_TYPE.MIXED, score: 4000, clearIce: 4 }, obstacles: [] });
  assertTrue(mixed > small && mixed < large, `混合目标落在两端之间：${small} < ${mixed} < ${large}（另一档 ${mid}）`);
});

test('computeStepBudget：结果夹在 [min, max] 内，且同一配置永远算出同一步数', () => {
  const budget = CONFIG.STEP_BUDGET;
  const heavy = Array.from({ length: 12 }, (_, i) => ({ r: Math.floor(i / 4) + 1, c: (i % 4) + 1, type: 'snow', layers: 5 }));
  const tiny = computeStepBudget({ colorCount: 6, goal: { type: GOAL_TYPE.SCORE, target: 1 }, obstacles: heavy });
  const huge = computeStepBudget({ colorCount: 5, goal: { type: GOAL_TYPE.MIXED, score: 999999, clearIce: 999 }, obstacles: [] });
  assertEqual(tiny, budget.min, '极小目标被夹到下限');
  assertEqual(huge, budget.max, '极大目标被夹到上限');

  const config = { colorCount: 5, goal: { type: GOAL_TYPE.SCORE, target: 9000 }, obstacles: [{ r: 1, c: 1, type: 'ice', layers: 2 }] };
  assertEqual(computeStepBudget(config), computeStepBudget(config), '同一配置两次结果一致（设计期派生，无随机）');
  assertTrue(computeStepBudget({ colorCount: 5, goal: null, obstacles: [] }) > 0, '缺 goal 时回落到纯基准步数，不抛错');
});


// ---------------------------------------------------------------- Step 12.2：50 关表

test('getLevelConfig：50 关都能取出合法配置（步数 = 公式派生、障碍 ≤ 12 格且 ≤ 2 类、星阈值非递减）', () => {
  assertEqual(LEVEL_COUNT, 50, '关卡总数');
  for (let id = 1; id <= LEVEL_COUNT; id += 1) {
    const config = getLevelConfig(id);
    assertEqual(config.id, id, `L${id} id`);
    assertTrue([5, 6].includes(config.colorCount), `L${id} 色数 ${config.colorCount}`);
    assertTrue(config.steps >= CONFIG.STEP_BUDGET.min && config.steps <= CONFIG.STEP_BUDGET.max, `L${id} 步数 ${config.steps}`);
    assertEqual(config.steps, computeStepBudget(config), `L${id} 步数等于公式派生`);
    assertTrue(config.obstacles.length <= 12, `L${id} 障碍格 ${config.obstacles.length} ≤ 12`);
    assertTrue(new Set(config.obstacles.map((o) => o.type)).size <= 2, `L${id} 障碍类型 ≤ 2`);
    const [a, b, c] = config.starThresholds;
    assertTrue(a <= b && b <= c, `L${id} 星阈值非递减 ${config.starThresholds.join('/')}`);
    assertTrue(a > 0, `L${id} 1★ 为正`);
  }
});

test('getLevelConfig：越界 id 夹到 [1, 50]，id 0 是演示关，非法 id 回落第 1 关', () => {
  assertEqual(getLevelConfig(0).id, DEMO_LEVEL_ID, '0 → Step 13 演示关（不在 50 关表内）');
  assertEqual(getLevelConfig(-5).id, 1, '负数 → 1');
  assertEqual(getLevelConfig(999).id, 50, '超上限 → 50');
  assertEqual(getLevelConfig(Number.NaN).id, 1, 'NaN → 1');
});

test('getLevelConfig：关卡曲线符合 LEVELS.md 的机制引入点', () => {
  assertEqual(getLevelConfig(1).obstacles.length, 0, 'L1 无障碍');
  assertTrue(getLevelConfig(4).obstacles.some((o) => o.type === 'ice'), 'L4 首次冰块');
  assertTrue(getLevelConfig(11).obstacles.some((o) => o.type === 'snow'), 'L11 首次雪块');
  assertEqual(getLevelConfig(13).goal.type, 'collect', 'L13 首次收集目标');
  assertEqual(getLevelConfig(31).goal.type, 'clearIce', 'L31 首次消冰目标');
  assertEqual(getLevelConfig(41).goal.type, 'mixed', 'L41 首次混合目标');
  assertEqual(getLevelConfig(50).starThresholds[0], 40000, 'L50 1★ = 设计基准 40000');
});

test('Step 13 演示关（id 0）：含藤蔓与巧克力，并满足 3.6 的硬指标与步数派生', () => {
  const demo = getLevelConfig(DEMO_LEVEL_ID);
  const types = new Set(demo.obstacles.map((o) => o.type));
  assertTrue(types.has(OBSTACLE_TYPE.VINE), '含藤蔓');
  assertTrue(types.has(OBSTACLE_TYPE.CHOC), '含巧克力');
  assertEqual(types.size, 2, '障碍物类型恰为 2 种（3.6 第 1 条上限）');
  assertTrue(demo.obstacles.length <= 12, `障碍格 ${demo.obstacles.length} ≤ 12（3.6 第 2 条）`);
  assertEqual(demo.steps, computeStepBudget(demo), '步数仍是公式派生（3.6 第 6 条）');
  assertTrue(demo.steps >= CONFIG.STEP_BUDGET.min && demo.steps <= CONFIG.STEP_BUDGET.max, '步数夹在 [min, max]');
  assertTrue(demo.obstacles.every((o) => o.layers >= 1), '障碍物层数都 ≥ 1（v1.17 上限均为 1）');
});

// ---------------------------------------------------------------- Step 14：关卡类型（水果关 / 时间关 / 金豆荚关）

test('createLevel（v1.19）：时间关 steps = 0、remainingTime = timeLimit，非时间关不受影响', () => {
  const timed = createLevel(levelConfig({ steps: 0, timeLimit: 60 }));
  assertEqual(timed.remainingTime, 60, 'remainingTime 初值 = timeLimit');
  assertTrue(isTimeLevel(timed), 'isTimeLevel 为真');
  assertEqual(timed.remainingSteps, 0, '时间关没有步数');

  const normal = createLevel(levelConfig());
  assertEqual(normal.remainingTime, 0, '非时间关 remainingTime 为 0');
  assertFalse(isTimeLevel(normal), '非时间关 isTimeLevel 为假');
});

test('createLevel（v1.19）：steps/timeLimit 的边界校验逐条生效', () => {
  assertThrows(() => createLevel(levelConfig({ steps: 0 })), '非时间关 steps 为 0 仍非法');
  assertThrows(() => createLevel(levelConfig({ timeLimit: 0 })), 'timeLimit 为 0 非法');
  assertThrows(() => createLevel(levelConfig({ timeLimit: 1.5 })), 'timeLimit 非整数非法');
  assertThrows(() => createLevel(levelConfig({ timeLimit: -3 })), 'timeLimit 为负非法');
  assertTrue(createLevel(levelConfig({ steps: 0, timeLimit: 1 })).timeLimit === 1, 'timeLimit = 1 合法');
});

test('createLevel（v1.19）：collectibles 不与外部配置共享引用', () => {
  const spec = { r: 0, c: 1, type: COLLECTIBLE_TYPE.FRUIT };
  const config = levelConfig({ collectibles: [spec] });
  const level = createLevel(config);
  level.collectibles.push({ r: 1, c: 1, type: COLLECTIBLE_TYPE.FRUIT });
  assertEqual(config.collectibles.length, 1, '外部 collectibles 未被改写');
  assertDeepEqual(level.collectibles[0], spec, '收集物落点原样保留');
});

test('consumeTime（v1.19）：按秒递减，归零后保持 0（3.6 第 8 条）', () => {
  const level = createLevel(levelConfig({ steps: 0, timeLimit: 10 }));
  assertEqual(consumeTime(level, 3), 7, '第一次');
  assertEqual(consumeTime(level, 4.5), 2.5, '小数秒也接受（UI 传真实经过时间）');
  assertEqual(consumeTime(level, 99), 0, '归零');
  assertEqual(consumeTime(level, 1), 0, '不再变负');
  assertEqual(consumeTime(level, -5), 0, '负数秒不增加时间');
});

test('checkGoal（v1.19）：水果关/金豆荚关比各自的收集计数', () => {
  const fruit = createLevel(levelConfig({ goal: { type: GOAL_TYPE.FRUIT, target: 2 } }));
  assertFalse(checkGoal(fruit, null, 0, {}), '一个都没收 → 未达成');
  fruit.collectedFruit = 1;
  assertFalse(checkGoal(fruit, null, 999999, {}), '分数再高也不算达成水果目标');
  fruit.collectedFruit = 2;
  assertTrue(checkGoal(fruit, null, 0, {}), '收满 2 个 → 达成');

  const pod = createLevel(levelConfig({ goal: { type: GOAL_TYPE.POD, target: 1 } }));
  assertFalse(checkGoal(pod, null, 0, {}), '豆荚未收 → 未达成');
  pod.collectedPod = 1;
  assertTrue(checkGoal(pod, null, 0, {}), '豆荚收满 → 达成');
  pod.collectedFruit = 5;
  assertTrue(checkGoal(pod, null, 0, {}), '水果计数不影响豆荚目标');
});

test('computeTimeBudget（v1.19）：夹在 [min, max]、确定性、障碍越多越短、目标越大越长', () => {
  const base = { colorCount: 5, obstacles: [], goal: { type: GOAL_TYPE.SCORE, target: 3000 } };
  const value = computeTimeBudget(base);
  assertEqual(value, computeTimeBudget(base), '同一配置永远算出同一时长（设计期派生）');
  assertTrue(value >= CONFIG.TIME_CONFIG.minSeconds && value <= CONFIG.TIME_CONFIG.maxSeconds, `夹在 [min,max]：${value}`);

  const heavier = computeTimeBudget({ ...base, obstacles: [{ r: 0, c: 0, type: 'ice', layers: 3 }, { r: 0, c: 1, type: 'snow', layers: 5 }] });
  assertTrue(heavier < value, `障碍摩擦扣时间：${heavier} < ${value}`);

  const bigger = computeTimeBudget({ ...base, goal: { type: GOAL_TYPE.SCORE, target: 20000 } });
  assertTrue(bigger > value, `目标越大时间越多：${bigger} > ${value}`);
  assertEqual(computeTimeBudget({ ...base, goal: { type: GOAL_TYPE.SCORE, target: 10 ** 9 } }), CONFIG.TIME_CONFIG.maxSeconds, '上限');
});

test('computeStepBudget/computeTimeBudget（v1.19）：收集物目标也折算工作量', () => {
  const fruit = { colorCount: 5, obstacles: [], goal: { type: GOAL_TYPE.FRUIT, target: 12 } };
  const pod = { colorCount: 5, obstacles: [], goal: { type: GOAL_TYPE.POD, target: 12 } };
  const one = { colorCount: 5, obstacles: [], goal: { type: GOAL_TYPE.FRUIT, target: 4 } };
  assertEqual(computeStepBudget(fruit), computeStepBudget(pod), '两种收集物目标的工作量相同（同用 collectUnit）');
  assertTrue(computeStepBudget(fruit) > computeStepBudget(one), '目标越大步数越多');
  assertTrue(computeTimeBudget(fruit) > computeTimeBudget(one), '目标越大时长越长');
});

test('collectibleSpecsFor（v1.19）：数量 = 目标数、坐标唯一、全部落在棋盘顶部', () => {
  const specs = collectibleSpecsFor({ type: GOAL_TYPE.FRUIT, target: 4 }, 8, 8);
  assertEqual(specs.length, 4, '数量 = 目标数');
  assertEqual(new Set(specs.map((s) => `${s.r},${s.c}`)).size, 4, '落点互不重叠（否则会互相覆盖）');
  assertTrue(specs.every((s) => s.r === 0), '4 个水果都在第 0 行（棋盘顶部，3.6 v1.18）');
  assertTrue(specs.every((s) => s.type === COLLECTIBLE_TYPE.FRUIT), '类型正确');
  assertTrue(specs.every((s) => s.c >= 0 && s.c < 8), '列号在棋盘内');

  const overflow = collectibleSpecsFor({ type: GOAL_TYPE.POD, target: 20 }, 8, 8);
  assertEqual(overflow.length, 20, '超过一行时向下一行铺开');
  assertEqual(new Set(overflow.map((s) => `${s.r},${s.c}`)).size, 20, '跨行也互不重叠');
  assertTrue(overflow.every((s) => s.r >= 0 && s.r < 8), '行号在棋盘内');
  assertDeepEqual(collectibleSpecsFor({ type: GOAL_TYPE.SCORE, target: 5 }, 8, 8), [], '非收集物目标不产生落点');
});

test('Step 14 演示关（id 51/52/53）：三种类型各自满足 v1.18/v1.19 的口径', () => {
  const fruit = getLevelConfig(DEMO_LEVEL_IDS.fruit);
  assertEqual(fruit.goal.type, GOAL_TYPE.FRUIT, '51 = 水果关');
  assertEqual(fruit.collectibles.length, fruit.goal.target, '水果数量 = 目标数');
  assertTrue(fruit.collectibles.every((s) => s.type === COLLECTIBLE_TYPE.FRUIT), '落点都是水果');
  assertEqual(fruit.steps, computeStepBudget(fruit), '步数仍是公式派生（3.6 第 6 条）');

  const pod = getLevelConfig(DEMO_LEVEL_IDS.pod);
  assertEqual(pod.goal.type, GOAL_TYPE.POD, '53 = 金豆荚关');
  assertTrue(pod.collectibles.every((s) => s.type === COLLECTIBLE_TYPE.POD), '落点都是金豆荚');

  const timed = getLevelConfig(DEMO_LEVEL_IDS.time);
  assertEqual(timed.steps, 0, '52 = 时间关：没有步数（3.6 v1.18）');
  assertEqual(timed.timeLimit, computeTimeBudget(timed), '时长由公式派生（3.6 第 8 条）');
  assertTrue(isTimeLevel(createLevel(timed)), 'createLevel 后仍被识别为时间关');
  assertDeepEqual(timed.collectibles, [], '时间关本身不产出收集物');
});

test('金豆荚关的三星阈值更高（3.6 v1.18 + STAR_CONFIG.podFactor）', () => {
  const fruit = getLevelConfig(DEMO_LEVEL_IDS.fruit);
  const pod = getLevelConfig(DEMO_LEVEL_IDS.pod);
  assertEqual(fruit.starThresholds[0], pod.starThresholds[0], '1★ 都是设计基准分（3.7 不变）');
  assertTrue(pod.starThresholds[1] > fruit.starThresholds[1], `2★ 更高：${pod.starThresholds[1]} > ${fruit.starThresholds[1]}`);
  assertTrue(pod.starThresholds[2] > fruit.starThresholds[2], `3★ 更高：${pod.starThresholds[2]} > ${fruit.starThresholds[2]}`);
});

test('Step 14 不改 50 关表：三种类型都不在 1-50 关里（v1.18 第 4 条）', () => {
  for (let id = 1; id <= LEVEL_COUNT; id += 1) {
    const config = getLevelConfig(id);
    assertFalse([GOAL_TYPE.FRUIT, GOAL_TYPE.POD].includes(config.goal.type), `L${id} 的目标不是水果/豆荚关`);
    assertEqual(config.timeLimit, undefined, `L${id} 不是时间关`);
    assertDeepEqual(config.collectibles, [], `L${id} 没有收集物`);
  }
});

// ---------------------------------------------------------------- Step 15：道具（v1.20 / 3.9）

test('grantSteps/grantTime（v1.20）：加五步在两种关卡上分别加步数 / 加秒数', () => {
  const normal = createLevel(levelConfig({ steps: 10 }));
  assertEqual(grantSteps(normal, 5), 15, '步数关 +5');
  assertEqual(grantSteps(normal, -3), 15, '负数不加');
  assertEqual(grantSteps(normal, Number.NaN), 15, 'NaN 不加');
  assertEqual(grantSteps(normal, 2.7), 17, '小数按整数加成');

  const timed = createLevel(levelConfig({ steps: 0, timeLimit: 20 }));
  assertEqual(grantTime(timed, CONFIG.BOOSTER_CONFIG.extraSeconds), 20 + CONFIG.BOOSTER_CONFIG.extraSeconds, '时间关加秒');
  assertEqual(timed.remainingSteps, 0, '时间关的步数始终是 0（3.6 第 8 条）');
  assertEqual(grantTime(timed, -5), 20 + CONFIG.BOOSTER_CONFIG.extraSeconds, '负数不加秒');
});

test('BOOSTER_CONFIG（v1.20）：四个键都取自 config.js（逻辑层不写魔法数字）', () => {
  assertEqual(CONFIG.BOOSTER_CONFIG.initialCount, 3, '初始数量');
  assertEqual(CONFIG.BOOSTER_CONFIG.extraSteps, 5, '加五步的步数');
  assertEqual(CONFIG.BOOSTER_CONFIG.extraSeconds, 10, '时间关的秒数');
  assertEqual(CONFIG.BOOSTER_CONFIG.hammerCells, 1, '小木锤的格数');
  assertDeepEqual(Object.values(BOOSTER_KIND).sort(), ['addSteps', 'hammer', 'refresh'], '道具类型常量');
});

// ---------------------------------------------------------------------------
// Step 19.3（v1.28）：解锁门槛（3.6 的解锁规则）—— 只按累计星数、第 1 关恒解锁、反锁保护
// ---------------------------------------------------------------------------

test('解锁门槛：第 1 关恒为 0、按 starsPerLevel 单调递增、隐藏关在天边云层之后', () => {
  const cfg = CONFIG.UNLOCK_CONFIG;
  assertTrue(cfg.starsPerLevel > 0, '门槛斜率是正数（否则门槛失去意义）');
  assertEqual(unlockStarsFor(1), 0, '第 1 关恒解锁');
  assertEqual(unlockStarsFor(0), 0, '非法关号按第 1 关处理');
  assertEqual(unlockStarsFor(-5), 0, '负数关号也夹到 0');

  let previous = -1;
  for (let id = 1; id <= LEVEL_COUNT; id += 1) {
    const need = unlockStarsFor(id);
    assertTrue(need >= previous, `门槛单调不减（L${id} = ${need} ≥ ${previous}）`);
    assertEqual(need, Math.round((id - 1) * cfg.starsPerLevel), `L${id} 的门槛 = round((id−1) × starsPerLevel)`);
    previous = need;
  }
  assertEqual(unlockStarsFor(50), 59, '第 50 关需 59 星（1.20 × 49 = 58.8 → 59）');
  assertTrue(LEVEL_COUNT * 3 >= unlockStarsFor(LEVEL_COUNT), '门槛不超过总星数上限（否则主线永远打不完）');

  for (const id of HIDDEN_LEVEL_IDS) {
    assertEqual(unlockStarsFor(id), cfg.tianbianStars, `隐藏关 L${id} 的门槛 = 天边门槛 ${cfg.tianbianStars}`);
  }
  assertDeepEqual(HIDDEN_LEVEL_IDS, [DEMO_LEVEL_IDS.fruit, DEMO_LEVEL_IDS.time, DEMO_LEVEL_IDS.pod], '隐藏关就是三个演示关');
});

test('解锁判定：门槛边界（差 1 星 / 刚好达标）与「已通关的关卡永远可玩」的反锁保护', () => {
  const need = unlockStarsFor(21);
  assertFalse(isLevelUnlocked(21, { totalStars: need - 1 }), `差 1 星 → 锁住（${need - 1} < ${need}）`);
  assertTrue(isLevelUnlocked(21, { totalStars: need }), '刚好达标 → 解锁');

  // 反锁保护：只要这一关拿过星（earned ≥ 1），门槛再高也放行 —— 老存档不会被新规则锁回去
  assertTrue(isLevelUnlocked(50, { earned: 1, totalStars: 0 }), '已通关的第 50 关在 0 星存档下仍可玩');
  assertTrue(isLevelUnlocked(50, { earned: 3, totalStars: 10 }), '3 星同理');
  assertFalse(isLevelUnlocked(50, { earned: 0, totalStars: unlockStarsFor(50) - 1 }), '没通关过 + 星数不够 → 仍然锁住');

  // 脏数据：非数字/负数都不放行，也不抛错
  assertFalse(isLevelUnlocked(30, { totalStars: 'x' }), '脏星数按 0 处理');
  assertFalse(isLevelUnlocked(30, {}), '缺省参数 = 0 星 0 通关记录');
});

test('天边云层：门槛来自 UNLOCK_CONFIG.tianbianStars，且隐藏关不计入总星数上限', () => {
  const cfg = CONFIG.UNLOCK_CONFIG;
  assertEqual(cfg.tianbianStars, 120, '天边门槛 120 星');
  assertFalse(isTianbianOpen(cfg.tianbianStars - 1), '差 1 星时云层仍在');
  assertTrue(isTianbianOpen(cfg.tianbianStars), '达标即散去');
  assertTrue(cfg.tianbianStars <= LEVEL_COUNT * 3, '天边门槛不超过主线满星数');
  assertTrue(HIDDEN_LEVEL_IDS.every((id) => id > LEVEL_COUNT), '隐藏关在主线圈之外');
  assertEqual(LEVEL_COUNT, 50, '主线仍是 50 关（总星数分母 150 不变）');
});

// ---------------------------------------------------------------------------
// Step 24（v1.38 / D052）：彩星分数线与获得条件（分数制：彩星线 = 三星阈值 × rainbowFactor）
// ---------------------------------------------------------------------------
test('彩星线 = round500(三星阈值 × STAR_CONFIG.rainbowFactor)，且严格高于三星线', () => {
  const factor = CONFIG.STAR_CONFIG.rainbowFactor;
  assertEqual(factor, 1.15, '系数取自附录 B（默认 1.15）');
  assertEqual(computeRainbowThreshold(20000), 23000, '20000 × 1.15 = 23000（已对齐 500 格）');
  assertEqual(computeRainbowThreshold(12340), 14000, '12340 × 1.15 = 14191 → 取整到 14000');
  assertEqual(computeRainbowThreshold(0), 0, '没有三星阈值就没有彩星线（不造出「0 分也能拿彩星」的漏洞）');
  assertEqual(computeRainbowThreshold(-5), 0, '脏输入按 0 处理');
  // 50 关 + 全部演示关：彩星线都必须严格高于三星阈值
  const ids = [...Array(LEVEL_COUNT)].map((_, i) => i + 1).concat(DEMO_LEVEL_IDS);
  for (const id of ids) {
    const cfg = getLevelConfig(id);
    const t3 = cfg.starThresholds[2];
    assertTrue(cfg.rainbowThreshold > t3, `第 ${id} 关彩星线 ${cfg.rainbowThreshold} > 三星线 ${t3}`);
    assertEqual(cfg.rainbowThreshold, computeRainbowThreshold(t3), `第 ${id} 关彩星线由公式派生（不手写）`);
    const ratio = cfg.rainbowThreshold / t3;
    assertTrue(ratio >= 1.1 && ratio <= 1.2, `第 ${id} 关彩星线 / 三星线 = ${ratio.toFixed(3)} 落在 [1.10, 1.20]`);
  }
});

test('彩星只在「通关 + 最终分 ≥ 彩星线」时获得', () => {
  const cfg = getLevelConfig(1);
  const base = { rainbowThreshold: cfg.rainbowThreshold, currentScore: cfg.rainbowThreshold, completed: true };
  assertTrue(isRainbowEarned(base), '刚好达到彩星线 → 给');
  assertTrue(isRainbowEarned({ ...base, currentScore: cfg.rainbowThreshold + 1 }), '超过彩星线 → 给');
  assertFalse(isRainbowEarned({ ...base, currentScore: cfg.rainbowThreshold - 1 }), '差 1 分 → 不给');
  assertFalse(isRainbowEarned({ ...base, completed: false }), '未通关（步数用尽/时间到）→ 即使分数够也不给');
  assertFalse(isRainbowEarned({ ...base, rainbowThreshold: undefined }), '关卡没有彩星线 → 不给');
  assertFalse(isRainbowEarned({ ...base, rainbowThreshold: 0 }), '彩星线为 0（异常数据）→ 不给');
  assertFalse(isRainbowEarned(null), '空对象 → 不给');
});

if (!globalThis.__XXL_TEST_BUNDLE__) await summarize();
