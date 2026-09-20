// render.js — Canvas 绘制与几何计算。见 AGENTS.md 2.2 / 2.3 / 5.2 / 5.4。
//
// 边界（2.3）：只接收「场景描述」对象并绘制；不读游戏状态、不绑定事件、不碰 localStorage。
// 性能（REFERENCES.md §3.5 三条红线）：
//   1) 每帧绘制路径不使用阴影模糊类 API（本文件没有该调用，验证见 PROGRESS 的红线计数）；
//   2) 静态图层（背景 + HUD 底 + 棋盘区底）与 6 色 × 6 形状糖果**烘焙到离屏 canvas**，
//      每帧只用 drawImage 复用，避免每帧几十次路径绘制；
//   3) 修饰性底色透明度 0.06（≤ 0.1）；匹配/选中高亮是有意义的状态提示，不属修饰性描边。
// 色盲友好（5.4）：普通动物除颜色外还有 6 种可区分形状，形状由 color 索引决定。

import { CONFIG } from './config.js';

// 渲染常量：只影响观感，不参与游戏规则（归属取舍见 D013）
const MAX_DPR = 3; // 后备缓冲上限：高 DPR 机型不做无意义的 4× 过度绘制
const BOARD_MARGIN = 16; // px；画布与安全区内容边缘之间的呼吸空间（两侧各一份）
const MIN_BOARD_PX = 220; // 极窄视口下的可读下限
const MAX_BOARD_PX = 720; // 平板/桌面上不让棋盘无限放大
const BACKDROP_RADIUS_RATIO = 0.03; // 画布圆角 / 边长
const HUD_RATIO = 0.13; // HUD 带高度 / 画布边长
const FIELD_RADIUS_RATIO = 0.03; // 棋盘区圆角 / 棋盘边长
const CELL_RADIUS_RATIO = 0.36; // 糖果半径 / 格子边长（5.2 正方形棋盘）
const MATCH_RING_RATIO = 0.44; // 匹配高亮环半径 / 格子边长
const SELECT_RING_RATIO = 0.43; // 选中环半径 / 格子边长
const HUD_LOW_STEPS = 5; // 剩余步数 ≤ 此值时用警示色
const BACKDROP_COLOR = '#1b1830';
const FIELD_COLOR = '#221d38';
const MATCH_RING_COLOR = 'rgba(255, 246, 180, 0.95)';
const SELECT_RING_COLOR = 'rgba(255, 255, 255, 0.85)';
const HUD_CELL_BG = 'rgba(255, 255, 255, 0.06)'; // 修饰性底色，透明度见红线 3
const HUD_LABEL_COLOR = 'rgba(255, 255, 255, 0.55)';
const HUD_VALUE_COLOR = '#ffffff';
const HUD_WARN_COLOR = '#ffd93b';
const OVERLAY_DIM = 'rgba(10, 8, 20, 0.78)';
const OVERLAY_PANEL = '#241f3a';
const OVERLAY_TITLE_COLOR = '#ffffff';
const OVERLAY_RECORD_COLOR = '#ffd93b';
const BUTTON_BG = '#ff4fd8'; // 调色板之外的洋红：不与任何糖果撞色，便于识别与程序化验证
const BUTTON_TEXT = '#2a0b23';
const FONT_STACK = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

// 颜色索引（0-5）→ 调色板。顺序对应 CONFIG.COLOR_NAMES，改动顺序等于改动视觉语义。
const BASE_COLORS = ['#f2555a', '#f7a325', '#ffd93b', '#4ecb71', '#38b6ff', '#a06bff'];

// 6 种形状与颜色一一对应（5.4 色盲友好）。每项返回闭合路径的顶点数（0 表示圆/圆角矩形）。
// 多边形参数：顶点数、旋转（-π/2 表示尖朝上）、外半径倍数、（仅星形）内半径倍数。
const SHAPES = [
  { kind: 'circle' },
  { kind: 'roundRect', corner: 0.34 },
  { kind: 'polygon', sides: 3, spin: 0, outer: 1.12, squash: 0.62 },
  { kind: 'polygon', sides: 4, spin: 0, outer: 1.1, squash: 0 },
  { kind: 'star', points: 5, outer: 1.08, inner: 0.45 },
  { kind: 'polygon', sides: 6, spin: 0, outer: 1, squash: 0 }
];

