// candy.js — 糖果外观与精灵烘焙（棋盘层的视觉资产）。见 AGENTS.md 2.2 / 2.3 / 5.4。
//
// 边界（2.3）：只负责「一颗糖果长什么样」——形状路径、配色、内嵌图案、条纹特效，
// 以及把这些烘焙成离屏 canvas 精灵；不读游戏状态、不绑定事件、不碰 localStorage，
// 也不做布局与每帧调度（那是 render.js 的职责）。依赖方向单向：render.js → candy.js。
//
// 零素材（D009）：全部程序化绘制，不引入任何外部图片；外观方案经用户批准，见 D020。
// 性能红线（REFERENCES.md §3.5）：
//   1) 不使用阴影模糊类 API —— 内阴影用「深色底层 + 上移亮体」模拟，高光用椭圆；
//   2) 精灵在布局时烘焙一次，每帧只 drawImage（红线 2）；
//   3) 修饰性底色透明度 ≤ 0.1（本文件的图案/高光属有意义的造型，不在此列）。
// 色盲友好（5.4）：颜色 ↔ 形状 ↔ 内嵌图案三重区分，形状与图案都由 color 索引唯一决定。

import { DIRECTION } from './config.js';

export const CELL_RADIUS_RATIO = 0.36; // 糖果半径 / 格子边长（5.2 正方形棋盘）
const RIM_MIX = 0.45; // 描边/暗边 = base 与黑的混合比例
const MOTIF_MIX = 0.38; // 内嵌图案的颜色混合比例
const MOTIF_ALPHA = 0.72;
const HIGHLIGHT_COLOR = 'rgba(255, 255, 255, 0.5)';
const STRIPE_COLOR = 'rgba(255, 255, 255, 0.88)';
const ARROW_COLOR = 'rgba(255, 255, 255, 0.92)';
const WRAPPED_HALO = 1.25; // 包装糖果光晕半径 / 糖果半径（仍在格子内：0.36 × 1.25 = 0.45 < 0.5）
const WRAPPED_KNOTS = [[-1, -1], [1, -1], [-1, 1], [1, 1]]; // 四角「包装结」的相对方位
const MAGIC_BODY_COLOR = '#241f3a'; // 魔力鸟的暗色球体（与任何颜色都不混淆）
const MAGIC_RING_RATIO = 0.82; // 彩虹环半径 / 糖果半径
const MAGIC_RING_WIDTH = 0.22; // 彩虹环线宽 / 糖果半径
const MAGIC_RING_SPIN = -Math.PI / 2; // 让第一段彩虹从正上方开始（观感更稳）
const MAGIC_CORE_RATIO = 0.24; // 白色中心点半径 / 糖果半径

// 颜色索引（0-5）→ 调色板。顺序对应 CONFIG.COLOR_NAMES，改动顺序等于改动视觉语义。
export const BASE_COLORS = ['#f2555a', '#f7a325', '#ffd93b', '#4ecb71', '#38b6ff', '#a06bff'];

// 6 种形状与颜色一一对应（5.4 色盲友好）。多边形参数：顶点数、旋转、外半径倍数、纵向压扁比例。
const SHAPES = [
  { kind: 'circle' },
  { kind: 'roundRect', corner: 0.34 },
  { kind: 'polygon', sides: 3, spin: 0, outer: 1.12, squash: 0.62 },
  { kind: 'polygon', sides: 4, spin: 0, outer: 1.1, squash: 0 },
  { kind: 'star', points: 5, outer: 1.08, inner: 0.45 },
  { kind: 'polygon', sides: 6, spin: 0, outer: 1, squash: 0 }
];

/**
 * 糖果精灵图集：每个颜色 5 张（普通 / 横向条纹 / 纵向条纹 / 包装 / 魔力鸟），共 30 张。
 * 形状与颜色一一对应（5.4），故形状只需按 color 索引取，不需要 6×6 全组合。
 * 魔力鸟的外观与颜色无关（彩虹环 + 白色中心），6 色各一份只是为了让图集结构统一。
 * 返回 [color] = { normal, stripedH, stripedV, wrapped, magic }，每张精灵正好覆盖一格（红线 2）。
 */
