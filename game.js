// game.js — 对外统一接口，组合调用其他逻辑模块。见 AGENTS.md 2.3 / 4.2。
//
// 纯逻辑模块：不碰 DOM / Canvas / localStorage（宪法 9 节）。
//
// GameState（4.2 未定义其结构，见 D016）= { level, board, gameOver, rng }：
//   - 分数不另存一份，统一读 level.currentScore（4.4 的 Level 已含该字段），避免两处真相源；
//   - rng 只用于「补充新格子」的随机源注入，生产环境即 Math.random，测试注入确定性序列。
//
// 【Step 4】createGame / trySwap / resolveBoard / getState 全部实现，并实现 4.3.2/4.3.3
//   （无效交换回退且不扣步数、只有有效交换才扣步数）与 3.5 的计分接入。
// 【Step 6】死局检测与重排（3.8）；【Step 7-10】特殊元素与组合（3.2/3.3）。

import { CONFIG, GOAL_TYPE } from './config.js';
import {
  cloneBoard,
  createBoard,
  resolveCascades,
  swapCells
} from './board.js';
// Step 6.1：可移动性/死局检测/重排来自 shuffle.js（与 board.js 的棋盘机制分离）
import { hasPossibleMove, isCellMovable, shuffleBoard } from './shuffle.js';
import { findAllMatchGroups } from './match.js';
import {
  calcBaseScore,
  calcCascadeBonus,
  calcFinalScore,
  calcSpecialMultiplier
} from './score.js';
import { consumeStep, createLevel } from './level.js';

/**
 * 4.2：createGame(levelConfig, options?) —— 建一局游戏。
 * levelConfig 缺省字段回落到 CONFIG（4.4 要求字段齐全，这里同时容忍缺省以便手动试玩）。
 * options.rng 为可选随机源（测试注入用，见 D016）。
 */
export function createGame(levelConfig = {}, options = {}) {
  const level = createLevel(normalizeLevelConfig(levelConfig));
  return {
    level,
    board: createBoard(level.rows, level.cols, level.colorCount, level.obstacles),
    gameOver: false,
    rng: typeof options.rng === 'function' ? options.rng : Math.random
  };
}

/**
 * 4.2：trySwap(state, a, b) —— 交换两个相邻格并结算。
 *   4.3.1 只允许相邻格；4.3.2 无匹配必须回退且不消耗步数；4.3.3 只有有效交换扣 1 步。
 * 返回 SwapResult。除 4.2 的五个字段外，额外返回两个供 UI 使用的产物（见 D016）：
 *   resolve   —— resolveBoard 的完整结果（含每层快照与轨迹，供分层回放）
 *   afterSwap —— 交换后、结算前的棋盘快照（回放首帧，让玩家看见「这一手造成的匹配」）
 * 无效交换时两者都为 null。
 */
export function trySwap(state, a, b) {
  const rejected = {
    valid: false,
    cascades: 0,
    scoreDelta: 0,
    stepsLeft: state.level.remainingSteps,
    gameOver: state.gameOver,
    resolve: null,
    afterSwap: null
  };

  if (state.gameOver) return rejected;
  if (!areAdjacent(a, b)) return rejected;
  if (!isCellMovable(state.board, a.r, a.c) || !isCellMovable(state.board, b.r, b.c)) return rejected;

  const snapshot = cloneBoard(state.board); // 4.2：cloneBoard 供回退使用
  swapCells(state.board, a, b);

  if (findAllMatchGroups(state.board).length === 0) {
    state.board = snapshot; // 4.3.2：回退到交换前，且不消耗步数
    return rejected;
  }

  const afterSwap = cloneBoard(state.board);
  const resolve = resolveBoard(state);
  consumeStep(state.level); // 4.3.3：只有有效交换才扣步数
  // 3.8 约束 4：死局且重排超过上限 → 判定关卡异常，进入结束流程（与「步数用尽」同为结束条件）
  const stuck = Boolean(resolve.deadlock) && !resolve.deadlock.shuffled;
  state.gameOver = state.level.remainingSteps <= 0 || stuck;

  return {
    valid: true,
    cascades: resolve.cascades,
    scoreDelta: resolve.scoreDelta,
    stepsLeft: state.level.remainingSteps,
    gameOver: state.gameOver,
    resolve,
    afterSwap
  };
}

