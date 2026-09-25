// tests/particles.test.js — particles.js 的单元测试（Step 17，v1.27）。见 AGENTS.md 7.1 / 2.3 / 15。
//
// 覆盖七组性质（全部可在 Node 里逐项判定，不依赖浏览器）：
//   ① 池有界：容量上限、溢出时覆盖最旧（dropped 计数）；
//   ② 生命周期：生成 → 存活 → 到期回收，update 后活动数回落；
//   ③ 确定性：同事件键 ⇒ 逐位相同的粒子；换格子/换种类/换关卡 ⇒ 不同；
//   ④ 按事件产出：颗数、条纹的双向直线、魔力鸟/组合的全色相；
//   ⑤ dt 边界：0 / 负 / NaN / 超大都不产生 NaN、不越界；
//   ⑥ reduced-motion：不生成（而不是生成了再隐身）；
//   ⑦ 内存与面积：快照只有叶子字段（不持有 cell 引用）、每帧贴图数 ≤ maxPerFrame。
import { test, assertEqual, assertTrue, assertFalse, assertDeepEqual, summarize } from './assert.js';
import { CONFIG, DIRECTION, PARTICLE_KIND } from '../config.js';
import {
  activeParticles,
  clearParticles,
  createParticleSystem,
  eventSeed,
  hashKey,
  mulberry32,
  particleStats,
  planBurst,
  spawnBurst,
  update
} from '../particles.js';

const CFG = CONFIG.PARTICLE_CONFIG;
const spec = (extra = {}) => ({ r: 3, c: 4, cellId: 17, levelId: 1, stage: 2, kind: PARTICLE_KIND.CLEAR, color: 2, ...extra });

test('粒子①：池有界 —— 生成数不超容量，溢出时覆盖最旧并计入 dropped', () => {
  const system = createParticleSystem({ capacity: 5 });
  assertEqual(system.capacity, 5, '容量按参数');
  assertEqual(system.count, 0, '初始为空');

  // 每次 3 颗、连爆两次 → 6 颗 > 5：第 6 颗必须覆盖最旧，活动数仍 ≤ 5
  spawnBurst(system, spec({ cellId: 1 }));
  spawnBurst(system, spec({ cellId: 2 }));
  assertEqual(system.count, 5, `活动数不超容量（${system.count} ≤ 5）`);
  assertEqual(system.dropped, 1, '溢出 1 颗被丢弃');
  assertTrue(system.spawned === 6, '累计生成 6 颗（诊断量与活动数不同）');

  // 池内槽位是「一次性分配、只改字段」：容量不随生成变化
  assertEqual(system.slots.length, 5, '槽位数组长度恒为容量');
  assertEqual(activeParticles(system).length, 5, '快照条数 = 活动数（未超 maxPerFrame）');
});

test('粒子②：生命周期 —— 到期回收，活动数回落到 0，且可重新使用', () => {
  const system = createParticleSystem({ capacity: 32 });
  spawnBurst(system, spec({ kind: PARTICLE_KIND.WRAPPED, cellId: 9 }));
  assertEqual(system.count, CFG.wrappedCount, '刚生成时全部存活');

  for (let i = 0; i < 12 && system.count > 0; i += 1) update(system, 100);
  assertEqual(system.count, 0, '推进 1.2 秒后全部回收');
  assertEqual(activeParticles(system).length, 0, '快照为空');
  assertTrue(system.slots.every((slot) => slot.alive === false), '池内没有残留存活槽');

  spawnBurst(system, spec({ cellId: 10 }));
  assertTrue(system.count > 0, '回收后的槽位可再次使用');
});

