// tests/audio.test.js — audio.js（音效合成 + 震动反馈）的单元测试。见 AGENTS.md 7.1 与 5.6 / Step 16。
//
// 全部用注入的假 AudioContext / 假 navigator：不依赖真实音频设备，Node 里就能跑。
// 音高派生（`resolveTone`）是纯函数，「同输入同输出」是它的核心契约 —— 与 computeStepBudget 同一口径。

import { test, assertEqual, assertTrue, assertFalse, assertDeepEqual, summarize } from './assert.js';
import { CONFIG } from '../config.js';
import { AUDIO_EVENTS, HAPTIC_EVENTS, createAudio, createHaptics, resolveHaptic, resolveTone } from '../audio.js';

/** 记录所有调用的假 AudioContext（够用即可：只实现 audio.js 用到的那几个方法）。 */
function fakeAudioContext(record) {
  return class FakeAudioContext {
    constructor() {
      this.state = 'suspended';
      this.currentTime = 0;
      this.destination = { name: 'destination' };
      record.constructed += 1;
    }
    resume() {
      this.state = 'running';
      record.resumed += 1;
    }
    createOscillator() {
      record.oscillators += 1;
      return {
        type: '',
        frequency: {
          setValueAtTime: (value, at) => record.frequency.push([value, at]),
          linearRampToValueAtTime: (value, at) => record.frequency.push([value, at])
        },
        connect: () => {},
        start: (at) => record.started.push(at),
        stop: (at) => record.stopped.push(at)
      };
    }
    createGain() {
      record.gains += 1;
      return {
        gain: {
          setValueAtTime: (value, at) => record.gain.push([value, at]),
          linearRampToValueAtTime: (value, at) => record.gain.push([value, at])
        },
        connect: () => {}
      };
    }
  };
}

const emptyRecord = () => ({ constructed: 0, resumed: 0, oscillators: 0, gains: 0, frequency: [], gain: [], started: [], stopped: [] });

test('resolveTone：事件未登记返回 null；登记的事件返回确定的音（同输入同输出）', () => {
  assertEqual(resolveTone('nope'), null, '未登记事件');
  assertDeepEqual(resolveTone('swapOk', Number.NaN), resolveTone('swapOk', 0), '非法序号按 0 处理');
  assertDeepEqual(resolveTone('swapOk', -3), resolveTone('swapOk', 0), '负序号按 0 处理');
  assertDeepEqual(resolveTone('swapOk', 2), resolveTone('swapOk', 2), '同输入同输出');
  const spec = CONFIG.AUDIO_CONFIG.events.swapOk;
  const tone = resolveTone('swapOk', 0);
  assertEqual(tone.wave, spec.wave, '波形来自配置');
  assertEqual(tone.from, spec.from, '起始频率');
  assertEqual(tone.to, spec.to, '结束频率');
  assertEqual(tone.duration, spec.duration, '时长');
  assertEqual(tone.gain, spec.gain * CONFIG.AUDIO_CONFIG.masterGain, '增益 = 单音增益 × 总音量');
});

test('resolveTone：序号只改音高（连击升调 / 逐颗星升调都由配置的 stepRatio 派生）', () => {
  const clear0 = resolveTone('clear', 0);
  const clear1 = resolveTone('clear', 1);
  const clear3 = resolveTone('clear', 3);
  const ratio = CONFIG.AUDIO_CONFIG.events.clear.stepRatio;
  assertTrue(clear1.from > clear0.from, '第二层比第一层高');
  assertEqual(Math.round(clear1.from), Math.round(clear0.from * ratio), '第 1 层 = 基准 × stepRatio');
  assertEqual(Math.round(clear3.from), Math.round(clear0.from * ratio ** 3), '第 3 层 = 基准 × stepRatio³');
  const star1 = resolveTone('star', 1);
  assertTrue(star1.from > resolveTone('star', 0).from, '第二颗星比第一颗高');
  assertTrue(CONFIG.AUDIO_CONFIG.events.star.stepRatio > 1, '星级升调倍率 > 1');
});

test('resolveHaptic：返回配置模式的副本；未登记事件返回 null', () => {
  const pattern = resolveHaptic('won');
  assertDeepEqual(pattern, CONFIG.HAPTIC_CONFIG.events.won, '与配置一致');
  pattern.push(9999);
  assertFalse(CONFIG.HAPTIC_CONFIG.events.won.includes(9999), '改动返回值不会污染配置表');
  assertEqual(resolveHaptic('star'), null, 'star 未登记震动 → null（不震）');
  assertEqual(resolveHaptic('nope'), null, '未知事件 → null');
});

