// particles.js — 粒子动画的**纯逻辑**（Step 17，宪法 v1.27 的 2.2 / 2.3 登记）。
//
// 边界（2.3）：只做「池 + 生命周期 + 生成计划 + 只读快照」。它不认识棋盘、`GameState`、
// DOM、Canvas、存档，也不实现任何游戏规则 —— 贴图只在 `render.js`，精灵烘焙只在 `candy.js`。
// 因为全是纯函数 + 固定容量数组，本模块可以在 Node 里逐项测量（池有界、生命周期、确定性、dt 边界）。
//
// 坐标系：粒子的位置以**棋盘格**为单位（1.0 = 一格边长），原点 = 棋盘左上角，
// 因此与设备像素/DPR 无关；渲染时乘 `cellPx` 并加棋盘区偏移即可（render.js）。
//
// 确定性（与 D039 的藤蔓路径、D041 的结算转化同一口径）：抖动只由 `PARTICLE_CONFIG.seed`
// 与事件键（关卡 id + 级联层 + `cell.id` + 事件种类）派生的固定种子 PRNG 决定，
// **不使用 `Math.random`、不读时间** —— 同输入必然同粒子，像素巡检因此可复现。
//
// 本文件的 `mulberry32` 是第三份同名实现（另外两份在 `settlement.js` 与 `vine-map.js`）：
// 不复用是为了守住 2.3 的单向依赖 —— 粒子层不得依赖结算逻辑，也不得依赖画布外的地图渲染层。
//
// 内存（宪法 15 节）：池里的槽位对象**一次性分配**、之后只改字段，永不持有已消除的 `cell`
// 引用（只记录格子的坐标与颜色下标），因此单局结束后可被整体 GC。

import { CONFIG, DIRECTION, PARTICLE_KIND } from './config.js';

const TAU = Math.PI * 2;
const MAX_STEP_MS = 100; // 单帧 dt 上限：暂停/切后台回来时不产生「瞬移穿屏」

/** 事件种类 → `PARTICLE_CONFIG` 里的「每格颗数」键。 */
const COUNT_KEYS = Object.freeze({
  [PARTICLE_KIND.CLEAR]: 'clearCount',
  [PARTICLE_KIND.STRIPED]: 'stripedCount',
  [PARTICLE_KIND.WRAPPED]: 'wrappedCount',
  [PARTICLE_KIND.MAGIC]: 'magicCount',
  [PARTICLE_KIND.COMBO]: 'comboCount'
});

/** 32 位固定种子 PRNG（与 settlement.js 的实现逐行一致）。 */
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

