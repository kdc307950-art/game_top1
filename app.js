// app.js — Canvas 渲染、触摸输入、动画。本项目唯一允许操作 DOM / Canvas / localStorage 的模块。
// 见 AGENTS.md 2.3 / 9 节。
//
// 【Step 2 · ROADMAP】棋盘来自 board.js 的真实 cell[][]，并实现滑动交换 + 3 连识别：
//   - 允许：滑动/点击交换、无效交换自动回退、识别匹配组并高亮；
//   - 禁止（Step 2）：消除动画、计分、special.js 逻辑；步数系统属 Step 4，本步无计数器。
//   - 交换编排（快照 → 交换 → 检测 → 回退）暂放本文件：4.2 的 game.trySwap 属 Step 4，
//     而 Step 2 不允许修改 game.js，Step 4 会把这段编排迁移过去。

import { CONFIG } from './config.js';
import { cloneBoard, createBoard, isCellMovable, swapCells } from './board.js';
import { findAllMatchGroups } from './match.js';

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
const MATCH_RING_RATIO = 0.44; // 匹配高亮环半径 / 格子边长
const SELECT_RING_RATIO = 0.43; // 选中环半径 / 格子边长
const BOARD_BG = '#1b1830';
const MATCH_RING_COLOR = 'rgba(255, 246, 180, 0.95)';
const SELECT_RING_COLOR = 'rgba(255, 255, 255, 0.85)';
const TOUCH_MOUSE_GUARD_MS = 600; // 触摸后忽略兼容鼠标事件的时长，避免一次手势被处理两次
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
  board: null, // board.js 的 cell[][]（AGENTS.md 4.1 唯一真相源）
  matched: [], // 最近一次有效交换识别出的匹配格（绘制高亮用，不参与规则）
  selected: null, // 点击两次交换的后备方案中已选中的格子
  sizePx: 0, // Canvas 的 CSS 像素边长（正方形）
  dpr: 1,
  frameRequest: 0
};

// 手势状态（5.3：touchstart + touchend 判定滑动方向）
const gesture = { startX: 0, startY: 0, startCell: null, lastTouchAt: 0 };

init();

/** 启动渲染与交互：建棋盘 → 布局首绘 → 绑定视口守卫与输入。 */
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
  view.board = createBoard(CONFIG.BOARD_SIZE, CONFIG.BOARD_SIZE, CONFIG.COLOR_COUNT);

  applyLayout();

  const initialMatches = findAllMatchGroups(view.board).length; // 自检：createBoard 保证为 0
  log(
    'info',
    `棋盘已生成并渲染：${CONFIG.BOARD_SIZE}×${CONFIG.BOARD_SIZE}，色数 ${CONFIG.COLOR_COUNT}，` +
      `初始匹配 ${initialMatches} 组，CSS ${view.sizePx}px，DPR ${view.dpr}（BACKING ${canvas.width}×${canvas.height}）`
  );
  if (CONFIG.COLOR_COUNT !== PALETTE.length) {
    log('warn', `CONFIG.COLOR_COUNT=${CONFIG.COLOR_COUNT} 与调色板 ${PALETTE.length} 色不一致，颜色会重复`);
  }

  window.addEventListener('resize', scheduleLayout, { passive: true });
  window.addEventListener('orientationchange', scheduleLayout, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleLayout, { passive: true });
  }

  bindViewportGuards();
  bindInput();
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
 * 绘制整块棋盘（先画糖果，再画匹配高亮与选中态）。
 * 绘制/路径调用预算（保守计法，fill + arc + stroke）：棋盘底 1 + 每格 2
 * = 129 次，再加高亮环（匹配格数 + 选中 1，通常 < 10）仍远低于
 * AGENTS.md 15 节「单帧绘制调用不超过 200 次」。
 * 光晕只用径向渐变实现，不使用阴影模糊（REFERENCES.md §3.5 性能红线第 1 条）。
 */
function drawBoard() {
  const ctx = view.ctx;
  const board = view.board;
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
      const item = board[r][c];
      if (item.color === null || item.color === undefined) continue; // 空格/纯障碍：外观属 Step 11
      const cx = (c + 0.5) * cell;
      const cy = (r + 0.5) * cell;
      const color = PALETTE[item.color % PALETTE.length];
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

  for (const pos of view.matched) {
    drawRing(ctx, pos, cell * MATCH_RING_RATIO, cell * 0.09, MATCH_RING_COLOR);
  }
  if (view.selected) {
    drawRing(ctx, view.selected, cell * SELECT_RING_RATIO, cell * 0.06, SELECT_RING_COLOR);
  }
}

