// level.js — 关卡配置、目标追踪、步数消耗、三星判定。见 AGENTS.md 2.3 / 4.2 / 4.4 / 3.6 / 3.7。
//
// 纯逻辑模块：不碰 DOM / Canvas / localStorage（宪法 9 节）。
//
// 【Step 4】已实现 createLevel / consumeStep / getRemainingStepBonus。
// 【Step 12 实现】checkGoal（3.6 关卡目标）与 calcStars（3.7 三星评分）。
//   Step 4 的禁止项明确含「实现三星评分」，关卡目标也属 Step 12，故这里不留空壳函数 ——
//   空壳会被误读成「已实现」，违约风险高于省一次编辑。
//
// consumeStep 不在 4.2 的清单里，属**契约扩展**：宪法 2.3 规定 level.js 的职责包含
// 「步数消耗」，而 4.2 未给出对应签名，故在此登记（见 D016）。

import { COLLECTIBLE_TYPE, CONFIG, GOAL_TYPE, OBSTACLE_TYPE } from './config.js';

const GOAL_TYPES = new Set(Object.values(GOAL_TYPE));

/**
 * Step 11：当前可玩关卡的配置（4.4 的 LevelConfig）。
 * 为什么放在 level.js 而不是 app.js：2.3 规定本模块的职责就是「关卡配置、目标追踪、步数消耗、三星判定」；
 * Step 11 加入障碍物后 app.js 的纯代码行数越过第 6 节的 300 行上限，故把配置表挪回它该在的地方
 * （顺带为 Step 12 的关卡目标/三星评分留出位置）。数值仍全部取自 config.js 已登记的键。
 *
 * obstacles 是一组**演示用**布局：4 颗 2 层冰块 + 2 块 3 层雪块 —— 覆盖覆层与占格两类障碍，
 * 层数也都留出「需要多次消除」的观感又不至于 30 步内破不掉。
 */
/** 关卡总数（选关界面与「下一关」流转用）。 */
export const LEVEL_COUNT = 50;
// 图案表
const PATTERNS = {
  none: [],
  corners: [[1, 1], [1, 6], [6, 1], [6, 6]],
  center4: [[3, 3], [3, 4], [4, 3], [4, 4]],
  pinwheel: [[2, 2], [2, 5], [5, 2], [5, 5]],
  diagonal6: [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6]],
  twinCols: [[2, 2], [3, 2], [4, 2], [2, 5], [3, 5], [4, 5]],
  zigzag6: [[2, 2], [2, 3], [2, 4], [5, 3], [5, 4], [5, 5]],
  ring8: [[1, 1], [1, 6], [6, 1], [6, 6], [3, 3], [3, 4], [4, 3], [4, 4]],
  midRows8: [[3, 2], [3, 3], [3, 5], [3, 6], [4, 2], [4, 3], [4, 5], [4, 6]],
  full12: [[1, 1], [1, 6], [6, 1], [6, 6], [2, 2], [2, 5], [5, 2], [5, 5], [3, 3], [3, 4], [4, 3], [4, 4]],
};

