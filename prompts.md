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
证据：<ROADMAP.md §0.2 的 L0-L6 等级；已验证 / 仅代码审查 / 未验证>
失败与回滚：<失败时保留什么证据、回到哪个提交或子步骤>
禁止：<本步明确不允许做的事>
前置依赖：<ROADMAP 中的 Step 编号>
参考：<REFERENCES.md 中的章节编号>
```

## 会话开始提示词

```text
请先阅读 AGENTS.md、ROADMAP.md、REFERENCES.md、PROGRESS.md 和 DECISIONS.md。
然后按 ROADMAP.md 的 <Step N> 开始。
若准备开始新的玩法 Step，先执行 ROADMAP.md §0.1 扩展前 Bug Audit Gate；未得出“允许进入下一 Step”结论前不得新增玩法。
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

## 扩展前 Bug Audit（当前 Step 7 后先用）

```text
任务：在不推进下一玩法 Step 的前提下，审计当前项目的功能缺陷、回归风险和未验证边界
范围：默认只读；允许运行现有测试、静态一致性脚本、本地 HTTP 冒烟和可用的移动模拟。除非用户明确要求修复，否则不改游戏代码、不新增 Step 8 功能。
开始前：阅读 AGENTS.md、ROADMAP.md §0.1/§0.2、当前 Step、REFERENCES.md 对应章节、PROGRESS.md 最近记录和 DECISIONS.md。
执行：
1. 运行 node tests/run-all.js，记录测试文件数、用例数、断言数、失败数和退出码。
2. 若 _build/consistency_check.py 存在则运行，区分静态检查与行为验证。
3. 经 HTTP 服务器验证首屏、有效/无效交换、消除/下落/补充、步数、结束面板和最高分；没有实际浏览器/设备时写未验证。
4. 检查窄屏触摸、滚动/缩放、安全区、输入锁、性能、控制台错误和本地存储边界；不得用桌面鼠标结果冒充真机触摸。
5. 对每个发现写 P0/P1/P2/P3、复现步骤、影响、证据等级、建议修复和回归用例。
输出：先列 findings（按严重度），再列未验证项、通过项和“是否允许进入下一 Step”的明确结论。
门禁：P0/P1 未清零、自动回归失败或浏览器冒烟失败时结论必须为“不允许进入下一 Step”。P2/P3 必须登记负责项和回归计划。
证据：严格按 ROADMAP.md §0.2 标注 L0-L6，并使用“已验证 / 仅代码审查 / 未验证”。
归档：在 PROGRESS.md 写审计命令、环境、结果和未验证边界；规则或范围变化才写 DECISIONS.md。
禁止：以分析或文档结论替代实际测试；在审计期间顺手实现包装糖果、魔力鸟、组合或其他后续 Step。
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

**Step 7 实战记录（2026-09-19）**

- 实际改动比模板多两个文件：`timeline.js`（新生成的条纹不该播消除动画，否则会「一闪就没了」）与 `render.js` + **新增 `candy.js`**（用户批准的糖果外观方案；外观代码让 `render.js` 超 300 行，按 §6 拆出并升宪法 v1.7）。`config.js` 最终**未改动**。
- 生成位置口径：4 连的条纹落在 `cells[floor((n−1)/2)]`（第 2 格），方向 = 匹配方向（D014 第 1 条，与参考实现相反）。
- 计分接入：本层「生成或触发」条纹时按 3.5 取 1.5 倍；组合倍数留给 Step 10。
- 提示词里最好直接写清「本层新生成的特殊元素本层不参与消除」，否则极易写成「生成即被消掉」。

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

**Step 8 实战记录（2026-09-20）**

- `detectMatchShape` 从 Step 2 起就能返回 `L`/`T`，所以本步只补了「映射 + 落点 + 影响范围 + 外观」；`config.js`、`board.js`、`timeline.js` **一行未改** —— Step 7 的 `spawnKeys`、链式清除与消除阶段补丁机制对包装糖果直接通用。这验证了 Step 7 把那套机制做成「类型无关」是对的。
- 落点口径：L/T 取**交叉点**（两条臂的公共格），与 4 连取「靠近中间」并列写进 D023；验收项「边界裁剪」用内部 9 / 边 6 / 角 4 三档断言。
- 老用例会因此失效，必须同步更新：`tests/integration.test.js` 里 Step 3 的「L 型消 5 格」要改成「消 4 格 + 交叉点留下包装糖果」，否则会把正确实现判成回归。
- 验证脚本的两个高频坑（本轮各踩一次）：① 近白像素判据会被左上高光污染，要按**象限**区分；② 消除键/消除阶段补丁都在**重力前**坐标空间，任何「生成格在不在消除键里」的断言都必须用 `cell.id` 而不是坐标。


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

**Step 9 实战记录（2026-09-20）**

- 本步的难点不是「怎么消」，而是 **4.2 的签名表达不了 3.2 的这条规则**：`getSpecialAffectedCells(board, r, c, type, direction)` 没有「目标颜色」参数，board 层也没有「清除任意坐标集合」的能力。开工前先向用户确认了三条口径并升宪法 **v1.11**（三条纯追加：`special.getMagicTargets`、`board.resolveCascades` 的 `initialClear`、`game.resolveBoard` 透传；两条行为口径：保留颜色但不参与同色匹配、交换消耗 1 步且拒绝空格）。**先定契约再写码**，避免了「先实现后改宪法」。
- 提示词里最好直接写清「魔力鸟不参与同色匹配（4.3.14）」。否则很容易顺手让它按颜色参与匹配 —— 那会让它被普通 3 连意外引爆，与「交换才触发」的口径冲突。
- 三个落点规则现在集中在一处：4 连取靠近中间、L/T 取交叉点、5 连直线取正中；`createSpecial` 里一眼能看全。
- **验证脚本必须同步升级模型**：Step 9 起盘面会出现魔力鸟，而旧套件（`verify-step6`、`audit-gate-step8`）仍把魔力鸟当可匹配格，于是把游戏正确拒绝的交换当成应当有效，整局循环提前耗尽、6 项失败。修法是给脚本补「魔力鸟识别（白心 + 多色相环）+ 匹配排除 + 优先走魔力鸟交换」。**产品代码一行未改** —— 脚本模型落后就改脚本。
- 顺带记录一个 3.8 的口径后果：`hasPossibleMove` 只认「交换后形成三消」，所以「只剩魔力鸟可换」会被判死局并重排；这是 3.8 字面定义的结果，本步不开例外（见 D025 第 6 条）。

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

**Step 10 实战记录（2026-09-20）**

- **本步不需要新的契约**：`resolveSpecialCombo(board, a, b)` 已在 Step 9 一并登记进 4.2（v1.11），`board.resolveCascades` 的 `initialClear` 也已存在。因此提示词里应该直接写明「复用既有入口、不新增契约」，避免又发明一套组合专用的清除 API。三步走完全够用：`trySwap` 判两侧都是特效 → `resolveSpecialCombo` 就地改造并返回清除坐标 → `resolveBoard(state, { initialClear })` 清除并级联。
- **最关键的一条设计是「`initialClear` 同时充当激活种子」**：3.3 里「条纹 + 魔力鸟 → 全屏同色变条纹并立即触发」「包装 + 魔力鸟 → 同色变包装并触发」「条纹 + 包装 → 区域内再触发包装爆炸」这三条**都不需要单独实现爆炸** —— 把要变形的格子就地改好、把坐标丢进清除集合，board 的种子链会让它们各自按 4.3.8 展开。若按直觉在 `special.js` 里再写一套二次爆炸，就会出现两处口径，迟早漂移。
- **倍数不要杜撰**：3.5 的倍数表只有四种「双方同类」组合；「条纹/包装 + 魔力鸟」按已有的魔力鸟 2.5 回落。`COMBO_TYPES` 的值与 `SCORE_CONFIG.specialMultipliers` 的组合键同名，`multiplierForLevel` 直接查表即可。
- **`multiplierForLevel` 只能看到逐层被清除的格子，看不到组合的双方是谁**，所以「级联里恰好清掉 2 颗条纹」会被记为 3.0、「恰好清掉 1 颗魔力鸟 + 别的特效」会按 2.5。规则顺序（magic ≥ 2 → 包+包 → 条+包 → 条+条）刻意对齐 3.3 的优先级；这条简化必须写进 `PROGRESS.md`/`DECISIONS.md`，不要假装精确。
- **组合会瞬间制造大面积空洞**（条+条 15 格、魔+魔 64 格），值得单独做一条渲染取证：真实 `render.js` 在空洞格不画糖果、不抛异常。
- **验证脚本的缓存问题（P3-6）**：`index.html` 用 `?t=` 破缓存，但它 `import` 的 `./special.js` 等子资源不带查询串，浏览器会复用上一轮的旧模块 —— 第一次跑 Step 10 验证时页面里根本没有 `COMBO_TYPES`，等于**拿旧代码当新代码验**。所有验证脚本此后都要加 `Network.enable` + `Network.setCacheDisabled({ cacheDisabled: true })`。
- **时序类脚本要把输入锁算进去**：组合/长级联会让动画变长，`verify-step5` 的「越界滑动」用例因为触摸落在输入锁窗口内而丢日志。修法是等动画结束后重投（输入锁吞掉的触摸不算产品缺陷）。

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
任务：按 ROADMAP.md Step 18.<子步骤>，把功能冻结的 H5 游戏包装为 Capacitor 原生应用候选版本
开始前：
1. 阅读 AGENTS.md、ROADMAP.md §0.1/§0.2/Step 18、REFERENCES.md Step 18、PROGRESS.md、DECISIONS.md。
2. 先完成扩展前 Bug Audit Gate，固定源码 commit/tag，确认 P0/P1 为 0。
3. 取得用户对 Capacitor 依赖、平台工程和最小资源准备脚本的明确批准；没有批准不得修改 package.json 的零依赖状态。
4. 盘点实际可用环境。Windows 上不得把 iOS 写成“已验证”；缺少 Android Studio/SDK、macOS/Xcode 或真机时必须写未验证。
子步骤：
- 18.1：环境盘点、功能冻结、包标识/版本/回滚点与本地存储预期。
- 18.2：可重复生成 webDir、Capacitor 初始化、add/sync 平台，验证 ESM 和资源路径。
- 18.3：WebView 的触摸、生命周期、safe-area、localStorage、音频、震动和离线降级边界。
- 18.4：Android Debug 构建、安装、真机冒烟和日志证据。
- 18.5：macOS/Xcode 上 iOS 模拟器/真机构建与验证；模拟器不能替代真实触摸或震动。
- 18.6：Release 版本映射、图标/启动图、最小权限、隐私说明、签名隔离和签名产物。
- 18.7：新安装、覆盖升级、卸载重装、前后台、离线启动、平台矩阵、归档和回滚演练。
范围：只改当前子步骤列出的文档、资源准备、Capacitor 配置或平台工程；不得推进 Step 8-17 玩法，不得在 Android/iOS 原生层重写匹配、计分、棋盘或关卡规则。
验收：逐项满足 ROADMAP 对应子步骤的门禁；分别报告“生成工程”“Debug 已安装”“真机已验证”“Release 已签名”“商店准备”的实际状态，不能混用。
测试：每次 Web 资源变更均执行 npm run stage:web -> 资源检查 -> npx cap sync <platform> -> 平台复测；若 Web 逻辑改动，额外运行 node tests/run-all.js 和浏览器冒烟。
证据：按 ROADMAP.md §0.2 标注 L0-L6；记录命令、工具版本、commit/tag、包标识、版本、设备、产物文件名、校验值、日志位置和未验证边界。
安全：密钥、证书、Provisioning Profile、签名密码和真实账号信息均不得进入 Git、终端回显、截图或 PROGRESS.md；只使用受控凭据存储。
失败与回滚：保留完整构建错误和最小复现；修复后从 stage:web 和 cap sync 重新开始。发布阻塞缺陷回到固定 tag/commit，修复并递增构建版本后生成新包，不覆盖旧 Release 包。
禁止：用 Android 结果替代 iOS 结论；把 Debug APK 说成正式发布包；为了适配原生而改变已验收游戏规则语义；未记录许可来源就加入图标、启动图或其他素材。
前置依赖：Step 17、ROADMAP.md §0.1 Gate；iOS 还依赖可用的 macOS/Xcode 环境
参考：REFERENCES.md §2.3 Step 18.1-18.7
```

---

## 待补充的提示词模式（随实战积累）

- 报错排查类：`先把完整的报错栈贴出来` + 复现步骤 + 预期行为 三段式。
- 规则争议类：引用宪法条款号，不允许 Agent 自行发明规则。
- 性能排查类：先给测量命令（DevTools Performance / `performance.now()` 循环），再给结论。
