// tests/hud.test.js — hud.js 的单元测试（Step 21.1 / v1.31 / DECISIONS D048）。
//
// 只测**纯函数**：目标进度推导（goalEntries / goalProgress）、步数心跳（heartbeatScale）、
// 达标闪烁（flashFactor）、连击文案（comboText）、飘字池（spawnFloat / advanceFloats /
// floatOffset / floatProgress）与 drawFloats 的无 ctx 安全返回。
// HUD 的实际像素由 `_build/shot-hud-21.mjs` 在浏览器里取证（L2/L3）。
//
// 为什么这些要进 Node：它们是**信息层的表现规则**（进度条取哪一项、心跳什么时候缩放、飘字何时回收），
// 一旦写错就会在真机上表现为「条子不动」「飘字不消失」，而画布像素很难断言到位。

import { test, assertEqual, assertTrue, assertFalse, assertDeepEqual, summarize } from './assert.js';
import { CONFIG } from '../config.js';
import {
  advanceFloats,
  comboText,
  drawFloats,
  flashFactor,
  floatOffset,
  floatProgress,
  goalEntries,
  goalProgress,
  heartbeatScale,
  spawnFloat
} from '../hud.js';

const HUD = CONFIG.HUD_CONFIG;
const scoreHud = (score, target) => ({ score, goal: { type: 'score', target } });
const field = { x: 0, y: 40, side: 320 };

test('goalEntries：六类目标的数值与文案（文案与 v1.14 的 5.5 逐字一致）', () => {
  assertDeepEqual(goalEntries(scoreHud(3200, 7000)), [{ label: '', value: 3200, target: 7000, done: false, text: '3200/7000' }], '分数关');
  assertDeepEqual(
    goalEntries({ goal: { type: 'clearIce', target: 12 }, clearedIce: 5 }),
    [{ label: '冰', value: 5, target: 12, done: false, text: '冰 5/12' }],
    '消冰关'
  );
  assertDeepEqual(
    goalEntries({ goal: { type: 'collect', targets: { frog: 12 } }, collected: { frog: 8 } }),
    [{ label: 'frog', value: 8, target: 12, done: false, text: 'frog 8/12' }],
    '收集关'
  );
  assertDeepEqual(goalEntries({ goal: { type: 'fruit', target: 3 }, collectedFruit: 1 }), [{ label: '水果', value: 1, target: 3, done: false, text: '水果 1/3' }], '水果关');
  assertDeepEqual(goalEntries({ goal: { type: 'pod', target: 2 }, collectedPod: 2 }), [{ label: '豆荚', value: 2, target: 2, done: true, text: '豆荚 2/2' }], '金豆荚关（已达成）');
  const mixed = goalEntries({ score: 100, clearedIce: 3, goal: { type: 'mixed', score: 5000, clearIce: 10 } });
  assertEqual(mixed.length, 2, '混合目标两个分项');
  assertDeepEqual(mixed.map((entry) => entry.text), ['100/5000', '冰 3/10'], '混合目标的分项文案');
  assertDeepEqual(goalEntries({ goal: null }), [], '没有目标 → 空表（不编造）');
  assertDeepEqual(goalEntries({}), [], '缺省 → 空表');
});

test('goalProgress：优先未完成的分项、全完成取最后一项、比例夹到 0–1', () => {
  const mixed = { score: 6000, clearedIce: 1, goal: { type: 'mixed', score: 5000, clearIce: 10 } };
  const progress = goalProgress(mixed);
  assertEqual(progress.has, true, '有目标');
  assertEqual(progress.text, '冰 1/10', '优先显示**未完成**的那一项（分数已完成、冰块没有）');
  assertEqual(progress.done, false, '还没达成');
  assertEqual(progress.ratio, 0.1, '比例 = 1/10');
  assertEqual(goalProgress(scoreHud(7000, 7000)).ratio, 1, '刚好达成 → 满格');
  assertEqual(goalProgress(scoreHud(9999, 7000)).ratio, 1, '超出目标也夹到 1（不画出格）');
  assertEqual(goalProgress(scoreHud(0, 7000)).ratio, 0, '0 分 → 空条');
  assertEqual(goalProgress({ goal: { type: 'score', target: 0 } }).ratio, 1, '目标为 0 的脏数据 → 视作满格，不产生 NaN');
  const none = goalProgress({ goal: null });
  assertEqual(none.has, false, '没有目标 → has=false（不画条子）');
  assertEqual(none.ratio, 0, '没有目标时比例是 0');
});

