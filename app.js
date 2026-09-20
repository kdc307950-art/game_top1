// app.js — Canvas 渲染、触摸输入、动画、localStorage。本项目唯一允许操作 DOM / Canvas / localStorage 的模块。
// 见 AGENTS.md 2.3 / 5 / 9 节。
//
// 【Step 4 · ROADMAP】游戏逻辑改为由 game.js 承担，本文件只负责「渲染 + 输入 + 持久化」：
//   - 交换与结算调用 game.trySwap（4.3.2 回退、4.3.3 扣步数都在逻辑层完成）；
//   - HUD 常驻显示 分数 / 剩余步数 / 最高分（5.5）；步数用尽显示页面内结束面板（禁 alert）；
//   - 最高分读写 localStorage，键名取自 STORAGE_KEYS.BEST_SCORE（`xxl_best_score`）；
//   - 渲染读取状态用 game.getState 的不可变快照；逐帧绘制直接读 GameState（本文件是唯一读者
//     且从不改写棋盘），避免每帧 64 次对象拷贝（15 节内存预算）。
//   - 仍禁止（Step 4）：特殊元素计分、三星评分（属 Step 7-12）。
//   - HUD 与结束面板直接画在 Canvas 上：Step 4 的范围不含 index.html 与 styles.css，
//     因此不新增 DOM 结构（结构仍只放 index.html，见 2.3）。

import { CONFIG, GOAL_TYPE, STORAGE_KEYS } from './config.js';
import { isCellMovable } from './board.js';
import { createGame, getState as getGameState, trySwap as gameTrySwap } from './game.js';

// ---------------------------------------------------------------------------
// 渲染常量：只影响观感，不参与游戏规则。
// 按 ROADMAP Step 1 的范围（只允许改 index.html / styles.css / app.js）它们不进
// config.js；若后续需要集中管理，须先改宪法附录 B 与 config.js。
// ---------------------------------------------------------------------------
const MAX_DPR = 3; // 后备缓冲上限：高 DPR 机型不做无意义的 4× 过度绘制
const BOARD_MARGIN = 16; // px；棋盘与安全区内容边缘之间的呼吸空间（两侧各一份）
const MIN_BOARD_PX = 220; // 极窄视口下的可读下限
const MAX_BOARD_PX = 720; // 平板/桌面上不让棋盘无限放大
const BOARD_RADIUS_RATIO = 0.03; // 画布圆角 / 边长
const HUD_RATIO = 0.13; // HUD 带高度 / 画布边长（棋盘区 = 剩余的正方形区域，见 boardRect）
const BOARD_FIELD_RADIUS_RATIO = 0.03; // 棋盘区圆角 / 棋盘边长
const CELL_RADIUS_RATIO = 0.36; // 糖果半径 / 格子边长（AGENTS.md 5.2 正方形棋盘）
const MATCH_RING_RATIO = 0.44; // 匹配高亮环半径 / 格子边长
const SELECT_RING_RATIO = 0.43; // 选中环半径 / 格子边长
const HUD_LOW_STEPS = 5; // 剩余步数 ≤ 此值时用警示色
const BACKDROP_COLOR = '#1b1830';
const BOARD_FIELD_COLOR = '#221d38';
const MATCH_RING_COLOR = 'rgba(255, 246, 180, 0.95)';
const SELECT_RING_COLOR = 'rgba(255, 255, 255, 0.85)';
const HUD_CELL_BG = 'rgba(255, 255, 255, 0.06)';
const HUD_LABEL_COLOR = 'rgba(255, 255, 255, 0.55)';
const HUD_VALUE_COLOR = '#ffffff';
const HUD_WARN_COLOR = '#ffd93b';
const OVERLAY_DIM = 'rgba(10, 8, 20, 0.78)';
const OVERLAY_PANEL = '#241f3a';
const OVERLAY_TITLE_COLOR = '#ffffff';
const OVERLAY_RECORD_COLOR = '#ffd93b';
// 「再来一局」按钮用调色板之外的洋红：既不与任何糖果撞色（便于程序化验证与视觉辨识），
// 也与结束面板的深色底形成高对比。palette 六色见 BASE_COLORS。
const BUTTON_BG = '#ff4fd8';
const BUTTON_TEXT = '#2a0b23';
const FONT_STACK = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
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
  game: null, // game.js 的 GameState（含 level / board / gameOver）
  best: 0, // 最高分（来自 localStorage，属 UI 侧状态）
  newRecord: false, // 本局是否刷新了最高分
  renderBoard: null, // 级联回放期间要绘制的历史快照；null 表示绘制当前棋盘
  matched: [], // 最近一次有效交换首层识别出的匹配格（绘制高亮用，不参与规则）
  selected: null, // 点击两次交换的后备方案中已选中的格子
  playback: false, // 级联回放中：期间锁定输入，避免逻辑状态与画面错位
  playbackTimer: 0,
  pendingGameOver: false, // 本次结算结束后进入结束面板（等回放播完再显示）
  restartRect: null, // 结束面板「再来一局」按钮的 Canvas 内坐标（CSS px）
  sizePx: 0, // Canvas 的 CSS 像素边长（正方形）
  dpr: 1,
  frameRequest: 0
};