// 50 关规格
const LEVEL_SPECS = [
  { id: 1, goal: { type: GOAL_TYPE.SCORE, target: 5000 }, colors: 5, pattern: 'none', star1: 5000 },
  { id: 2, goal: { type: GOAL_TYPE.SCORE, target: 6000 }, colors: 5, pattern: 'none', star1: 6000 },
  { id: 3, goal: { type: GOAL_TYPE.SCORE, target: 7000 }, colors: 5, pattern: 'none', star1: 7000 },
  { id: 4, goal: { type: GOAL_TYPE.SCORE, target: 8000 }, colors: 5, pattern: 'corners', ice: [4, 1], star1: 8000 },
  { id: 5, goal: { type: GOAL_TYPE.SCORE, target: 9000 }, colors: 5, pattern: 'corners', ice: [4, 2], star1: 9000 },
  { id: 6, goal: { type: GOAL_TYPE.SCORE, target: 10000 }, colors: 5, pattern: 'center4', ice: [4, 2], star1: 10000 },
  { id: 7, goal: { type: GOAL_TYPE.SCORE, target: 11000 }, colors: 5, pattern: 'pinwheel', ice: [4, 2], star1: 11000 },
  { id: 8, goal: { type: GOAL_TYPE.SCORE, target: 12000 }, colors: 5, pattern: 'diagonal6', ice: [6, 1], star1: 12000 },
  { id: 9, goal: { type: GOAL_TYPE.SCORE, target: 13000 }, colors: 5, pattern: 'twinCols', ice: [6, 2], star1: 13000 },
  { id: 10, goal: { type: GOAL_TYPE.SCORE, target: 14000 }, colors: 5, pattern: 'zigzag6', ice: [6, 2], star1: 14000 },
  { id: 11, goal: { type: GOAL_TYPE.SCORE, target: 15000 }, colors: 6, pattern: 'center4', snow: [4, 2], star1: 15000 },
  { id: 12, goal: { type: GOAL_TYPE.SCORE, target: 16000 }, colors: 6, pattern: 'ring8', ice: [4, 2], snow: [4, 2], star1: 16000 },
  { id: 13, goal: { type: GOAL_TYPE.COLLECT, targets: { frog: 12 } }, colors: 6, pattern: 'pinwheel', ice: [4, 2], star1: 15000 },
  { id: 14, goal: { type: GOAL_TYPE.COLLECT, targets: { frog: 14 } }, colors: 6, pattern: 'twinCols', ice: [4, 2], snow: [2, 2], star1: 16000 },
  { id: 15, goal: { type: GOAL_TYPE.COLLECT, targets: { frog: 16 } }, colors: 6, pattern: 'zigzag6', ice: [4, 2], snow: [2, 2], star1: 17000 },
  { id: 16, goal: { type: GOAL_TYPE.COLLECT, targets: { frog: 16 } }, colors: 6, pattern: 'ring8', ice: [4, 2], snow: [4, 2], star1: 18000 },
  { id: 17, goal: { type: GOAL_TYPE.COLLECT, targets: { frog: 18 } }, colors: 6, pattern: 'midRows8', ice: [4, 3], snow: [4, 2], star1: 19000 },
  { id: 18, goal: { type: GOAL_TYPE.COLLECT, targets: { hippo: 16 } }, colors: 6, pattern: 'diagonal6', ice: [6, 2], star1: 19000 },
  { id: 19, goal: { type: GOAL_TYPE.COLLECT, targets: { hippo: 18 } }, colors: 6, pattern: 'twinCols', ice: [4, 3], snow: [2, 2], star1: 20000 },
  { id: 20, goal: { type: GOAL_TYPE.COLLECT, targets: { hippo: 18 } }, colors: 6, pattern: 'zigzag6', ice: [3, 3], snow: [3, 2], star1: 20000 },
  { id: 21, goal: { type: GOAL_TYPE.COLLECT, targets: { hippo: 20 } }, colors: 6, pattern: 'center4', ice: [4, 3], star1: 21000 },
  { id: 22, goal: { type: GOAL_TYPE.COLLECT, targets: { ladybug: 18 } }, colors: 6, pattern: 'ring8', ice: [4, 3], snow: [4, 2], star1: 21000 },
  { id: 23, goal: { type: GOAL_TYPE.COLLECT, targets: { ladybug: 20 } }, colors: 6, pattern: 'midRows8', ice: [5, 3], snow: [3, 2], star1: 22000 },
  { id: 24, goal: { type: GOAL_TYPE.COLLECT, targets: { ladybug: 20 } }, colors: 6, pattern: 'pinwheel', ice: [4, 3], star1: 22000 },
  { id: 25, goal: { type: GOAL_TYPE.COLLECT, targets: { ladybug: 22 } }, colors: 6, pattern: 'twinCols', ice: [4, 3], snow: [2, 3], star1: 23000 },
  { id: 26, goal: { type: GOAL_TYPE.COLLECT, targets: { frog: 12, hippo: 12 } }, colors: 6, pattern: 'ring8', ice: [4, 3], snow: [4, 2], star1: 23000 },
  { id: 27, goal: { type: GOAL_TYPE.COLLECT, targets: { frog: 14, hippo: 14 } }, colors: 6, pattern: 'midRows8', ice: [4, 3], snow: [4, 2], star1: 24000 },
  { id: 28, goal: { type: GOAL_TYPE.COLLECT, targets: { frog: 14, hippo: 14 } }, colors: 6, pattern: 'full12', ice: [6, 3], snow: [6, 2], star1: 25000 },
  { id: 29, goal: { type: GOAL_TYPE.COLLECT, targets: { octopus: 18, fox: 18 } }, colors: 6, pattern: 'zigzag6', ice: [4, 3], snow: [2, 3], star1: 26000 },
  { id: 30, goal: { type: GOAL_TYPE.COLLECT, targets: { octopus: 20, fox: 20 } }, colors: 6, pattern: 'full12', ice: [6, 3], snow: [6, 3], star1: 27000 },
  { id: 31, goal: { type: GOAL_TYPE.CLEAR_ICE, target: 8 }, colors: 6, pattern: 'ring8', ice: [8, 2], star1: 20000 },
  { id: 32, goal: { type: GOAL_TYPE.CLEAR_ICE, target: 10 }, colors: 6, pattern: 'midRows8', ice: [6, 2], snow: [2, 2], star1: 21000 },
  { id: 33, goal: { type: GOAL_TYPE.CLEAR_ICE, target: 12 }, colors: 6, pattern: 'full12', ice: [8, 2], snow: [4, 2], star1: 22000 },
  { id: 34, goal: { type: GOAL_TYPE.CLEAR_ICE, target: 14 }, colors: 6, pattern: 'twinCols', ice: [6, 3], star1: 22000 },
  { id: 35, goal: { type: GOAL_TYPE.CLEAR_ICE, target: 16 }, colors: 6, pattern: 'full12', ice: [8, 3], snow: [4, 3], star1: 23000 },
  { id: 36, goal: { type: GOAL_TYPE.CLEAR_ICE, target: 18 }, colors: 6, pattern: 'midRows8', ice: [6, 3], snow: [2, 3], star1: 24000 },
  { id: 37, goal: { type: GOAL_TYPE.CLEAR_ICE, target: 20 }, colors: 6, pattern: 'full12', ice: [8, 3], snow: [4, 4], star1: 25000 },
  { id: 38, goal: { type: GOAL_TYPE.CLEAR_ICE, target: 22 }, colors: 6, pattern: 'midRows8', ice: [8, 3], star1: 26000 },
  { id: 39, goal: { type: GOAL_TYPE.CLEAR_ICE, target: 24 }, colors: 6, pattern: 'full12', ice: [8, 3], snow: [4, 4], star1: 27000 },
  { id: 40, goal: { type: GOAL_TYPE.CLEAR_ICE, target: 30 }, colors: 6, pattern: 'full12', ice: [10, 3], snow: [2, 5], star1: 28000 },
  { id: 41, goal: { type: GOAL_TYPE.MIXED, score: 20000, clearIce: 12 }, colors: 6, pattern: 'full12', ice: [6, 3], snow: [6, 3], star1: 20000 },
  { id: 42, goal: { type: GOAL_TYPE.MIXED, score: 22000, collect: { frog: 15 } }, colors: 6, pattern: 'ring8', ice: [4, 3], snow: [4, 3], star1: 22000 },
  { id: 43, goal: { type: GOAL_TYPE.MIXED, score: 24000, collect: { hippo: 15 } }, colors: 6, pattern: 'midRows8', ice: [4, 3], snow: [4, 3], star1: 24000 },
  { id: 44, goal: { type: GOAL_TYPE.MIXED, score: 26000, clearIce: 16 }, colors: 6, pattern: 'full12', ice: [6, 3], snow: [6, 4], star1: 26000 },
  { id: 45, goal: { type: GOAL_TYPE.MIXED, score: 28000, collect: { ladybug: 18 } }, colors: 6, pattern: 'full12', ice: [8, 3], snow: [4, 4], star1: 28000 },
  { id: 46, goal: { type: GOAL_TYPE.MIXED, score: 30000, clearIce: 18, collect: { frog: 15 } }, colors: 6, pattern: 'full12', ice: [6, 3], snow: [6, 4], star1: 30000 },
  { id: 47, goal: { type: GOAL_TYPE.MIXED, score: 32000, collect: { octopus: 18, fox: 18 } }, colors: 6, pattern: 'full12', ice: [8, 2], snow: [4, 3], star1: 32000 },
  { id: 48, goal: { type: GOAL_TYPE.MIXED, score: 34000, clearIce: 20, collect: { hippo: 18 } }, colors: 6, pattern: 'full12', ice: [8, 3], snow: [4, 4], star1: 34000 },
  { id: 49, goal: { type: GOAL_TYPE.MIXED, score: 36000, clearIce: 22, collect: { ladybug: 20, octopus: 20 } }, colors: 6, pattern: 'full12', ice: [8, 3], snow: [4, 4], star1: 36000 },
  { id: 50, goal: { type: GOAL_TYPE.MIXED, score: 40000, clearIce: 24, collect: { frog: 18, hippo: 18 } }, colors: 6, pattern: 'full12', ice: [8, 3], snow: [4, 5], star1: 40000 },
];
/**
 * 4.4 的 LevelConfig：按关卡 id 取出配置（1..LEVEL_COUNT，越界夹到区间内）。
 * 数据来自 `LEVELS.md` 的同名表（由 `_build/gen-level-table.mjs` 生成，`_build/check-level-table.mjs` 反向巡检），
 * 因此**改关卡先改文档**。步数不在这里手写：由 `computeStepBudget` 从难度派生（3.6 第 6 条）。
 * 障碍物按「命名图案 + 冰/雪格数与层数」展开成 4.4 的 ObstacleSpec[]。
 */
