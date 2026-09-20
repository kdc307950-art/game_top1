// tests/score.test.js — score.js 的单元测试。见 AGENTS.md 7.1 与 ROADMAP Step 4。
//
// 断言口径与 3.5 / 附录 A 的速查表逐项对齐；所有期望值都从 CONFIG.SCORE_CONFIG 取，
// 避免测试自己写死一份「第二真相源」。

import { test, assertEqual, assertTrue, summarize } from './assert.js';
import { CONFIG } from '../config.js';
import {
  calcBaseScore,
  calcCascadeBonus,
  calcFinalScore,
  calcSpecialMultiplier
} from '../score.js';

const SCORE = CONFIG.SCORE_CONFIG;

test('calcBaseScore：基础分 = 动物数 × basePerCell（3.5）', () => {
  const cells = [{ color: 0 }, { color: 1 }, { color: 2 }];
  assertEqual(calcBaseScore(cells), 3 * SCORE.basePerCell, '3 个动物');
  assertEqual(calcBaseScore([{}, {}, {}, {}, {}]), 5 * SCORE.basePerCell, '5 个动物');
  assertEqual(calcBaseScore([]), 0, '空数组');
});

test('calcBaseScore：非法输入返回 0，不抛错不返回 NaN', () => {
  assertEqual(calcBaseScore(undefined), 0, 'undefined');
  assertEqual(calcBaseScore(null), 0, 'null');
  assertEqual(calcBaseScore(3), 0, '数字');
});

test('calcSpecialMultiplier：普通元素与未登记取值都不放大（×1）', () => {
  assertEqual(calcSpecialMultiplier('normal', null), 1, '普通元素');
  assertEqual(calcSpecialMultiplier(null, null), 1, '无类型');
  assertEqual(calcSpecialMultiplier('unknown', null), 1, '未登记类型');
  assertEqual(calcSpecialMultiplier('unknown', 'unknownCombo'), 1, '未登记组合');
});

test('calcSpecialMultiplier：倍数全部取自 config（附录 B 的 3.5 倍数表）', () => {
  assertEqual(calcSpecialMultiplier('striped', null), SCORE.specialMultipliers.striped, '条纹 1.5');
  assertEqual(calcSpecialMultiplier('wrapped', null), SCORE.specialMultipliers.wrapped, '包装 2.0');
  assertEqual(calcSpecialMultiplier('magic', null), SCORE.specialMultipliers.magic, '魔力鸟 2.5');
  assertEqual(calcSpecialMultiplier('striped', 'stripedStriped'), SCORE.specialMultipliers.stripedStriped, '条纹+条纹 3.0');
  assertEqual(calcSpecialMultiplier('striped', 'stripedWrapped'), SCORE.specialMultipliers.stripedWrapped, '条纹+包装 3.5');
  assertEqual(calcSpecialMultiplier('wrapped', 'wrappedWrapped'), SCORE.specialMultipliers.wrappedWrapped, '包装+包装 4.0');
  assertEqual(calcSpecialMultiplier('magic', 'magicMagic'), SCORE.specialMultipliers.magicMagic, '魔力鸟+魔力鸟 5.0');
});

test('calcSpecialMultiplier：组合优先于单元素（3.3 组合效果优先）', () => {
  const combo = SCORE.specialMultipliers.stripedWrapped;
  const single = SCORE.specialMultipliers.striped;
  assertTrue(combo > single, '前提：组合倍数高于单元素');
  assertEqual(calcSpecialMultiplier('striped', 'stripedWrapped'), combo, '传入组合时取组合值');
});

test('calcCascadeBonus：第 1 层不计连消，第 2 层起按 cascadeStep 递增（3.5 / D016）', () => {
  assertEqual(calcCascadeBonus(1, 30), 0, '第 1 层（交换本身造成的消除）不加分');
  assertEqual(calcCascadeBonus(2, 30), SCORE.cascadeStep, '第 2 层 +30');
  assertEqual(calcCascadeBonus(3, 30), SCORE.cascadeStep * 2, '第 3 层 +60');
  assertEqual(calcCascadeBonus(4, 30), SCORE.cascadeStep * 3, '第 4 层 +90');
  assertEqual(calcCascadeBonus(5, 30), SCORE.cascadeStep * 4, '第 5 层 +120（与 3.5 的「30、60、90、120」一致）');
});

test('calcCascadeBonus：非法层数返回 0', () => {
  assertEqual(calcCascadeBonus(0, 30), 0, '第 0 层');
  assertEqual(calcCascadeBonus(-3, 30), 0, '负数');
  assertEqual(calcCascadeBonus(undefined, 30), 0, 'undefined');
  assertEqual(calcCascadeBonus(NaN, 30), 0, 'NaN');
});

test('calcFinalScore：base × 倍数 + 连消加分', () => {
  assertEqual(calcFinalScore(30, 1, 0), 30, '普通消除');
  assertEqual(calcFinalScore(30, 1, 30), 60, '普通 + 连消');
  assertEqual(calcFinalScore(30, 1.5, 0), 45, '条纹（3.5 表）');
  assertEqual(calcFinalScore(30, 2, 30), 90, '包装 + 连消');
});

test('calcFinalScore：与附录 A 速查表逐项一致（30 分基数 × 各倍数）', () => {
  const base = 3 * SCORE.basePerCell; // 30 分
  const expected = {
    striped: 45,
    wrapped: 60,
    magic: 75,
    stripedStriped: 90,
    stripedWrapped: 105,
    wrappedWrapped: 120,
    magicMagic: 150
  };
  for (const [key, table] of Object.entries(SCORE.specialMultipliers)) {
    assertEqual(calcFinalScore(base, table, 0), expected[key], `${key} 的结算分`);
  }
});

test('calcFinalScore：非法输入不产生 NaN', () => {
  assertEqual(calcFinalScore(NaN, 1, 0), 0, 'base 为 NaN');
  assertEqual(calcFinalScore(30, NaN, 0), 30, '倍数为 NaN 时按 1 处理');
  assertEqual(calcFinalScore(30, 1, NaN), 30, '加分为 NaN 时按 0 处理');
});

if (!globalThis.__XXL_TEST_BUNDLE__) summarize();