function drawRing(ctx, pos, ringRadius, lineWidth, color) {
  const cell = view.sizePx / CONFIG.BOARD_SIZE;
  ctx.beginPath();
  ctx.arc((pos.c + 0.5) * cell, (pos.r + 0.5) * cell, ringRadius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
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

// ---------------------------------------------------------------------------
// 输入（AGENTS.md 5.3：主交互是 touchstart + touchend 判定滑动方向，
// 点击两次交换仅作后备方案；鼠标事件只为桌面端手动验证提供同一入口）
// ---------------------------------------------------------------------------

function bindInput() {
  const canvas = view.canvas;
  canvas.addEventListener('touchstart', onTouchStart, { passive: true });
  canvas.addEventListener('touchend', onTouchEnd, { passive: true });
  canvas.addEventListener('touchcancel', resetGesture, { passive: true });
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
}

function onTouchStart(event) {
  if (event.touches.length !== 1) return; // 多指手势不参与交换
  gesture.lastTouchAt = Date.now();
  const touch = event.changedTouches[0];
  beginGesture(touch.clientX, touch.clientY);
}

function onTouchEnd(event) {
  gesture.lastTouchAt = Date.now();
  const touch = event.changedTouches[0];
  if (touch) endGesture(touch.clientX, touch.clientY);
}

function onMouseDown(event) {
  if (isCompatibilityMouseEvent()) return;
  beginGesture(event.clientX, event.clientY);
}

function onMouseUp(event) {
  if (isCompatibilityMouseEvent()) return;
  endGesture(event.clientX, event.clientY);
}

/** 触摸设备在 touchend 后还会补发鼠标事件，需按时间窗忽略，避免同一手势被处理两次。 */
function isCompatibilityMouseEvent() {
  return Date.now() - gesture.lastTouchAt < TOUCH_MOUSE_GUARD_MS;
}

function beginGesture(clientX, clientY) {
  gesture.startX = clientX;
  gesture.startY = clientY;
  gesture.startCell = cellAt(clientX, clientY);
}

function resetGesture() {
  gesture.startCell = null;
}

function endGesture(clientX, clientY) {
  const start = gesture.startCell;
  gesture.startCell = null;
  if (!start) return;

  const dx = clientX - gesture.startX;
  const dy = clientY - gesture.startY;
  const threshold = CONFIG.ANIMATION_CONFIG.swipeThreshold;

  if (Math.max(Math.abs(dx), Math.abs(dy)) >= threshold) {
    // 5.3 方向锁定：只取主轴，斜向滑动也按主轴判定，避免斜向误判
    const step =
      Math.abs(dx) >= Math.abs(dy) ? { r: 0, c: Math.sign(dx) } : { r: Math.sign(dy), c: 0 };
    attemptSwap(start, { r: start.r + step.r, c: start.c + step.c });
    return;
  }

  handleTap(start); // 5.3：滑动之外的后备交互
}

/** 屏幕坐标 → 棋盘格；落在棋盘外或空白处返回 null。 */
function cellAt(clientX, clientY) {
  const rect = view.canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const c = Math.floor(((clientX - rect.left) / rect.width) * CONFIG.BOARD_SIZE);
  const r = Math.floor(((clientY - rect.top) / rect.height) * CONFIG.BOARD_SIZE);
  return isInsideBoard(view.board, r, c) ? { r, c } : null;
}

/** 后备交互：第一次点击选中，第二次点相邻格交换；点同格取消，点远处改选。 */
function handleTap(cell) {
  if (!isCellMovable(view.board, cell.r, cell.c)) {
    view.selected = null;
    drawBoard();
    return;
  }
  const selected = view.selected;
  if (!selected) {
    view.selected = cell;
    drawBoard();
    return;
  }
  if (selected.r === cell.r && selected.c === cell.c) {
    view.selected = null;
    drawBoard();
    return;
  }
  if (Math.abs(selected.r - cell.r) + Math.abs(selected.c - cell.c) === 1) {
    attemptSwap(selected, cell);
    return;
  }
  view.selected = cell;
  drawBoard();
}

/**
 * 交换编排：快照 → 交换 → 匹配检测 → 无效则回退。
 * 4.3.1/4.3.2：只有相邻格可交换；交换后无匹配必须回退。步数系统属 Step 4，
 * 本步没有计数器，因此「无效交换不扣步数」自然成立。
 */
function attemptSwap(a, b) {
  const board = view.board;
  if (!isInsideBoard(board, b.r, b.c)) {
    log('info', `滑动超出棋盘边界，忽略：(${a.r},${a.c}) → (${b.r},${b.c})`);
    return;
  }
  if (!isCellMovable(board, a.r, a.c) || !isCellMovable(board, b.r, b.c)) {
    view.selected = null;
    view.matched = [];
    log('info', `交换被拒绝：(${a.r},${a.c}) 或 (${b.r},${b.c}) 不可移动（3.4 藤蔓 / 空格）`);
    drawBoard();
    return;
  }

  const snapshot = cloneBoard(board); // 4.2：cloneBoard 供回退使用
  swapCells(board, a, b);
  const groups = findAllMatchGroups(board);
  view.selected = null;

  if (groups.length === 0) {
    view.board = snapshot; // 4.3.2：无效交换回退到交换前
    view.matched = [];
    log('info', `交换无效，已回退：(${a.r},${a.c}) ↔ (${b.r},${b.c})`);
  } else {
    view.matched = groups.flatMap((group) => group.cells);
    log(
      'info',
      `交换有效：识别到 ${groups.length} 组匹配 [${groups.map((group) => group.shape).join(', ')}]，` +
        `共 ${view.matched.length} 格（消除属 Step 3）`
    );
  }
  drawBoard();
}

function isInsideBoard(board, r, c) {
  return Boolean(board) && r >= 0 && c >= 0 && r < board.length && c < board[r].length;
}

/**
 * AGENTS.md 5.1：禁止页面滚动、下拉刷新与双指缩放。
 * iOS Safari 会忽略 user-scalable=no，必须显式阻止 gesture* 与双指 touchmove；
 * preventDefault 只阻止默认行为，不影响 touchstart/touchend 的事件投递。
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
