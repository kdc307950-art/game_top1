// hud.js — HUD 与结束面板的绘制。见 AGENTS.md 2.2 / 2.3 / 5.4 / 5.5。
//
// 边界（2.3）：只接收「场景描述」（分数 / 剩余步数 / 最高分、结束面板数据），
// 不读游戏状态、不碰 localStorage、不绑事件。
// 与 render.js 的关系：render.js 负责棋盘层、本文件负责信息层；render.js **单向**依赖本文件
// （需要 HUD_RATIO / hudCells 来烘焙静态图层）。为避免 render ↔ hud 形成模块环，
// 圆角矩形路径在本文件就地实现一份（10 行纯几何），不反向 import render.js。

export const HUD_RATIO = 0.13; // HUD 带高度 / 画布边长（render.js 据此切分棋盘区）
const HUD_LOW_STEPS = 5; // 剩余步数 ≤ 此值时用警示色
const HUD_LOW_TIME = 10; // 剩余秒数 ≤ 此值时用警示色（3.6 v1.18 的时间关）
const HUD_CELL_BG = 'rgba(255, 255, 255, 0.06)'; // 修饰性底色；透明度 ≤ 0.1（REFERENCES §3.5 红线 3）
const HUD_LABEL_COLOR = 'rgba(255, 255, 255, 0.55)';
const HUD_VALUE_COLOR = '#ffffff';
const HUD_WARN_COLOR = '#ffd93b';
const OVERLAY_DIM = 'rgba(10, 8, 20, 0.78)';
const OVERLAY_PANEL = '#241f3a';
const OVERLAY_TITLE_COLOR = '#ffffff';
const OVERLAY_RECORD_COLOR = '#ffd93b';
const BUTTON_BG = '#ff4fd8'; // 调色板之外的洋红：不与任何糖果撞色，便于识别与程序化验证
const BUTTON_TEXT = '#2a0b23';
const GOAL_DONE_COLOR = '#4ecb71'; // 已完成的目标分项（与糖果绿色同为调色板内的绿）
const BANNER_BG = 'rgba(20, 16, 34, 0.92)';
const BANNER_TEXT_COLOR = '#ffe9a8';
const FONT_STACK = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

/** HUD 四个信息格的位置（静态图层与文字共用，避免两处各算一遍）。v1.14：3 格 → 4 格（5.5）。 */
export function hudCells(sizePx, hudHeight) {
  const pad = hudHeight * 0.18;
  const gap = hudHeight * 0.08;
  const w = (sizePx - pad * 2 - gap * 3) / 4;
  const h = hudHeight - pad * 2;
  return [0, 1, 2, 3].map((index) => ({ x: pad + index * (w + gap), y: pad, w, h }));
}

/** HUD 底色（静态图层的一部分，由 render.js 烘焙；这里只提供几何与颜色）。 */
export function hudCellBackground() {
  return HUD_CELL_BG;
}

/** HUD 常驻信息（5.5 / v1.14）：分数 / 剩余步数 / 关卡目标进度 / 最高分。
 *  v1.19：时间关**没有步数**，第二格改显示剩余时间（3.6 第 8 条 + 5.5）。 */
export function drawHud(ctx, { sizePx, hudHeight, hud }) {
  const boxes = hudCells(sizePx, hudHeight);
  const timed = Number.isFinite(hud.timeLimit) && hud.timeLimit > 0;
  const stats = [
    { label: '分数', value: String(hud.score), warn: false },
    timed
      ? { label: '时间', value: `${Math.max(0, Math.ceil(hud.remainingTime ?? 0))}s`, warn: (hud.remainingTime ?? 0) <= HUD_LOW_TIME }
      : { label: '步数', value: String(hud.steps), warn: hud.steps <= HUD_LOW_STEPS },
    { label: '目标', value: '', warn: false, lines: goalLines(hud) },
    { label: '最高分', value: String(hud.best), warn: false }
  ];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  boxes.forEach((box, index) => {
    const stat = stats[index];
    const cx = box.x + box.w / 2;
    ctx.font = `500 ${Math.max(9, Math.round(hudHeight * 0.2))}px ${FONT_STACK}`;
    ctx.fillStyle = HUD_LABEL_COLOR;
    ctx.fillText(stat.label, cx, box.y + box.h * (stat.lines ? 0.2 : 0.32));

    if (stat.lines) {
      // 目标格最多两行（v1.14 的 5.5 口径）：一行一个「当前值/目标值」
      ctx.font = `700 ${Math.max(9, Math.round(hudHeight * 0.26))}px ${FONT_STACK}`;
      stat.lines.forEach((line, i) => {
        ctx.fillStyle = line.done ? GOAL_DONE_COLOR : HUD_VALUE_COLOR;
        ctx.fillText(line.text, cx, box.y + box.h * (i === 0 ? 0.52 : 0.8));
      });
      return;
    }
    ctx.font = `700 ${Math.max(12, Math.round(hudHeight * 0.36))}px ${FONT_STACK}`;
    ctx.fillStyle = stat.warn ? HUD_WARN_COLOR : HUD_VALUE_COLOR;
    ctx.fillText(stat.value, cx, box.y + box.h * 0.68);
  });
}

