// audio.js — 音效合成与震动反馈。见 AGENTS.md 2.2 / 2.3 / 5.6。
//
// 边界（2.3）：**唯一允许创建 `AudioContext` 的模块**。只接收「事件名 + 序号」，
// 不读游戏状态、不绑定事件、不碰存档（开关由调用方从 storage.js 读出来后经 `isEnabled()` 传进来）。
// 零素材（D009）：全部用 Web Audio 合成，**不引入任何音频文件** —— 因此 `assets/` 仍是空的，
// 也不需要为资源登记新的文件类型。
// 可测性：`resolveTone` / `resolveHaptic` 是纯函数（无 AudioContext 也能在 Node 里断言）；
// `createAudio` / `createHaptics` 接受注入的 `contextCtor` / `navigator`，因此单测不需要真实设备。

import { CONFIG } from './config.js';

/** 已登记的音效事件名（未登记的事件一律不响，避免静默播放噪音）。 */
export const AUDIO_EVENTS = Object.freeze(Object.keys(CONFIG.AUDIO_CONFIG.events));

/** 已登记的震动事件名。 */
export const HAPTIC_EVENTS = Object.freeze(Object.keys(CONFIG.HAPTIC_CONFIG.events));

const clamp01 = (value) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/**
 * 5.6：把「事件 + 序号」解析成一段**确定**的音（纯函数、无随机、不碰 AudioContext）。
 * 序号只改音高（`stepRatio^index`），因此连击层数/第几颗星 → 同输入同输出 ——
 * 与 `computeStepBudget` 的「设计期派生」同一口径。事件未登记时返回 null。
 */
export function resolveTone(event, index = 0) {
  const spec = CONFIG.AUDIO_CONFIG.events[event];
  if (!spec) return null;
  const step = Number.isFinite(index) && index > 0 ? Math.trunc(index) : 0;
  const ratio = spec.stepRatio ** step;
  return {
    wave: spec.wave,
    from: spec.from * ratio,
    to: spec.to * ratio,
    duration: spec.duration,
    gain: clamp01(spec.gain) * clamp01(CONFIG.AUDIO_CONFIG.masterGain)
  };
}

/** 5.6：震动模式（纯函数）。返回毫秒数组的副本（调用方改不到配置表）；事件未登记时返回 null。 */
export function resolveHaptic(event) {
  const pattern = CONFIG.HAPTIC_CONFIG.events[event];
  return Array.isArray(pattern) ? [...pattern] : null;
}

/**
 * 建一个音效播放器。`isEnabled()` 由调用方注入（读偏好），`contextCtor` / `logger` 可注入以便测试。
 * 浏览器要求音频上下文在**用户手势**里创建/恢复，所以 `play()` 是惰性创建，`unlock()` 由 app.js 在手势入口调用。
 */
export function createAudio(options = {}) {
  const logger = typeof options.logger === 'function' ? options.logger : () => {};
  const isEnabled = typeof options.isEnabled === 'function' ? options.isEnabled : () => true;
  const ctorOf = () => options.contextCtor ?? globalThis.AudioContext ?? globalThis.webkitAudioContext;
  let context = null;
  let unavailable = false;

  const ensureContext = () => {
    if (context || unavailable) return context;
    const Impl = ctorOf();
    if (typeof Impl !== 'function') {
      unavailable = true; // 只提示一次，之后静默：桌面/无音频环境是正常降级，不是错误
      logger('info', '当前环境没有 AudioContext，音效静默降级（不影响对局）');
      return null;
    }
    try {
      context = new Impl();
    } catch (error) {
      unavailable = true;
      logger('warn', `AudioContext 创建失败，音效静默降级：${error.message}`);
    }
    return context;
  };

  return {
    /** 在用户手势里调用：解锁/恢复音频上下文（否则一直是 suspended，听不到声音）。 */
    unlock() {
      const ctx = ensureContext();
      if (ctx && typeof ctx.resume === 'function' && ctx.state === 'suspended') {
        try {
          ctx.resume();
        } catch (error) {
          logger('warn', `音频上下文恢复失败：${error.message}`);
        }
      }
      return Boolean(ctx);
    },

    /** 播一段音；返回是否真的播了（供测试与诊断）。偏好关闭 / 未登记 / 环境不支持都返回 false。 */
    play(event, index = 0) {
      const tone = resolveTone(event, index);
      if (!tone || !isEnabled()) return false;
      const ctx = ensureContext();
      if (!ctx) return false;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = tone.wave;
        osc.frequency.setValueAtTime(tone.from, now);
        osc.frequency.linearRampToValueAtTime(tone.to, now + tone.duration);
        gain.gain.setValueAtTime(tone.gain, now);
        gain.gain.linearRampToValueAtTime(0.0001, now + tone.duration); // 淡出，避免爆音
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + tone.duration);
        return true;
      } catch (error) {
        logger('warn', `播放音效失败：${error.message}`);
        return false;
      }
    },

    /** 诊断信息（供浏览器取证：是否创建过上下文）。 */
    state() {
      return { available: !unavailable, created: Boolean(context) };
    }
  };
}

/**
 * 建一个震动反馈器。`navigator` 可注入以便测试；没有 `navigator.vibrate`（桌面浏览器）时静默返回 false。
 */
export function createHaptics(options = {}) {
  const isEnabled = typeof options.isEnabled === 'function' ? options.isEnabled : () => true;
  const navOf = () => options.navigator ?? globalThis.navigator;

  return {
    vibrate(event) {
      const pattern = resolveHaptic(event);
      if (!pattern || !isEnabled()) return false;
      const target = navOf();
      if (!target || typeof target.vibrate !== 'function') return false;
      try {
        return target.vibrate(pattern) !== false;
      } catch {
        return false; // 震动被系统策略拒绝时不该影响对局
      }
    },
    available() {
      const target = navOf();
      return Boolean(target && typeof target.vibrate === 'function');
    }
  };
}