// 手势状态（5.3：touchstart + touchend 判定滑动方向）
const gesture = { startX: 0, startY: 0, startCell: null, lastTouchAt: 0 };

init();

/** 启动：读最高分 → 建局 → 布局首绘 → 绑定视口守卫与输入。 */
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
  view.best = readBestScore();
  startNewGame();

  applyLayout();

  window.addEventListener('resize', scheduleLayout, { passive: true });
  window.addEventListener('orientationchange', scheduleLayout, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleLayout, { passive: true });
  }

  bindViewportGuards();
  bindInput();
}

/** 开新一局：重建 GameState 并复位所有视图侧状态。 */
function startNewGame() {
  view.game = createGame(buildLevelConfig());
  view.newRecord = false;
  view.renderBoard = null;
  view.matched = [];
  view.selected = null;
  view.pendingGameOver = false;
  view.restartRect = null;

  const snapshot = getGameState(view.game);
  log(
    'info',
    `新一局开始：第 ${snapshot.levelId} 关 ${snapshot.rows}×${snapshot.cols}，` +
      `步数 ${snapshot.remainingSteps}，最高分 ${view.best}`
  );
  // 首次布局由 init 随后调用的 applyLayout 负责；重开一局时这里需要重绘
  if (view.sizePx > 0) drawBoard();
}

/**
 * 4.4 的 LevelConfig。数值全部取自 config.js 已登记的键（无需改附录 B）：
 * 步数与三星阈值来自 LEVEL_DEFAULTS，分数目标取一星阈值（与宪法第 14 节 LEVEL_1 一致）。
 */
function buildLevelConfig() {
  return {
    id: 1,
    rows: CONFIG.BOARD_SIZE,
    cols: CONFIG.BOARD_SIZE,
    colorCount: CONFIG.COLOR_COUNT,
    steps: CONFIG.LEVEL_DEFAULTS.steps,
    goal: { type: GOAL_TYPE.SCORE, target: CONFIG.LEVEL_DEFAULTS.starThresholds[0] },
    starThresholds: [...CONFIG.LEVEL_DEFAULTS.starThresholds],
    obstacles: []
  };
}

/** 计算棋盘旁长（CSS 像素）：取可用宽高中的较小者，扣除安全区与留白。 */
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

/** 棋盘区在画布内的位置与边长：画布顶部留出 HUD 带，其余为正方形棋盘区。 */
function boardRect() {
  const hudHeight = Math.round(view.sizePx * HUD_RATIO);
  const side = view.sizePx - hudHeight;
  return { x: (view.sizePx - side) / 2, y: hudHeight, side };
}

/** 当前应显示的棋盘：回放期间是历史快照，否则是逻辑上的当前棋盘。 */
function currentBoard() {
  return view.renderBoard ?? view.game.board;
}

/**
 * 绘制一帧：背景 → HUD → 棋盘区（糖果 + 高亮）→ 结束面板。
 * 绘制/路径调用预算（保守计法，fill + arc + stroke + fillText）：
 * 背景 1 + HUD 约 12 + 棋盘区 1 + 每格 2（=128）+ 高亮环若干 ≈ 145，
 * 结束面板再约 16，均低于 AGENTS.md 15 节「单帧绘制调用不超过 200 次」。
 * 光晕只用径向渐变实现，不使用阴影模糊（REFERENCES.md §3.5 性能红线第 1 条）。
 */
