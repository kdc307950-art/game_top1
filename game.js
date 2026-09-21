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

import { CELL_TYPE, CONFIG, GOAL_TYPE, OBSTACLE_TYPE } from './config.js';
import {
  cloneBoard,
  createBoard,
  resolveCascades,
  swapCells
} from './board.js';
// Step 6.1：可移动性/死局检测/重排来自 shuffle.js（与 board.js 的棋盘机制分离）
import { hasPossibleMove, isCellMovable, shuffleBoard } from './shuffle.js';
import { findAllMatchGroups, matchShapeToSpecial } from './match.js';
// Step 11：障碍物层数分（3.5「冰块/雪块每层 1000 分」，另算、不参与特效倍数）
import { getObstacleScore } from './obstacles.js';
// Step 9：魔力鸟的全屏同色目标集合（v1.11 登记的纯追加函数）
// Step 10：两颗相邻特效交换的组合效果（3.3 / 4.3.9）
import { COMBO_TYPES, getMagicTargets, resolveSpecialCombo } from './special.js';
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

  // 4.3.9 / 3.3：两颗相邻特殊元素交换 → 触发组合效果，**不进行普通匹配检测**
  const comboClear = comboClearTargets(state.board, a, b);
  // 3.2 / D025：魔力鸟 + 普通色块的对调本身就是一次有效交换（不需要形成匹配）
  const magicClear = comboClear ? null : magicClearTargets(state.board, a, b);
  const forced = comboClear ?? magicClear;

  if (!forced && findAllMatchGroups(state.board).length === 0) {
    state.board = snapshot; // 4.3.2：回退到交换前，且不消耗步数
    return rejected;
  }

  const afterSwap = cloneBoard(state.board);
  const resolve = forced ? resolveBoard(state, { initialClear: forced }) : resolveBoard(state);
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
 * 计分按 3.5：每层 base（动物数 × 10）× 倍数 + 连消加分；倍数由 multiplierForLevel 判定
 * （Step 7 起：本层生成或触发条纹糖果时为 1.5，其余为 1）。
 * 返回 ResolveResult：
 *   cascades / levels / cleared / spawned / capped（来自 board.resolveCascades）
 *   + scoreDelta（本次结算总分）+ levelScores（逐层明细，供 UI 与测试核对公式）
 *   + deadlock（3.8：消除与填充完成后检测死局并尝试重排；无死局时为 null）
 */