/** 把任意字符串折成 32 位种子（FNV-1a）——让「同事件键 ⇒ 同粒子」可复现。 */
export function hashKey(text) {
  const source = String(text ?? '');
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * 事件键 → 种子：`PARTICLE_CONFIG.seed ⊕ hashKey("关卡id:级联层:cell.id:种类")`。
 * 同一局面重播时逐位相同；不同格子/不同种类则不同（用例覆盖这两条）。
 */
export function eventSeed(levelId, stage, cellId, kind) {
  const key = `${Math.trunc(Number(levelId) || 0)}:${Math.trunc(Number(stage) || 0)}:${Math.trunc(Number(cellId) || 0)}:${kind}`;
  return (CONFIG.PARTICLE_CONFIG.seed ^ hashKey(key)) >>> 0;
}

/**
 * 把「事件种类 + 该格的上下文」翻译成一份**粒子生成计划**（纯函数，可单测）。
 * 返回数组，每项 = 一颗粒子的初值：`{ vx, vy, life, size, color, rot, spin }`
 * （位置由 `spawnBurst` 统一放到爆发格的中心）。
 *
 * 方向分布按种类区分（Step 17 用户拍板的外观 A：三类强度）：
 *   clear   —— 向上的扇形（`spread` 决定锥角），观感是「消掉的一小股」
 *   striped —— 沿 `direction` 的**双向直线**（横条沿 x、竖条沿 y），呼应爆破方向
 *   wrapped —— 环形（等角分布 + 小抖动）
 *   magic   —— 环形 + **全色相**（颜色下标循环 0..5）
 *   combo   —— 同 magic 的环形，但颗数最多、尺寸再放大一档
 */
export function planBurst(kind, options = {}) {
  const cfg = CONFIG.PARTICLE_CONFIG;
  const rng = typeof options.rng === 'function' ? options.rng : mulberry32(0);
  const type = COUNT_KEYS[kind] ? kind : PARTICLE_KIND.CLEAR;
  const count = Math.max(0, Math.trunc(options.count ?? cfg[COUNT_KEYS[type]]));
  const baseColor = Number.isInteger(options.color) && options.color >= 0 ? options.color : 0;
  const rainbow = type === PARTICLE_KIND.MAGIC || type === PARTICLE_KIND.COMBO;
  const sizeScale = type === PARTICLE_KIND.CLEAR ? 1 : cfg.specialSizeBoost;
  const plan = [];

  for (let i = 0; i < count; i += 1) {
    let angle;
    if (type === PARTICLE_KIND.CLEAR) {
      angle = -Math.PI / 2 + (rng() * 2 - 1) * Math.PI * cfg.spread; // 以正上方为中心
    } else if (type === PARTICLE_KIND.STRIPED) {
      const axis = options.direction === DIRECTION.V ? -Math.PI / 2 : 0; // 竖条沿 y、横条沿 x
      angle = axis + (i % 2 === 0 ? 0 : Math.PI) + (rng() * 2 - 1) * 0.25;
    } else {
      angle = (i / Math.max(1, count)) * TAU + (rng() * 2 - 1) * 0.35;
    }
    const speed = cfg.speed * (1 + (rng() * 2 - 1) * cfg.speedJitter);
    plan.push({
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: cfg.lifeMs * (1 - rng() * cfg.lifeJitter),
      size: cfg.size * sizeScale * (1 + (rng() * 2 - 1) * cfg.sizeJitter),
      color: rainbow ? i % 6 : baseColor,
      rot: rng() * TAU,
      spin: (rng() * 2 - 1) * 0.006
    });
  }
  return plan;
}

/**
 * 创建粒子系统（固定容量的环形池）。
 * `options.reducedMotion` 为真或 `PARTICLE_CONFIG.enabled` 为假时 `enabled = false` ——
 * 此时 `spawnBurst` 恒返回 0（**不生成**，而不是生成了再隐身）。
 */
export function createParticleSystem(options = {}) {
  const cfg = CONFIG.PARTICLE_CONFIG;
  const capacity = Math.max(1, Math.trunc(Number(options.capacity) || cfg.capacity));
  const slots = [];
  for (let i = 0; i < capacity; i += 1) {
    slots.push({
      alive: false, kind: PARTICLE_KIND.CLEAR, color: 0,
      x: 0, y: 0, vx: 0, vy: 0,
      life: 0, maxLife: 0, size: 0, rot: 0, spin: 0
    });
  }
  return {
    capacity,
    slots,
    cursor: 0, // 下一个写入槽（环形）
    count: 0, // 存活数（≤ capacity）
    enabled: options.enabled === undefined ? Boolean(cfg.enabled) && !options.reducedMotion : Boolean(options.enabled),
    spawned: 0, // 累计生成颗数（诊断）
    dropped: 0, // 因池满被覆盖的旧粒子数（诊断）
    clock: 0 // 累计推进时间（ms）
  };
}

/**
 * 在 `spec` 指定的格子上爆一批粒子。返回实际生成颗数。
 * `spec = { r, c, kind, color, direction, levelId, stage, cellId, count? }`
 * 池满时**覆盖最旧的一颗**（环形缓冲），因此生成是 O(1)、永不阻塞逻辑层。
 */
export function spawnBurst(system, spec = {}) {
  if (!system || !system.slots || !system.enabled) return 0;
  const cfg = CONFIG.PARTICLE_CONFIG;
  const kind = COUNT_KEYS[spec.kind] ? spec.kind : PARTICLE_KIND.CLEAR;
  const originR = Number.isFinite(spec.r) ? spec.r : 0;
  const originC = Number.isFinite(spec.c) ? spec.c : 0;
  const rng = mulberry32(eventSeed(spec.levelId, spec.stage, spec.cellId, kind));
  const plan = planBurst(kind, {
    rng,
    color: spec.color,
    direction: spec.direction,
    count: spec.count
  }).slice(0, Math.max(0, Math.trunc(cfg.maxPerBurst)));

  for (const particle of plan) {
    const slot = system.slots[system.cursor];
    if (slot.alive) system.dropped += 1; // 覆盖最旧
    else system.count += 1;
    slot.alive = true;
    slot.kind = kind;
    slot.color = particle.color;
    slot.x = originC + 0.5; // 棋盘坐标系：列 → x
    slot.y = originR + 0.5; // 行 → y
    slot.vx = particle.vx;
    slot.vy = particle.vy;
    slot.life = particle.life;
    slot.maxLife = particle.life;
    slot.size = particle.size;
    slot.rot = particle.rot;
    slot.spin = particle.spin;
    system.cursor = (system.cursor + 1) % system.capacity;
    system.spawned += 1;
  }
  return plan.length;
}

/** 推进 `dtMs`（毫秒）：积分 → 回收到期粒子。`dt` 被夹在 [0, MAX_STEP_MS] 内。 */
export function update(system, dtMs) {
  if (!system || !system.slots) return system;
  const cfg = CONFIG.PARTICLE_CONFIG;
  const raw = Number(dtMs);
  const dt = Number.isFinite(raw) ? Math.max(0, Math.min(MAX_STEP_MS, raw)) : 0;
  system.clock += dt;
  if (dt === 0) return system;
  const damp = Math.pow(cfg.friction, dt);
  let count = 0;
  for (const slot of system.slots) {
    if (!slot.alive) continue;
    slot.life -= dt;
    if (slot.life <= 0) {
      slot.alive = false;
      continue;
    }
    slot.vy += cfg.gravity * dt;
    slot.vx *= damp;
    slot.vy *= damp;
    slot.x += slot.vx * dt;
    slot.y += slot.vy * dt;
    slot.rot += slot.spin * dt;
    count += 1;
  }
  system.count = count;
  return system;
}

/**
 * 只读快照（供 render.js 贴图）：最多 `PARTICLE_CONFIG.maxPerFrame` 项，按**从旧到新**排列，
 * 每项只含渲染需要的叶子字段（不含池对象本身，避免渲染层改到池内状态）。
 * `alpha` 由剩余寿命派生（`(life/maxLife)^0.7`：尾部收得更快，观感更利落）。
 */
export function activeParticles(system) {
  const out = [];
  if (!system || !system.slots) return out;
  const limit = Math.max(0, Math.min(CONFIG.PARTICLE_CONFIG.maxPerFrame, system.capacity));
  const start = system.count >= system.capacity ? system.cursor : 0;
  for (let i = 0; i < system.capacity && out.length < limit; i += 1) {
    const slot = system.slots[(start + i) % system.capacity];
    if (!slot.alive) continue;
    const ratio = slot.maxLife > 0 ? Math.max(0, Math.min(1, slot.life / slot.maxLife)) : 0;
    out.push({
      kind: slot.kind,
      color: slot.color,
      x: slot.x,
      y: slot.y,
      size: slot.size,
      rot: slot.rot,
      alpha: Math.pow(ratio, 0.7),
      age: slot.maxLife - slot.life
    });
  }
  return out;
}

/** 清空池（结束/切关/重开时调用，避免上一局的粒子留在新局上）。 */
export function clearParticles(system) {
  if (!system || !system.slots) return system;
  for (const slot of system.slots) slot.alive = false;
  system.count = 0;
  system.cursor = 0;
  return system;
}

/** 诊断量（日志与浏览器巡检用；不含任何池内引用）。 */
export function particleStats(system) {
  return {
    capacity: system?.capacity ?? 0,
    count: system?.count ?? 0,
    spawned: system?.spawned ?? 0,
    dropped: system?.dropped ?? 0,
    enabled: Boolean(system?.enabled),
    clock: system?.clock ?? 0
  };
}
