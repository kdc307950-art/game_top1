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
export function buildDemoLevelConfig() {
  return {
    id: 1,
    rows: CONFIG.BOARD_SIZE,
    cols: CONFIG.BOARD_SIZE,
    colorCount: CONFIG.COLOR_COUNT,
    steps: CONFIG.LEVEL_DEFAULTS.steps,
    goal: { type: GOAL_TYPE.SCORE, target: CONFIG.LEVEL_DEFAULTS.starThresholds[0] },
    starThresholds: [...CONFIG.LEVEL_DEFAULTS.starThresholds],
    obstacles: [
      { r: 2, c: 2, type: OBSTACLE_TYPE.ICE, layers: 2 },
      { r: 2, c: 5, type: OBSTACLE_TYPE.ICE, layers: 2 },
      { r: 5, c: 2, type: OBSTACLE_TYPE.ICE, layers: 2 },
      { r: 5, c: 5, type: OBSTACLE_TYPE.ICE, layers: 2 },
      { r: 3, c: 3, type: OBSTACLE_TYPE.SNOW, layers: 3 },
      { r: 4, c: 4, type: OBSTACLE_TYPE.SNOW, layers: 3 }
    ]
  };
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