export function buildSpriteAtlas(cellCss, dpr) {
  const px = Math.max(8, Math.round(cellCss * dpr));
  const radius = cellCss * CELL_RADIUS_RATIO * dpr;
  return BASE_COLORS.map((base, color) => {
    const shape = SHAPES[color % SHAPES.length];
    const bake = (paint) => {
      const canvas = document.createElement('canvas');
      canvas.width = px;
      canvas.height = px;
      paint(canvas.getContext('2d'), px / 2, px / 2, radius);
      return canvas;
    };
    return {
      normal: bake((ctx, cx, cy, r) => paintCandy(ctx, cx, cy, r, base, shape)),
      stripedH: bake((ctx, cx, cy, r) => paintStripedCandy(ctx, cx, cy, r, base, shape, DIRECTION.H)),
      stripedV: bake((ctx, cx, cy, r) => paintStripedCandy(ctx, cx, cy, r, base, shape, DIRECTION.V)),
      wrapped: bake((ctx, cx, cy, r) => paintWrappedCandy(ctx, cx, cy, r, base, shape)),
      magic: bake((ctx, cx, cy, r) => paintMagicCandy(ctx, cx, cy, r))
    };
  });
}

/**
 * 普通糖果：深色描边（同时充当底部内阴影）+ 径向渐变主体 + 内嵌图案 + 左上高光。
 * 全部为路径/渐变绘制：不使用阴影模糊类 API（红线 1，见 REFERENCES §3.5）。
 */