export function resolveBoard(state, options = {}) {
  const result = resolveCascades(state.board, state.level.colorCount, {
    rng: state.rng,
    initialClear: options.initialClear // 3.2 的魔力鸟交换用（v1.11 登记）
  });

  let scoreDelta = 0;
  const levelScores = [];
  for (const level of result.levels) {
    const base = calcBaseScore(level.cleared);
    const multiplier = multiplierForLevel(level); // 3.5：条纹糖果（4 消/触发）= 1.5
    const bonus = calcCascadeBonus(level.level, base);
    const obstacle = obstacleScoreForLevel(level); // 3.5（v1.12）：层数分另算，不乘倍数
    const gained = calcFinalScore(base, multiplier, bonus) + obstacle;
    scoreDelta += gained;
    levelScores.push({ level: level.level, base, multiplier, bonus, obstacle, gained });
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
 * 3.5（v1.12）：本层障碍物得分 = 层数分（冰块/雪块每层 1000，**另算、不参与特效倍数**）
 * + 冰块连消加分（第 n ≥ 2 层清掉冰块时额外 (n − 1) × cascadeIceStep，与普通连消的 30/档并存）。
 * 层数分只按「本层实际减掉的层数」计，故同层多次波及同一格不会重复计分（一层 = 一次被波及）。
 */
function obstacleScoreForLevel(level) {
  const damaged = Array.isArray(level.damaged) ? level.damaged : [];
  let score = 0;
  let iceLayers = 0;
  for (const hit of damaged) {
    score += getObstacleScore(hit.type, hit.layersRemoved);
    if (hit.type === OBSTACLE_TYPE.ICE) iceLayers += hit.layersRemoved;
  }
  if (iceLayers > 0 && level.level >= 2) {
    score += (level.level - 1) * CONFIG.SCORE_CONFIG.cascadeIceStep;
  }
  return score;
}

/**
 * 3.5 / 3.3：本层特效倍数。判定顺序**就是** 3.3 的组合优先级（魔力鸟相关 > 包装+包装 >
 * 条纹+包装 > 条纹+条纹），再回落到单特效：
 *   1. 本层清掉两颗魔力鸟 → 5.0（魔力鸟 + 魔力鸟）；
 *   2. 本层清掉一颗魔力鸟且伴随其它特效 → 2.5（魔力鸟相关组合：3.5 表未登记其组合倍数，
 *      按 3.2 优先级回落为魔力鸟自身的 2.5，见 D026）；
 *   3. 两颗包装 → 4.0；条纹与包装同层 → 3.5；两颗条纹 → 3.0；
 *   4. 其余按单特效：本层生成（组形状经 matchShapeToSpecial 映射）或触发（cleared 里带 type）
 *      的条纹 1.5 / 包装 2.0 / 魔力鸟 2.5。
 * 口径来源与「级联中恰好清掉两颗条纹也会按 3.0 计」这类简化见 D026。
 */
function multiplierForLevel(level) {
  const counts = countSpecialCells(level.cleared);
  if (counts[CELL_TYPE.MAGIC] >= 2) return calcSpecialMultiplier(null, COMBO_TYPES.MAGIC_MAGIC);
  if (counts[CELL_TYPE.MAGIC] === 1 && (counts[CELL_TYPE.STRIPED] > 0 || counts[CELL_TYPE.WRAPPED] > 0)) {
    return calcSpecialMultiplier(CELL_TYPE.MAGIC, null);
  }
  if (counts[CELL_TYPE.WRAPPED] >= 2) return calcSpecialMultiplier(null, COMBO_TYPES.WRAPPED_WRAPPED);
  if (counts[CELL_TYPE.STRIPED] > 0 && counts[CELL_TYPE.WRAPPED] > 0) return calcSpecialMultiplier(null, COMBO_TYPES.STRIPED_WRAPPED);
  if (counts[CELL_TYPE.STRIPED] >= 2) return calcSpecialMultiplier(null, COMBO_TYPES.STRIPED_STRIPED);

  const types = [];
  for (const cell of level.cleared) {
    if (cell.type !== CELL_TYPE.NORMAL) types.push(cell.type);
  }
  for (const group of level.groups) {
    const type = matchShapeToSpecial(group.shape, group.direction);
    if (type) types.push(type);
  }
  if (types.length === 0) return calcSpecialMultiplier(CELL_TYPE.NORMAL, null);

  for (const type of PRIORITY) {
    if (types.includes(type)) return calcSpecialMultiplier(type, null);
  }
  return 1;
}

/** 3.2 优先级：魔力鸟 > 包装糖果 > 条纹糖果（Step 8/9 会让后两者真正出现）。 */
const PRIORITY = [CELL_TYPE.MAGIC, CELL_TYPE.WRAPPED, CELL_TYPE.STRIPED];

/** 4.3.9 / 3.3：判断这次交换是不是「两颗相邻特殊元素」，是则返回组合要清除的坐标集合。 */
function comboClearTargets(board, a, b) {
  const cellA = board[a.r]?.[a.c];
  const cellB = board[b.r]?.[b.c];
  if (!cellA || !cellB) return null;
  if (cellA.type === CELL_TYPE.NORMAL || cellB.type === CELL_TYPE.NORMAL) return null; // 必须两侧都是特效
  const cleared = resolveSpecialCombo(board, a, b); // 可能就地改造「全屏同色 → 条纹/包装」
  return cleared.length > 0 ? cleared : null;
}

/** 统计本层被清掉的各类特效数量（用于按 3.3 优先级取倍数）。 */
function countSpecialCells(cleared) {
  const counts = {};
  for (const cell of cleared) {
    if (cell.type === CELL_TYPE.NORMAL) continue;
    counts[cell.type] = (counts[cell.type] ?? 0) + 1;
  }
  return counts;
}

/**
 * 3.2 / D025：判断这次交换是不是「魔力鸟 + 普通色块」。
 * 调用点在 `swapCells` **之后**，因此魔力鸟现在位于 a/b 中的一侧、被换过来的普通糖果在另一侧。
 * 返回要清除的坐标集合（全屏该颜色 + 魔力鸟自身）；不是这种交换时返回 null，交回普通匹配路径。
 * 与空格 / 纯障碍 / 其它特殊元素的交换都不触发（3.2 要求「任意普通色块」；特效+特效属 Step 10 的组合）。
 */
function magicClearTargets(board, a, b) {
  const magicAt = board[a.r]?.[a.c]?.type === CELL_TYPE.MAGIC ? a : board[b.r]?.[b.c]?.type === CELL_TYPE.MAGIC ? b : null;
  if (!magicAt) return null;

  const other = magicAt === a ? b : a;
  const target = board[other.r]?.[other.c];
  if (!target || target.color === null || target.color === undefined) return null;
  if (target.type !== CELL_TYPE.NORMAL) return null;

  return [...getMagicTargets(board, target.color), { r: magicAt.r, c: magicAt.c }];
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