/**
 * 目标进度文本（v1.14 的 5.5）：按目标类型给出「当前值/目标值」，最多两行。
 * 混合目标先显示未完成的分项（更有用），超出两行的部分以 `+N` 提示。
 * 只接收场景数据，不认识棋盘状态 —— 与 hud.js 的边界一致（2.3）。
 */
function goalLines(hud) {
  const goal = hud.goal ?? null;
  if (!goal) return [{ text: '—', done: false }];
  const collected = hud.collected ?? {};
  const entries = [];

  if (goal.type === 'score') entries.push(progress(`${hud.score}`, `${goal.target}`, hud.score >= goal.target));
  if (goal.type === 'clearIce') entries.push(progress(`冰 ${hud.clearedIce ?? 0}`, `${goal.target}`, (hud.clearedIce ?? 0) >= goal.target));
  // 3.6（v1.18）：水果关/金豆荚关的进度就是「已收到几个」
  if (goal.type === 'fruit') entries.push(progress(`水果 ${hud.collectedFruit ?? 0}`, `${goal.target}`, (hud.collectedFruit ?? 0) >= goal.target));
  if (goal.type === 'pod') entries.push(progress(`豆荚 ${hud.collectedPod ?? 0}`, `${goal.target}`, (hud.collectedPod ?? 0) >= goal.target));
  if (goal.type === 'collect' || goal.type === 'mixed') {
    const targets = goal.type === 'collect' ? goal.targets : goal.collect;
    for (const [name, need] of Object.entries(targets ?? {})) {
      entries.push(progress(`${name} ${collected[name] ?? 0}`, `${need}`, (collected[name] ?? 0) >= need));
    }
  }
  if (goal.type === 'mixed') {
    if (goal.score !== undefined) entries.push(progress(`${hud.score}`, `${goal.score}`, hud.score >= goal.score));
    if (goal.clearIce !== undefined) entries.push(progress(`冰 ${hud.clearedIce ?? 0}`, `${goal.clearIce}`, (hud.clearedIce ?? 0) >= goal.clearIce));
  }
  if (entries.length === 0) return [{ text: '—', done: false }];

  const ordered = [...entries.filter((e) => !e.done), ...entries.filter((e) => e.done)];
  const shown = ordered.slice(0, 2);
  if (ordered.length > shown.length) shown[shown.length - 1].text += ` +${ordered.length - shown.length}`;
  return shown;
}

const progress = (current, target, done) => ({ text: `${current}/${target}`, done });

/**
 * 结束面板（5.5：页面内 UI，禁止 alert）。返回「再来一局」按钮在画布内的命中区域，
 * 供 app.js 做点按判定（本文件不做命中测试，也不认识手势）。
 */
/**
 * 重排提示（5.5：无可行交换时必须给出明确提示，再进行重排）。
 * 画在棋盘区中央的一枚胶囊上，不遮挡 HUD，也不参与任何判定。
 */