test('粒子③：确定性 —— 同事件键逐位相同，换键即不同', () => {
  const a = createParticleSystem({ capacity: 64 });
  const b = createParticleSystem({ capacity: 64 });
  const c = createParticleSystem({ capacity: 64 });
  const d = createParticleSystem({ capacity: 64 });

  spawnBurst(a, spec({ kind: PARTICLE_KIND.MAGIC, cellId: 33 }));
  spawnBurst(b, spec({ kind: PARTICLE_KIND.MAGIC, cellId: 33 }));
  spawnBurst(c, spec({ kind: PARTICLE_KIND.MAGIC, cellId: 34 }));
  spawnBurst(d, spec({ kind: PARTICLE_KIND.MAGIC, cellId: 33, stage: 3 }));

  assertDeepEqual(activeParticles(a), activeParticles(b), '同键 ⇒ 逐位相同（含初速/寿命/尺寸/颜色/旋转）');
  assertFalse(JSON.stringify(activeParticles(a)) === JSON.stringify(activeParticles(c)), '换 cell.id ⇒ 不同');
  assertFalse(JSON.stringify(activeParticles(a)) === JSON.stringify(activeParticles(d)), '换级联层 ⇒ 不同');

  assertTrue(eventSeed(1, 2, 17, 'clear') !== eventSeed(1, 2, 17, 'magic'), '换种类 ⇒ 种子不同');
  assertTrue(eventSeed(1, 2, 17, 'clear') !== eventSeed(2, 2, 17, 'clear'), '换关卡 ⇒ 种子不同');
  assertEqual(eventSeed(1, 2, 17, 'clear'), eventSeed(1, 2, 17, 'clear'), '同参数 ⇒ 种子稳定');

  // 种子只由事件键决定：与系统实例、与调用次数无关
  const again = createParticleSystem({ capacity: 64 });
  update(again, 500);
  spawnBurst(again, spec({ kind: PARTICLE_KIND.MAGIC, cellId: 33 }));
  assertDeepEqual(activeParticles(again), activeParticles(a), '池的推进历史不影响生成结果（种子只认事件键）');

  assertEqual(mulberry32(7)(), mulberry32(7)(), 'mulberry32 同种子同序列');
  assertTrue(hashKey('a') !== hashKey('b'), 'hashKey 区分输入');
});

test('粒子④：按事件产出 —— 颗数递增、条纹成直线、魔力鸟与组合是全色相', () => {
  const counts = {
    [PARTICLE_KIND.CLEAR]: CFG.clearCount,
    [PARTICLE_KIND.STRIPED]: CFG.stripedCount,
    [PARTICLE_KIND.WRAPPED]: CFG.wrappedCount,
    [PARTICLE_KIND.MAGIC]: CFG.magicCount,
    [PARTICLE_KIND.COMBO]: CFG.comboCount
  };
  for (const kind of Object.keys(counts)) {
    const system = createParticleSystem({ capacity: 64 });
    const made = spawnBurst(system, spec({ kind, cellId: 5 }));
    assertEqual(made, counts[kind], `${kind} 的颗数 = ${counts[kind]}`);
    assertTrue(made <= CFG.maxPerBurst, `${kind} 不超单次上限`);
  }
  assertTrue(CFG.clearCount < CFG.stripedCount && CFG.stripedCount < CFG.magicCount && CFG.magicCount <= CFG.comboCount,
    '三类强度是「颗数递增」的（普通 < 条纹 < 魔力鸟 ≤ 组合）');

  // 条纹沿 direction：横条 |vx| > |vy|、竖条 |vy| > |vx|
  const horizontal = planBurst(PARTICLE_KIND.STRIPED, { rng: mulberry32(3), direction: DIRECTION.H, color: 1 });
  const vertical = planBurst(PARTICLE_KIND.STRIPED, { rng: mulberry32(3), direction: DIRECTION.V, color: 1 });
  assertTrue(horizontal.every((p) => Math.abs(p.vx) > Math.abs(p.vy)), '横条纹：速度沿 x');
  assertTrue(vertical.every((p) => Math.abs(p.vy) > Math.abs(p.vx)), '竖条纹：速度沿 y');
  assertTrue(horizontal.every((p) => p.color === 1), '条纹粒子沿用该格颜色');

  // 魔力鸟/组合：颜色下标覆盖全部 6 色
  for (const kind of [PARTICLE_KIND.MAGIC, PARTICLE_KIND.COMBO]) {
    const plan = planBurst(kind, { rng: mulberry32(11) });
    const colors = new Set(plan.map((p) => p.color));
    assertEqual(colors.size, 6, `${kind} 是全色相（覆盖 6 色）`);
  }

  // 普通消除带上抛：整体 vy 为负（向上）
  const clearPlan = planBurst(PARTICLE_KIND.CLEAR, { rng: mulberry32(5), color: 0 });
  assertTrue(clearPlan.every((p) => p.vy < 0), '普通消除是向上的扇形');
  assertTrue(clearPlan.every((p) => p.life > 0 && p.size > 0), '寿命与尺寸都是正数');
});