export function getLevelConfig(id) {
  const wanted = Number.isFinite(id) ? Math.round(id) : 1;
  const demo = demoLevelConfig(wanted);
  if (demo) return demo;
  const spec = LEVEL_SPECS.find((item) => item.id === Math.min(Math.max(wanted, 1), LEVEL_COUNT)) ?? LEVEL_SPECS[0];
  const coords = PATTERNS[spec.pattern] ?? [];
  const obstacles = [];
  const ice = spec.ice ?? [0, 0];
  const snow = spec.snow ?? [0, 0];
  for (let i = 0; i < ice[0]; i += 1) obstacles.push({ r: coords[i][0], c: coords[i][1], type: OBSTACLE_TYPE.ICE, layers: ice[1] });
  for (let i = 0; i < snow[0]; i += 1) {
    const cell = coords[ice[0] + i];
    if (cell) obstacles.push({ r: cell[0], c: cell[1], type: OBSTACLE_TYPE.SNOW, layers: snow[1] });
  }

  const config = {
    id: spec.id,
    rows: CONFIG.BOARD_SIZE,
    cols: CONFIG.BOARD_SIZE,
    colorCount: spec.colors,
    goal: spec.goal,
    starThresholds: starThresholdsOf(spec.star1),
    obstacles,
    collectibles: collectibleSpecsFor(spec.goal, CONFIG.BOARD_SIZE, CONFIG.BOARD_SIZE)
  };
  return { ...config, steps: computeStepBudget(config) };
}

