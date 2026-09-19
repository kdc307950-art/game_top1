# prompts — 复用提示词库

> 关联文件：`AGENTS.md` 第 12 节、`ROADMAP.md` 各 Step
> 使用方式：每个 Step 完成后，将其提示词存档于此。新的记录追加在末尾。

---

## 通用提示词模板

```text
任务：实现 <功能名>
范围：只允许修改 <文件列表>
验收：<可观察的行为>
测试：<运行哪些测试 / 手动验证步骤>
禁止：<本步明确不允许做的事>
前置依赖：<ROADMAP 中的 Step 编号>
参考：<REFERENCES.md 中的章节编号>
```

## 会话开始提示词

```text
请先阅读 AGENTS.md、ROADMAP.md、REFERENCES.md、PROGRESS.md 和 DECISIONS.md。
然后按 ROADMAP.md 的 <Step N> 开始。
只允许修改该 Step“范围”内列出的文件。
先给计划，再改代码，最后告诉我如何验证。
```

## 会话结束提示词

```text
请在 PROGRESS.md 追加本次会话记录，包含：
- 完成项
- 验证方式
- 遗留问题
- 下一步建议

如本次出现非显然决策，请在 DECISIONS.md 追加记录。
```

## 环境提示词（本项目专用）

```text
本项目源码是 ES Module，必须经 http 打开，不能双击 index.html：
  python -m http.server 8000     → http://localhost:8000/
手机真机：同一 Wi-Fi 下访问 http://<电脑局域网IP>:8000/
测试：node tests/run-all.js（依赖 package.json 的 "type": "module"）
```

---

## Step 0：项目骨架初始化

```text
任务：初始化项目骨架
范围：按 AGENTS.md 2.2 创建目录与空占位文件；只允许完善 Step 0 列出的骨架、治理文档与测试入口
验收：目录结构与宪法一致；CONFIG 字段齐全；assertEqual/assertTrue 可用；git init 后完成 [step0] 初始提交
测试：python -m http.server 8000 打开 localhost:8000 无控制台报错；运行 run-all.js
禁止：写任何业务逻辑，引入任何依赖
前置依赖：无
参考：REFERENCES.md §2.1 Step 0
```

## Step 1：棋盘渲染

```text
任务：在 Canvas 上渲染 8×8 消消乐棋盘
范围：只允许修改 index.html、styles.css、app.js
验收：手机浏览器可见正方形棋盘，无滚动无缩放，颜色从 CONFIG.COLOR_COUNT 随机取
测试：python -m http.server 8000 + Chrome DevTools 模拟手机，手动打开验证
禁止：实现触摸交互，修改任何逻辑模块，硬编码颜色数
```

## Step 2：触摸交换 + 匹配检测

```text
任务：实现滑动交换与 3 连匹配检测
范围：允许改 app.js、board.js、match.js、config.js 及对应测试
验收：交换无效回退，3/4/5 连与 L/T 型 shape 被正确识别
测试：node tests/board.test.js 与 node tests/match.test.js 全绿；手机手动滑动验证
禁止：实现消除动画与计分；引入 special.js 逻辑
```

## Step 3：消除、下落、填充、级联

```text
任务：实现消除、下落、填充、级联
范围：允许改 board.js、match.js、app.js、config.js 及对应测试
验收：消除后下落填充，级联检测直到无新匹配，级联层数可追踪
测试：node tests/integration.test.js 断言最终棋盘与级联层数；手动观察动画
禁止：实现特殊元素生成、计分、步数消耗、死局检测与重排
```

## Step 4：计分、步数、游戏结束、最高分

```text
任务：实现基础计分、步数、游戏结束、最高分
范围：允许改 score.js、level.js、game.js、app.js、config.js 及对应测试
验收：有效交换扣步，连消加分正确，游戏结束用页面内 UI，最高分存 localStorage
测试：node tests/score.test.js、level.test.js、game.test.js 全绿；手动玩一局
禁止：特殊元素计分、三星评分、逻辑模块操作 localStorage
```

## Step 5：移动端适配 + 动画打磨

```text
任务：移动端适配与动画打磨
范围：允许改 app.js、styles.css、config.js 的 ANIMATION_CONFIG
验收：动画时长均取自配置，先更新状态再播动画，色盲友好，安全区适配，帧率达标
测试：真机跑一局，Chrome DevTools 性能面板检查帧率与色盲模拟
禁止：引入动画库，改动规则逻辑
```

## Step 6：死局检测与重排

```text
任务：实现死局检测与重排
范围：允许改 board.js、game.js、app.js、config.js 及 board.test.js
验收：每次消除后检测，无可行交换则提示并重排，重排满足宪法 3.8，不消耗步数
测试：node tests/board.test.js 断言死局与重排；手动观察
禁止：改变障碍物布局，重排消耗步数，无限重试
```

## Step 7：条纹糖果

```text
任务：实现条纹糖果（4 连生成，激活消除整行/列）
范围：允许改 special.js、match.js、board.js、game.js、app.js、config.js、tests/special.test.js
验收：横向 4 连→横向条纹，纵向 4 连→纵向条纹，激活后整行/整列清除
测试：node tests/special.test.js 断言生成坐标与受影响坐标集合
禁止：实现包装糖果与魔力鸟
前置依赖：Step 6
参考：REFERENCES.md §2.2 Step 7
```

## Step 8：包装糖果

```text
任务：实现包装糖果（L/T 型 5 连生成，激活消除 3×3）
范围：允许改 special.js、match.js、board.js、game.js、app.js、config.js、tests/special.test.js
验收：L 型与 T 型均识别为 wrapped，激活影响 3×3 且边界裁剪
测试：node tests/special.test.js 断言形状识别与影响范围
禁止：实现魔力鸟
前置依赖：Step 7
参考：REFERENCES.md §2.2 Step 8
```

