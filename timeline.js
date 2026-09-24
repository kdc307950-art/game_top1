// timeline.js — 动画时间线调度与 rAF 回放。见 AGENTS.md 2.2 / 2.3 / 5.4 / 15。
//
// 边界（2.3）：只接收「阶段列表 + 每帧回调」并按时长推进；不读游戏状态、不碰 localStorage、
// 不实现任何游戏规则 —— 它不知道什么叫消除，只知道「第 N 阶段的进度是多少」。
// 时长全部来自 `CONFIG.ANIMATION_CONFIG`（15 节），并支持系统「减少动效」（5.4）。

import { CELL_TYPE, CONFIG } from './config.js';

/**
 * 三档时长。系统「减少动效」或配置 reducedMotion 为真时，消除与下落归零（直接显示结果），
 * 但**保留级联间隔** —— 静态的逐层揭示仍能让玩家看出发生了连消。
 */
export function motionDurations(systemReduced = false) {
  const cfg = CONFIG.ANIMATION_CONFIG;
  const reduced = cfg.reducedMotion || systemReduced;
  return {
    reduced,
    clear: reduced ? 0 : cfg.clearDuration,
    fall: reduced ? 0 : cfg.fallDuration,
    gap: cfg.cascadeGap,
    // Step 20（v1.25）：结算阶段的「转化定格」停留时长。减少动效时退化为级联间隔（不会完全跳过）
    hold: reduced ? cfg.cascadeGap : cfg.settleHold
  };
}

/** 下落时长按距离缩放，并落在 15 节的 150-250ms 区间内（基值为 fallDuration）。 */
export function fallDurationFor(moves, baseDuration) {
  if (baseDuration <= 0 || moves.length === 0) return 0;
  const maxDistance = moves.reduce((max, move) => Math.max(max, move.to.r - move.from.r), 1);
  const ratio = Math.min(maxDistance, 4) / 4; // 1 格 → 0.25；≥4 格 → 1
  return Math.round(baseDuration * (0.75 + 0.25 * ratio));
}

/**
 * 把一次结算拆成阶段列表：每层级联 = 消除 → 下落（若有落定）→ 落定。
 * 只做数据整理，不触发绘制；`board` 是历史快照，`keys/hidden/moves` 供渲染层解释。
 *
 * v1.25（Step 20）追加第 4 个参数 `settlement`（`game.js` 的结算阶段元信息，可为 null）：
 * 在 `settlement.atIndex` 处插入一帧 `bonus` —— 先把「剩余步数变出来的那批特殊糖果」画出来再引爆。
 * 同时把 `preBoard` 换成 `settlement.board`，后续的清除/下落快照才与逻辑层一致；
 * 否则玩家会看到一批从未被画出来过的特效凭空炸掉（`clearedKeys` 靠 `cell.id` 对位，
 * 转化只改 `type`/`direction` 不改对象，因此对位仍然成立）。
 */
export function buildPhases(resolve, afterSwap, motion, settlement = null) {
  const phases = [];
  let preBoard = afterSwap;
  let bonusInserted = false;
  // Step 20（v1.25）：结算批次的**动画预算** —— 逻辑与计分不受影响（它们早已在 game.js 里算完），
  // 这里只限制「逐层播放」的层数。没有它，一次 29 余步的通关会有 259 个阶段 ≈ 48.6 秒的演出。
  const cap = settlement
    ? settlement.atIndex + Math.max(1, Math.trunc(CONFIG.SETTLEMENT_CONFIG.maxAnimationLevels))
    : Number.POSITIVE_INFINITY;
  let truncated = false;

  const pushBonus = (levelIndex) => {
    if (!settlement || bonusInserted) return;
    bonusInserted = true;
    phases.push({
      phase: 'bonus',
      board: settlement.board,
      levelIndex: Math.max(0, levelIndex),
      // **刻意不画横幅**：这一帧存在的意义就是让玩家看清「哪些格子变成了特效」，
      // 而 hud.js 的 drawBanner 画在棋盘区**正中央** —— 叠加层会盖住它本该展示的东西，
      // 而且会让像素巡检把横幅当成「一片同色格子」（verify-step12 阶段 5 的「无三连」当场误判）。
      // 因此提示文案走 app.js 的日志（`settlementText`），画布上只做「定格」。
      banner: null,
      duration: motion.hold
    });
  };

  resolve.levels.forEach((level, index) => {
    // 超出动画预算：不再逐层播放（分数与盘面早已算定），循环结束后一次性跳到最终盘面
    if (index >= cap) {
      truncated = true;
      return;
    }
    // Step 20：结算批次的起点先插一帧「转化定格」，并把 preBoard 接到转化后的棋盘
    if (settlement && index === settlement.atIndex) {
      pushBonus(index - 1);
      preBoard = settlement.board;
    }
    // 本层新生成的特殊元素本层**不被消除**（board.js 的 collectClearKeys 排除了它），
    // 因此它既不该播「缩小淡出」，也不该在下落阶段被隐藏 —— 否则玩家会看到
    // 「刚做出来的条纹糖果一闪就没了」（用户反馈的现象）。做法：把它从消除键里剔除，
    // 并把消除前的棋盘打上补丁，让消除/下落阶段就按特效的样子绘制。
    const patches = spawnedSpecials(preBoard, level);
    const spawnKeys = new Set(patches.map((patch) => `${patch.at.r},${patch.at.c}`));
    // groups 只有初始匹配；条纹激活会额外清除整行/列。动画必须以逻辑层实际
    // 返回的 cleared 集合为准，否则波及格会在下落阶段突然消失。
    const keys = clearedKeys(preBoard, level.cleared, spawnKeys);
    const board = patches.length > 0 ? patchedBoard(preBoard, patches) : preBoard;
    const moves = new Map(level.moves.map((move) => [move.id, { from: move.from, to: move.to }]));
    phases.push({ phase: 'clear', board, keys, levelIndex: index, duration: motion.clear });
    if (moves.size > 0) {
      phases.push({
        phase: 'fall',
        board,
        hidden: keys,
        moves,
        levelIndex: index,
        duration: fallDurationFor(level.moves, motion.fall)
      });
    }
    phases.push({ phase: 'settle', board: level.board, levelIndex: index, duration: motion.gap });
    preBoard = level.board;
  });

  // 兜底：结算批次的下标等于 levels 长度时（没有属于引爆的层）也要把转化那一帧补上
  if (settlement && !bonusInserted) {
    pushBonus(resolve.levels.length - 1);
    phases.push({ phase: 'settle', board: settlement.board, levelIndex: Math.max(0, resolve.levels.length - 1), duration: motion.gap });
  }

  // 动画预算用尽：直接停在最终盘面，并把 levelIndex 顶到末尾 —— HUD 的分数因此一次性到终值
  // （app.js 的 hudScoreAt 按 levelIndex 取分，若停在中间层，HUD 会显示一个永远到不了终值的分数）
  if (truncated) {
    const last = resolve.levels[resolve.levels.length - 1];
    phases.push({ phase: 'settle', board: last.board, levelIndex: resolve.levels.length - 1, duration: motion.gap });
  }
  // 3.8：若本次结算触发了重排，追加一个重排阶段（前后快照按 cell.id 对位，得到每格起止位置）
  const deadlock = resolve.deadlock;
  if (deadlock && deadlock.shuffled) {
    phases.push({
      phase: 'shuffle',
      board: deadlock.before,
      hidden: null,
      moves: diffById(deadlock.before, deadlock.after),
      levelIndex: resolve.levels.length - 1, // 分数停在最终值，不再逐层累加
      banner: '无可消除组合，正在重排…',
      // 15 节没有独立的「重排」预算，复用下落时长；减少动效下退化为级联间隔（保留提示可见）
      duration: motion.fall > 0 ? motion.fall : motion.gap
    });
  }
  return phases;
}