/**
 * Step 13（v1.17）演示关：id = 0，**不在 LEVELS.md 的 50 关表内**，只用于在真实页面里
 * 查看与验证藤蔓/巧克力（`index.html?demo=1`）。它同时使用两种新障碍，满足 3.6 的
 * 「单关障碍物类型 ≤ 2 种、障碍格 ≤ 12 格」硬指标；步数同样由 computeStepBudget 派生。
 * 之所以不做进 50 关表：把新障碍排进关卡属「文档先行」的另一步（见 DECISIONS D033）。
 *
 * Step 14（v1.19）追加三个演示关：51 水果 / 52 时间 / 53 金豆荚，由 `index.html?demo=fruit|time|pod`
 * 进入。它们同样**不进 50 关表**（v1.18 第 4 条：三种类型各自验收前不得入表，见 D035 第 8 条）。
 */
export const DEMO_LEVEL_ID = 0;

/** 演示关 id → 名称（app.js 解析 `?demo=` 与日志用；不进选关网格）。 */
export const DEMO_LEVEL_IDS = Object.freeze({
  obstacles: DEMO_LEVEL_ID,
  fruit: 51,
  time: 52,
  pod: 53
});

/** 演示关配置工厂：命中演示关 id 时返回配置，否则返回 null（交回 50 关表）。 */
function demoLevelConfig(id) {
  if (id === DEMO_LEVEL_IDS.obstacles) return obstacleDemoConfig();
  if (id === DEMO_LEVEL_IDS.fruit) return collectibleDemoConfig(id, GOAL_TYPE.FRUIT, 4);
  if (id === DEMO_LEVEL_IDS.pod) return collectibleDemoConfig(id, GOAL_TYPE.POD, 3);
  if (id === DEMO_LEVEL_IDS.time) return timeDemoConfig(id);
  return null;
}