/** 画布边长（CSS 像素）：取可用宽高中的较小者，扣除安全区与留白（5.1）。 */
export function computeBoardSize() {
  const root = document.documentElement;
  const viewportW = root.clientWidth || window.innerWidth;
  const viewportH = root.clientHeight || window.innerHeight;
  const availW = viewportW - readSafeInset('left') - readSafeInset('right') - BOARD_MARGIN * 2;
  const availH = viewportH - readSafeInset('top') - readSafeInset('bottom') - BOARD_MARGIN * 2;
  return Math.max(MIN_BOARD_PX, Math.min(availW, availH, MAX_BOARD_PX) | 0);
}

/** 画布内的分区几何：顶部 HUD 带 + 正方形棋盘区（5.2 棋盘必须是正方形）。 */
export function boardRect(sizePx) {
  const hudHeight = Math.round(sizePx * HUD_RATIO);
  const side = sizePx - hudHeight;
  return { hudHeight, field: { x: (sizePx - side) / 2, y: hudHeight, side } };
}

/** 屏幕坐标 → 棋盘格；落在棋盘区外返回 null。 */
export function cellAt(canvas, clientX, clientY, sizePx) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const area = boardRect(sizePx).field;
  const cols = CONFIG.BOARD_SIZE;
  const c = Math.floor(((clientX - rect.left - area.x) / area.side) * cols);
  const r = Math.floor(((clientY - rect.top - area.y) / area.side) * cols);
  if (r < 0 || c < 0 || r >= cols || c >= cols) return null;
  return { r, c };
}

/** 点按是否落在矩形内（矩形为画布内坐标，需换算掉画布在页面中的偏移）。 */
export function hitTest(canvas, clientX, clientY, box) {
  if (!box) return false;
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
}

/**
 * 创建渲染器：持有离屏缓存（静态图层 + 糖果精灵图集），按尺寸变化重建。
 * app.js 在布局变化时 prepare，每帧 draw；draw 返回本帧的交互区域（结束面板按钮）。
 */
export function createRenderer() {
  let cache = null;

  function prepare(sizePx, dpr, layout) {
    cache = {
      sizePx,
      layout,
      cellCss: layout.field.side / CONFIG.BOARD_SIZE,
      chrome: buildChrome(sizePx, dpr, layout),
      sprites: buildSpriteAtlas(layout.field.side / CONFIG.BOARD_SIZE, dpr)
    };
  }

  function draw(ctx, scene) {
    if (!cache || cache.sizePx !== scene.sizePx) return { restartRect: null };
    const { field } = cache.layout;
    ctx.clearRect(0, 0, scene.sizePx, scene.sizePx);
    ctx.drawImage(cache.chrome, 0, 0, scene.sizePx, scene.sizePx); // 静态图层：1 次 drawImage
    drawCandies(ctx, cache, scene, field);
    drawRings(ctx, scene, field);
    drawHud(ctx, cache, scene);
    return { restartRect: scene.overlay ? drawGameOver(ctx, field, scene.overlay) : null };
  }

  return { prepare, draw };
}

/** 静态图层：背景 + HUD 底 + 棋盘区底。一帧内不变，烘焙后每帧只 drawImage 一次（红线 2）。 */
function buildChrome(sizePx, dpr, layout) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sizePx * dpr);
  canvas.height = Math.round(sizePx * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  roundRectPath(ctx, 0, 0, sizePx, sizePx, sizePx * BACKDROP_RADIUS_RATIO);
  ctx.fillStyle = BACKDROP_COLOR;
  ctx.fill();
  for (const box of hudCells(sizePx, layout.hudHeight)) {
    roundRectPath(ctx, box.x, box.y, box.w, box.h, box.h * 0.22);
    ctx.fillStyle = HUD_CELL_BG;
    ctx.fill();
  }
  const { x, y, side } = layout.field;
  roundRectPath(ctx, x, y, side, side, side * FIELD_RADIUS_RATIO);
  ctx.fillStyle = FIELD_COLOR;
  ctx.fill();
  return canvas;
}

/** 糖果精灵图集：6 色 × 6 形状，每个精灵正好覆盖一格，绘制时按格位贴图（红线 2）。 */
function buildSpriteAtlas(cellCss, dpr) {
  const px = Math.max(8, Math.round(cellCss * dpr));
  const radius = cellCss * CELL_RADIUS_RATIO * dpr;
  return BASE_COLORS.map((base) =>
    SHAPES.map((shape) => {
      const canvas = document.createElement('canvas');
      canvas.width = px;
      canvas.height = px;
      paintCandy(canvas.getContext('2d'), px / 2, px / 2, radius, base, shape);
      return canvas;
    })
  );
}

