// app.js — Canvas 渲染、触摸输入、动画。本项目唯一允许操作 DOM / Canvas / localStorage 的模块。
// 见 AGENTS.md 2.3 / 9 节。
//
// 【Step 1 · ROADMAP】本文件当前只做「8×8 棋盘显示」：
//   - 禁止触摸交互、禁止游戏规则、禁止修改逻辑模块（ROADMAP Step 1 禁止项）；
//   - 因此这里不 import board.js / match.js，格子颜色是**临时占位数据**，
//     AGENTS.md 4.1 的 cell[][] 由 board.js 在 Step 2/3 提供后接入；
//   - 所有可调数值来自 config.js（宪法 0.7 / 9 节）。

import { CONFIG } from './config.js';

// ---------------------------------------------------------------------------
// 渲染常量：只影响观感，不参与游戏规则。
// 按 ROADMAP Step 1 的范围（只允许改 index.html / styles.css / app.js）它们不进
// config.js；若后续需要集中管理，须先改宪法附录 B 与 config.js。
// ---------------------------------------------------------------------------
const MAX_DPR = 3; // 后备缓冲上限：高 DPR 机型不做无意义的 4× 过度绘制
const BOARD_MARGIN = 16; // px；棋盘与安全区内容边缘之间的呼吸空间（两侧各一份）
const MIN_BOARD_PX = 220; // 极窄视口下的可读下限
const MAX_BOARD_PX = 720; // 平板/桌面上不让棋盘无限放大
const BOARD_RADIUS_RATIO = 0.03; // 棋盘圆角 / 边长
const CELL_RADIUS_RATIO = 0.36; // 糖果半径 / 格子边长（AGENTS.md 5.2 正方形棋盘）
const BOARD_BG = '#1b1830';
const LOG_RANK = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LOG_RANK = LOG_RANK.info;

// 颜色索引（0-5）→ 调色板。顺序对应 CONFIG.COLOR_NAMES，改动顺序等于改动视觉语义。
// 每个颜色预计算亮/暗变体，供单次径向渐变填充使用（避免阴影模糊，见 REFERENCES.md §3.5）。
const BASE_COLORS = ['#f2555a', '#f7a325', '#ffd93b', '#4ecb71', '#38b6ff', '#a06bff'];
const PALETTE = BASE_COLORS.map((base) => ({
  light: mixHex(base, '#ffffff', 0.45),
  base,
  dark: mixHex(base, '#000000', 0.3)
}));

// 视图状态（唯一可变副作用集中处）
const view = {
  canvas: null,
  ctx: null,
  colors: null, // 占位颜色索引（Uint8Array），仅用于绘制，不是棋盘状态
  sizePx: 0, // Canvas 的 CSS 像素边长（正方形）
  dpr: 1,
  frameRequest: 0
};

init();

/** 启动渲染：取元素 → 建占位颜色 → 布局首绘 → 绑定视口守卫。 */
function init() {
  const canvas = document.getElementById('board');
  if (!canvas) {
    log('error', '未找到 #board 元素，渲染中止');
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    log('error', '无法获取 2D 上下文，渲染中止');
    return;
  }

  view.canvas = canvas;
  view.ctx = ctx;
  view.colors = createPlaceholderColors();

  applyLayout();

  log(
    'info',
    `棋盘已渲染：${CONFIG.BOARD_SIZE}×${CONFIG.BOARD_SIZE}，色数 ${CONFIG.COLOR_COUNT}，` +
      `CSS ${view.sizePx}px，DPR ${view.dpr}（BACKING ${canvas.width}×${canvas.height}）`
  );

  window.addEventListener('resize', scheduleLayout, { passive: true });
  window.addEventListener('orientationchange', scheduleLayout, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleLayout, { passive: true });
  }

  bindViewportGuards();
}

/**
 * 生成占位颜色索引。
 * 这不是 AGENTS.md 4.1 的棋盘状态（那必须是 board.js 的 cell[][]），
 * 只是 Step 1「每格显示一个随机颜色」的绘制输入，Step 2 接入真实棋盘后删除。
 */
function createPlaceholderColors() {
  const total = CONFIG.BOARD_SIZE * CONFIG.BOARD_SIZE;
  const colors = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    colors[i] = Math.floor(Math.random() * CONFIG.COLOR_COUNT);
  }
  if (CONFIG.COLOR_COUNT !== PALETTE.length) {
    log('warn', `CONFIG.COLOR_COUNT=${CONFIG.COLOR_COUNT} 与调色板 ${PALETTE.length} 色不一致，占位颜色会重复`);
  }
  return colors;
}