function drawBoard(board = currentBoard(), matched = view.matched) {
  const ctx = view.ctx;
  const size = view.sizePx;

  ctx.clearRect(0, 0, size, size);
  roundRectPath(ctx, 0, 0, size, size, size * BOARD_RADIUS_RATIO);
  ctx.fillStyle = BACKDROP_COLOR;
  ctx.fill();

  drawHud(ctx);

  const area = boardRect();
  const cell = area.side / CONFIG.BOARD_SIZE;
  const radius = cell * CELL_RADIUS_RATIO;

  roundRectPath(ctx, area.x, area.y, area.side, area.side, area.side * BOARD_FIELD_RADIUS_RATIO);
  ctx.fillStyle = BOARD_FIELD_COLOR;
  ctx.fill();

  for (let r = 0; r < CONFIG.BOARD_SIZE; r += 1) {
    for (let c = 0; c < CONFIG.BOARD_SIZE; c += 1) {
      const item = board[r][c];
      if (item.color === null || item.color === undefined) continue; // 空格/纯障碍：外观属 Step 11
      const cx = area.x + (c + 0.5) * cell;
      const cy = area.y + (r + 0.5) * cell;
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

  for (const pos of matched) {
    drawRing(ctx, area, pos, cell * MATCH_RING_RATIO, cell * 0.09, MATCH_RING_COLOR);
  }
  if (view.selected) {
    drawRing(ctx, area, view.selected, cell * SELECT_RING_RATIO, cell * 0.06, SELECT_RING_COLOR);
  }

  if (view.game.gameOver) drawGameOver(ctx, area);
}

/** HUD 常驻显示：分数 / 剩余步数 / 最高分（5.5）。直接读 GameState，不做逐帧快照拷贝。 */
function drawHud(ctx) {
  const size = view.sizePx;
  const hudHeight = Math.round(size * HUD_RATIO);
  const pad = hudHeight * 0.18;
  const gap = hudHeight * 0.1;
  const cellW = (size - pad * 2 - gap * 2) / 3;
  const cellH = hudHeight - pad * 2;
  const steps = view.game.level.remainingSteps;

  const stats = [
    { label: '分数', value: String(view.game.level.currentScore), warn: false },
    { label: '步数', value: String(steps), warn: steps <= HUD_LOW_STEPS },
    { label: '最高分', value: String(view.best), warn: false }
  ];

  stats.forEach((stat, index) => {
    const x = pad + index * (cellW + gap);
    const y = pad;
    const cx = x + cellW / 2;

    roundRectPath(ctx, x, y, cellW, cellH, cellH * 0.22);
    ctx.fillStyle = HUD_CELL_BG;
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `500 ${Math.max(9, Math.round(hudHeight * 0.22))}px ${FONT_STACK}`;
    ctx.fillStyle = HUD_LABEL_COLOR;
    ctx.fillText(stat.label, cx, y + cellH * 0.32);

    ctx.font = `700 ${Math.max(12, Math.round(hudHeight * 0.38))}px ${FONT_STACK}`;
    ctx.fillStyle = stat.warn ? HUD_WARN_COLOR : HUD_VALUE_COLOR;
    ctx.fillText(stat.value, cx, y + cellH * 0.68);
  });
}

/** 游戏结束面板（5.5：页面内 UI，禁止 alert）。同时登记「再来一局」按钮的命中区域。 */
function drawGameOver(ctx, area) {
  ctx.fillStyle = OVERLAY_DIM;
  ctx.fillRect(area.x, area.y, area.side, area.side);

  const panelW = area.side * 0.82;
  const panelH = area.side * 0.58;
  const px = area.x + (area.side - panelW) / 2;
  const py = area.y + (area.side - panelH) / 2;
  const cx = px + panelW / 2;

  roundRectPath(ctx, px, py, panelW, panelH, area.side * 0.05);
  ctx.fillStyle = OVERLAY_PANEL;
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = `700 ${Math.round(area.side * 0.085)}px ${FONT_STACK}`;
  ctx.fillStyle = OVERLAY_TITLE_COLOR;
  ctx.fillText('步数用尽', cx, py + panelH * 0.16);

  ctx.font = `500 ${Math.round(area.side * 0.042)}px ${FONT_STACK}`;
  ctx.fillStyle = HUD_LABEL_COLOR;
  ctx.fillText('本局得分', cx, py + panelH * 0.36);

  ctx.font = `700 ${Math.round(area.side * 0.11)}px ${FONT_STACK}`;
  ctx.fillStyle = OVERLAY_TITLE_COLOR;
  ctx.fillText(String(view.game.level.currentScore), cx, py + panelH * 0.5);

  ctx.font = `500 ${Math.round(area.side * 0.042)}px ${FONT_STACK}`;
  ctx.fillStyle = view.newRecord ? OVERLAY_RECORD_COLOR : HUD_LABEL_COLOR;
  ctx.fillText(
    view.newRecord ? `新纪录！最高分 ${view.best}` : `最高分 ${view.best}`,
    cx,
    py + panelH * 0.66
  );

  const btnW = panelW * 0.62;
  const btnH = panelH * 0.17;
  const bx = cx - btnW / 2;
  const by = py + panelH * 0.78;
  roundRectPath(ctx, bx, by, btnW, btnH, btnH * 0.32);
  ctx.fillStyle = BUTTON_BG;
  ctx.fill();

  ctx.font = `700 ${Math.round(area.side * 0.05)}px ${FONT_STACK}`;
  ctx.fillStyle = BUTTON_TEXT;
  ctx.fillText('再来一局', cx, by + btnH / 2);

  view.restartRect = { x: bx, y: by, w: btnW, h: btnH };
}

function drawRing(ctx, area, pos, ringRadius, lineWidth, color) {
  const cell = area.side / CONFIG.BOARD_SIZE;
  ctx.beginPath();
  ctx.arc(area.x + (pos.c + 0.5) * cell, area.y + (pos.r + 0.5) * cell, ringRadius, 0, Math.PI * 2);
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
  if (view.playback) return; // 级联回放中不接受新输入（画面与逻辑状态错位会误导玩家）
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

  const dx = clientX - gesture.startX;
  const dy = clientY - gesture.startY;
  const threshold = CONFIG.ANIMATION_CONFIG.swipeThreshold;
  const isSwipe = Math.max(Math.abs(dx), Math.abs(dy)) >= threshold;

  if (view.game.gameOver) {
    // 结束后只响应「点按再来一局」，滑动一律忽略
    if (!isSwipe && isInsideRect(clientX, clientY, view.restartRect)) startNewGame();
    else if (!isSwipe) log('info', '本局已结束：点按「再来一局」开始新一局');
    return;
  }

  if (!start) return;

  if (isSwipe) {
    // 5.3 方向锁定：只取主轴，斜向滑动也按主轴判定，避免斜向误判
    const step =
      Math.abs(dx) >= Math.abs(dy) ? { r: 0, c: Math.sign(dx) } : { r: Math.sign(dy), c: 0 };
    attemptSwap(start, { r: start.r + step.r, c: start.c + step.c });
    return;
  }

  handleTap(start); // 5.3：滑动之外的后备交互
}

/** 屏幕坐标 → 棋盘格；落在棋盘区外返回 null。 */
function cellAt(clientX, clientY) {
  const rect = view.canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const area = boardRect();
  const c = Math.floor(((clientX - rect.left - area.x) / area.side) * CONFIG.BOARD_SIZE);
  const r = Math.floor(((clientY - rect.top - area.y) / area.side) * CONFIG.BOARD_SIZE);
  return isInsideBoard(view.game.board, r, c) ? { r, c } : null;
}

/** 点按是否落在矩形内（矩形为 Canvas 内坐标，需换算掉画布在页面中的偏移）。 */
function isInsideRect(clientX, clientY, box) {
  if (!box) return false;
  const rect = view.canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
}

/** 后备交互：第一次点击选中，第二次点相邻格交换；点同格取消，点远处改选。 */
function handleTap(cell) {
  if (view.playback || view.game.gameOver) return;
  if (!isCellMovable(view.game.board, cell.r, cell.c)) {
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
 * 交换编排：交给 game.trySwap（4.3.1/4.3.2/4.3.3 都在逻辑层），本函数只负责
 * 日志、首帧高亮与分层回放。
 * 5.4：逻辑在 trySwap 内同步算完，回放只画历史快照。
 */
function attemptSwap(a, b) {
  if (view.playback || view.game.gameOver) return;
  if (!isInsideBoard(view.game.board, b.r, b.c)) {
    log('info', `滑动超出棋盘边界，忽略：(${a.r},${a.c}) → (${b.r},${b.c})`);
    return;
  }

  const result = gameTrySwap(view.game, a, b);
  view.selected = null;

  if (!result.valid) {
    view.matched = [];
    log('info', `交换无效，已回退：(${a.r},${a.c}) ↔ (${b.r},${b.c})（不消耗步数，剩余 ${result.stepsLeft}）`);
    drawBoard();
    return;
  }

  const snapshot = getGameState(view.game);
  const firstGroups = result.resolve.levels[0]?.groups ?? [];
  view.matched = firstGroups.flatMap((group) => group.cells);
  view.pendingGameOver = result.gameOver;

  log(
    'info',
    `交换有效：(${a.r},${a.c}) ↔ (${b.r},${b.c})，识别到 ${firstGroups.length} 组匹配 ` +
      `[${firstGroups.map((group) => group.shape).join(', ')}]，级联 ${result.cascades} 层，` +
      `共消除 ${result.resolve.cleared.length} 格，新生成 ${result.resolve.spawned.length} 格，` +
      `本步 +${result.scoreDelta} 分（本局 ${snapshot.currentScore}），剩余步数 ${result.stepsLeft}`
  );
  if (result.resolve.capped) {
    log('warn', `级联达到层数上限（${result.cascades} 层）后强制结束，请检查随机源或色数设置`);
  }

  view.renderBoard = result.afterSwap;
  drawBoard(result.afterSwap, view.matched); // 首帧：高亮本次匹配
  startCascadePlayback(result.resolve.levels);
}

/**
 * 分层回放级联结果（Step 5 会把这里升级为带补间的位移/消除动画）。
 * 时间取自 ANIMATION_CONFIG：clearDuration = 高亮帧停留（即「消除动画时长」的语义），
 * cascadeGap = 每层之间的间隔（15 节「级联间隔」）。第 0 帧已由 attemptSwap 绘出。
 * 回放结束后若步数已用尽，再切到结束面板（让玩家先看到最后一手的结算）。
 */
function startCascadePlayback(levels) {
  if (levels.length === 0) {
    finishPlayback();
    return;
  }

  view.playback = true;
  let index = 0;

  const showNextLevel = () => {
    if (index >= levels.length) {
      finishPlayback();
      return;
    }
    view.renderBoard = levels[index].board;
    drawBoard(levels[index].board, []);
    index += 1;
    view.playbackTimer = window.setTimeout(showNextLevel, CONFIG.ANIMATION_CONFIG.cascadeGap);
  };

  view.playbackTimer = window.setTimeout(showNextLevel, CONFIG.ANIMATION_CONFIG.clearDuration);
}

/** 回放收尾：回到逻辑棋盘；若本局已结束则进入结束面板。 */
function finishPlayback() {
  view.playback = false;
  view.playbackTimer = 0;
  view.renderBoard = null; // 回到当前逻辑棋盘（= 最后一层快照的内容）
  view.matched = [];
  drawBoard();

  if (view.pendingGameOver) {
    view.pendingGameOver = false;
    finishGame();
  }
}

/** 本局结束：刷新并持久化最高分，打印结算日志（5.5：页面内面板由 drawBoard 绘制）。 */
function finishGame() {
  const snapshot = getGameState(view.game);
  const isRecord = snapshot.currentScore > view.best;
  if (isRecord) {
    view.best = snapshot.currentScore;
    writeBestScore(view.best);
  }
  view.newRecord = isRecord;

  log(
    'info',
    `游戏结束：步数用尽。本局得分 ${snapshot.currentScore}，最高分 ${view.best}` +
      (isRecord ? '（新纪录，已写入 localStorage）' : '')
  );
  drawBoard();
}

/** 读取最高分；localStorage 不可用（隐私模式等）时回落到 0，不让整局崩掉。 */
function readBestScore() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.BEST_SCORE);
    const value = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch (error) {
    log('warn', `读取最高分失败（localStorage 不可用）：${error.message}`);
    return 0;
  }
}

/** 写入最高分。失败只记日志：存档失败不应该阻断游戏。 */
function writeBestScore(score) {
  try {
    window.localStorage.setItem(STORAGE_KEYS.BEST_SCORE, String(score));
    return true;
  } catch (error) {
    log('warn', `写入最高分失败：${error.message}`);
    return false;
  }
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
