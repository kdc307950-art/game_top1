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

import { CELL_TYPE, COLLECTIBLE_TYPE, CONFIG, GOAL_TYPE, OBSTACLE_TYPE, BOOSTER_KIND } from './config.js';
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
import { calcStars, checkGoal, consumeStep, consumeTime, createLevel, grantSteps, grantTime, isTimeLevel } from './level.js';
// Step 20（v1.25）：结算阶段（剩余步数 → 奖励分 + 随机特殊糖果 → 连锁引爆）的纯函数都在 settlement.js
import {
  conversionPlan,
  detonationOrder,
  findCellById,
  settlementRngFor,
  settlementStepsScore
} from './settlement.js';

/**
 * 4.2：createGame(levelConfig, options?) —— 建一局游戏。
 * levelConfig 缺省字段回落到 CONFIG（4.4 要求字段齐全，这里同时容忍缺省以便手动试玩）。
 * options.rng 为可选随机源（测试注入用，见 D016）。
 */
export function createGame(levelConfig = {}, options = {}) {
  const level = createLevel(normalizeLevelConfig(levelConfig));
  return {
    level,
    // v1.19：收集物（水果/金豆荚）随关卡配置一起落到棋盘顶部（3.6 的水果关/金豆荚关）
    board: createBoard(level.rows, level.cols, level.colorCount, level.obstacles, level.collectibles),
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
  // v1.19（3.6 v1.18）：时间关**没有步数概念**，消除不扣时间（时间只按真实时间流逝，见 game.tickTime）。
  const timed = isTimeLevel(state.level);
  if (!timed) consumeStep(state.level);
  const moveResult = forced ? resolveBoard(state, { initialClear: forced }) : resolveBoard(state);

  // Step 20（v1.25，3.6 第 7 条）：走完最后一步（步数用尽）或已经达成目标时，进入**结算阶段** ——
  // 剩余步数先变成递增奖励分与随机特殊糖果，再把盘面上的特殊糖果按「从底部到顶部」依次连锁引爆。
  // 引爆的消除与得分照常计入目标进度与分数，因此「最后一步引爆刚好达成目标」算通关。
  // 时间关没有「最后一步」，改由归零那一刻进入结算（tickTime）。
  const stepsExhausted = !timed && state.level.remainingSteps <= 0;
  const endgame = stepsExhausted || state.level.completed
    ? settleEndgame(state, { atIndex: moveResult.levels.length })
    : null;
  const resolve = endgame ? mergeResolveResults([moveResult, endgame]) : moveResult;
  // 3.8 约束 4：死局且重排超过上限 → 判定关卡异常，进入结束流程（与「步数用尽」同为结束条件）
  const stuck = Boolean(resolve.deadlock) && !resolve.deadlock.shuffled;
  // Step 12.1：结束有三种原因 —— 通关（3.6）、步数用尽、死局且重排失败（3.8 约束 4）。
  // v1.19：时间关的失败原因是倒计时归零（由 tickTime 置位），不在这里判定。
  state.gameOver = state.level.completed || stepsExhausted || stuck;

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
 * v1.25（Step 20）追加 `options.final`：结算阶段（本局已结束）的每一次引爆都传它 ——
 * 跳过 3.8 的死局检测与重排，避免「已经结算完了又把棋盘搅乱」。缺省行为与既有调用完全一致。
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
    // 3.7：达成目标即通关。**v1.25 起不再在这里加「剩余步数分」** —— 剩余步数的转化整体搬到了
    // 结算阶段（`settleEndgame`），由调用方在本手结算之后执行一次；这样做是为了让「同一个剩余步数」
    // 只被结算一次（旧的平坦 30 分/步与新的结算阶段会重复计分）。
    state.level.completed = true;
  }

  // 已通关就不必再为重排操心（3.8 的检测是为了继续玩下去，而不是为了结算面板）；
  // 结算阶段的每一次引爆同样跳过重排（`options.final`）—— 本局已经结束，重排只会把棋盘搅乱。
  const deadlock = state.level.completed || options.final ? null : ensurePlayable(state);
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
  // v1.19（3.6 v1.18）：水果关/金豆荚关的进度 —— 收集物落到出口行即计数（board 已把它移出棋盘）
  for (const hit of result.collected ?? []) {
    if (hit.type === COLLECTIBLE_TYPE.FRUIT) level.collectedFruit += 1;
    else if (hit.type === COLLECTIBLE_TYPE.POD) level.collectedPod += 1;
  }
}