test('heartbeatScale：非低值恒为 1；低值时按周期在 1 ↔ lowStepsScale 之间呼吸', () => {
  assertEqual(heartbeatScale(20, 0, null, 1234), 1, '步数充足 → 不缩放');
  assertTrue(heartbeatScale(0, 0, null, 1234) > 1, `步数 0 → 一定在心跳（实得 ${heartbeatScale(0, 0, null, 1234)}）`);
  const peak = heartbeatScale(3, 0, null, HUD.lowStepsPulseMs / 2);
  assertEqual(Math.round(peak * 1000) / 1000, HUD.lowStepsScale, '半周期处是峰值');
  assertEqual(heartbeatScale(3, 0, null, 0), 1, '周期起点是谷值（1）');
  for (const step of [0, 1, 5]) {
    const value = heartbeatScale(step, 0, null, 200);
    assertTrue(value >= 1 && value <= HUD.lowStepsScale, `步数 ${step} 的缩放落在 [1, ${HUD.lowStepsScale}]：${value}`);
  }
  assertEqual(heartbeatScale(3, 0, null, 200), heartbeatScale(3, 0, null, 200), '同一时刻同一输入 → 同一缩放（无随机）');
  assertEqual(heartbeatScale(3, 0, null, 200 + HUD.lowStepsPulseMs), heartbeatScale(3, 0, null, 200), '整周期后回到同一相位');
  // 时间关：用剩余秒数而不是步数（3.6 v1.18 —— 时间关没有步数）
  assertEqual(heartbeatScale(0, 60, 60, 100), 1, '时间关秒数充足 → 不缩放（即使步数是 0）');
  assertTrue(heartbeatScale(0, 5, 60, HUD.lowStepsPulseMs / 2) > 1, '时间关 ≤10s → 心跳');
});

test('flashFactor：只在达成后闪烁，取值 0–1（确定性）', () => {
  assertEqual(flashFactor(false, 123), 0, '未达成 → 不闪');
  assertEqual(Math.round(flashFactor(true, HUD.progressFlashMs / 2) * 1000) / 1000, 1, '半周期 → 最亮');
  assertEqual(flashFactor(true, 0), 0, '周期起点 → 常态色');
  assertTrue(flashFactor(true, 123) >= 0 && flashFactor(true, 123) <= 1, '因子落在 0–1');
  assertEqual(flashFactor(true, 123), flashFactor(true, 123), '无随机');
});

test('comboText：第 3 层起给文案，薄层与脏值返回 null', () => {
  assertEqual(comboText(0), null, '第 1 层没有文案');
  assertEqual(comboText(1), null, '第 2 层没有文案');
  assertEqual(comboText(2), '太棒了！', '第 3 层');
  assertEqual(comboText(3), '干得好！', '第 4 层');
  assertEqual(comboText(4), '不可思议！', '第 5 层');
  assertEqual(comboText(99), '不可思议！', '更高的连击封顶到最强文案（不越界）');
  assertEqual(comboText(Number.NaN), null, '脏值 → null');
  assertEqual(comboText(-3), null, '负数 → null');
});