test('粒子⑤：dt 边界 —— 0 / 负 / NaN / 超大都不产生 NaN、不越界', () => {
  const system = createParticleSystem({ capacity: 16 });
  spawnBurst(system, spec({ cellId: 21 }));
  const before = activeParticles(system);

  update(system, 0);
  assertDeepEqual(activeParticles(system), before, 'dt = 0 不改变任何粒子');
  update(system, -500);
  assertDeepEqual(activeParticles(system), before, '负 dt 按 0 处理');
  update(system, Number.NaN);
  assertDeepEqual(activeParticles(system), before, 'NaN 按 0 处理');

  update(system, 1e9);
  const after = activeParticles(system);
  for (const particle of after) {
    for (const key of ['x', 'y', 'size', 'rot', 'alpha', 'age']) {
      assertTrue(Number.isFinite(particle[key]), `${key} 是有限数（dt 被夹到 ${100}ms 上限）`);
    }
    assertTrue(particle.alpha >= 0 && particle.alpha <= 1, `alpha ∈ [0,1]（${particle.alpha}）`);
    assertTrue(particle.x > -100 && particle.x < 100 && particle.y > -100 && particle.y < 100, '位置没有飞出量级（未穿屏到无穷）');
  }
  assertTrue(system.clock >= 100, 'clock 只累计被夹住的那一段');
});

test('粒子⑥：reduced-motion 或总开关关闭时不生成（不是生成了再隐身）', () => {
  const reduced = createParticleSystem({ reducedMotion: true });
  const disabled = createParticleSystem({ enabled: false });
  assertFalse(reduced.enabled, 'reduced-motion ⇒ enabled = false');
  assertEqual(spawnBurst(reduced, spec({ cellId: 1 })), 0, '不生成任何粒子');
  assertEqual(reduced.count, 0, '池保持为空（不占容量）');
  assertEqual(spawnBurst(disabled, spec({ cellId: 1 })), 0, '总开关关闭同理');
  assertEqual(update(reduced, 16).count, 0, '推进也不会凭空出现粒子');

  const on = createParticleSystem({ enabled: true });
  assertTrue(spawnBurst(on, spec({ cellId: 1 })) > 0, '显式开启后照常生成');
});

test('粒子⑦：快照只有叶子字段（不持有 cell 引用）、每帧贴图数 ≤ maxPerFrame', () => {
  const system = createParticleSystem({ capacity: CFG.capacity });
  for (let i = 0; i < 40; i += 1) spawnBurst(system, spec({ cellId: i + 1, kind: PARTICLE_KIND.COMBO }));
  const list = activeParticles(system);
  assertTrue(system.count <= CFG.capacity, '活动数不超容量');
  assertTrue(list.length <= CFG.maxPerFrame, `每帧贴图数 ≤ maxPerFrame（${list.length} ≤ ${CFG.maxPerFrame}）`);

  const allowed = new Set(['kind', 'color', 'x', 'y', 'size', 'rot', 'alpha', 'age']);
  for (const particle of list) {
    assertDeepEqual(Object.keys(particle).sort(), [...allowed].sort(), '快照字段固定');
    for (const value of Object.values(particle)) {
      assertTrue(['string', 'number'].includes(typeof value), '快照只含字符串/数字（无对象引用）');
    }
  }
  assertTrue(system.slots.every((slot) => !('cell' in slot) && !('board' in slot)), '池槽位不持有棋盘/格子对象');

  clearParticles(system);
  assertEqual(system.count, 0, 'clearParticles 清空');
  assertEqual(activeParticles(system).length, 0, '清空后快照为空');

  const stats = particleStats(system);
  assertEqual(stats.capacity, CFG.capacity, '诊断量带容量');
  assertTrue(stats.spawned >= 40 * CFG.comboCount, '诊断量累计生成颗数');
});

if (!globalThis.__XXL_TEST_BUNDLE__) await summarize();
