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

import { CONFIG, GOAL_TYPE, OBSTACLE_TYPE } from './config.js';

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
    obstacles
  };
  return { ...config, steps: computeStepBudget(config) };
}

/** 3.7 的三星阈值：1★ = 设计基准分，2★ ≈ 1.7×、3★ ≈ 2.5×（取整到 500，与 LEVELS.md 口径一致）。 */
function starThresholdsOf(star1) {
  const round500 = (value) => Math.round(value / 500) * 500;
  return [star1, round500(star1 * 1.7), round500(star1 * 2.5)];
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
  const obstacles = config?.obstacles ?? [];
  const cells = obstacles.length;
  const layers = obstacles.reduce((sum, spec) => sum + (Number.isFinite(spec?.layers) ? spec.layers : 0), 0);
  const colors = config?.colorCount ?? CONFIG.COLOR_COUNT;
  const friction = cells * budget.perCell + layers * budget.perLayer + Math.max(0, colors - 5) * budget.perColor;
  const raw = budget.base + goalWorkload(config?.goal, budget) * budget.workload - friction;
  return Math.min(Math.max(Math.round(raw), budget.min), budget.max);
}

/** 目标工作量：把四种目标折算到同一个「单位」上（`mixed` 相加）。 */
function goalWorkload(goal, budget) {
  if (!goal || typeof goal !== 'object') return 0;
  const score = (value) => (Number.isFinite(value) ? value / budget.scoreUnit : 0);
  const collect = (targets) => Object.values(targets ?? {}).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0) / budget.collectUnit;
  const ice = (value) => (Number.isFinite(value) ? value / budget.iceUnit : 0);

  if (goal.type === GOAL_TYPE.SCORE) return score(goal.target);
  if (goal.type === GOAL_TYPE.COLLECT) return collect(goal.targets);
  if (goal.type === GOAL_TYPE.CLEAR_ICE) return ice(goal.target);
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
  return {
    ...config,
    // 数组字段做一层拷贝：关卡状态不应与外层配置共享可变引用（4.4 的 Level 是本局私有状态）
    starThresholds: [...config.starThresholds],
    obstacles: [...(config.obstacles ?? [])],
    remainingSteps: config.steps,
    collected: {},
    clearedIce: 0,
    currentScore: 0,
    completed: false // 4.4（v1.14）：本局是否已达成通关目标
  };
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

  for (const [name, value] of [['rows', rows], ['cols', cols], ['colorCount', colorCount], ['steps', steps]]) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`createLevel: ${name} 必须是正整数，收到 ${value}`);
    }
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