export function drawBanner(ctx, field, text) {
  const fontSize = Math.round(field.side * 0.052);
  ctx.font = `700 ${fontSize}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = Math.min(field.side * 0.92, ctx.measureText(text).width + fontSize * 1.8);
  const h = fontSize * 2.1;
  const x = field.x + (field.side - w) / 2;
  const y = field.y + field.side * 0.5 - h / 2;
  roundRectPath(ctx, x, y, w, h, h * 0.3);
  ctx.fillStyle = BANNER_BG;
  ctx.fill();
  ctx.fillStyle = BANNER_TEXT_COLOR;
  ctx.fillText(text, field.x + field.side / 2, y + h / 2);
}

export function drawGameOver(ctx, field, overlay) {
  // overlay.reason：'won'（达成 3.6 的目标）/ 'steps'（步数用尽）/ 'stuck'（3.8 约束 4：死局重排超限）
  // / 'time'（v1.19：时间关倒计时归零且目标未达成，3.6 v1.18）
  const title =
    overlay.reason === 'won' ? '关卡完成'
      : overlay.reason === 'stuck' ? '无可消除组合'
        : overlay.reason === 'time' ? '时间到'
          : '步数用尽';
  const stars = Number.isFinite(overlay.stars) ? overlay.stars : 0;
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
    { text: title, size: 0.085, weight: 700, color: OVERLAY_TITLE_COLOR, at: 0.14 },
    // 3.7 的三星：只在通关时画（失败局面 overlay.stars = 0）
    ...(stars > 0
      ? [{ text: '★'.repeat(stars) + '☆'.repeat(3 - stars), size: 0.1, weight: 700, color: OVERLAY_RECORD_COLOR, at: 0.3 }]
      : []),
    { text: '本局得分', size: 0.042, weight: 500, color: HUD_LABEL_COLOR, at: stars > 0 ? 0.46 : 0.36 },
    { text: String(overlay.score), size: 0.11, weight: 700, color: OVERLAY_TITLE_COLOR, at: stars > 0 ? 0.58 : 0.5 },
    {
      text: overlay.newRecord ? `新纪录！最高分 ${overlay.best}` : `最高分 ${overlay.best}`,
      size: 0.042,
      weight: 500,
      color: overlay.newRecord ? OVERLAY_RECORD_COLOR : HUD_LABEL_COLOR,
      at: stars > 0 ? 0.72 : 0.66
    }
  ];
  for (const line of lines) {
    ctx.font = `${line.weight} ${Math.round(field.side * line.size)}px ${FONT_STACK}`;
    ctx.fillStyle = line.color;
    ctx.fillText(line.text, cx, py + panelH * line.at);
  }

  // Step 12.2：通关后有「下一关」（最后一关除外），失败时是「重试」；两者都带「选关」
  const btnH = panelH * 0.17;
  const btnY = py + panelH * 0.78;
  const gap = panelW * 0.04;
  const primaryLabel = overlay.hasNext ? '下一关' : overlay.reason === 'won' ? '选择关卡' : '重试';
  const primaryW = panelW * 0.42;
  const primaryX = cx - primaryW - gap / 2;
  const drawButton = (x, y, w, h, label) => {
    roundRectPath(ctx, x, y, w, h, h * 0.32);
    ctx.fillStyle = BUTTON_BG;
    ctx.fill();
    ctx.font = `700 ${Math.round(field.side * 0.045)}px ${FONT_STACK}`;
    ctx.fillStyle = BUTTON_TEXT;
    ctx.fillText(label, x + w / 2, y + h / 2);
    return { x, y, w, h };
  };
  const primary = drawButton(primaryX, btnY, primaryW, btnH, primaryLabel);
  const select = drawButton(cx + gap / 2, btnY, primaryW, btnH, '选关');
  return { restartRect: primary, nextRect: overlay.hasNext ? primary : null, selectRect: select };
}

/**
 * 回放期间的 HUD 分数：逐层累加本层得分，并在最后一层之后补上「关卡级尾款」
 * （3.5 的剩余步数转化不在逐层明细里，v1.16 从 app.js 移到这里 —— 它是纯信息层推导）。
 */
export function hudScoreAt(playback, levelIndex) {
  if (!playback) return 0;
  let gained = 0;
  for (let i = 0; i <= levelIndex && i < playback.levelScores.length; i += 1) gained += playback.levelScores[i].gained;
  const tail = levelIndex >= playback.levelScores.length - 1 ? playback.tailBonus : 0;
  return playback.scoreBefore + gained + tail;
}

/**
 * 目标的一句话摘要（日志与结束面板用）：把 GoalSpec 说成人话。
 * 放在 hud.js 是因为它属于「信息层文案」—— 与 HUD 的目标进度显示同源，且 app.js 也复用它打日志（v1.16）。
 */
export function describeGoal(goal) {
  if (!goal) return '无目标';
  if (goal.type === 'score') return `分数达到 ${goal.target}`;
  if (goal.type === 'clearIce') return `消除 ${goal.target} 层冰块`;
  if (goal.type === 'collect') return `收集 ${formatTargets(goal.targets)}`;
  if (goal.type === 'fruit') return `收集 ${goal.target} 个水果`;   // 3.6 v1.18
  if (goal.type === 'pod') return `收集 ${goal.target} 个金豆荚`;    // 3.6 v1.18
  const parts = [];
  if (goal.score !== undefined) parts.push(`分数 ${goal.score}`);
  if (goal.clearIce !== undefined) parts.push(`冰块 ${goal.clearIce} 层`);
  if (goal.collect) parts.push(`收集 ${formatTargets(goal.collect)}`);
  return `混合目标（${parts.join(' + ')}）`;
}

const formatTargets = (targets) => Object.entries(targets ?? {}).map(([name, need]) => `${name}×${need}`).join(' + ');

/** 圆角矩形路径（就地一份，理由见文件头：避免与 render.js 形成模块环）。 */
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