test('createAudio：播放在假 AudioContext 上产生正确的振荡器与增益调用', () => {
  const record = emptyRecord();
  const logs = [];
  const audio = createAudio({ contextCtor: fakeAudioContext(record), logger: (l, m) => logs.push([l, m]) });
  assertTrue(audio.play('swapOk'), '播放成功');
  assertEqual(record.constructed, 1, '上下文只创建一次');
  assertEqual(record.oscillators, 1, '一个振荡器');
  assertEqual(record.gains, 1, '一个增益节点');
  const tone = resolveTone('swapOk', 0);
  assertEqual(record.frequency[0][0], tone.from, '先设起始频率');
  assertEqual(record.frequency[1][0], tone.to, '再线性升到结束频率');
  assertEqual(record.gain[0][0], tone.gain, '起始增益 = 解析出的增益');
  assertEqual(record.started.length, 1, '启动一次');
  assertEqual(record.stopped.length, 1, '停止一次（不留下永远发声的节点）');
  assertTrue(audio.play('clear', 1), '连击音也能播');
  assertEqual(record.oscillators, 2, '第二次播放再建一个振荡器');
  audio.play('nope');
  assertEqual(record.oscillators, 2, '未登记事件不建振荡器');
  assertDeepEqual(audio.state(), { available: true, created: true }, '诊断信息');
});

test('createAudio：偏好关闭 / 环境无 AudioContext 都静默降级（不抛错、只提示一次）', () => {
  const record = emptyRecord();
  let enabled = false;
  const audio = createAudio({ contextCtor: fakeAudioContext(record), isEnabled: () => enabled });
  assertFalse(audio.play('swapOk'), '偏好关闭 → 不播');
  assertEqual(record.constructed, 0, '关闭时连上下文都不创建');

  const logs = [];
  const silent = createAudio({ contextCtor: undefined, logger: (l, m) => logs.push([l, m]) });
  assertFalse(silent.play('swapOk'), '没有 AudioContext → false');
  silent.play('swapOk');
  assertEqual(logs.filter(([l]) => l === 'info').length, 1, '降级提示只打一次');
  assertDeepEqual(silent.state(), { available: false, created: false }, '诊断信息反映不可用');
  assertFalse(silent.unlock(), 'unlock 在不可用环境下返回 false');
});

test('createAudio.unlock：在用户手势里 resume 被挂起的上下文（5.6）', () => {
  const record = emptyRecord();
  const audio = createAudio({ contextCtor: fakeAudioContext(record) });
  assertTrue(audio.unlock(), '解锁成功');
  assertEqual(record.resumed, 1, 'resume 被调用一次');
  audio.unlock();
  assertEqual(record.resumed, 1, '已 running 时不再 resume');
});

test('createHaptics：navigator.vibrate 被按配置模式调用；无该 API 时静默降级', () => {
  const calls = [];
  const haptics = createHaptics({ navigator: { vibrate: (pattern) => { calls.push(pattern); return true; } } });
  assertTrue(haptics.available(), '有震动能力');
  assertTrue(haptics.vibrate('won'), '震动成功');
  assertDeepEqual(calls, [CONFIG.HAPTIC_CONFIG.events.won], '模式来自配置');
  assertFalse(haptics.vibrate('star'), '未登记事件不震');
  assertEqual(calls.length, 1, '只震了一次');

  let enabled = false;
  const off = createHaptics({ navigator: { vibrate: () => { calls.push('should-not-happen'); return true; } }, isEnabled: () => enabled });
  assertFalse(off.vibrate('won'), '偏好关闭 → 不震');
  assertEqual(calls.length, 1, '关闭时没有新调用');

  const desktop = createHaptics({ navigator: {} });
  assertFalse(desktop.available(), '桌面浏览器没有 vibrate');
  assertFalse(desktop.vibrate('won'), '静默返回 false，不抛错');
});

test('AUDIO_EVENTS / HAPTIC_EVENTS：登记表与 config.js 一致，且震动不含 star', () => {
  assertDeepEqual([...AUDIO_EVENTS].sort(), ['clear', 'lose', 'star', 'swapBad', 'swapOk', 'won'], '音效事件');
  assertDeepEqual([...HAPTIC_EVENTS].sort(), ['clear', 'lose', 'swapOk', 'won'], '震动事件');
  for (const name of AUDIO_EVENTS) {
    const tone = resolveTone(name, 0);
    assertTrue(tone.from > 0 && tone.to > 0 && tone.duration > 0, `${name} 的频率与时长都为正`);
    assertTrue(tone.gain > 0 && tone.gain <= 1, `${name} 的增益落在 (0,1]`);
  }
});

if (!globalThis.__XXL_TEST_BUNDLE__) await summarize();