/**
 * 3.6 第 8 条（v1.19）：推进时间关的倒计时，`seconds` 由 UI 传入**真实经过的秒数**（消除不扣时间）。
 * 归零那一刻按第 7 条先引爆盘面上的特殊方块再结算 —— 引爆若达成目标即算通关，否则判失败。
 * 返回 `{ remainingTime, gameOver, won, resolve }`：`resolve` 是引爆的结算结果（未归零或非时间关时为 null），
 * 供 UI 用与一次交换相同的回放路径播完最后一波。
 */
export function tickTime(state, seconds) {
  const level = state.level;
  const timed = isTimeLevel(level);
  if (state.gameOver || !timed) {
    return { remainingTime: level.remainingTime ?? 0, gameOver: state.gameOver, won: level.completed, resolve: null };
  }

  const remainingTime = consumeTime(level, seconds);
  if (remainingTime > 0) {
    return { remainingTime, gameOver: false, won: level.completed, resolve: null };
  }

  const resolve = settleEndgame(state, { atIndex: 0 }); // 3.6 第 7 条：归零那一刻进入结算阶段
  state.gameOver = true;
  return { remainingTime, gameOver: true, won: level.completed, resolve };
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
 * 3.9（v1.20）：使用道具。三种道具都**不消耗步数、也不扣时间**；是否生效由 `used` 表达，
 * 调用方（UI）据此决定是否扣除数量 —— 逻辑层不认识道具数量（它是跨关卡的账号级状态，2.3）。
 *   refresh  —— 重排棋盘：走 3.8 的同一条路径（只搬普通动物格，不动障碍物与收集物）；失败时 `used = false`。
 *   addSteps —— 步数关 `+extraSteps` 步；时间关 `+extraSeconds` 秒（时间关没有步数，3.6 第 8 条）。
 *   hammer   —— 消除 `target`（Pos 或 Pos[]，最多 `hammerCells` 格）：只接受**含动物**的格子，
 *               消除走 `resolveBoard({ initialClear })`，因此被点名的特殊元素按 4.3.8 照常激活。
 */
export function useBooster(state, kind, target) {
  const level = state.level;
  const base = {
    used: false,
    kind,
    reason: null,
    resolve: null,
    stepsLeft: level.remainingSteps,
    remainingTime: level.remainingTime ?? 0,
    gameOver: state.gameOver
  };
  if (state.gameOver) return { ...base, reason: 'busy' };

  if (kind === BOOSTER_KIND.REFRESH) {
    const stats = { tries: 0 };
    const shuffled = shuffleBoard(state.board, { rng: state.rng, stats });
    return { ...base, used: shuffled, reason: shuffled ? null : 'shuffleFailed' };
  }

  if (kind === BOOSTER_KIND.ADD_STEPS) {
    if (isTimeLevel(level)) {
      return { ...base, used: true, remainingTime: grantTime(level, CONFIG.BOOSTER_CONFIG.extraSeconds) };
    }
    return { ...base, used: true, stepsLeft: grantSteps(level, CONFIG.BOOSTER_CONFIG.extraSteps) };
  }

  if (kind === BOOSTER_KIND.HAMMER) {
    const targets = (Array.isArray(target) ? target : [target])
      .filter((pos) => isHammerTarget(state.board, pos))
      .slice(0, Math.max(1, Math.trunc(CONFIG.BOOSTER_CONFIG.hammerCells)));
    if (targets.length === 0) return { ...base, reason: 'badTarget' };

    const resolve = resolveBoard(state, { initialClear: targets.map((pos) => ({ r: pos.r, c: pos.c })) });
    // 木锤不消耗步数，但结算照常可能达成目标（3.6）—— 结束判定与一次交换同一套口径
    state.gameOver = state.gameOver || state.level.completed;
    return { ...base, used: true, resolve, stepsLeft: level.remainingSteps, gameOver: state.gameOver };
  }

  return { ...base, reason: 'badKind' };
}

/** 3.9：小木锤只接受「含动物的格子」—— 空格 / 纯障碍（雪块·巧克力）/ 收集物（水果·金豆荚）一律无效。 */
function isHammerTarget(board, target) {
  if (!target || !Number.isInteger(target.r) || !Number.isInteger(target.c)) return false;
  const cell = board?.[target.r]?.[target.c];
  return Boolean(cell) && cell.color !== null && cell.color !== undefined;
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
    collectedFruit: state.level.collectedFruit, // v1.19：水果关进度
    collectedPod: state.level.collectedPod,     // v1.19：金豆荚关进度
    // v1.19（5.5）：HUD 的第二格在时间关显示剩余时间；非时间关 timeLimit 为 null、步数有效
    timeLimit: isTimeLevel(state.level) ? state.level.timeLimit : null,
    remainingTime: state.level.remainingTime ?? 0,
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
    // v1.19：时间关（3.6 第 8 条）与收集物落点（水果关/金豆荚关）；缺省时行为与既有调用完全一致
    timeLimit: config.timeLimit,
    collectibles: config.collectibles ?? [],
    goal: config.goal ?? { type: GOAL_TYPE.SCORE, target: CONFIG.LEVEL_DEFAULTS.starThresholds[0] },
    starThresholds: config.starThresholds ?? [...CONFIG.LEVEL_DEFAULTS.starThresholds],
    obstacles: config.obstacles ?? []
  };
}