/**
 * 4.2：resolveBoard(state) —— 消除 → 下落 → 填充 → 级联，并把分数结算进 level.currentScore。
 * 计分按 3.5：每层 base（动物数 × 10）× 倍数 + 连消加分；本步无特殊元素，倍数恒为 1。
 * 返回 ResolveResult：
 *   cascades / levels / cleared / spawned / capped（来自 board.resolveCascades）
 *   + scoreDelta（本次结算总分）+ levelScores（逐层明细，供 UI 与测试核对公式）
 *   + deadlock（3.8：消除与填充完成后检测死局并尝试重排；无死局时为 null）
 */
export function resolveBoard(state) {
  const result = resolveCascades(state.board, state.level.colorCount, { rng: state.rng });

  let scoreDelta = 0;
  const levelScores = [];
  for (const level of result.levels) {
    const base = calcBaseScore(level.cleared);
    // Step 4 只会产生普通消除；特殊元素接入后这里改为按 cell.type / 组合类型取值（3.5）
    const multiplier = calcSpecialMultiplier('normal', null);
    const bonus = calcCascadeBonus(level.level, base);
    const gained = calcFinalScore(base, multiplier, bonus);
    scoreDelta += gained;
    levelScores.push({ level: level.level, base, multiplier, bonus, gained });
  }

  state.level.currentScore += scoreDelta;
  return { ...result, scoreDelta, levelScores, deadlock: ensurePlayable(state) };
}

/**
 * 3.8：每次消除与填充完成后检测是否存在可行交换；无可行交换则重排。
 * 返回 null（无死局）或 DeadlockResolution（供 UI 显示提示与重排动画）。
 * 注意「每次都检测」是 3.8 的原文要求，因此即使本次已耗尽步数也会检测与重排 —— 保持规则一致，
 * 不引入「最后一步跳过」这种例外。
 */
function ensurePlayable(state) {
  if (hasPossibleMove(state.board)) return null;

  const before = cloneBoard(state.board);
  const stats = { tries: 0 };
  const shuffled = shuffleBoard(state.board, { rng: state.rng, stats });
  return {
    tries: stats.tries,
    shuffled,
    before,
    after: cloneBoard(state.board)
  };
}

/**
 * 4.2：getState(state) —— 返回不可变快照，供 UI 读取（深拷贝 + 冻结，杜绝外部改写内部状态）。
 */
export function getState(state) {
  const board = cloneBoard(state.board).map((row) => {
    row.forEach((cell) => Object.freeze(cell));
    return Object.freeze(row);
  });
  return Object.freeze({
    levelId: state.level.id,
    rows: state.level.rows,
    cols: state.level.cols,
    colorCount: state.level.colorCount,
    totalSteps: state.level.steps,
    remainingSteps: state.level.remainingSteps,
    currentScore: state.level.currentScore,
    gameOver: state.gameOver,
    board: Object.freeze(board)
  });
}

function normalizeLevelConfig(config) {
  return {
    id: config.id ?? 1,
    rows: config.rows ?? CONFIG.BOARD_SIZE,
    cols: config.cols ?? CONFIG.BOARD_SIZE,
    colorCount: config.colorCount ?? CONFIG.COLOR_COUNT,
    steps: config.steps ?? CONFIG.LEVEL_DEFAULTS.steps,
    goal: config.goal ?? { type: GOAL_TYPE.SCORE, target: CONFIG.LEVEL_DEFAULTS.starThresholds[0] },
    starThresholds: config.starThresholds ?? [...CONFIG.LEVEL_DEFAULTS.starThresholds],
    obstacles: config.obstacles ?? []
  };
}

/** 4.3.1：上下左右相邻（曼哈顿距离为 1）。 */
function areAdjacent(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}