function paintCandy(ctx, cx, cy, radius, base, shape) {
  // 1) 底层深色：主体略微上移，露出下缘暗边，形成「底部内阴影」的立体感
  ctx.fillStyle = mixHex(base, '#000000', RIM_MIX);
  shapePath(ctx, shape, cx, cy, radius);
  ctx.fill();

  // 2) 主体：亮部偏左上，手感更「鼓」
  const grad = ctx.createRadialGradient(cx - radius * 0.32, cy - radius * 0.42, radius * 0.08, cx, cy, radius * 1.02);
  grad.addColorStop(0, mixHex(base, '#ffffff', 0.55));
  grad.addColorStop(0.5, base);
  grad.addColorStop(1, mixHex(base, '#000000', 0.22));
  ctx.fillStyle = grad;
  shapePath(ctx, shape, cx - radius * 0.03, cy - radius * 0.05, radius * 0.97);
  ctx.fill();

  // 3) 内嵌图案 + 4) 左上高光都在形状裁剪区里画，避免溢出到相邻格子
  ctx.save();
  shapePath(ctx, shape, cx, cy, radius * 0.98);
  ctx.clip();
  ctx.globalAlpha = MOTIF_ALPHA;
  const motif = mixHex(base, '#000000', MOTIF_MIX);
  ctx.fillStyle = motif;
  ctx.strokeStyle = motif;
  paintMotif(ctx, shape, cx, cy, radius);
  ctx.globalAlpha = 1;

  ctx.fillStyle = HIGHLIGHT_COLOR;
  ctx.beginPath();
  ctx.ellipse(cx - radius * 0.34, cy - radius * 0.4, radius * 0.3, radius * 0.19, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 内嵌图案：每种形状一个可辨识的小图案，与形状同族但更小，避免细格子里糊成一团。 */
function paintMotif(ctx, shape, cx, cy, r) {
  if (shape.kind === 'circle') {
    ctx.lineWidth = r * 0.15;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.34, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  if (shape.kind === 'roundRect') {
    ctx.fillRect(cx - r * 0.52, cy - r * 0.3, r * 1.04, r * 0.13);
    ctx.fillRect(cx - r * 0.52, cy + r * 0.17, r * 1.04, r * 0.13);
    return;
  }
  if (shape.kind === 'star') {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const rad = i % 2 === 0 ? r * 0.46 : r * 0.2;
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const x = cx + Math.cos(angle) * rad;
      const y = cy + Math.sin(angle) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (shape.sides === 3) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.42);
    ctx.lineTo(cx + r * 0.38, cy + r * 0.26);
    ctx.lineTo(cx - r * 0.38, cy + r * 0.26);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (shape.sides === 4) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.fillRect(cx - r * 0.3, cy - r * 0.52, r * 0.13, r * 1.04);
  ctx.fillRect(cx + r * 0.17, cy - r * 0.52, r * 0.13, r * 1.04);
}

/**
 * 条纹糖果：在普通糖果上叠 3 条白色条纹 + 方向箭头。
 * 3.2：条纹方向 = 匹配方向（横向 4 连 → 横条纹 → 消整行）；5.4 要求方向可辨，故保留箭头。
 */
function paintStripedCandy(ctx, cx, cy, radius, base, shape, direction) {
  paintCandy(ctx, cx, cy, radius, base, shape);
  const horizontal = direction !== DIRECTION.V;

  ctx.save();
  shapePath(ctx, shape, cx, cy, radius * 0.98);
  ctx.clip();
  ctx.fillStyle = STRIPE_COLOR;
  for (let i = -1; i <= 1; i += 1) {
    if (horizontal) {
      ctx.fillRect(cx - radius * 0.95, cy + i * radius * 0.34 - radius * 0.07, radius * 1.9, radius * 0.14);
    } else {
      ctx.fillRect(cx + i * radius * 0.34 - radius * 0.07, cy - radius * 0.95, radius * 0.14, radius * 1.9);
    }
  }
  ctx.restore();

  ctx.fillStyle = ARROW_COLOR;
  ctx.beginPath();
  if (horizontal) {
    ctx.moveTo(cx + radius * 0.62, cy);
    ctx.lineTo(cx + radius * 0.36, cy - radius * 0.2);
    ctx.lineTo(cx + radius * 0.36, cy + radius * 0.2);
  } else {
    ctx.moveTo(cx, cy + radius * 0.62);
    ctx.lineTo(cx - radius * 0.2, cy + radius * 0.36);
    ctx.lineTo(cx + radius * 0.2, cy + radius * 0.36);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * 包装糖果：普通糖果 + 径向渐变光晕 + 四个「包装结」。
 * 5.4 要求特殊元素有明显视觉区分；光晕用径向渐变而不是阴影模糊（红线 1，REFERENCES §3.5）。
 * 光晕半径 1.25r 仍在格子内（r = 0.36 格边长 → 1.25r = 0.45 格边长），不会溢出到相邻格。
 */
function paintWrappedCandy(ctx, cx, cy, radius, base, shape) {
  const halo = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius * WRAPPED_HALO);
  halo.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
  halo.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * WRAPPED_HALO, 0, Math.PI * 2);
  ctx.fill();

  paintCandy(ctx, cx, cy, radius, base, shape);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  for (const [dx, dy] of WRAPPED_KNOTS) {
    ctx.beginPath();
    ctx.arc(cx + dx * radius * 0.62, cy + dy * radius * 0.62, radius * 0.13, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * 魔力鸟：暗色球体 + 六色彩虹环 + 白色中心点（3.2「消除全屏同色」/ 5.4 要求彩色光芒可辨）。
 * 外观与自身颜色无关，这样玩家一眼就知道它「不属于任何颜色、可匹配任意颜色」。
 * 全部用路径/渐变绘制，不使用阴影模糊（红线 1）。
 */
function paintMagicCandy(ctx, cx, cy, radius) {
  ctx.fillStyle = MAGIC_BODY_COLOR;
  shapePath(ctx, SHAPES[0], cx, cy, radius); // 圆球：与「颜色无关」的语义一致
  ctx.fill();

  BASE_COLORS.forEach((color, index) => {
    const start = (index * Math.PI) / 3 + MAGIC_RING_SPIN;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * MAGIC_RING_RATIO, start, start + Math.PI / 3);
    ctx.lineWidth = radius * MAGIC_RING_WIDTH;
    ctx.strokeStyle = color;
    ctx.stroke();
  });

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, radius * MAGIC_CORE_RATIO, 0, Math.PI * 2);
  ctx.fill();
}

/** 生成形状路径：圆 / 圆角方 / 正多边形（可纵向压扁）/ 星形，全部闭合。 */function shapePath(ctx, shape, cx, cy, r) {
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

/** 圆角矩形路径（Canvas 提供的 roundRect 在部分旧版移动浏览器缺失，故自行绘制）。 */
export function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
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
