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
import { calcStars, checkGoal, consumeStep, createLevel, getRemainingStepBonus } from './level.js';

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
  // 4.3.3：只有有效交换才扣步数。**先扣步再结算** —— 3.5 的剩余步数转化用的是「通关那一刻」的真实剩余，
  // 把刚用掉的这一步也算进去会多给一份分（Step 12.1 的用例抓到过这个 off-by-one）。
  consumeStep(state.level);
  const moveResult = forced ? resolveBoard(state, { initialClear: forced }) : resolveBoard(state);

  // Step 12.3（用户批准）：走完最后一步（步数用尽）或已经达成目标时，**先引爆盘面上的特殊方块再最终结算**。
  // 引爆是链式的（引爆过程中新生成的特殊方块继续引爆），成果照常计入目标进度与分数 ——
  // 因此「最后一步引爆刚好达成目标」算通关。
  const endgame = state.level.remainingSteps <= 0 || state.level.completed ? detonateSpecials(state) : null;
  const resolve = endgame ? mergeResolveResults([moveResult, endgame]) : moveResult;
  // 3.8 约束 4：死局且重排超过上限 → 判定关卡异常，进入结束流程（与「步数用尽」同为结束条件）
  const stuck = Boolean(resolve.deadlock) && !resolve.deadlock.shuffled;
  // Step 12.1：结束有三种原因 —— 通关（3.6）、步数用尽、死局且重排失败（3.8 约束 4）
  state.gameOver = state.level.completed || state.level.remainingSteps <= 0 || stuck;

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

  // Step 12.1（3.6）：先把本步的收集与清冰计入关卡进度，再判定目标是否达成。
  // 顺序很重要：目标判定必须用「本步结算后」的计数与分数，否则最后一手永远差一步。
  accumulateProgress(state.level, result);
  if (!state.level.completed && checkGoal(state.level, state.board, state.level.currentScore, state.level.collected)) {
    // 3.7：达成目标即通关；3.5 的剩余步数转化在通关的**这一刻**一次性结算（repeat 调用不会重复加）
    state.level.completed = true;
    const stepBonus = getRemainingStepBonus(state.level.remainingSteps);
    state.level.currentScore += stepBonus;
    scoreDelta += stepBonus;
  }

  // 已通关就不必再为重排操心（3.8 的检测是为了继续玩下去，而不是为了结算面板）
  const deadlock = state.level.completed ? null : ensurePlayable(state);
  return { ...result, scoreDelta, levelScores, deadlock };
}

/**
 * 3.6 的目标追踪：把本次结算的成果计入 `Level.collected` / `Level.clearedIce`。
 * 收集只数**动物**（魔力鸟不是可收集的动物，它保留颜色只是为了渲染，故排除，见 3.2 / D025）；
 * 清冰只数**冰块层数**（3.6 的 clearIce；雪块层数不计入 —— `LEVELS.md` 第 2 节的口径）。
 */
function accumulateProgress(level, result) {
  for (const cell of result.cleared) {
    if (cell.type === CELL_TYPE.MAGIC) continue;
    const name = CONFIG.COLOR_NAMES[cell.color];
    if (!name) continue;
    level.collected[name] = (level.collected[name] ?? 0) + 1;
  }
  for (const hit of result.damaged) {
    if (hit.type === OBSTACLE_TYPE.ICE) level.clearedIce += hit.layersRemoved;
  }
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
    // v1.14：HUD 与结束面板只靠快照就能渲染（5.5），不必绕过快照去读 state.level
    goal: Object.freeze({ ...state.level.goal }),
    collected: Object.freeze({ ...state.level.collected }),
    clearedIce: state.level.clearedIce,
    stars: starsOf(state.level),
    won: state.level.completed,
    board: Object.freeze(board)
  });
}

/**
 * 3.7：本局星级。达成通关目标至少 1 星（3.7 原文），二星/三星只看分数阈值；
 * 未通关时一律 0 星（结束面板因此不会给失败局面画星星）。
 */
function starsOf(level) {
  if (!level.completed) return 0;
  return Math.max(1, calcStars(level.currentScore, level.starThresholds));
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

/**
 * Step 12.3：本局结束时引爆盘面上的特殊方块，返回合并后的结算结果（没有特殊方块时返回 null）。
 * 每一轮把「盘面上所有特殊方块的坐标」作为 `initialClear` 交给 `resolveCascades` ——
 * Step 10 起 initialClear 的格子同时充当**激活种子**，因此条纹/包装会各自展开、并被链式传播；
 * 魔力鸟在 D025 的保守口径下只清自己，所以这里额外把「它保留的颜色」的全屏同色格一起点燃。
 * 一轮之后若级联又生成了新的特殊方块，就再来一轮，直到盘面没有特殊方块或达到轮数上限。
 */
function detonateSpecials(state) {
  const rounds = [];
  const maxRounds = CONFIG.ENDGAME_CONFIG.maxDetonationRounds;
  for (let round = 0; round < maxRounds; round += 1) {
    const seeds = detonationSeeds(state.board);
    if (seeds.length === 0) break;
    rounds.push(resolveBoard(state, { initialClear: seeds }));
  }
  if (rounds.length === 0) return null;
  const merged = mergeResolveResults(rounds);
  merged.deadlock = null; // 本局已结束：3.8 的死局检测是为了继续玩，这里不再重排
  return merged;
}

/** 引爆要点燃的坐标：盘面上每个特殊方块自身；魔力鸟再加上「它自己那颗颜色」的全屏同色格。 */
function detonationSeeds(board) {
  const seeds = [];
  board.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (!cell || cell.type === CELL_TYPE.NORMAL) return;
      seeds.push({ r, c });
      if (cell.type === CELL_TYPE.MAGIC && cell.color !== null && cell.color !== undefined) {
        seeds.push(...getMagicTargets(board, cell.color));
      }
    });
  });
  return seeds;
}

/** 把多轮结算的结果合并成一个 ResolveResult（供 UI 一次播完，字段与 4.2 一致）。 */
function mergeResolveResults(results) {
  const merged = {
    cascades: 0,
    levels: [],
    cleared: [],
    damaged: [],
    spawned: [],
    capped: false,
    scoreDelta: 0,
    levelScores: [],
    deadlock: null
  };
  for (const result of results) {
    if (!result) continue;
    merged.cascades += result.cascades;
    merged.levels.push(...result.levels);
    merged.cleared.push(...result.cleared);
    merged.damaged.push(...result.damaged);
    merged.spawned.push(...result.spawned);
    merged.capped = merged.capped || result.capped;
    merged.scoreDelta += result.scoreDelta;
    merged.levelScores.push(...result.levelScores);
    merged.deadlock = merged.deadlock ?? result.deadlock;
  }
  return merged;
}

/** 4.3.1：上下左右相邻（曼哈顿距离为 1）。 */
function areAdjacent(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}
