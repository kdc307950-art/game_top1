// timeline.js — 动画时间线调度与 rAF 回放。见 AGENTS.md 2.2 / 2.3 / 5.4 / 15。
//
// 边界（2.3）：只接收「阶段列表 + 每帧回调」并按时长推进；不读游戏状态、不碰 localStorage、
// 不实现任何游戏规则 —— 它不知道什么叫消除，只知道「第 N 阶段的进度是多少」。
// 时长全部来自 `CONFIG.ANIMATION_CONFIG`（15 节），并支持系统「减少动效」（5.4）。

import { CONFIG } from './config.js';

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
    gap: cfg.cascadeGap
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
 * 把一次结算拆成阶段列表：每层级联 = 消除 → 下落（若有位移）→ 落定。
 * 只做数据整理，不触发绘制；`board` 是历史快照，`keys/hidden/moves` 供渲染层解释。
 */
export function buildPhases(resolve, afterSwap, motion) {
  const phases = [];
  let preBoard = afterSwap;
  resolve.levels.forEach((level, index) => {
    const keys = new Set(level.groups.flatMap((group) => group.cells).map((pos) => `${pos.r},${pos.c}`));
    const moves = new Map(level.moves.map((move) => [move.id, { from: move.from, to: move.to }]));
    phases.push({ phase: 'clear', board: preBoard, keys, levelIndex: index, duration: motion.clear });
    if (moves.size > 0) {
      phases.push({
        phase: 'fall',
        board: preBoard,
        hidden: keys,
        moves,
        levelIndex: index,
        duration: fallDurationFor(level.moves, motion.fall)
      });
    }
    phases.push({ phase: 'settle', board: level.board, levelIndex: index, duration: motion.gap });
    preBoard = level.board;
  });

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

/** 按 cell.id 匹配前后快照，得出每格的起止位置；只做数据变换，不改动棋盘。 */
function diffById(before, after) {
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