function obstacleDemoConfig() {
  const vines = [[3, 3], [4, 4]];
  const chocs = [[2, 2], [2, 5], [5, 2], [5, 5]];
  const obstacles = [
    ...vines.map(([r, c]) => ({ r, c, type: OBSTACLE_TYPE.VINE, layers: 1 })),
    ...chocs.map(([r, c]) => ({ r, c, type: OBSTACLE_TYPE.CHOC, layers: 1 }))
  ];
  const config = {
    id: DEMO_LEVEL_ID,
    rows: CONFIG.BOARD_SIZE,
    cols: CONFIG.BOARD_SIZE,
    colorCount: 5,
    goal: { type: GOAL_TYPE.SCORE, target: 4000 },
    starThresholds: starThresholdsOf(4000),
    obstacles,
    collectibles: []
  };
  return { ...config, steps: computeStepBudget(config) };
}

/** 水果关/金豆荚演示关：只在目标与掉落节奏上有别（3.6 v1.18）。 */
function collectibleDemoConfig(id, type, target) {
  const config = {
    id,
    rows: CONFIG.BOARD_SIZE,
    cols: CONFIG.BOARD_SIZE,
    colorCount: 5,
    goal: { type, target },
    starThresholds: starThresholdsOf(3000, { pod: type === GOAL_TYPE.POD }),
    obstacles: [],
    collectibles: collectibleSpecsFor({ type, target }, CONFIG.BOARD_SIZE, CONFIG.BOARD_SIZE)
  };
  return { ...config, steps: computeStepBudget(config) };
}

/** 时间关演示关（3.6 第 8 条）：`steps: 0` + 派生出的 `timeLimit`，由 `game.tickTime` 推进倒计时。 */
function timeDemoConfig(id) {
  const config = {
    id,
    rows: CONFIG.BOARD_SIZE,
    cols: CONFIG.BOARD_SIZE,
    colorCount: 5,
    goal: { type: GOAL_TYPE.SCORE, target: 3000 },
    starThresholds: starThresholdsOf(3000),
    obstacles: [],
    collectibles: []
  };
  return { ...config, steps: 0, timeLimit: computeTimeBudget(config) };
}

/**
 * 3.6（v1.19）：水果关/金豆荚关的收集物落点 —— 从棋盘**顶部**按列均匀铺开（v1.18 原文：「棋盘顶部生成水果」）。
 * 纯函数、无随机：同一目标数量永远得到同一布局，演示关因此可复现、可在巡检里比对。
 */
export function collectibleSpecsFor(goal, rows, cols) {
  const type = goal?.type === GOAL_TYPE.FRUIT
    ? COLLECTIBLE_TYPE.FRUIT
    : goal?.type === GOAL_TYPE.POD
      ? COLLECTIBLE_TYPE.POD
      : null;
  if (!type) return [];
  const target = Number.isFinite(goal.target) ? Math.max(0, Math.trunc(goal.target)) : 0;
  const specs = [];
  for (let i = 0; i < Math.min(target, rows * cols); i += 1) {
    const band = Math.floor(i / cols);
    const inBand = i % cols;
    const colsInBand = Math.min(target - band * cols, cols);
    const c = Math.min(cols - 1, Math.floor(((inBand + 0.5) * cols) / colsInBand));
    specs.push({ r: band, c, type });
  }
  return specs;
}