/**
 * 找出本层「刚升级成特效」的格子：id 在消除前就存在（排除补位新格），但 type 从普通变成了特效。
 * 返回其在**消除前**的位置（补丁点）与消除后的格子对象；不修改任何棋盘。
 */
function spawnedSpecials(preBoard, level) {
  if (!preBoard) return [];
  const before = new Map();
  preBoard.forEach((row, r) => {
    row.forEach((cell, c) => before.set(cell.id, { r, c, type: cell.type }));
  });
  const patches = [];
  level.board.forEach((row) => {
    row.forEach((cell) => {
      const from = before.get(cell.id);
      if (!from) return; // 补位新格
      if (from.type !== CELL_TYPE.NORMAL || cell.type === CELL_TYPE.NORMAL) return; // 不是本层新特效
      patches.push({ at: { r: from.r, c: from.c }, cell });
    });
  });
  return patches;
}

/** 按消除前快照中的 cell.id 还原本层实际清除坐标，不猜测特效波及范围。 */
function clearedKeys(preBoard, cleared, excluded) {
  const clearedIds = new Set(cleared.map((cell) => cell.id));
  const keys = new Set();
  preBoard.forEach((row, r) => {
    row.forEach((cell, c) => {
      const key = `${r},${c}`;
      if (clearedIds.has(cell.id) && !excluded.has(key)) keys.add(key);
    });
  });
  return keys;
}

/** 在消除前的棋盘上按下标打补丁（浅拷贝行，不改动原快照）。 */
function patchedBoard(board, patches) {
  const copy = board.map((row) => row.slice());
  for (const patch of patches) copy[patch.at.r][patch.at.c] = patch.cell;
  return copy;
}

/** 按 cell.id 匹配前后快照，得出每格的起止位置；只做数据变换，不改动棋盘。 */function diffById(before, after) {
  const origin = new Map();
  before.forEach((row, r) => {
    row.forEach((cell, c) => origin.set(cell.id, { r, c }));
  });
  const moves = new Map();
  after.forEach((row, r) => {
    row.forEach((cell, c) => {
      const from = origin.get(cell.id);
      if (from && (from.r !== r || from.c !== c)) moves.set(cell.id, { from, to: { r, c } });
    });
  });
  return moves;
}

/**
 * 创建回放器：`play(phases)` 起播，`stop()` 中止。
 * 每帧调用 `onFrame(phase, progress)`（progress ∈ [0,1]），全部阶段结束后调用一次 `onDone()`。
 * running 用于让调用方锁定输入（app.js 的 isLocked）。
 */
export function createTimeline({ onFrame, onDone }) {
  let session = null;

  function step(now) {
    if (!session) return;
    const phase = session.phases[session.index];
    if (!phase) {
      session = null;
      onDone?.();
      return;
    }
    if (session.startedAt === 0) session.startedAt = now;
    const progress = phase.duration > 0 ? Math.min(1, (now - session.startedAt) / phase.duration) : 1;
    onFrame?.(phase, progress);
    if (progress >= 1) {
      session.index += 1;
      session.startedAt = 0; // 下一阶段从它的第一帧开始计时
    }
    session.raf = window.requestAnimationFrame(step);
  }

  function play(phases) {
    stop();
    session = { phases, index: 0, startedAt: 0, raf: 0 };
    session.raf = window.requestAnimationFrame(step);
  }

  function stop() {
    if (!session) return;
    window.cancelAnimationFrame(session.raf);
    session = null;
  }

  return {
    play,
    stop,
    get running() {
      return session !== null;
    }
  };
}
