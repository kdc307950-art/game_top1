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

import { COLLECTIBLE_TYPE, CONFIG, DIRECTION } from './config.js';

export const CELL_RADIUS_RATIO = 0.36; // 糖果半径 / 格子边长（5.2 正方形棋盘）
const RIM_MIX = 0.45; // 描边/暗边 = base 与黑的混合比例
const MOTIF_MIX = 0.38; // 内嵌图案的颜色混合比例
const MOTIF_ALPHA = 0.72;
const HIGHLIGHT_COLOR = 'rgba(255, 255, 255, 0.5)';
// ---- 21.3 v2（用户反馈第 1/3 条）：统一材质 —— 一块主高光 + 一个小反光点
const GLOSS_MAIN = 'rgba(255, 255, 255, 0.46)';
const GLOSS_DOT = 'rgba(255, 255, 255, 0.82)';
// ---- 21.3（D048）拟人化与质感：纯造型比例，按 D013 留在模块内，不进附录 B ----
const BAKED_SHADOW = 'rgba(18, 14, 28, 0.22)'; // 预烘焙的几何投影（不用模糊类 API）
const EYE_MIX = 0.78;        // 眼睛 = 糖果底色与近黑的混合比例（留一点色相，护住按色相识别的探针）
const EYE_GLINT = 'rgba(255, 255, 255, 0.85)';
const BLUSH_COLOR = 'rgba(255, 186, 202, 0.5)'; // 偏**浅**的粉（在红糖果上「粉色压红」几乎看不见，浅粉才在 6 色上都读得出来）
const STRIPE_COLOR = 'rgba(255, 255, 255, 0.88)';
const ARROW_COLOR = 'rgba(255, 255, 255, 0.92)';
const WRAPPED_HALO = 1.25; // 包装糖果光晕半径 / 糖果半径（仍在格子内：0.36 × 1.25 = 0.45 < 0.5）
// ---- 魔力鸟（21.3 v2）：亮白鸟身 + 彩虹冠羽 + 短翅膀 + 小喙（材质与普通糖果共用 paintVolume） ----
const MAGIC_BODY_COLOR = '#f4f2ff'; // 亮白偏冷（**不在 6 色之内** ⇒ 「不属于任何颜色」；在深色棋盘上也不再发空）
const MAGIC_WING_COLOR = 'rgba(176, 170, 214, 0.92)';
const MAGIC_BEAK_COLOR = '#ffb340';

// 障碍物外观（Step 11；5.4「冰块半透明叠加、雪块白色覆盖」+ 层数显示）。
// 冰块的半透明是功能性的（要让冰里的动物可辨），不属于红线 3 的修饰性底色。
const ICE_INSET_RATIO = 0.06; // 冰块覆层内缩 / 格子边长
const ICE_RADIUS_RATIO = 0.22; // 覆层圆角 / 覆层边长
const ICE_EDGE_WIDTH_RATIO = 0.025; // 覆层描边线宽 / 格子边长
const ICE_CRACK_WIDTH_RATIO = 0.02; // 裂纹线宽 / 格子边长
const ICE_FILL_COLOR = 'rgba(186, 232, 255, 0.35)'; // 0.55 会把红糖果染成粉色（色相 358→330），0.35 仍能读出糖色
const ICE_EDGE_COLOR = 'rgba(255, 255, 255, 0.92)';
const ICE_CRACK_COLOR = 'rgba(255, 255, 255, 0.8)';
// 裂纹位置固定（相对覆层的比例坐标），避免每局观感抖动
// 三条裂纹都避开格心：格心是玩家判断「冰里是哪颗动物」的关键位置，白色裂纹压上去会让色相失真
const ICE_CRACKS = [
  [[0.14, 0.12], [0.32, 0.4]],
  [[0.68, 0.16], [0.88, 0.48]],
  [[0.2, 0.7], [0.42, 0.92]]
];
const SNOW_INSET_RATIO = 0.04; // 雪块内缩 / 格子边长（比冰块更满，强调「占格」）
const SNOW_FILL_COLOR = '#f4f8ff';
const SNOW_EDGE_COLOR = '#c6d6ee';
const SNOW_MOUND_Y_RATIO = 0.72; // 堆积弧带中心的相对高度
const SNOW_MOUND_COLOR = 'rgba(148, 174, 212, 0.35)';