/** 3.7 的三星阈值：1★ = 设计基准分，2★/3★ = 基准分 × `STAR_CONFIG` 的倍率（取整到 500，与 LEVELS.md 口径一致）。 */
function starThresholdsOf(star1, { pod = false } = {}) {
  const stars = CONFIG.STAR_CONFIG;
  const round500 = (value) => Math.round(value / 500) * 500;
  const bonus = pod ? stars.podFactor : 1; // 3.6 v1.18：金豆荚关的三星阈值更高
  return [star1, round500(star1 * stars.secondFactor * bonus), round500(star1 * stars.thirdFactor * bonus)];
}
/**
 * Step 12.2（用户批准）：难度 → 步数。**设计期派生**，不引入运行时随机性 ——
 * 同一个关卡配置永远算出同一个步数，因此关卡仍然可复现、可在巡检里被校验。
 *
 * 公式：`步数 = clamp(round(base + 目标工作量 × workload − 障碍摩擦), min, max)`
 *   · 目标工作量（workload）：分数目标按 `scoreUnit` 折算，收集目标按 `collectUnit` 折算，
 *     消冰目标按 `iceUnit` 折算；`mixed` 三项相加。
 *   · 障碍摩擦（friction）：`障碍格数 × perCell + 障碍总层数 × perLayer + 超过 5 色的部分 × perColor`。
 * 系数全部来自 `CONFIG.STEP_BUDGET`（附录 B），本函数里没有魔法数字。
 */
export function computeStepBudget(config) {
  const budget = CONFIG.STEP_BUDGET;
  const { workload, friction } = difficultyOf(config);
  const raw = budget.base + workload * budget.workload - friction;
  return Math.min(Math.max(Math.round(raw), budget.min), budget.max);
}

/**
 * Step 14.2（v1.19，3.6 第 8 条）：时间关的时长派生 —— **倒计时替代步数**，故时间关不适用第 6 条的步数公式。
 * 公式与步数同构，只是把「步」换成「秒」并把障碍摩擦单独折算：
 *   `秒数 = clamp(round(initialSeconds + 目标工作量 × secondsPerWorkload − 障碍摩擦 × secondsPerFriction), min, max)`
 * 目标工作量与障碍摩擦的定义与 `computeStepBudget` 完全一致（同一套单位键），因此两种关卡的难度观感一致。
 * 纯函数、无随机；系数全部来自 `CONFIG.TIME_CONFIG`（附录 B）。
 */
export function computeTimeBudget(config) {
  const time = CONFIG.TIME_CONFIG;
  const { workload, friction } = difficultyOf(config);
  const raw = time.initialSeconds + workload * time.secondsPerWorkload - friction * time.secondsPerFriction;
  return Math.min(Math.max(Math.round(raw), time.minSeconds), time.maxSeconds);
}

/** 难度度量：目标工作量（`STEP_BUDGET` 的单位键）与障碍摩擦 —— 步数与时长派生共用同一定义。 */
function difficultyOf(config) {
  const budget = CONFIG.STEP_BUDGET;
  const obstacles = config?.obstacles ?? [];
  const cells = obstacles.length;
  const layers = obstacles.reduce((sum, spec) => sum + (Number.isFinite(spec?.layers) ? spec.layers : 0), 0);
  const colors = config?.colorCount ?? CONFIG.COLOR_COUNT;
  const friction = cells * budget.perCell + layers * budget.perLayer + Math.max(0, colors - 5) * budget.perColor;
  return { workload: goalWorkload(config?.goal, budget), friction };
}

/**
 * 目标工作量：把各种目标折算到同一个「单位」上（`mixed` 相加）。
 * v1.19：水果关/金豆荚关的「收集 N 个」与 `collect` 同类，共用 `collectUnit`。
 */
function goalWorkload(goal, budget) {
  if (!goal || typeof goal !== 'object') return 0;
  const score = (value) => (Number.isFinite(value) ? value / budget.scoreUnit : 0);
  const collect = (targets) => Object.values(targets ?? {}).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0) / budget.collectUnit;
  const ice = (value) => (Number.isFinite(value) ? value / budget.iceUnit : 0);
  const count = (value) => (Number.isFinite(value) ? value / budget.collectUnit : 0);

  if (goal.type === GOAL_TYPE.SCORE) return score(goal.target);
  if (goal.type === GOAL_TYPE.COLLECT) return collect(goal.targets);
  if (goal.type === GOAL_TYPE.CLEAR_ICE) return ice(goal.target);
  if (goal.type === GOAL_TYPE.FRUIT || goal.type === GOAL_TYPE.POD) return count(goal.target);
  if (goal.type === GOAL_TYPE.MIXED) return score(goal.score) + ice(goal.clearIce) + collect(goal.collect);
  return 0;
}

/**
 * 4.2 / 4.4：createLevel(config) —— 校验并构造关卡状态。
 * Level = LevelConfig & { remainingSteps, collected, clearedIce, currentScore }（4.4）。
 * 4.4 约束：goal 与 starThresholds 必填；starThresholds 必须是三元组且非递减。
 */
