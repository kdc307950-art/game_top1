// input.js — 触摸/鼠标手势识别与视口守卫。见 AGENTS.md 2.2 / 2.3 / 5.1 / 5.3。
//
// 边界（宪法 2.3）：只产出 `{ kind, x0, y0, x1, y1 }` 手势事件；不认识棋盘、
// 不碰游戏状态与 localStorage。是否接受某个手势由 app.js 通过 `isLocked` 决定（不透明策略回调）。
//
// 5.3：主交互是 touchstart + touchend 判定滑动方向，点击两次交换只是后备方案；
//      鼠标事件只为桌面端手动验证提供同一入口（触摸后按时间窗忽略浏览器的兼容鼠标事件）。

import { CONFIG } from './config.js';

const TOUCH_MOUSE_GUARD_MS = 600;

/**
 * 绑定输入。返回解绑函数。
 * @param {object} options
 * @param {HTMLElement} options.target        接收触摸/鼠标事件的元素（画布）
 * @param {() => boolean} [options.isLocked]  返回 true 时丢弃整段手势（动画播放中 / 已结束）
 * @param {(gesture: object) => void} [options.onSwipe] 滑动：{ kind:'swipe', x0,y0,x1,y1 }
 * @param {(gesture: object) => void} [options.onTap]   点按：{ kind:'tap', x0,y0,x1,y1 }
 */
export function bindInput({ target, isLocked = () => false, onSwipe, onTap }) {
  const gesture = { x0: 0, y0: 0, tracking: false, lastTouchAt: 0 };

  const begin = (x, y) => {
    if (isLocked()) {
      gesture.tracking = false;
      return;
    }
    gesture.x0 = x;
    gesture.y0 = y;
    gesture.tracking = true;
  };

  const end = (x, y) => {
    if (!gesture.tracking) return;
    gesture.tracking = false;
    if (isLocked()) return;
    const payload = { x0: gesture.x0, y0: gesture.y0, x1: x, y1: y };
    const dx = x - gesture.x0;
    const dy = y - gesture.y0;
    const threshold = CONFIG.ANIMATION_CONFIG.swipeThreshold; // 5.3：阈值取自配置
    if (Math.max(Math.abs(dx), Math.abs(dy)) >= threshold) {
      // 5.3 方向锁定：只取主轴，斜向滑动也按主轴判定，避免斜向误判
      const step =
        Math.abs(dx) >= Math.abs(dy) ? { r: 0, c: Math.sign(dx) } : { r: Math.sign(dy), c: 0 };
      onSwipe?.({ kind: 'swipe', ...payload, step });
      return;
    }
    onTap?.({ kind: 'tap', ...payload });
  };

  const cancel = () => {
    gesture.tracking = false;
  };

  const onTouchStart = (event) => {
    if (event.touches.length !== 1) return; // 多指手势不参与交换
    gesture.lastTouchAt = Date.now();
    const touch = event.changedTouches[0];
    begin(touch.clientX, touch.clientY);
  };

  const onTouchEnd = (event) => {
    gesture.lastTouchAt = Date.now();
    const touch = event.changedTouches[0];
    if (touch) end(touch.clientX, touch.clientY);
  };

  const onMouseDown = (event) => {
    if (Date.now() - gesture.lastTouchAt < TOUCH_MOUSE_GUARD_MS) return;
    begin(event.clientX, event.clientY);
  };

  const onMouseUp = (event) => {
    if (Date.now() - gesture.lastTouchAt < TOUCH_MOUSE_GUARD_MS) return;
    end(event.clientX, event.clientY);
  };

  target.addEventListener('touchstart', onTouchStart, { passive: true });
  target.addEventListener('touchend', onTouchEnd, { passive: true });
  target.addEventListener('touchcancel', cancel, { passive: true });
  target.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return () => {
    target.removeEventListener('touchstart', onTouchStart);
    target.removeEventListener('touchend', onTouchEnd);
    target.removeEventListener('touchcancel', cancel);
    target.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
  };
}

/**
 * 视口守卫（5.1）：禁止页面滚动、下拉刷新与双指缩放。
 * iOS Safari 会忽略 user-scalable=no，必须显式阻止 gesture* 与双指 touchmove；
 * preventDefault 只阻止默认行为，不影响 touchstart/touchend 的事件投递。
 */
export function bindViewportGuards(doc = document) {
  const preventDefault = (event) => event.preventDefault();
  const types = ['gesturestart', 'gesturechange', 'touchmove'];
  for (const type of types) doc.addEventListener(type, preventDefault, { passive: false });
  return () => {
    for (const type of types) doc.removeEventListener(type, preventDefault);
  };
}

/** 系统「减少动效」偏好（5.4）。CSS 侧由 styles.css 的媒体查询兜底，动画时长由 app.js 决定。 */
export function prefersReducedMotion(win = window) {
  return Boolean(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
}