function paintCandy(ctx, cx, cy, radius, base, shape) {
  const grad = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.4, radius * 0.12, cx, cy, radius);
  grad.addColorStop(0, mixHex(base, '#ffffff', 0.45));
  grad.addColorStop(0.55, base);
  grad.addColorStop(1, mixHex(base, '#000000', 0.3));
  ctx.fillStyle = grad;
  shapePath(ctx, shape, cx, cy, radius);
  ctx.fill();
}

/** 生成形状路径：圆 / 圆角方 / 正多边形（可纵向压扁）/ 星形，全部闭合。 */
function shapePath(ctx, shape, cx, cy, r) {
  if (shape.kind === 'circle') {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    return;
  }
  if (shape.kind === 'roundRect') {
    roundRectPath(ctx, cx - r, cy - r, r * 2, r * 2, r * shape.corner);
    return;
  }
  const tips = shape.kind === 'star' ? shape.points * 2 : shape.sides;
  ctx.beginPath();
  for (let i = 0; i < tips; i += 1) {
    const isInner = shape.kind === 'star' && i % 2 === 1;
    const length = isInner ? r * shape.inner : r * shape.outer;
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / tips;
    const x = cx + Math.cos(angle) * length;
    // squash 让三角形/菱形等比拉伸，避免细长失真
    const y = cy + Math.sin(angle) * length * (1 + (shape.squash ?? 0));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// 每帧绘制
// ---------------------------------------------------------------------------

/** 棋盘层：静止格贴图；下落格按缓动插值；正在消除的格子缩小淡出；空/纯障碍格不画（Step 11）。 */
function drawCandies(ctx, cache, scene, field) {
  const cell = cache.cellCss;
  const board = scene.board;
  const cols = CONFIG.BOARD_SIZE;

  for (let r = 0; r < cols; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const item = board[r][c];
      if (item.color === null || item.color === undefined) continue;
      const key = `${r},${c}`;
      if (scene.clearing && scene.clearing.keys.has(key)) continue; // 交给下面的「消除中」分支
      if (scene.hidden && scene.hidden.has(key)) continue; // 下落阶段：这一格已被消除

      const move = scene.falling ? scene.falling.moves.get(item.id) : undefined;
      let row = r;
      let col = c;
      if (move) {
        const t = scene.falling.progress * scene.falling.progress; // 重力感：先慢后快
        row = move.from.r + (move.to.r - move.from.r) * t;
        col = move.from.c + (move.to.c - move.from.c) * t;
      }
      blit(ctx, cache.sprites[item.color % cache.sprites.length], item.color, field.x + col * cell, field.y + row * cell, cell, 1, 1);
    }
  }

  if (scene.clearing) {
    // 消除动画（15 节 200-300ms）：缩小 + 淡出；颜色从「消除前」的棋盘上读，无需额外缓存
    const scale = 1 - 0.55 * scene.clearing.progress;
    const alpha = 1 - scene.clearing.progress;
    for (const key of scene.clearing.keys) {
      const comma = key.indexOf(',');
      const r = Number(key.slice(0, comma));
      const c = Number(key.slice(comma + 1));
      const item = board[r]?.[c];
      if (!item || item.color === null || item.color === undefined) continue;
      blit(ctx, cache.sprites[item.color % cache.sprites.length], item.color, field.x + c * cell, field.y + r * cell, cell, scale, alpha);
    }
  }
}

/** 贴图；scale ≠ 1 时以格心为中心缩放（消除动画用）。 */
function blit(ctx, row, color, x, y, cell, scale, alpha) {
  const sprite = row[color % row.length];
  ctx.globalAlpha = alpha;
  if (scale === 1) {
    ctx.drawImage(sprite, x, y, cell, cell);
  } else {
    const size = cell * scale;
    const offset = (cell - size) / 2;
    ctx.drawImage(sprite, x + offset, y + offset, size, size);
  }
  ctx.globalAlpha = 1;
}

function drawRings(ctx, scene, field) {
  const cell = field.side / CONFIG.BOARD_SIZE;
  for (const pos of scene.matched) {
    strokeRing(ctx, field, pos, cell * MATCH_RING_RATIO, cell * 0.09, MATCH_RING_COLOR);
  }
  if (scene.selected) {
    strokeRing(ctx, field, scene.selected, cell * SELECT_RING_RATIO, cell * 0.06, SELECT_RING_COLOR);
  }
}

function strokeRing(ctx, field, pos, radius, lineWidth, color) {
  const cell = field.side / CONFIG.BOARD_SIZE;
  ctx.beginPath();
  ctx.arc(field.x + (pos.c + 0.5) * cell, field.y + (pos.r + 0.5) * cell, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

/** HUD：分数 / 剩余步数 / 最高分常驻可见（5.5）。 */
function drawHud(ctx, cache, scene) {
  const hudHeight = cache.layout.hudHeight;
  const boxes = hudCells(scene.sizePx, hudHeight);
  const stats = [
    { label: '分数', value: String(scene.hud.score), warn: false },
    { label: '步数', value: String(scene.hud.steps), warn: scene.hud.steps <= HUD_LOW_STEPS },
    { label: '最高分', value: String(scene.hud.best), warn: false }
  ];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  boxes.forEach((box, index) => {
    const cx = box.x + box.w / 2;
    ctx.font = `500 ${Math.max(9, Math.round(hudHeight * 0.22))}px ${FONT_STACK}`;
    ctx.fillStyle = HUD_LABEL_COLOR;
    ctx.fillText(stats[index].label, cx, box.y + box.h * 0.32);
    ctx.font = `700 ${Math.max(12, Math.round(hudHeight * 0.38))}px ${FONT_STACK}`;
    ctx.fillStyle = stats[index].warn ? HUD_WARN_COLOR : HUD_VALUE_COLOR;
    ctx.fillText(stats[index].value, cx, box.y + box.h * 0.68);
  });
}

function hudCells(sizePx, hudHeight) {
  const pad = hudHeight * 0.18;
  const gap = hudHeight * 0.1;
  const w = (sizePx - pad * 2 - gap * 2) / 3;
  const h = hudHeight - pad * 2;
  return [0, 1, 2].map((index) => ({ x: pad + index * (w + gap), y: pad, w, h }));
}

/** 结束面板（5.5：页面内 UI，禁止 alert）。返回「再来一局」按钮的命中区域。 */
function drawGameOver(ctx, field, overlay) {
  ctx.fillStyle = OVERLAY_DIM;
  ctx.fillRect(field.x, field.y, field.side, field.side);

  const panelW = field.side * 0.82;
  const panelH = field.side * 0.58;
  const px = field.x + (field.side - panelW) / 2;
  const py = field.y + (field.side - panelH) / 2;
  const cx = px + panelW / 2;
  roundRectPath(ctx, px, py, panelW, panelH, field.side * 0.05);
  ctx.fillStyle = OVERLAY_PANEL;
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = [
    { text: '步数用尽', size: 0.085, weight: 700, color: OVERLAY_TITLE_COLOR, at: 0.16 },
    { text: '本局得分', size: 0.042, weight: 500, color: HUD_LABEL_COLOR, at: 0.36 },
    { text: String(overlay.score), size: 0.11, weight: 700, color: OVERLAY_TITLE_COLOR, at: 0.5 },
    {
      text: overlay.newRecord ? `新纪录！最高分 ${overlay.best}` : `最高分 ${overlay.best}`,
      size: 0.042,
      weight: 500,
      color: overlay.newRecord ? OVERLAY_RECORD_COLOR : HUD_LABEL_COLOR,
      at: 0.66
    }
  ];
  for (const line of lines) {
    ctx.font = `${line.weight} ${Math.round(field.side * line.size)}px ${FONT_STACK}`;
    ctx.fillStyle = line.color;
    ctx.fillText(line.text, cx, py + panelH * line.at);
  }

  const btnW = panelW * 0.62;
  const btnH = panelH * 0.17;
  const bx = cx - btnW / 2;
  const by = py + panelH * 0.78;
  roundRectPath(ctx, bx, by, btnW, btnH, btnH * 0.32);
  ctx.fillStyle = BUTTON_BG;
  ctx.fill();
  ctx.font = `700 ${Math.round(field.side * 0.05)}px ${FONT_STACK}`;
  ctx.fillStyle = BUTTON_TEXT;
  ctx.fillText('再来一局', cx, by + btnH / 2);
  return { x: bx, y: by, w: btnW, h: btnH };
}

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

function readSafeInset(side) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--safe-${side}`);
  const px = Number.parseFloat(raw);
  return Number.isFinite(px) ? px : 0;
}

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