export function createLevel(config) {
  validateLevelConfig(config);
  const timeLimit = timeLimitOf(config);
  return {
    ...config,
    // 数组字段做一层拷贝：关卡状态不应与外层配置共享可变引用（4.4 的 Level 是本局私有状态）
    starThresholds: [...config.starThresholds],
    obstacles: [...(config.obstacles ?? [])],
    collectibles: [...(config.collectibles ?? [])],
    remainingSteps: config.steps,
    // v1.19（3.6 第 8 条）：时间关的倒计时；非时间关为 0（此时以步数计时）
    remainingTime: timeLimit ?? 0,
    collected: {},
    clearedIce: 0,
    collectedFruit: 0, // v1.19：水果关的进度（落到底部出口计数）
    collectedPod: 0,   // v1.19：金豆荚关的进度
    currentScore: 0,
    completed: false // 4.4（v1.14）：本局是否已达成通关目标
  };
}

/** 3.6 第 8 条（v1.19）：`timeLimit > 0` 即时间关；未配置/非法时返回 null（普通步数关）。 */
export function isTimeLevel(level) {
  return Number.isFinite(level?.timeLimit) && level.timeLimit > 0;
}

function timeLimitOf(config) {
  const value = config?.timeLimit;
  return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * 步数消耗（4.3.3：只有有效交换才扣步数；调用点在 game.trySwap）。
 * 返回消耗后的剩余步数；已为 0 时保持 0，不出现负步数。
 */
export function consumeStep(level) {
  level.remainingSteps = Math.max(0, level.remainingSteps - 1);
  return level.remainingSteps;
}

/**
 * 时间消耗（v1.19，3.6 第 8 条）：时间关的倒计时递减，返回剩余秒数（已为 0 时保持 0）。
 * 调用点在 `game.tickTime`；**消除本身不扣时间**（3.6 v1.18 原文），故 `trySwap` 不调用本函数。
 */
export function consumeTime(level, seconds) {
  const amount = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  level.remainingTime = Math.max(0, (Number.isFinite(level.remainingTime) ? level.remainingTime : 0) - amount);
  return level.remainingTime;
}

/**
 * 步数恢复（v1.20，3.9 的「加五步」）：增加剩余步数并返回加后的值。
 * 与 `consumeStep` 对称；调用点在 `game.useBooster`，**道具本身不消耗步数**。
 */
export function grantSteps(level, steps) {
  const amount = Number.isFinite(steps) ? Math.max(0, Math.trunc(steps)) : 0;
  level.remainingSteps = Math.max(0, (Number.isFinite(level.remainingSteps) ? level.remainingSteps : 0) + amount);
  return level.remainingSteps;
}

/** 时间恢复（v1.20）：`game.useBooster` 的「加五步」在**时间关**走这条分支（时间关没有步数，3.6 第 8 条）。 */
export function grantTime(level, seconds) {
  const amount = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  level.remainingTime = Math.max(0, (Number.isFinite(level.remainingTime) ? level.remainingTime : 0) + amount);
  return level.remainingTime;
}

/**
 * 4.2：checkGoal(level, board, score, collected) —— 本局是否已达成通关目标（3.6）。
 * 四种目标：`score` 比分数；`collect` 比收集计数（键为 `COLOR_NAMES` 里的动物名）；
 * `clearIce` 比冰块层数；`mixed` 要求列出的每个分项都达标（未列出的分项不参与判定）。
 * `board` 目前不参与判定（四种目标都只依赖计数与分数），保留该参数是因为 4.2 已登记此签名，
 * 且后续若出现「清空指定区域」类目标就会需要它（见 D029）。
 */
export function checkGoal(level, board, score, collected = {}) {
  const goal = level?.goal;
  if (!goal || typeof goal !== 'object') return false;
  const reached = Number.isFinite(score) ? score : 0;
  const counts = collected ?? {};

  if (goal.type === GOAL_TYPE.SCORE) return reached >= goal.target;
  if (goal.type === GOAL_TYPE.COLLECT) return meetsCollect(goal.targets, counts);
  if (goal.type === GOAL_TYPE.CLEAR_ICE) return (level.clearedIce ?? 0) >= goal.target;
  // v1.19（3.6 v1.18）：水果关/金豆荚关的进度分别由 board 的收集事件累加而来
  if (goal.type === GOAL_TYPE.FRUIT) return (level.collectedFruit ?? 0) >= goal.target;
  if (goal.type === GOAL_TYPE.POD) return (level.collectedPod ?? 0) >= goal.target;
  if (goal.type === GOAL_TYPE.MIXED) {
    const parts = [];
    if (goal.score !== undefined) parts.push(reached >= goal.score);
    if (goal.clearIce !== undefined) parts.push((level.clearedIce ?? 0) >= goal.clearIce);
    if (goal.collect !== undefined) parts.push(meetsCollect(goal.collect, counts));
    // 一个分项都没配的 mixed 不算达成（4.4 要求 goal 必填，不能靠空对象蒙过判定）
    return parts.length > 0 && parts.every(Boolean);
  }
  return false;
}

/** 收集目标：每个列出的动物都要达到数量（未列出的不参与判定）。 */
function meetsCollect(targets, counts) {
  if (!targets || typeof targets !== 'object') return false;
  const entries = Object.entries(targets);
  if (entries.length === 0) return false;
  return entries.every(([name, need]) => (counts[name] ?? 0) >= need);
}

/**
 * 4.2 / 3.7：calcStars(score, thresholds) —— 分数落在哪一档就是几星（0 = 未达 1★ 线）。
 * 注意 3.7 的「**达成通关目标即获得一星**」不由本函数表达（签名里没有目标）：
 * 调用方（game.js）在通关时取 `max(1, calcStars(...))`，于是收集/清冰关即使分数偏低也至少有 1 星。
 * 分数关因为 1★ 阈值就等于目标分，两种口径自然一致（见 D029）。
 */
export function calcStars(score, thresholds) {
  const value = Number.isFinite(score) ? score : 0;
  if (!Array.isArray(thresholds) || thresholds.length !== 3) return 0;
  if (value >= thresholds[2]) return 3;
  if (value >= thresholds[1]) return 2;
  if (value >= thresholds[0]) return 1;
  return 0;
}

/** 4.2：getRemainingStepBonus(stepsLeft) —— 剩余步数转化（3.5「每剩余一步约转化为 30 分」）。 */
export function getRemainingStepBonus(stepsLeft) {
  const steps = Number.isFinite(stepsLeft) ? Math.floor(stepsLeft) : 0;
  return Math.max(0, steps) * CONFIG.SCORE_CONFIG.stepBonus;
}

function validateLevelConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('createLevel: 缺少关卡配置');
  const { rows, cols, colorCount, steps, goal, starThresholds } = config;

  for (const [name, value] of [['rows', rows], ['cols', cols], ['colorCount', colorCount]]) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`createLevel: ${name} 必须是正整数，收到 ${value}`);
    }
  }
  // 4.4（v1.19）：时间关没有步数概念，故 steps 允许为 0；普通关卡仍必须 ≥ 1
  if (!Number.isInteger(steps) || steps < 0) {
    throw new Error(`createLevel: steps 必须是非负整数，收到 ${steps}`);
  }
  const timeLimit = timeLimitOf(config);
  if (steps < 1 && timeLimit === null) {
    throw new Error('createLevel: 非时间关的 steps 必须 ≥ 1（4.4 v1.19）');
  }
  if (config.timeLimit !== undefined && timeLimit === null) {
    throw new Error(`createLevel: timeLimit 必须是正整数秒（4.4 v1.19），收到 ${config.timeLimit}`);
  }
  if (!goal || typeof goal !== 'object' || !GOAL_TYPES.has(goal.type)) {
    throw new Error(`createLevel: goal.type 必须是 ${[...GOAL_TYPES].join(' / ')} 之一（4.4）`);
  }
  if (!Array.isArray(starThresholds) || starThresholds.length !== 3) {
    throw new Error('createLevel: starThresholds 必须是三元组（4.4）');
  }
  if (!starThresholds.every((value) => Number.isFinite(value))) {
    throw new Error('createLevel: starThresholds 必须是数字');
  }
  if (!(starThresholds[0] <= starThresholds[1] && starThresholds[1] <= starThresholds[2])) {
    throw new Error(`createLevel: starThresholds 必须非递减（4.4），收到 ${starThresholds.join(',')}`);
  }
}