// Step 13（v1.17）藤蔓：覆层障碍，画在糖果之上 —— 必须**半透明**，否则读不出里面的动物（3.4 / 5.4）。
const VINE_STEM_COLOR = 'rgba(52, 124, 66, 0.88)';
const VINE_LEAF_COLOR = 'rgba(118, 190, 92, 0.9)';
const VINE_STEM_WIDTH_RATIO = 0.075; // 藤茎线宽 / 格子边长
const VINE_LEAF_R_RATIO = 0.13;      // 叶片半径 / 格子边长
const VINE_INSET_RATIO = 0.1;        // 藤茎端点内缩 / 格子边长

// Step 13（v1.17）巧克力：占格障碍、单层，格内没有动物，所以是**不透明**深色方块 + 巧克力格纹。
const CHOC_INSET_RATIO = 0.03;
const CHOC_FILL_COLOR = '#5b3520';
const CHOC_EDGE_COLOR = '#301809';
const CHOC_GRID_COLOR = 'rgba(255, 216, 173, 0.30)';
const CHOC_GLOSS_COLOR = 'rgba(255, 236, 206, 0.22)';
const BADGE_X_RATIO = 0.78; // 层数角标圆心（右上角）
const BADGE_Y_RATIO = 0.24;
const BADGE_R_RATIO = 0.15;
const BADGE_FILL_COLOR = 'rgba(36, 31, 58, 0.85)';
const BADGE_TEXT_COLOR = '#ffffff';

// Step 14（v1.18/v1.19）收集物：水果与金豆荚。它们**占格**（格内没有动物），因此是不透明精灵。
// 配色刻意避开调色板（`BASE_COLORS`）与障碍物用色，便于 5.4 的「一眼可辨」与像素取证：
//   水果 = 深红果身 + 深绿叶 + 棕色果柄；金豆荚 = 琥珀色荚身 + 奶白豆粒 + 深棕荚缝。
const FRUIT_BODY_COLOR = '#c62828';
const FRUIT_BODY_DARK = '#7f1616';
const FRUIT_LEAF_COLOR = '#2e7d32';
const FRUIT_STEM_COLOR = '#6d4c41';
const FRUIT_INSET_RATIO = 0.18;   // 果身半径 / 格子边长的一半（留出描边与高光空间）
const POD_BODY_COLOR = '#d9a441';
const POD_BODY_DARK = '#7a5220';
const POD_BEAN_COLOR = '#fdf3d0';
const POD_BEAN_COUNT = 3;
const POD_HALF_W_RATIO = 0.30;    // 荚身半宽 / 格子边长（整荚 0.60 格宽，留出与邻格的间隔）
const POD_HALF_H_RATIO = 0.40;    // 荚身半高 / 格子边长（整荚 0.80 格高）

// 颜色索引（0-5）→ 调色板。顺序对应 CONFIG.COLOR_NAMES，改动顺序等于改动视觉语义。
export const BASE_COLORS = ['#f2555a', '#f7a325', '#ffd93b', '#4ecb71', '#38b6ff', '#a06bff'];

