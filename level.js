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

import { CONFIG, GOAL_TYPE } from './config.js';

const GOAL_TYPES = new Set(Object.values(GOAL_TYPE));

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
    currentScore: 0
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
