// settlement.js — 结算阶段（Step 20，用户批准的方案）。见 AGENTS.md 2.3 / 3.5 / 3.6 第 7 条。
//
// 纯逻辑模块：不碰 DOM / Canvas / localStorage（宪法 9 节），也不认识 GameState。
// 它只回答四个问题（全部是纯函数，可在 Node 里逐项测）：
//   ① 第 n 个剩余步值多少分？（递增制，数值 = 该关 1★ 基准分 × 比例，见 SETTLEMENT_CONFIG）
//   ② 星级阈值修正要预留多少结算期望分？（设计期派生，不依赖运行时历史）
//   ③ 哪些格子会被转化成特殊糖果、各转成什么？（**受控伪随机**：固定种子的 mulberry32）
//   ④ 引爆队列的初始顺序是什么？（从棋盘底部到顶部）
//
// 「受控伪随机」的含义（用户方案 1.3）：玩家不知道这次会出什么，但**系统知道** ——
// 同一个 `seed + 关卡id` 永远给出同一串数，因此结算可复现、可巡检，不违反
// 3.6 第 6 条「设计期派生、无运行时随机」的口径。
//
// 注意：本文件的 mulberry32 与 `vine-map.js` 的同名实现是**两份**（一个是地图路径的
// 几何抖动、一个是结算的转化分配）。不复用是为了守住 2.3 的单向依赖 ——
// 逻辑模块不得依赖渲染模块（`vine-map.js` 是画布外的 DOM 渲染层）。

import { CELL_TYPE, CONFIG } from './config.js';

/** 转化出的特殊糖果类型（权重键 → 4.1 的 cell.type / cell.direction）。顺序即权重表的登记顺序。 */
const SPECIAL_SHAPES = Object.freeze({
  stripedH: { type: CELL_TYPE.STRIPED, direction: 'h' },
  stripedV: { type: CELL_TYPE.STRIPED, direction: 'v' },
  wrapped: { type: CELL_TYPE.WRAPPED, direction: null },
  magic: { type: CELL_TYPE.MAGIC, direction: null }
});

/**
 * mulberry32：32 位固定种子 PRNG，返回 [0,1) 的确定性序列。
 * 同一 seed 永远同一串数 —— 这正是「受控伪随机」的实现基础。
 */
export function mulberry32(seed) {
  let state = Math.trunc(seed) >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 结算阶段的随机源：种子 = `SETTLEMENT_CONFIG.seed + 关卡id`（同一关每次结算完全一致）。 */
export function settlementRngFor(levelId) {
  const id = Number.isFinite(levelId) ? Math.trunc(levelId) : 0;
  return mulberry32(CONFIG.SETTLEMENT_CONFIG.seed + id);
}

/**
 * 第 `stepIndex`（1 起算）个剩余步的奖励比例：递增制，第 1–6 步取 `stepScoreRatios`
 * 的对应项，第 7 步及以后统一取末项（用户方案 1.2 的递增制形状）。
 * 非法下标（< 1）返回 0 —— 不放大、不抛错。
 */
export function stepScoreRatio(stepIndex) {
  const ratios = CONFIG.SETTLEMENT_CONFIG.stepScoreRatios;
  const index = Number.isFinite(stepIndex) ? Math.trunc(stepIndex) : 0;
  if (index < 1 || ratios.length === 0) return 0;
  return ratios[Math.min(index - 1, ratios.length - 1)];
}

/**
 * 3.5（v1.25 口径）：`steps` 个剩余步的奖励分合计。
 * `scale` 是该关的**设计基准分**（= `starThresholds[0]`，分数关即目标分）——
 * 递增制的量级挂在它上面，因此 50 关的「省步收益 / 星级基准」比值完全一致。
 * 逐步取整（而不是最后取整），保证每一步的奖励都是整数分、可单独显示。
 */
export function settlementStepsScore(steps, scale) {
  const count = Number.isFinite(steps) ? Math.max(0, Math.trunc(steps)) : 0;
  const base = Number.isFinite(scale) ? Math.max(0, scale) : 0;
  let total = 0;
  for (let i = 1; i <= count; i += 1) total += Math.round(base * stepScoreRatio(i));
  return total;
}

/**
 * 3.7（v1.25）：星级阈值修正要预留的**结算期望分** —— 统一动态调整的输入。
 * 用户方案 2.2 的原意是「平均余步数 × 平均每步得分」，其中平均余步数取**历史通关余步数的中位数**。
 * 本项目没有运行时历史（也不该为了调数值引入一张新存档），故用**设计期代理**替代：
 *   `典型余步 = round(步数预算 × typicalRemainingRatio)`，并夹到 `[0, 步数预算 − 1]`
 *   （上限的理由：第 1 手就通关时最多剩 `步数 − 1` 步）。
 * 纯函数、无随机：同一关永远算出同一个期望值，因此星阈值仍属「设计期派生」。
 */
export function estimateSettlementScore(scale, steps) {
  const budget = Number.isFinite(steps) ? Math.max(0, Math.trunc(steps)) : 0;
  const ratio = CONFIG.SETTLEMENT_CONFIG.typicalRemainingRatio;
  const upper = Math.max(0, budget - 1);
  const typical = Math.min(Math.round(budget * ratio), upper);
  return settlementStepsScore(typical, scale);
}

/**
 * 3.6 第 7 条（v1.25）：能被转化成特殊糖果的格子 —— **只接受最朴素的动物格**。
 * 排除项与理由：
 *   · 空格 / 占格障碍（雪块·巧克力）：格内没有动物，无从「把一个小动物变成特效」；
 *   · 收集物（水果·金豆荚）：3.6 v1.18 规定它不可被消除、也不参与匹配；
 *   · **任何带障碍物的格子**（含冰块/藤蔓）：冰块是覆层，转出来的特效会与「冰里住着一颗特效」
 *     这种歧义状态纠缠；藤蔓更是永久锁格（v1.17）。保守起见一律不转化 —— 结算奖励应当确定、可解释。
 *   · 已经是特殊糖果的格子：没有可转化的余地。
 */
export function conversionCells(board) {
  const cells = [];
  if (!Array.isArray(board)) return cells;
  board.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (!isPlainAnimal(cell)) return;
      cells.push({ r, c });
    });
  });
  return cells;
}