// 6 种形状与颜色一一对应（5.4 色盲友好）。多边形参数：顶点数、旋转、外半径倍数、纵向拉伸比例。
// `face`（21.3 v2 / 用户反馈第 3 条）：各形状**可见糖体**的相对大小 —— 表情按它缩放，
// 这样「不同轮廓里的脸看起来一样大」（菱形/五角星的可视面积明显小于内部切圆，故取更小值）。
// ⚠️ 21.3 修掉一个**潜伏缺陷**：`squash` 在 `shapePath` 里是**纵向拉伸**（`(1 + squash)`），
// 三角形原本 `outer 1.12 + squash 0.62` ⇒ 纵向半高 1.81r，而精灵只有 0.5 格 = 1.39r
// ⇒ **顶部顶点被精灵边界裁掉**（黄三角形的尖被削平，实测最外 1px 有 13 个不透明像素、minY = 0）。
// 21.3 v2 按用户反馈「加宽主体、软化尖角、降低纵向尖长」进一步调整为 outer 0.9 + squash 0.34。
const SHAPES = [
  { kind: 'circle', face: 1 },
  { kind: 'roundRect', corner: 0.42, face: 0.94 },
  // 21.3 v2 按用户反馈「加宽主体、软化尖角、降低纵向尖长」进一步调整：
  // 三角形 outer 0.9→**1.0**、squash 0.34→**0.26** ⇒ 宽 1.73r、纵向半高 1.26r
  // （既比原来的 1.56r 宽一档、又仍落在精灵 1.389r 之内），视觉重量向红圆/橙方靠齐。
  { kind: 'polygon', sides: 3, spin: 0, outer: 1, squash: 0.26, face: 0.9 },
  { kind: 'polygon', sides: 4, spin: 0, outer: 1.06, face: 0.82 },
  { kind: 'star', points: 5, outer: 1.08, inner: 0.52, face: 0.86 },
  { kind: 'polygon', sides: 6, spin: 0, outer: 1.02, face: 0.94 }
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

// 粒子外观（Step 17 / 宪法 v1.27，用户拍板的外观方案 A：预烘焙精灵 + 三类强度）。
// 三种形状各 6 色，全部在布局时烘焙一次、每帧只 drawImage（15 节红线 2 的「静态烘焙复用」）。
// 刻意只用**实心填充 + 一层半透明白高光**：零阴影模糊类 API、零每帧渐变（REFERENCES.md §3.5 红线 1）。
const PARTICLE_BAKE_RATIO = 0.2; // 粒子精灵的烘焙边长 / 格子边长（渲染时按实际尺寸缩放）
const PARTICLE_SHAPES = ['dot', 'shard', 'star'];
const PARTICLE_HIGHLIGHT = 'rgba(255, 255, 255, 0.55)';

/** 三种粒子形状的路径：圆点 / 斜菱（条纹）/ 五角星（包装·魔力鸟·组合）。 */
function particlePath(ctx, shape, cx, cy, r) {
  ctx.beginPath();
  if (shape === 'dot') {
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  } else if (shape === 'shard') {
    ctx.moveTo(cx, cy - r * 1.15);
    ctx.lineTo(cx + r * 0.62, cy);
    ctx.lineTo(cx, cy + r * 1.15);
    ctx.lineTo(cx - r * 0.62, cy);
    ctx.closePath();
  } else {
    const outer = r * 1.08;
    const inner = r * 0.46;
    for (let i = 0; i < 10; i += 1) {
      const radius = i % 2 === 0 ? outer : inner;
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
}

/**
 * 粒子精灵图集（Step 17）：返回 `{ dot, shard, star }`，每项是 6 色（下标 = `cell.color`）的精灵数组。
 * 形状与事件种类的对应由 `render.js` 决定（普通消除 → dot，条纹 → shard，包装/魔力鸟/组合 → star）。
 * 旋转由渲染层用 `ctx.rotate` 施加，图集里一律正放。
 */
export function buildParticleAtlas(cellCss, dpr) {
  const px = Math.max(6, Math.round(cellCss * PARTICLE_BAKE_RATIO * dpr));
  const bake = (shape, base) => {
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    const r = px * 0.4;
    particlePath(ctx, shape, px / 2, px / 2, r);
    ctx.fillStyle = base;
    ctx.fill();
    // 左上高光：与糖果的 HIGHLIGHT_COLOR 同一语言，但只画一个不透明小圆点（不做渐变）
    ctx.beginPath();
    ctx.arc(px / 2 - r * 0.32, px / 2 - r * 0.34, r * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = PARTICLE_HIGHLIGHT;
    ctx.fill();
    return canvas;
  };
  return PARTICLE_SHAPES.reduce((atlas, shape) => {
    atlas[shape] = BASE_COLORS.map((base) => bake(shape, base));
    return atlas;
  }, {});
}

/**
 * 收集物精灵图集（Step 14，3.6 的水果关 / 金豆荚关）：
 * 返回 `{ fruit, pod }`，每张正好覆盖一格。收集物**占格且格内没有动物**（4.1），
 * 所以两张都是不透明绘制（与雪块/巧克力同一类「盖住格位槽」的画法）。
 * 每张都烘焙一次、每帧只 drawImage，符合 15 节的性能预算（红线 2）。
 */
export function buildCollectibleAtlas(cellCss, dpr) {
  const px = Math.max(8, Math.round(cellCss * dpr));
  const bake = (paint) => {
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    paint(canvas.getContext('2d'), px);
    return canvas;
  };
  return {
    [COLLECTIBLE_TYPE.FRUIT]: bake(paintFruit),
    [COLLECTIBLE_TYPE.POD]: bake(paintPod)
  };
}

/** 水果：深红果身 + 深绿叶 + 棕色果柄 + 左上高光（全程序化，零素材，见 D009）。 */
function paintFruit(ctx, size) {
  const cx = size * 0.5;
  const cy = size * 0.56;
  const r = size * FRUIT_INSET_RATIO * 1.35;

  ctx.lineWidth = Math.max(1, size * 0.045);
  ctx.strokeStyle = FRUIT_STEM_COLOR;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.75);
  ctx.lineTo(cx + r * 0.12, cy - r * 1.35);
  ctx.stroke();

  ctx.fillStyle = FRUIT_LEAF_COLOR;
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.42, cy - r * 1.05, r * 0.42, r * 0.2, -0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = FRUIT_BODY_DARK;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = FRUIT_BODY_COLOR;
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.06, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = HIGHLIGHT_COLOR;
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.34, cy - r * 0.36, r * 0.28, r * 0.18, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

/** 金豆荚：琥珀色荚身 + 三颗奶白豆粒 + 深棕荚缝（与水果的区别一眼可辨）。 */
function paintPod(ctx, size) {
  const cx = size * 0.5;
  const cy = size * 0.5;
  const halfW = size * POD_HALF_W_RATIO;
  const halfH = size * POD_HALF_H_RATIO;

  const podPath = () => {
    ctx.beginPath();
    ctx.ellipse(cx, cy, halfW, halfH, 0, 0, Math.PI * 2);
  };

  podPath();
  ctx.fillStyle = POD_BODY_DARK;
  ctx.fill();

  podPath();
  ctx.fillStyle = POD_BODY_COLOR;
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.ellipse(cx - size * 0.02, cy - size * 0.02, halfW * 0.92, halfH * 0.94, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 豆粒：沿荚身中轴等距排布，让「分阶段掉落」的收集物读起来像一荚豆子而不是一颗糖
  ctx.fillStyle = POD_BEAN_COLOR;
  for (let i = 0; i < POD_BEAN_COUNT; i += 1) {
    const t = (i + 0.5) / POD_BEAN_COUNT;
    const y = cy - halfH * 0.62 + halfH * 1.24 * t;
    ctx.beginPath();
    ctx.arc(cx, y, halfW * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
}


/**
 * 障碍物精灵图集（Step 11，5.4「冰块半透明叠加、雪块白色覆盖」+ 清晰的层数显示）。
 * 返回 { ice: [1 层, 2 层, …], snow: [...] }，索引 = layers − 1；每张正好覆盖一格。
 *   ice  —— 半透明覆层，画在**糖果之上**（冰里的动物仍要看得见）；
 *   snow —— 不透明占格，其格内没有动物（3.4），直接盖住格位槽。
 * 层数角标直接烘焙进精灵：每帧仍是「一格一次 drawImage」，不产生额外文本绘制（15 节 ≤200 次）。
 * 两个角标都固定在右上角，便于像素取证与观感稳定。
 */
export function buildObstacleAtlas(cellCss, dpr) {
  const px = Math.max(8, Math.round(cellCss * dpr));
  const bake = (paint) => {
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    paint(canvas.getContext('2d'), px);
    return canvas;
  };
  const ice = [];
  for (let layers = 1; layers <= CONFIG.OBSTACLE_CONFIG.ice.maxLayers; layers += 1) {
    ice.push(bake((ctx, size) => paintIceOverlay(ctx, size, layers)));
  }
  const snow = [];
  for (let layers = 1; layers <= CONFIG.OBSTACLE_CONFIG.snow.maxLayers; layers += 1) {
    snow.push(bake((ctx, size) => paintSnowBlock(ctx, size, layers)));
  }
  const vine = [];
  for (let layers = 1; layers <= CONFIG.OBSTACLE_CONFIG.vine.maxLayers; layers += 1) {
    vine.push(bake((ctx, size) => paintVineOverlay(ctx, size, layers)));
  }
  const choc = [];
  for (let layers = 1; layers <= CONFIG.OBSTACLE_CONFIG.choc.maxLayers; layers += 1) {
    choc.push(bake((ctx, size) => paintChocBlock(ctx, size, layers)));
  }
  return { ice, snow, vine, choc };
}

/**
 * 冰块覆层：半透明冰蓝底 + 白色描边 + 两道固定的裂纹 + 右上角层数角标。
 * 5.4 要求「半透明叠加」，故本图层的透明度是**功能性**的（让冰里的动物可辨），
 * 不属于红线 3 的「修饰性底色」。裂纹位置固定，避免每局观感抖动。
 */
function paintIceOverlay(ctx, size, layers) {
  const inset = size * ICE_INSET_RATIO;
  const box = size - inset * 2;
  roundRectPath(ctx, inset, inset, box, box, box * ICE_RADIUS_RATIO);
  ctx.fillStyle = ICE_FILL_COLOR;
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * ICE_EDGE_WIDTH_RATIO);
  ctx.strokeStyle = ICE_EDGE_COLOR;
  ctx.stroke();

  ctx.strokeStyle = ICE_CRACK_COLOR;
  ctx.lineWidth = Math.max(1, size * ICE_CRACK_WIDTH_RATIO);
  for (const [[x0, y0], [x1, y1]] of ICE_CRACKS) {
    ctx.beginPath();
    ctx.moveTo(inset + box * x0, inset + box * y0);
    ctx.lineTo(inset + box * x1, inset + box * y1);
    ctx.stroke();
  }
  paintLayerBadge(ctx, size, layers);
}

/** 雪块：白色不透明占格 + 冷色描边 + 底部一点点堆积感的内阴影 + 右上角层数角标。 */
function paintSnowBlock(ctx, size, layers) {
  const inset = size * SNOW_INSET_RATIO;
  const box = size - inset * 2;
  roundRectPath(ctx, inset, inset, box, box, box * ICE_RADIUS_RATIO);
  ctx.fillStyle = SNOW_FILL_COLOR;
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * ICE_EDGE_WIDTH_RATIO);
  ctx.strokeStyle = SNOW_EDGE_COLOR;
  ctx.stroke();

  // 内阴影：不用阴影模糊 API（红线 1），改用底部半透明弧带模拟堆积
  ctx.beginPath();
  ctx.ellipse(size / 2, inset + box * SNOW_MOUND_Y_RATIO, box * 0.32, box * 0.16, 0, 0, Math.PI * 2);
  ctx.fillStyle = SNOW_MOUND_COLOR;
  ctx.fill();
  paintLayerBadge(ctx, size, layers);
}

/**
 * 藤蔓（Step 13 / v1.17）：**半透明**绿色藤茎十字缠绕 + 两片叶子 + 右上角层数角标。
 * 它是覆层障碍，画在糖果**之上**；透明度是功能性的 —— 3.4 要求冰里的动物仍可辨，
 * 藤蔓同理（里面的动物照常参与匹配、可被相邻消除波及）。
 */
function paintVineOverlay(ctx, size, layers) {
  const inset = size * VINE_INSET_RATIO;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, size * VINE_STEM_WIDTH_RATIO);
  ctx.strokeStyle = VINE_STEM_COLOR;
  for (const along of [0, 1]) {
    ctx.beginPath();
    ctx.moveTo(along === 0 ? inset : size / 2, along === 0 ? size / 2 : inset);
    ctx.lineTo(along === 0 ? size - inset : size / 2, along === 0 ? size / 2 : size - inset);
    ctx.stroke();
  }

  ctx.fillStyle = VINE_LEAF_COLOR;
  for (const [lx, ly] of [[0.28, 0.30], [0.72, 0.70]]) {
    ctx.beginPath();
    ctx.ellipse(size * lx, size * ly, size * VINE_LEAF_R_RATIO, size * VINE_LEAF_R_RATIO * 0.62, leafTilt(lx), 0, Math.PI * 2);
    ctx.fill();
  }
  paintLayerBadge(ctx, size, layers);
}

/** 叶片倾斜：左右两片反向，避免看起来是复制粘贴（纯观感，不影响任何判定）。 */
function leafTilt(x) {
  return x < 0.5 ? -Math.PI / 5 : Math.PI / 5;
}

/**
 * 巧克力（Step 13 / v1.17）：不透明深棕占格方块 + 描边 + 十字格纹 + 左上高光 + 层数角标。
 * 它是占格障碍（3.4 v1.12），格内没有动物，所以直接盖住格位槽 —— 与雪块同一条受损路径，
 * 但每块 1000 分（3.5 v1.17）。
 */
function paintChocBlock(ctx, size, layers) {
  const inset = size * CHOC_INSET_RATIO;
  const box = size - inset * 2;
  roundRectPath(ctx, inset, inset, box, box, box * ICE_RADIUS_RATIO);
  ctx.fillStyle = CHOC_FILL_COLOR;
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * ICE_EDGE_WIDTH_RATIO);
  ctx.strokeStyle = CHOC_EDGE_COLOR;
  ctx.stroke();

  // 十字格纹：不用阴影/模糊 API（红线 1），只画两条线表达「一块巧克力」
  ctx.strokeStyle = CHOC_GRID_COLOR;
  ctx.lineWidth = Math.max(1, size * ICE_CRACK_WIDTH_RATIO);
  ctx.beginPath();
  ctx.moveTo(inset + box / 2, inset + box * 0.12);
  ctx.lineTo(inset + box / 2, inset + box * 0.88);
  ctx.moveTo(inset + box * 0.12, inset + box / 2);
  ctx.lineTo(inset + box * 0.88, inset + box / 2);
  ctx.stroke();

  ctx.strokeStyle = CHOC_GLOSS_COLOR;
  ctx.beginPath();
  ctx.moveTo(inset + box * 0.2, inset + box * 0.24);
  ctx.lineTo(inset + box * 0.44, inset + box * 0.24);
  ctx.stroke();
  paintLayerBadge(ctx, size, layers);
}

/** 右上角层数角标：深色圆底 + 白色数字（5.4 的「清晰层数显示」）。 */
function paintLayerBadge(ctx, size, layers) {
  const cx = size * BADGE_X_RATIO;
  const cy = size * BADGE_Y_RATIO;
  const radius = size * BADGE_R_RATIO;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = BADGE_FILL_COLOR;
  ctx.fill();
  ctx.fillStyle = BADGE_TEXT_COLOR;
  ctx.font = `bold ${Math.round(radius * 1.5)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(layers), cx, cy);
}

/**
 * **糖果体（共用材质）** —— 普通糖果与魔力鸟的**同一套**体积画法（用户 21.3 反馈第 1 条：
 * 「三个风格放在一起」，要求统一材质）。三层，全部是**几何**，零模糊类 API、零每帧渐变：
 *   ① 预烘焙投影：形状剪影右下偏移（`BAKED_SHADOW`）；
 *   ② 暗边：底色压暗的整圈（露出下缘，形成「底部内阴影」）；
 *   ③ 主体：径向渐变，**光源固定在左上**（`cx − 0.32r, cy − 0.42r`）。
 * `light` / `dark` / `rim` 允许微调，但**光源位置与三层结构对所有棋子一致**。
 */
function paintVolume(ctx, shape, cx, cy, radius, base, { light = 0.55, dark = 0.22, rim = RIM_MIX, shadow = BAKED_SHADOW } = {}) {
  ctx.fillStyle = shadow;
  shapePath(ctx, shape, cx + radius * 0.05, cy + radius * 0.11, radius * 0.99);
  ctx.fill();

  ctx.fillStyle = mixHex(base, '#000000', rim);
  shapePath(ctx, shape, cx, cy, radius);
  ctx.fill();

  const grad = ctx.createRadialGradient(cx - radius * 0.32, cy - radius * 0.42, radius * 0.08, cx, cy, radius * 1.02);
  grad.addColorStop(0, mixHex(base, '#ffffff', light));
  grad.addColorStop(0.5, base);
  grad.addColorStop(1, mixHex(base, '#000000', dark));
  ctx.fillStyle = grad;
  shapePath(ctx, shape, cx - radius * 0.03, cy - radius * 0.05, radius * 0.97);
  ctx.fill();
}

/**
 * **一块主高光 + 一个小反光点**（用户反馈第 3 条：原来的高光「像白色涂抹」）。
 * 两点都落在**左上象限、眼睛上方**，顺着糖体表面的走向（长轴沿 -0.5rad），不压额头/眼睛。
 */
function paintGloss(ctx, cx, cy, radius) {
  ctx.fillStyle = GLOSS_MAIN;
  ctx.beginPath();
  ctx.ellipse(cx - radius * 0.3, cy - radius * 0.38, radius * 0.26, radius * 0.15, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = GLOSS_DOT;
  ctx.beginPath();
  ctx.arc(cx - radius * 0.5, cy - radius * 0.2, radius * 0.055, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 普通糖果：**共用材质** + 内嵌图案 + 主高光/反光点 + 表情。
 * 全部为路径/渐变绘制：不使用阴影模糊类 API（红线 1，见 REFERENCES §3.5）。
 */
function paintCandy(ctx, cx, cy, radius, base, shape, withFace = true) {
  paintVolume(ctx, shape, cx, cy, radius, base);

  // 内嵌图案 + 高光 + 表情都在形状裁剪区里画，避免溢出到相邻格子
  ctx.save();
  shapePath(ctx, shape, cx, cy, radius * 0.98);
  ctx.clip();
  ctx.globalAlpha = MOTIF_ALPHA;
  const motif = mixHex(base, '#000000', MOTIF_MIX);
  ctx.fillStyle = motif;
  ctx.strokeStyle = motif;
  paintMotif(ctx, shape, cx, cy, radius);
  ctx.globalAlpha = 1;
  paintGloss(ctx, cx, cy, radius);
  if (withFace) paintFace(ctx, cx, cy, radius * (shape.face ?? 1), base);
  ctx.restore();
}

/**
 * **拟人化表情**（Step 21.3 / D048）：两只小眼睛（带一点白色反光）+ 两片腮红。
 *
 * 三条设计约束（都是可测量的，见 `_build/shot-candy-21.mjs`）：
 *   ① 眼睛用的是**糖果自己颜色的深色版**（`mixHex(base, …, EYE_MIX)`）而不是纯黑 ——
 *      这样即使探针在眼位附近取样，色相仍与本体一致，`verify-step12b` 的「按色相识别 64 格」不会被打断；
 *   ② 眼睛与腮红都**避开格心**（|dx| < 0.1r、|dy| < 0.12r 是空区），因此格心永远是本体色；
 *   ③ 全部在形状裁剪区内绘制，绝不溢出到相邻格子。
 */
function paintFace(ctx, cx, cy, r, base) {
  const eye = mixHex(base, '#0d0d14', EYE_MIX);
  // 眼睛整体略低于中线：上方让出高光区（主高光在 -0.38r，两者不打架）
  const eyeY = cy - r * 0.02;
  for (const side of [-1, 1]) {
    const x = cx + side * r * 0.19;
    ctx.fillStyle = eye;
    ctx.beginPath();
    ctx.ellipse(x, eyeY, r * 0.095, r * 0.125, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = EYE_GLINT;
    ctx.beginPath();
    ctx.arc(x - r * 0.03, eyeY - r * 0.045, r * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = BLUSH_COLOR;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + side * r * 0.44, cy + r * 0.26, r * 0.16, r * 0.095, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 内嵌图案：每种形状一个可辨识的小图案，与形状同族但更小，避免细格子里糊成一团。
 *  **不使用横向/纵向长条**（用户反馈第 5 条：长条会被误读为条纹特效的线索）——
 *  方形改「小圆角方框」、六边形改「小六边形框」、菱形改「小菱形框」，与条纹糖果一眼分开。 */
function paintMotif(ctx, shape, cx, cy, r) {
  if (shape.kind === 'circle') {
    ctx.lineWidth = r * 0.15;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.34, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  if (shape.kind === 'roundRect') {
    ctx.lineWidth = r * 0.13;
    roundRectPath(ctx, cx - r * 0.32, cy - r * 0.32, r * 0.64, r * 0.64, r * 0.16);
    ctx.stroke();
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
  // 菱形（sides 4，spin 0 ⇒ 顶点朝上下）与六边形：画各自的小框，与形状同族
  const corners = shape.sides === 4 ? 4 : 6;
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  for (let i = 0; i < corners; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / corners;
    const x = cx + Math.cos(angle) * r * 0.36;
    const y = cy + Math.sin(angle) * r * 0.36;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
}

/**
 * 条纹糖果：在普通糖果上叠 3 条白色条纹 + 方向箭头。
 * 3.2：条纹方向 = 匹配方向（横向 4 连 → 横条纹 → 消整行）；5.4 要求方向可辨，故保留箭头。
 */
function paintStripedCandy(ctx, cx, cy, radius, base, shape, direction) {
  paintCandy(ctx, cx, cy, radius, base, shape, false);
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

  // 21.3：脸**最后**画，否则会被条纹与箭头盖住
  ctx.save();
  shapePath(ctx, shape, cx, cy, radius * 0.98);
  ctx.clip();
  paintFace(ctx, cx, cy, radius, base);
  ctx.restore();
}

/**
 * 包装糖果（21.3 v2 重做，用户反馈第 5 条：「四个白点更像铆钉，看不出包装」）：
 * **扭结的两端 + 头顶蝴蝶结**，轮廓一眼是「被糖纸包起来的糖」。
 *   · 两端：左右各一个三角形「纸角」，从糖体边缘往外探（`0.55r → 1.14r`），画在糖体**下面**；
 *   · 蝴蝶结：头顶两个小环 + 一个结（画在糖体**上面**，与表情错开 —— 脸在中部、结在头顶）；
 *   · 全部在格内（最远 1.14r + 投影偏移 ≈ 1.25r < 1.389r），无模糊类 API。
 */
function paintWrappedCandy(ctx, cx, cy, radius, base, shape) {
  const halo = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius * WRAPPED_HALO);
  halo.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
  halo.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * WRAPPED_HALO, 0, Math.PI * 2);
  ctx.fill();

  // 糖纸两端（先画，被糖体压住一半，露出来的是「纸角」）
  ctx.fillStyle = mixHex(base, '#ffffff', 0.18);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * radius * 1.14, cy);
    ctx.lineTo(cx + side * radius * 0.5, cy - radius * 0.52);
    ctx.lineTo(cx + side * radius * 0.5, cy + radius * 0.52);
    ctx.closePath();
    ctx.fill();
  }

  paintCandy(ctx, cx, cy, radius, base, shape, false);

  // 头顶蝴蝶结
  ctx.fillStyle = mixHex(base, '#ffffff', 0.32);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + side * radius * 0.26, cy - radius * 0.82, radius * 0.22, radius * 0.15, side * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = mixHex(base, '#000000', 0.3);
  ctx.beginPath();
  ctx.arc(cx, cy - radius * 0.82, radius * 0.1, 0, Math.PI * 2);
  ctx.fill();

  // 脸最后画（否则被覆盖）
  ctx.save();
  shapePath(ctx, shape, cx, cy, radius * 0.98);
  ctx.clip();
  paintFace(ctx, cx, cy, radius * (shape.face ?? 1), base);
  ctx.restore();
}

/**
 * **魔力鸟（21.3 v2 整体重做，用户反馈第 4 条）**。
 *
 * 旧版是「暗色球 + 六色圆环 + 白色中心头像」：环容易读成加载进度，主体又暗又空、材质与其它棋子脱节，
 * 而且**没有喙、没有翅膀、没有冠羽** —— 名字叫鸟却不像鸟。
 *
 * 新版只保留「彩虹 + 不属于任何颜色」这两个语义，外形改成**一只圆润的鸟**，且与普通糖果**共用同一套材质**
 * （`paintVolume` + `paintGloss` 的光源方向一致），因此天然属于同一套糖果世界：
 *   ① **彩虹冠羽**：6 片彩色羽片沿头顶扇形排开（彩虹从「外围进度环」搬到**头顶**，不再像指示器）；
 *   ② **鸟身**：用普通糖果的圆形状 + 同一材质，但底色是**亮白**（不在 6 色之内 ⇒ 一眼看出「不属于任何颜色」，
 *      同时在深色棋盘上足够醒目，不再「空、小」）；
 *   ③ **短翅膀**：左右两片，把圆形轮廓拉成鸟形；
 *   ④ **小鸟喙**：脸下方一个橙色小三角（与表情错开）；
 *   ⑤ **脸**：与普通糖果同一套 `paintFace`（眼睛/腮红尺寸、眼距、高光位置全部沿用，只按糖体缩放）。
 */
function paintMagicCandy(ctx, cx, cy, radius) {
  // ① 彩虹冠羽（画在鸟身之前，露在头顶上方）
  //    ⚠️ 羽片必须落在**一格之内**：`0.72r + 0.26r + 0.3r = 1.28r < 1.389r`（探针量最外 1px 必须全透明）。
  for (let i = 0; i < 6; i += 1) {
    const angle = -Math.PI / 2 + (i - 2.5) * 0.235;
    const px = cx + Math.cos(angle) * radius * 0.72;
    const py = cy + Math.sin(angle) * radius * 0.72;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = BASE_COLORS[i];
    ctx.beginPath();
    ctx.ellipse(0, -radius * 0.26, radius * 0.12, radius * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ② 鸟身：与普通糖果**同一材质**（同光源、同三层结构）
  paintVolume(ctx, SHAPES[0], cx, cy + radius * 0.07, radius * 0.94, MAGIC_BODY_COLOR, { light: 0.3, dark: 0.24, rim: 0.3 });

  // ③ 短翅膀：左右各一片（暗一档），把圆拉成鸟
  ctx.fillStyle = MAGIC_WING_COLOR;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + side * radius * 0.72, cy + radius * 0.14, radius * 0.3, radius * 0.19, side * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // ④ 小鸟喙（与腮红在 x 上错开，互不打架）
  ctx.fillStyle = MAGIC_BEAK_COLOR;
  ctx.beginPath();
  ctx.moveTo(cx, cy + radius * 0.52);
  ctx.lineTo(cx - radius * 0.17, cy + radius * 0.22);
  ctx.lineTo(cx + radius * 0.17, cy + radius * 0.22);
  ctx.closePath();
  ctx.fill();

  // ⑤ 高光与脸：与普通糖果同一套规则（只按糖体半径缩放）
  ctx.save();
  shapePath(ctx, SHAPES[0], cx, cy + radius * 0.07, radius * 0.92);
  ctx.clip();
  paintGloss(ctx, cx, cy + radius * 0.07, radius * 0.94);
  paintFace(ctx, cx, cy + radius * 0.02, radius * 0.94, MAGIC_BODY_COLOR);
  ctx.restore();
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