## Step 9：魔力鸟

```text
任务：实现魔力鸟（5 连直线生成，交换后消除全屏同色）
范围：允许改 special.js、match.js、board.js、game.js、app.js、config.js、tests/special.test.js
验收：5 连直线生成 magic；与普通色块交换清除全屏该色；不能与空格交换
测试：node tests/special.test.js 断言生成与全屏清除坐标集合
禁止：实现特殊元素组合
前置依赖：Step 8
参考：REFERENCES.md §2.2 Step 9
```

## Step 10：特殊元素组合

```text
任务：实现六种特殊元素组合效果
范围：允许改 special.js、game.js、app.js、config.js、tests/special.test.js
验收：六种组合按宪法 3.3 生效，优先级按 3.3 排序，组合触发扣 1 步
测试：node tests/special.test.js 逐一断言六种组合的影响坐标集合
禁止：新增宪法未列出的组合类型
前置依赖：Step 9
参考：REFERENCES.md §2.2 Step 10
```

## Step 11：冰块与雪块

```text
任务：实现冰块与雪块障碍物
范围：允许改 obstacles.js、board.js、match.js、special.js、game.js、app.js、config.js、tests/obstacles.test.js
验收：冰块 1-3 层、雪块 1-5 层，不参与匹配，影响下落与交换，被波及减 1 层，得分按宪法 3.5
测试：node tests/obstacles.test.js 断言层数减少与得分
禁止：实现藤蔓、巧克力
前置依赖：Step 10
参考：REFERENCES.md §2.2 Step 11
```

## Step 12：关卡目标与三星评分

```text
任务：实现关卡目标与三星评分
范围：允许改 level.js、game.js、app.js、config.js、tests/level.test.js
验收：支持 score/collect/clearIce/mixed 四种目标，步数用尽未达成即失败，三星仅取决于分数，剩余步数按 3.5 转化
测试：node tests/level.test.js 断言四种目标判定与三星计算
禁止：实现道具系统
前置依赖：Step 11
参考：REFERENCES.md §2.2 Step 12
```

## Step 13：更多障碍物（藤蔓、巧克力）

```text
任务：实现藤蔓与巧克力障碍物
范围：允许改 obstacles.js、board.js、app.js、tests/obstacles.test.js
验收：藤蔓中动物不能交换但可被相邻波及；巧克力被相邻消除或特效波及即消除；重排不改变障碍物布局
测试：node tests/obstacles.test.js 断言交换限制与波及消除
禁止：实现绳索（宪法未定义规则）
前置依赖：Step 12
参考：REFERENCES.md §2.3 Step 13
```

## Step 14：关卡类型

```text
任务：实现水果关、时间关、金豆荚关三种关卡类型
范围：允许改 level.js、game.js、app.js、config.js、tests/level.test.js
验收：水果关收集水果；时间关以时间替代步数；金豆荚落到指定位置即通关
测试：node tests/level.test.js 断言三种关卡通关判定
禁止：修改已验收的关卡目标语义（金豆荚机制宪法未定义，需先在 DECISIONS.md 记录设计）
前置依赖：Step 13
参考：REFERENCES.md §2.3 Step 14
```

## Step 15：道具系统

```text
任务：实现刷新、加五步、小木锤三种道具
范围：允许改 level.js、game.js、app.js、config.js、tests/level.test.js
验收：刷新不消耗步数重排；加五步 +5；小木锤消除单格；道具数量持久化在 app.js 层完成
测试：node tests/level.test.js 断言三种道具效果
禁止：逻辑模块直接操作 localStorage
前置依赖：Step 14
参考：REFERENCES.md §2.3 Step 15
```

## Step 16：音效与震动反馈

```text
任务：接入音效与震动反馈
范围：允许改 app.js、styles.css、config.js，新增 assets/ 音频
验收：消除/连消/特效/结束各一处音效，支持静音开关并持久化，支持 navigator.vibrate 且有兼容性检测
测试：真机验证；首次用户手势后才初始化 AudioContext
禁止：引入音频库；使用未授权素材
前置依赖：Step 15
参考：REFERENCES.md §2.3 Step 16
```

## Step 17：粒子动画与视觉打磨

```text
任务：为消除、特效、组合效果加入粒子动画
范围：允许改 app.js、styles.css、config.js
验收：粒子不影响帧率预算（60fps，低端机 ≥30fps）；特效有独特粒子表现
测试：DevTools Performance 实测单帧耗时；确认每帧路径无 shadowBlur
禁止：引入粒子引擎；每帧滥用 shadowBlur
前置依赖：Step 16
参考：REFERENCES.md §2.3 Step 17
```

## Step 18：Capacitor 打包

```text
任务：用 Capacitor 打包为 Android/iOS
范围：新增 capacitor.config.json、android/、ios/，不改逻辑模块
验收：Android APK 可安装运行，iOS 模拟器可运行，真机触摸/音效/震动正常
测试：真机安装联调，确认 WebView 内 ESM、localStorage、vibrate 正常
禁止：为适配原生改动游戏逻辑语义
前置依赖：Step 17
参考：REFERENCES.md §2.3 Step 18
```

---

## 待补充的提示词模式（随实战积累）

- 报错排查类：`先把完整的报错栈贴出来` + 复现步骤 + 预期行为 三段式。
- 规则争议类：引用宪法条款号，不允许 Agent 自行发明规则。
- 性能排查类：先给测量命令（DevTools Performance / `performance.now()` 循环），再给结论。