/**
 * 3.6 第 7 条（v1.25，Step 20）：本局结束时的**结算阶段**，返回合并后的 ResolveResult。
 *
 *   ① 剩余步数 → 递增制奖励分（`settlementStepsScore`，量级 = 该关 1★ 基准分 × 比例）；
 *   ② 剩余步数 → 随机特殊糖果（**受控伪随机**：`mulberry32(seed + 关卡id)`，落在朴素动物格上）；
 *   ③ 把盘面上的特殊糖果按「从棋盘底部到顶部」的顺序**依次引爆**：每引爆一颗就走一次完整结算
 *      （激活 → 下落 → 填充 → 级联），级联中新生成的特殊糖果会被追加到队列继续引爆，
 *      直到队列清空或达到 `SETTLEMENT_CONFIG.maxChainDetonations`。
 *
 * 返回的对象除 4.2 的 ResolveResult 字段外还带一个 `settlement`：
 *   `{ steps, stepScore, detonations, converted, board, atIndex }` ——
 *   `board` 是「转化之后、第一颗引爆之前」的棋盘快照，供 UI 先把这批特殊糖果画出来；
 *   `atIndex` 是引爆批次在 `levels` 里的起始下标（它之前的层属于玩家的最后一手）。
 *
 * 没有剩余步数、盘面也没有特殊糖果时返回 null（本局直接就结束了，没有结算演出）。
 */
function settleEndgame(state, { atIndex = 0 } = {}) {
  const level = state.level;
  const steps = Math.max(0, Math.trunc(level.remainingSteps ?? 0));
  // 奖励分与转化数量的量级都挂在该关的 1★ 基准分上（理由见 config.js 的 SETTLEMENT_CONFIG 注释）
  const scale = Number.isFinite(level.starThresholds?.[0]) ? level.starThresholds[0] : 0;

  const plan = conversionPlan(state.board, steps, settlementRngFor(level.id));
  const converted = applyConversion(state.board, plan);
  const convertedBoard = cloneBoard(state.board); // 引爆前快照：UI 用它画出「刚变出来的」特殊糖果
  const stepScore = settlementStepsScore(steps, scale);
  if (stepScore > 0) level.currentScore += stepScore;

  const chain = chainDetonations(state);
  if (converted.length === 0 && chain.rounds.length === 0 && stepScore === 0) return null;

  const merged = mergeResolveResults(chain.rounds);
  merged.deadlock = null; // 本局已结束：3.8 的重排已无意义（结算内部也已用 final 跳过）
  const detonationScore = merged.scoreDelta; // 连锁引爆本身挣到的分（消除 + 障碍层数 + 连消）
  merged.scoreDelta += stepScore; // 关卡级一次性结算，不在逐层明细里（app.js 的 tailBonus 兜住）
  merged.settlement = {
    steps,
    stepScore,
    detonationScore,
    detonations: chain.count,
    converted,
    board: convertedBoard,
    atIndex
  };
  return merged;
}