test('飘字池：有界（≤ floatMax）、不改入参、按生命期回收', () => {
  let pool = [];
  for (let i = 1; i <= HUD.floatMax + 3; i += 1) pool = spawnFloat(pool, `+${i * 10}`, i);
  assertEqual(pool.length, HUD.floatMax, `池上限 = ${HUD.floatMax}（超出的丢最旧）`);
  assertEqual(pool[pool.length - 1].text, `+${(HUD.floatMax + 3) * 10}`, '最新的一条一定在池里');
  const first = [{ text: '+10', bornAt: 0, index: 1 }];
  const after = spawnFloat(first, '+20', 10);
  assertEqual(first.length, 1, 'spawnFloat **不改入参**（返回新数组）');
  assertEqual(after.length, 2, '返回的池里多了一条');
  const kept = advanceFloats(after, 10 + HUD.floatLifeMs - 11);
  assertEqual(kept.length, 2, `生命期内两条都留着（此时第一条 ${HUD.floatLifeMs - 11}ms、第二条 ${HUD.floatLifeMs - 21}ms）`);
  const half = advanceFloats(after, HUD.floatLifeMs + 9);
  assertEqual(half.length, 1, '到点的第一条被回收（第二条还差 1ms）');
  assertEqual(advanceFloats(after, HUD.floatLifeMs + 10).length, 0, '两条都到点后全部回收');
  assertEqual(advanceFloats(after, 10 + HUD.floatLifeMs * 10).length, 0, '时间久了全部回收');
  assertDeepEqual(advanceFloats(null, 0), [], '空池安全');
  assertDeepEqual(advanceFloats(undefined, 0), [], '缺省安全');
});

test('飘字位移：由序号与生命进度派生（确定性、上升、不出棋盘）', () => {
  const float = { text: '+100', bornAt: 1000, index: 1 };
  assertEqual(floatProgress(float, 1000), 0, '刚生成 → 进度 0');
  assertEqual(floatProgress(float, 1000 + HUD.floatLifeMs / 2), 0.5, '半程 → 0.5');
  assertEqual(floatProgress(float, 1000 + HUD.floatLifeMs * 5), 1, '过期后夹到 1（不越界）');
  const start = floatOffset(float, 1000, field.side);
  const mid = floatOffset(float, 1000 + HUD.floatLifeMs / 2, field.side);
  const end = floatOffset(float, 1000 + HUD.floatLifeMs, field.side);
  assertEqual(start.dy, 0, '起点不偏移');
  assertTrue(mid.dy < 0 && end.dy < start.dy, `随时间**向上**飘：${start.dy} → ${mid.dy} → ${end.dy}`);
  assertEqual(end.dy, -field.side * HUD.floatRiseRatio, `终点 = -side × floatRiseRatio = ${-field.side * HUD.floatRiseRatio}`);
  assertEqual(JSON.stringify(floatOffset(float, 1500, field.side)), JSON.stringify(floatOffset(float, 1500, field.side)), '同一时刻同一输入 → 同一位移（无随机）');
  const xs = [1, 2, 3, 4, 5, 6].map((index) => floatOffset({ bornAt: 0, index }, 0, field.side).dx);
  assertTrue(new Set(xs).size >= 3, `横向按序号错开，至少 3 个不同位置：${JSON.stringify(xs)}`);
  assertTrue(xs.every((dx) => Math.abs(dx) <= field.side * 0.07), '错开幅度不超过 7% 棋盘边长（不飞出棋盘）');
});

test('drawFloats：空池不碰 ctx（返回 0），有池时逐条返回条数', () => {
  const calls = { fillText: 0, strokeText: 0 };
  const stub = {
    fillText: () => { calls.fillText += 1; },
    strokeText: () => { calls.strokeText += 1; }
  };
  assertEqual(drawFloats(stub, field, [], 0), 0, '空池 → 画 0 条且不调用绘制');
  assertEqual(calls.fillText, 0, '空池时一次 fillText 都没有');
  const pool = [spawnFloat([], '+10', 0)[0], { text: '+20', bornAt: 0, index: 2 }];
  assertEqual(drawFloats(stub, field, pool, 100), 2, '两条都画了');
  assertEqual(calls.fillText, 2, '每条一次填充');
  assertEqual(calls.strokeText, 2, '每条一次描边（暗色勾边，保证在棋盘上读得清）');
  assertEqual(drawFloats(null, field, pool, 0), 0, 'ctx 为空也安全（不抛错）');
});

if (!globalThis.__XXL_TEST_BUNDLE__) await summarize();