function isPlainAnimal(cell) {
  if (!cell) return false;
  if (cell.color === null || cell.color === undefined) return false;
  if (cell.type !== CELL_TYPE.NORMAL) return false;
  if (cell.obstacle !== null && cell.obstacle !== undefined) return false;
  if (cell.collectible !== null && cell.collectible !== undefined) return false;
  return true;
}

/**
 * 3.6 第 7 条（v1.25）：本局结算时「剩余步数 → 特殊糖果」的转化计划（**不改动棋盘**）。
 * 落点从 `conversionCells` 里用注入的 rng 做 Fisher-Yates 洗牌后取前 N 个（N = 剩余步数，
 * 上限为可用格数）；类型按 `SETTLEMENT_CONFIG.specialWeights` 的权重随机取。
 * 返回 `[{ r, c, type, direction }]`，由调用方（game.js）落到棋盘上。
 */
export function conversionPlan(board, steps, rng) {
  const rnd = typeof rng === 'function' ? rng : mulberry32(CONFIG.SETTLEMENT_CONFIG.seed);
  const wanted = Number.isFinite(steps) ? Math.max(0, Math.trunc(steps)) : 0;
  const pool = conversionCells(board);
  if (wanted === 0 || pool.length === 0) return [];

  // Fisher-Yates：只洗到需要的个数为止（洗牌过程即「随机落点」）
  const take = Math.min(wanted, pool.length);
  for (let i = 0; i < take; i += 1) {
    const j = i + Math.floor(rnd() * (pool.length - i));
    const swap = pool[i];
    pool[i] = pool[j];
    pool[j] = swap;
  }

  const plan = [];
  for (let i = 0; i < take; i += 1) {
    const shape = pickShape(rnd);
    plan.push({ r: pool[i].r, c: pool[i].c, type: shape.type, direction: shape.direction });
  }
  return plan;
}

/** 按权重取一种特殊糖果形态（权重与顺序都来自 `SETTLEMENT_CONFIG.specialWeights`）。 */
function pickShape(rnd) {
  const weights = CONFIG.SETTLEMENT_CONFIG.specialWeights;
  const keys = Object.keys(SPECIAL_SHAPES);
  const total = keys.reduce((sum, key) => sum + Math.max(0, Number(weights?.[key]) || 0), 0);
  if (!(total > 0)) return SPECIAL_SHAPES[keys[0]];

  let ticket = rnd() * total;
  for (const key of keys) {
    ticket -= Math.max(0, Number(weights?.[key]) || 0);
    if (ticket < 0) return SPECIAL_SHAPES[key];
  }
  return SPECIAL_SHAPES[keys[keys.length - 1]]; // 浮点兜底：落在最后一项
}

/**
 * 3.6 第 7 条（v1.25）：引爆队列的初始顺序 —— **从棋盘底部到顶部**（用户方案 1.4 第 2 条）。
 * 底部的引爆更容易把上方的糖果带进下落连锁，因此先爆下面。
 * 返回 `Pos[]`；只列 `cell.type !== normal` 的格子（即特殊糖果）。
 */
export function detonationOrder(board) {
  const order = [];
  if (!Array.isArray(board)) return order;
  for (let r = board.length - 1; r >= 0; r -= 1) {
    const row = board[r];
    for (let c = 0; c < row.length; c += 1) {
      const cell = row[c];
      if (!cell || cell.type === CELL_TYPE.NORMAL) continue;
      order.push({ r, c });
    }
  }
  return order;
}

/** 按 `cell.id` 在棋盘上找当前位置（连锁引爆期间格子会随重力移动，故用 id 而不是坐标追踪）。 */
export function findCellById(board, id) {
  if (!Array.isArray(board)) return null;
  for (let r = 0; r < board.length; r += 1) {
    const row = board[r];
    for (let c = 0; c < row.length; c += 1) {
      if (row[c]?.id === id) return { r, c };
    }
  }
  return null;
}