/** 计算棋盘边长（CSS 像素）：取可用宽高中的较小者，扣除安全区与留白。 */
function computeBoardSize() {
  const root = document.documentElement;
  const viewportW = root.clientWidth || window.innerWidth;
  const viewportH = root.clientHeight || window.innerHeight;
  const availW = viewportW - readSafeInset('left') - readSafeInset('right') - BOARD_MARGIN * 2;
  const availH = viewportH - readSafeInset('top') - readSafeInset('bottom') - BOARD_MARGIN * 2;
  const size = Math.min(availW, availH, MAX_BOARD_PX);
  return Math.max(MIN_BOARD_PX, Math.floor(size));
}

/** 读取 styles.css 中声明的安全区值（AGENTS.md 5.1 刘海屏适配）。 */
function readSafeInset(side) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--safe-${side}`);
  const px = Number.parseFloat(raw);
  return Number.isFinite(px) ? px : 0;
}

/** 应用尺寸：CSS 尺寸保持正方形，后备缓冲按 devicePixelRatio 放大（AGENTS.md 5.2）。 */
function applyLayout() {
  const size = computeBoardSize();
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const backing = Math.round(size * dpr);

  view.sizePx = size;
  view.dpr = dpr;
  view.canvas.style.width = `${size}px`;
  view.canvas.style.height = `${size}px`;
  // 先改后备缓冲尺寸（该赋值会重置变换并清空画布），再设变换、再绘制。
  if (view.canvas.width !== backing) view.canvas.width = backing;
  if (view.canvas.height !== backing) view.canvas.height = backing;
  view.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBoard();
}

/** 合并同一帧内的多次视口变化（旋转屏幕会连续触发 resize）。 */
function scheduleLayout() {
  if (view.frameRequest !== 0) return;
  view.frameRequest = window.requestAnimationFrame(() => {
    view.frameRequest = 0;
    applyLayout();
  });
}

/**
 * 绘制整块棋盘。绘制/路径调用预算（保守计法，fill + arc）：
 * 棋盘底 1 次 fill，每格 1 次 arc + 1 次 fill，合计 129 次 —— 低于 AGENTS.md 15 节
 * 「单帧绘制调用不超过 200 次」。光晕只用径向渐变实现，不使用阴影模糊
 * （REFERENCES.md §3.5 性能红线第 1 条）。
 */
function drawBoard() {
  const ctx = view.ctx;
  const rows = CONFIG.BOARD_SIZE;
  const cols = CONFIG.BOARD_SIZE;
  const size = view.sizePx;
  const cell = size / cols;
  const radius = cell * CELL_RADIUS_RATIO;

  ctx.clearRect(0, 0, size, size);

  roundRectPath(ctx, 0, 0, size, size, size * BOARD_RADIUS_RATIO);
  ctx.fillStyle = BOARD_BG;
  ctx.fill();

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const cx = (c + 0.5) * cell;
      const cy = (r + 0.5) * cell;
      const color = PALETTE[view.colors[r * cols + c] % PALETTE.length];
      const grad = ctx.createRadialGradient(
        cx - radius * 0.35,
        cy - radius * 0.4,
        radius * 0.12,
        cx,
        cy,
        radius
      );
      grad.addColorStop(0, color.light);
      grad.addColorStop(0.55, color.base);
      grad.addColorStop(1, color.dark);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** 圆角矩形路径（不用 ctx.roundRect，兼容旧版移动浏览器）。 */
function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * AGENTS.md 5.1：禁止页面滚动、下拉刷新与双指缩放。
 * iOS Safari 会忽略 user-scalable=no，必须显式阻止 gesture* 与双指 touchmove；
 * preventDefault 只阻止默认行为，不影响 Step 2 的 touchstart/touchend 事件投递。
 * 本函数不属于游戏交互逻辑（ROADMAP Step 1 禁止项）。
 */
function bindViewportGuards() {
  const preventDefault = (event) => event.preventDefault();
  document.addEventListener('gesturestart', preventDefault, { passive: false });
  document.addEventListener('gesturechange', preventDefault, { passive: false });
  document.addEventListener('touchmove', preventDefault, { passive: false });
}

/** 十六进制颜色与目标色按比例混合，返回 #rrggbb。 */
function mixHex(hex, targetHex, amount) {
  const from = parseHex(hex);
  const to = parseHex(targetHex);
  const channel = (index) => Math.round(from[index] + (to[index] - from[index]) * amount);
  return `#${[0, 1, 2].map((i) => channel(i).toString(16).padStart(2, '0')).join('')}`;
}

function parseHex(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** 正式日志入口（AGENTS.md 6 节：不使用调试用 console.log）。 */
function log(level, message) {
  if (!(level in LOG_RANK) || LOG_RANK[level] < MIN_LOG_RANK) return;
  const line = `[xxl] ${message}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}