/**
 * 把转化计划落到棋盘上：只改 `type` / `direction`，不动 `color` / `obstacle` / `collectible`
 * （格子对象本身不变，因此动画的 `cell.id` 追踪仍然成立）。返回已应用的明细。
 */
function applyConversion(board, plan) {
  const applied = [];
  for (const item of plan) {
    const cell = board[item.r]?.[item.c];
    if (!cell || cell.color === null || cell.color === undefined) continue;
    cell.type = item.type;
    cell.direction = item.direction;
    applied.push({ r: item.r, c: item.c, type: item.type, direction: item.direction, color: cell.color });
  }
  return applied;
}

/**
 * 3.6 第 7 条（v1.25）：队列式连锁引爆 —— 从棋盘底部到顶部依次引爆**一颗**特殊糖果。
 * 队列里存 `cell.id` 而不是坐标：上一次引爆的级联会让格子随重力移动，坐标当场就失效了。
 * 每一步都用 `resolveBoard(..., { final: true })` 结算，因此结算期间不会再触发死局重排。
 */
function chainDetonations(state) {
  const maxSteps = Math.max(1, Math.trunc(CONFIG.SETTLEMENT_CONFIG.maxChainDetonations));
  const rounds = [];
  const pending = [];
  const queued = new Set();

  // 把盘面上尚未入队的特殊糖果按「底 → 顶」追加进队列；每引爆一颗后再调一次，把新生成的接上
  const enqueueAll = () => {
    for (const pos of detonationOrder(state.board)) {
      const cell = state.board[pos.r][pos.c];
      if (queued.has(cell.id)) continue;
      queued.add(cell.id);
      pending.push(cell.id);
    }
  };

  enqueueAll();
  let count = 0;
  while (pending.length > 0 && count < maxSteps) {
    const pos = findCellById(state.board, pending.shift());
    if (!pos) continue; // 已被上一波连锁吃掉
    const cell = state.board[pos.r][pos.c];
    if (cell.type === CELL_TYPE.NORMAL) continue; // 已被清除并补位成普通格

    // 魔力鸟在 D025 的保守口径下只清自己，故额外把「它保留的颜色」的全屏同色格一起点燃
    const seeds = [{ r: pos.r, c: pos.c }];
    if (cell.type === CELL_TYPE.MAGIC && cell.color !== null && cell.color !== undefined) {
      seeds.push(...getMagicTargets(state.board, cell.color));
    }
    rounds.push(resolveBoard(state, { initialClear: seeds, final: true }));
    count += 1;
    enqueueAll();
  }
  return { rounds, count };
}

/** 把多轮结算的结果合并成一个 ResolveResult（供 UI 一次播完，字段与 4.2 一致）。 */
function mergeResolveResults(results) {
  const merged = {
    cascades: 0,
    levels: [],
    cleared: [],
    damaged: [],
    collected: [], // v1.19（3.6）：收集事件也要合并，否则引爆轮的收集会丢
    spawned: [],
    capped: false,
    scoreDelta: 0,
    levelScores: [],
    deadlock: null,
    settlement: null // v1.25：结算阶段元信息（无结算时为 null）
  };
  for (const result of results) {
    if (!result) continue;
    merged.cascades += result.cascades;
    merged.levels.push(...result.levels);
    merged.cleared.push(...result.cleared);
    merged.damaged.push(...result.damaged);
    merged.collected.push(...(result.collected ?? []));
    merged.spawned.push(...result.spawned);
    merged.capped = merged.capped || result.capped;
    merged.scoreDelta += result.scoreDelta;
    merged.levelScores.push(...result.levelScores);
    merged.deadlock = merged.deadlock ?? result.deadlock;
    // v1.25：结算阶段的元信息（转化明细、奖励分、引爆起始下标）要穿过合并，UI 才能播对首帧
    if (result.settlement) merged.settlement = result.settlement;
  }
  return merged;
}

/** 4.3.1：上下左右相邻（曼哈顿距离为 1）。 */
function areAdjacent(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}
