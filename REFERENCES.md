# REFERENCES.md — 外部参考项目与逐 Step 借鉴方案

> 版本：v1.0.3
> 关联文件：`AGENTS.md`、`ROADMAP.md`、`DECISIONS.md`
> 用途：记录 GitHub 参考项目、逐 Step 借鉴方案、借鉴原则与许可证合规。
> 维护方式：Agent 提议，用户批准后更新；每次具体借鉴记入 `DECISIONS.md`。

---

## 0. 使用规则

1. 本文件只记录「参考什么」与「如何借鉴」，不复制外部代码。
2. 所有借鉴必须用 `AGENTS.md` 4.1 定义的 `cell[][]` 数据结构重新实现。
3. 每次具体借鉴后，在 `DECISIONS.md` 追加一条记录。
4. 参考项目若含许可证，必须在本文件第 5 节登记。
5. 本文件与 `ROADMAP.md` 的 Step 编号保持一一对应。

---

## 1. 参考项目总览

以下「许可证」「活跃度」列于 2026-09-18 通过 GitHub REST API 实测（`/repos/{owner}/{repo}` 的 `license.spdx_id`、`stargazers_count`、`pushed_at`），非推测值。

| 项目 | 技术栈 | 匹配度 | 主要用途 | 许可证（实测） | 星标 | 最后推送 |
|---|---|---|---|---|---|---|
| rola2005-klc/game2 | HTML5 + Vanilla JS | ★★★★★ | 第一、二阶段主力参考 | **无**（无 LICENSE 文件） | 0 | 2026-04-27 |
| jooyouss/candy-crush | HTML5 Canvas + ES6+ | ★★★★☆ | 特殊元素系统参考 | **MIT** | 0 | 2025-03-20 |
| bazhanius/match-3-game | HTML5 Canvas + Vanilla JS | ★★★★☆ | 道具/时间关参考 | **MIT** | 7 | 2025-09-06 |
| AlexKutepov/Match3-algorithm-TS-Cocos-creator | Cocos Creator + TS | ★★★☆☆ | 算法架构参考 | **无** | 21 | 2026-01-21 |
| Ghamza-Jd/Match-3 | Cocos Creator + JS | ★★★☆☆ | 死局预防算法参考 | **MIT** | 10 | 2019-05-28 |
| k8scat/kaixinxiaoxiaole | Cocos Creator | ★★☆☆☆ | 多平台/障碍物参考 | **MIT** | 0 | 2023-11-15 |
| rembound/Match-3-Game-HTML5 | HTML5 Canvas + JS | ★★★☆☆ | 基础三消实现参考（bazhanius 的上游） | **MIT** | 80 | 2023-01-13 |

> **已移除的项目**：原表内的 `youssefmyh/Match3Algorithm`（C++）于 2026-09-18 核实返回 **HTTP 404**，仓库已不存在（或已改名），不能作为参考。其「匹配算法思路」一项由 `AlexKutepov/Match3-algorithm-TS-Cocos-creator` 承担，见 D008。
>
> **v1.0.1 新增（见 §6 更新记录）**：`rembound/Match-3-Game-HTML5` 由 bazhanius 的 README 显式声明为其基础（"Based on rembound/Match-3-Game-HTML5"），MIT、80 星、34KB 单文件风格，是理解基础三消实现的最短路径，登记为补充参考。

---

## 2. 逐 Step 借鉴方案

### 2.1 第一阶段：核心可玩版（Step 0–6）

#### Step 0：项目骨架初始化

**核心参考**：`rola2005-klc/game2`

**借鉴要点**：game2 文件组织精简——`index.html`、`style.css`、`game.js`（纯逻辑）、`app.js`（渲染交互）、`test.js`（棋盘引擎测试）、`mobile-ui.test.js`（移动端 UX 静态检查），共 7 个文件（2026-09-18 实测仓库文件清单）。与 `AGENTS.md` 2.2 节目录高度一致，只是 game2 把逻辑集中在一个 `game.js` 中，本项目拆得更细。

**适配建议**：不照搬 game2 的单文件逻辑结构。借鉴其测试组织方式——`test.js` 直接跑断言，不依赖测试框架。本项目在 `tests/assert.js` 中实现类似的极简断言工具（并扩展为「断言 + 用例注册表 + 自动发现入口」，见 D005）。

#### Step 1：棋盘渲染

**核心参考**：`rola2005-klc/game2` + `bazhanius/match-3-game`

**借鉴要点**：
- game2 的 `app.js` 负责渲染与玩家交互，`style.css` 是响应式移动 UI。观察其 Canvas 尺寸与 `devicePixelRatio` 的结合方式，以及 `touch-action: none` 禁止滚动。
- bazhanius 强调 Mobile first，用 Material Icons 作为方块图标（属外部字体资源，本项目**不采用**，改用 Canvas 程序化绘制，见 D009）。

**适配建议**：本项目要求 `app.js` 只做 Canvas 绘制。若 game2 用 DOM 渲染，只借鉴尺寸计算与事件处理；Canvas 绘制方式参考 bazhanius。

#### Step 2：触摸交换 + 匹配检测

**核心参考**：`rola2005-klc/game2`（主力）+ `AlexKutepov/Match3-algorithm-TS-Cocos-creator`（进阶）

**借鉴要点**：
- game2 完整实现相邻交换、无效移动拒绝、3+ 自动匹配。
- game2 的 `game.js` 是纯逻辑函数，职责与 `board.js` + `match.js` 一致。
- AlexKutepov 的匹配检测器实现单次遍历完成匹配检测（O(n²) 内），可作为性能优化思路。

> **核实状态**：AlexKutepov 仓库存在性、星标、许可证已实测；其**内部文件级细节（`MatchDetector.ts` / `BoardPhysics.ts` 的类名与签名）本轮未能复核**——GitHub API 触发限流，`/find/` 页面为前端动态渲染无法抓取。进入 Step 2 前必须重读源码确认，不得按本文件描述直接假设。

**适配建议**：先用 game2 思路实现正确版本，再用 AlexKutepov 思路优化。关键差异：game2 可能用简单数字数组，本项目必须用 `cell` 对象。不复制数据结构，只借鉴算法流程。

#### Step 3：消除、下落、填充、级联

**核心参考**：`rola2005-klc/game2`（主力）+ `AlexKutepov/Match3-algorithm-TS-Cocos-creator`（下落系统）

**借鉴要点**：
- game2 实现下落/填充级联。
- AlexKutepov 的物理模块负责重力、下落与对角移动，并使用对象池复用实例。

**适配建议**：参考 game2 的级联流程；参考 AlexKutepov 如何返回移动轨迹供动画使用。若 Step 5 发现频繁创建/销毁 cell 导致卡顿，可引入对象池（本项目约定：`board.js` 的 `applyGravity` 返回 `MoveRecord[]`，见 `AGENTS.md` 4.2）。

#### Step 4：计分、步数、游戏结束、最高分

**核心参考**：`rola2005-klc/game2`（主力）+ `bazhanius/match-3-game`（辅助）

**借鉴要点**：
- game2 实现 30 步限制与本地最高分，用 `localStorage` 保存。
- bazhanius 额外提供 Timer（2 分钟倒计时）与 L10n（俄/英双语）。

**适配建议**：计分逻辑在 `score.js` 独立实现，遵循 `AGENTS.md` 3.5 倍数表。最高分键名使用本项目定义的 `xxl_best_score`（已收进 `config.js` 的 `STORAGE_KEYS`）。

#### Step 5：移动端适配 + 动画打磨

**核心参考**：`rola2005-klc/game2`

**借鉴要点**：game2 移动端 UX 三特性——Mobile-first UI、Haptic feedback hooks、Reduced-motion support。对应 `AGENTS.md` 5.3 与 5.4。

**适配建议**：
- 借鉴触摸事件处理方式。
- 引入 `prefers-reduced-motion` 媒体查询，在 `ANIMATION_CONFIG` 增加 `reducedMotion` 开关（已预置在 `config.js`，见 D006）。
- 参考 `mobile-ui.test.js` 的断言项设计本项目移动端验证清单。

#### Step 6：死局检测与重排

**核心参考**：`Ghamza-Jd/Match-3`（主力）+ `AlexKutepov/Match3-algorithm-TS-Cocos-creator`（辅助）

**借鉴要点**：
- Ghamza-Jd 实现「Always have moves」算法，事前预防死局（其 README 原话："Prevention is shall reap better than cure"）。
- AlexKutepov 提供 Auto-Shuffle，事后重排。

**适配建议**：先按 `AGENTS.md` 3.8 实现事后重排。若测试中发现重排频繁触发，再考虑引入 Ghamza-Jd 的预防算法。参考 AlexKutepov 的触发时机：每次消除 + 填充完成后立即检测。

---

### 2.2 第二阶段：开心消消乐核心机制（Step 7–12）

#### Step 7–10：特殊元素系统（条纹、包装、魔力鸟、组合效果）

**核心参考**：`jooyouss/candy-crush`

**借鉴要点**：candy-crush 实现四种特殊糖果——条纹（整行/列，含 `candy-striped-h.svg` / `candy-striped-v.svg` 两个方向的独立素材）、包装、炸弹（大范围）、彩虹（任意颜色）。技术栈（HTML5 Canvas + ES6+）与本项目完全一致，仓库结构（2026-09-18 实测）：`js/main.js`、`js/game.js`、`js/candies.js`、`js/ui.js`、`js/audio.js`、`js/animations.js`、`js/levels/levels.js`。

**适配映射**：

| 本项目 Step | candy-crush 模块 | 借鉴要点 |
|---|---|---|
| Step 7（条纹） | 条纹糖果（h/v 两向） | 判断 4 连方向，生成对应方向条纹 |
| Step 8（包装） | 包装糖果 | 判断 L/T 型，计算 3×3 影响范围 |
| Step 9（魔力鸟） | 彩虹糖果 | 「匹配任意颜色」与全屏消除 |
| Step 10（组合） | 特殊糖果交互 | 两个特殊糖果相邻交换的组合效果 |

**关键差异提醒**：
- candy-crush 有 6 种基础 + 4 种特殊 = 10 种元素，本项目是 6 基础 + 3 特殊 = 9 种。**不直接复制元素枚举**。
- candy-crush 的「炸弹糖果」在本项目宪法 3.2 中无对应类型。如需可映射为「魔力鸟 + 魔力鸟」，或作为第三阶段扩展（须先改宪法）。
- candy-crush 用 SVG 素材，本项目为**零素材 + 程序化绘制**（见 D009），只借鉴逻辑，不借鉴资源方案。

**Step 7 落地记录（2026-09-19）**：

- **借的是视觉语言，不是素材**：条纹糖果 = 底糖果 + 3 条平行白色条纹 + 方向箭头（对应 candy-crush 的 `candy-striped-h.svg` / `candy-striped-v.svg` 两种朝向所表达的信息）；棋盘新增「底盘格位槽」也取自同类作品的棋盘网格语言。落地方式全部为 Canvas 程序化绘制（`candy.js`），**未复制任何图片/音频**（D009、D020）。
- **明确不采纳其条纹方向口径**：candy-crush 的 `getBonusType` 是 `isHorizontal → LineVertical`（横 4 连生成**竖**条纹）。本项目宪法 3.2 规定「条纹方向 = 匹配方向」（横 4 连 → 横条纹 → 消整行），故此处**以本宪法为准**，参考实现只用于确认「条纹需要一个可辨识的朝向信息」，见 D014 第 1 条与 D020 第 4 条。
- 参考实现中「特殊糖果生成后立即计入消除」的实现方式在本项目被**明令排除**：4.3.8 与 D020 第 1 条要求「本层新生成的特殊元素本层不参与消除」，否则会出现「刚做出来就消失」。

**Step 8 落地记录（2026-09-20）**：

- **L/T 识别沿用本项目算法**：本项目在 Step 2 就已用「连续段扫描 + 并查集合并 + 交叉点是否位于两条臂端点」判定 `L`/`T`（`match.js` 的 `detectMatchShape`），本步只把 `L`/`T` 映射为 `wrapped`，**没有改判定规则**，也没有移植参考实现的簇判定代码。
- **3×3 影响范围与边界裁剪自行实现**（`special.js` 的 `wrappedCells`）：内部 9 格、贴边 6 格、角落 4 格；与参考实现「爆炸范围受棋盘约束」的结论一致，但不复制其代码。
- **外观同样零搬运**：包装糖果用「径向渐变光晕 + 四角白结」表达（对应同类作品里包装糖果的光晕与糖果纸造型），全部 Canvas 程序化绘制（`candy.js` 的 `paintWrappedCandy`），未使用其 SVG/PNG，也未使用阴影模糊。

#### Step 11：冰块与雪块

**核心参考**：`k8scat/kaixinxiaoxiaole`（主力）+ `AlexKutepov/Match3-algorithm-TS-Cocos-creator`（辅助）

**借鉴要点**：
- k8scat 项目标题即「开心消消乐」，规则设计与 `AGENTS.md` 3.4 高度一致（MIT 许可，仓库 301 个文件，含 `LICENSE`）。
- AlexKutepov 支持 Blocked Cells 与 Void Areas，可参考其棋盘表示。

**适配建议**：核心逻辑自行实现。参考 k8scat 的层数显示思路；参考 AlexKutepov 的 Blocked Cells 棋盘表示。层数上限集中定义在 `config.js` 的 `OBSTACLE_CONFIG`（D006）。

#### Step 12：关卡目标与三星评分

**核心参考**：`k8scat/kaixinxiaoxiaole`（主力）+ `jooyouss/candy-crush`（辅助）

**借鉴要点**：candy-crush 实现关卡系统与进度保存（`js/levels/levels.js`）；k8scat 有超 2000 个关卡。

**适配建议**：`LevelConfig` 数据结构已由 `AGENTS.md` 4.4 定义。参考 candy-crush 的关卡进度保存与三星阈值配置。

---

### 2.3 第三阶段：扩展机制（Step 13–18）

#### Step 13：更多障碍物（藤蔓、巧克力）

**核心参考**：`k8scat/kaixinxiaoxiaole`

参考其藤蔓实现思路（被困动物不能交换、可被相邻消除波及），用本项目 `obstacles.js` 重新实现。

#### Step 14：关卡类型（水果关、时间关、金豆荚关）

**核心参考**：`bazhanius/match-3-game`（主力）+ `Ghamza-Jd/Match-3`（辅助）

**借鉴要点**：bazhanius 实现 Timer 与 L10n，是时间关的基础；还实现 Show Move、Delete Color、Delete Area、Any Color 四种 booster。

**适配建议**：
- 时间关参考 Timer，将「步数消耗」替换为「时间倒计时」。
- 金豆荚关宪法未定义，**需自行设计「护送」机制，并先记入 `DECISIONS.md`**（宪法 0.6）。
- Show Move 可对应宪法中的死局提示功能。

#### Step 15：道具系统

**核心参考**：`bazhanius/match-3-game`

**对应关系**：

| 本项目道具 | bazhanius 对应 | 借鉴要点 |
|---|---|---|
| 刷新 | Show Move / 自动重排 | 15 秒无操作自动提示机制 |
| 加五步 | （无直接对应） | 简单实现 |
| 小木锤 | Delete Area | 消除周围区域 |

**适配建议**：道具数量在 `level.js` 管理，`localStorage` 交互在 `app.js` 处理。

#### Step 16：音效与震动反馈

**核心参考**：`jooyouss/candy-crush`（主力）+ `k8scat/kaixinxiaoxiaole`（辅助）

candy-crush 实测含 8 个音频文件：`click.mp3`、`swap.mp3`、`invalid.mp3`、`match.mp3`、`special.mp3`、`level-complete.mp3`、`game-over.mp3`、`background-music.mp3`。

**适配建议**：用 `HTMLAudioElement` 或 `AudioContext`，不引入音频库；震动用 `navigator.vibrate`，注意兼容性检测。参考 candy-crush 的音效分类设计触发点。**音效素材须为自制或已授权，MIT 只覆盖代码不自动覆盖素材**，使用前在第 5 节登记。

#### Step 17：粒子动画

**核心参考**：`jooyouss/candy-crush`（`js/animations.js`）

**适配建议**：粒子系统核心是管理一组有生命周期的粒子对象（位置、速度、透明度、颜色），每帧更新并绘制。用数组 + `requestAnimationFrame` 即可，不引入粒子引擎。性能红线见本文件 §3.5。

#### Step 18：Capacitor 打包为 Android/iOS

**核心参考**：Capacitor 官方文档（环境、配置、工作流、Android、iOS）+ Android Developers / Apple Developer 的签名与分发文档。

**辅助参考**：`k8scat/kaixinxiaoxiaole`。它已适配 H5、微信小游戏、Android 原生与 iOS 原生；但其 Cocos 构建系统与本项目的 Vanilla JS + Canvas 架构不同，只借鉴“多端验收维度”，不复制构建配置、原生工程或资源。

> **当前边界（2026-09-20）**：本项目仍处于 Step 7 功能冻结后的 Bug Audit 与文档治理阶段；没有安装 Capacitor、没有 `android/` / `ios/` 原生工程、没有 APK/AAB/IPA 产物。本节是将来执行 Step 18 时的参考与检查清单，不能据此声称已支持 Android/iOS 或已可发布。具体门禁、证据等级和执行顺序以 `ROADMAP.md` §0.1–§0.3 与 Step 18 为准。

**适配总原则**：Capacitor 是一次经用户批准的“打包例外”，不是现在对“零依赖、无构建工具”开发约束的追溯性否定。只有本阶段功能冻结、回归证据完整后，才允许安装 CLI/runtime、创建原生目录或改动 `package.json`。游戏规则模块、`cell[][]` 契约与 Web 开发入口不因打包而重写。

##### Step 18.1：环境与功能冻结

- 重读 Capacitor 当期官方环境文档，记录实际安装的 Node、Capacitor CLI/runtime、Android Studio、Android SDK、Xcode 与原生依赖版本；不要把本文档中的版本描述当作永久值。
- 在 Windows 上只规划/构建 Android；iOS 原生构建、签名和设备调试必须转到 macOS + Xcode 环境。没有 macOS 证据时，iOS 只能记为“未验证”。
- 先冻结 Web 版本：记录 Git commit/tag、`node tests/run-all.js` 结果、浏览器回归结果、已知 P2/P3 和明确延期的 Step 8–17 能力。P0/P1 未清零时不进入打包。

##### Step 18.2：Web 资源暂存与 Capacitor 初始化

- Capacitor 的 `webDir` 必须指向包含最终 `index.html` 的 Web 资源目录。当前项目无构建工具，未来须在实施时明确一个可重复生成的暂存目录（建议 `www/`），而不是让原生工程直接引用工作区根目录。
- 暂存流程要验证：`index.html`、全部 ES Module、`styles.css`、`assets/`、图标/启动图和版本清单均存在；不带入 `_build/`、测试夹具、密钥、调试日志或开发说明。
- 选择 `capacitor.config.json` 还是 `capacitor.config.ts`、应用 ID、显示名称、`webDir` 和原生目录跟踪策略前，先把拟定值写入 `DECISIONS.md`；应用 ID 一旦进入商店不可随意更换。
- 首次执行 `cap init`、添加平台与同步前，保留根目录 Web 版的可运行验证。不同 CLI 版本的 `npx cap init` 可能要求交互式填写；执行时必须记录 CLI 版本、完整命令、实际填写的 `appName`/`appId`/`webDir` 和生成的配置文件，不能只记“已初始化”。Capacitor 侧的 `sync` 是将已准备好的 Web 资源和原生依赖同步到平台工程，不替代 Web 版测试。

##### Step 18.3：WebView 与原生能力兼容

- 在真实 WebView 中单独回归 ES Module 加载、Canvas DPR/方向变化、安全区、`localStorage` 的首次启动/重启/升级/卸载后行为、触摸滑动、输入锁、音频解锁与减少动效。桌面浏览器通过不能推导为 WebView 通过。
- 若未来 Step 16 或原生包装引入 `navigator.vibrate`，只能以能力检测后的降级路径运行；若确有原生触感需求，再参考 Capacitor Haptics 插件，并把新增依赖、权限和隐私影响写入决策与隐私清单。当前未验证的震动能力不得写成已有功能。
- Android 返回键、前后台恢复等属于原生行为，只有引入并验证 Capacitor App 插件后才处理；不得把浏览器 `history` 行为当作原生返回键已验收。
- 每项结论都要标出平台、设备/模拟器、系统与 WebView/WKWebView 版本、构建号、复现步骤和结果。失败时保留日志/截图/最小复现，不以“某个 API 看起来可用”替代完整一局验证。

##### Step 18.4：Android Debug 交付

- 按当期官方文档准备 Android Studio 与 SDK，添加 Android 平台、同步暂存资源、用 Android Studio 或 CLI 打开并运行 Debug 包。模拟器和真机都要记录；模拟器通过不能代替至少一台真机。
- Debug 包的验收至少包含：冷启动、连续完整一局、无效交换回退、暂停/恢复、旋转或横屏提示、返回键策略、离线启动、升级覆盖安装与卸载重装后的存档边界。
- Debug 安装成功只表示 Android 冒烟通过，不能称为签名发布包、商店就绪或 iOS 已支持。

##### Step 18.5：iOS 构建与验证

- 在 macOS 上按当期官方文档配置 Xcode、命令行工具和所需的 iOS 依赖管理方式，添加/同步 iOS 平台并通过 Xcode 打开工作区。
- 分开记录 iOS 模拟器与真机的结果：模拟器用于基础启动与布局，真机必须复核触摸、音频、低电量/后台恢复、安全区、存档和安装包行为。
- iOS 构建、证书、描述文件、TestFlight 上传与 App Store 审核是独立证据；Windows 上的 Web 或 Android 结果不得迁移为 iOS 结论。

##### Step 18.6：Release 签名、版本与合规

- 版本策略至少区分对用户可见的版本号、平台构建号、Git commit/tag 与 Web 资源清单；每次候选包都能追溯到唯一源码提交和唯一暂存资源。
- Android Release 需要保护 keystore / upload key，绝不提交密码、私钥或签名文件；Google Play 的 App Bundle、签名和上传流程以 Android Developers 当期文档为准。
- iOS Release 需要匹配的 Bundle ID、签名能力、构建号与 App Store Connect 记录；上传、TestFlight 与提交审核以 Apple Developer 当期文档为准。
- 发布前建立最小合规包：应用名称/图标/启动图来源、第三方依赖与许可证、隐私说明、数据存储说明、联网/权限说明、年龄分级素材与商店截图。零素材策略不自动覆盖原生图标、启动图或商店素材的权利来源。

##### Step 18.7：发布候选回归、归档与回滚

- 对每个 Release Candidate 分平台执行安装、升级覆盖、冷启动、完整一局、暂停恢复、离线启动、清存档/卸载重装、权限拒绝和崩溃/控制台检查；结论按 `ROADMAP.md` §0.2 的证据等级登记。
- 归档内容至少包括：源码 commit/tag、锁定依赖版本、`capacitor.config.*`、Web 资源清单/校验值、产物文件名与校验值、设备矩阵、测试记录、签名保管位置说明（不记录秘密）、已知风险与回滚步骤。
- 回滚优先恢复到上一个已签名且已验证的版本；不要在商店/原生工程内临时手改规则逻辑来“救火”。若原生壳配置需要热修，必须能重建同一 Web 暂存资源并重新走最小回归。

---

## 3. 通用借鉴原则

### 3.1 文件对应关系

| 本项目模块 | 参考项目对应文件 | 借鉴重点 |
|---|---|---|
| `board.js` | game2 的 `game.js`、AlexKutepov 的棋盘/物理模块 | 棋盘数据结构、交换验证、重力下落 |
| `match.js` | game2 的 `game.js`、AlexKutepov 的匹配检测器 | 匹配检测算法、形状识别 |
| `special.js` | candy-crush 的 `js/candies.js`、`js/game.js` | 特殊元素生成与触发 |
| `score.js` | game2 的 `game.js` | 计分逻辑 |
| `obstacles.js` | k8scat 的 Cocos 脚本、AlexKutepov 的 Blocked Cells | 障碍物层数管理 |
| `level.js` | candy-crush 的 `js/levels/levels.js`、bazhanius 的 Timer | 关卡目标与评分 |
| `app.js` | game2 的 `app.js` | Canvas 渲染与触摸交互 |
| `config.js` | 无直接参考 | 按 `AGENTS.md` 附录 B 自行定义 |

### 3.2 正确借鉴流程

1. **阅读**：打开参考项目对应文件，理解算法思路。
2. **画图**：画出算法流程或数据结构示意图。
3. **适配**：用本项目 `cell[][]` 重新实现，不复制变量名与函数签名。
4. **测试**：用 `tests/assert.js` 写断言，验证实现正确。
5. **记录**：在 `DECISIONS.md` 记录「参考了哪个项目的哪个思路，做了哪些适配」。

### 3.3 必须避免的陷阱

- 不复制数据结构：game2 可能用数字数组，AlexKutepov 用 Cocos Node，本项目必须用 `cell[][]`。
- 不复制渲染方式：game2 可能用 DOM，bazhanius 用 Canvas 2D，AlexKutepov 用 Cocos Sprite。
- 不复制命名：candy-crush 的「炸弹糖果」在本项目宪法中无对应。
- 不复制素材：candy-crush 的 SVG/MP3、bazhanius 的 Material Icons 均**不引入**（D009）。
- 不跳过测试：每次参考实现后跑 `node tests/run-all.js`。
- 不直接粘贴大段外部代码。
- **不采信本文件对参考项目内部细节的描述**：文件级结论（类名、函数签名、模块职责）必须在使用前重新打开源码确认，本文件的「核实状态」标注即为此目的。

### 3.4 参考优先级矩阵

| ROADMAP Step | 核心参考 | 辅助参考 | 参考强度 |
|---|---|---|---|
| Step 0 | game2 | — | 结构参考 |
| Step 1 | game2 | bazhanius | 渲染参考 |
| Step 2 | game2 | AlexKutepov | 算法参考 |
| Step 3 | game2 | AlexKutepov | 流程参考 |
| Step 4 | game2 | bazhanius | 计分参考 |
| Step 5 | game2 | — | UX 参考 |
| Step 6 | Ghamza-Jd | AlexKutepov | 算法参考 |
| Step 7 | candy-crush | — | 实现参考 |
| Step 8 | candy-crush | — | 实现参考 |
| Step 9 | candy-crush | — | 实现参考 |
| Step 10 | candy-crush | — | 实现参考 |
| Step 11 | k8scat | AlexKutepov | 规则参考 |
| Step 12 | k8scat | candy-crush | 规则参考 |
| Step 13 | k8scat | — | 规则参考 |
| Step 14 | bazhanius | Ghamza-Jd | 功能参考 |
| Step 15 | bazhanius | — | 实现参考 |
| Step 16 | candy-crush | k8scat | 功能参考 |
| Step 17 | candy-crush | — | 实现参考 |
| Step 18 | Capacitor 官方文档 + Android/Apple 官方发布文档 | k8scat | 流程与发布参考 |

### 3.5 性能红线（Canvas 2D 实测结论）

**测量环境（必须如实标注，避免后续 Step 误判）**：以下数字来自**同系列另一项目**（PvZ 风格塔防）的实测记录，不是本项目实测：Chrome + Canvas 2D，逻辑分辨率 1000×630，`devicePixelRatio = 2`（后备缓冲 2000×1260），**峰值 26 个活动实体**，量法为 `performance.now()` 包住 60 帧渲染循环取平均（预算 16.6ms）。本项目（8×8 = 64 格棋盘、RTX 4060 + Windows 11）**尚未复现**，Step 5 / Step 17 必须以本机实测为准；引用本条只作为「方向性红线」，不作为本项目的性能基线。

`AGENTS.md` 15 节给了帧率与耗时预算，这里补三条**实测**出来的实现红线，Step 5 / Step 17 必须遵守：

1. **禁止在每帧绘制路径里使用 `ctx.shadowBlur`。** 同场景同实体数、只换光晕实现方式的对照：

   | 光晕实现方式 | 单帧耗时 |
   |---|---|
   | `shadowBlur`（敌人眼睛光晕 + 3 处 HUD） | **6.53 ms** |
   | 径向渐变 + 双层描边（视觉上无差别） | **2.18 ms** |

   **3 倍**代价换一个肉眼看不出的差异。更糟的是 6.53ms 时 CDP 的 `Page.captureScreenshot` 开始**超时**，表现为「浏览器工具坏了」，实为渲染太慢。替代：`createRadialGradient` 画光晕、双层描边画选中态、`strokeText` + `fillText` 画发光文字。
    - 验证命令：Windows PowerShell 用 `(Select-String -LiteralPath app.js,render.js,candy.js,hud.js,timeline.js -Pattern 'shadowBlur' -AllMatches | ForEach-Object Matches | Measure-Object).Count`；POSIX 环境可用 `rg -n 'shadowBlur' app.js render.js candy.js hud.js timeline.js`（无匹配即通过）。目标均为 **0**。
2. **静态图层烘焙到离屏 canvas 后 `drawImage` 复用**，不要每帧重画背景；保留 10-15% 的动态元素（呼吸、摇摆）避免画面发死。
3. **修饰性描边透明度 ≤ 0.1。** 网格线、分隔线在 alpha 0.26 时会变成画面主体（看起来像布纹），0.09 才是纹理。

以上三条在 Step 5 / Step 17 的「测试」项里各有一条对应的验证动作，不是可选项。

---

## 4. 参考文档索引

| 文档 | 地址 | 用途 |
|---|---|---|
| game2 源码 | https://github.com/rola2005-klc/game2 | 第一、二阶段主力参考 |
| game2 在线试玩 | https://rola2005-klc.github.io/game2/ | 交互体验参考（实测可访问，标题「星星糖果消消乐」，30 步、点击交换、分数/最高分均已实现） |
| candy-crush 源码 | https://github.com/jooyouss/candy-crush | 特殊元素系统参考 |
| candy-crush 在线试玩 | https://jooyouss.github.io/candy-crush/ | 交互体验参考 |
| bazhanius 源码 | https://github.com/bazhanius/match-3-game | 道具/时间关参考 |
| bazhanius 在线试玩 | https://bazhanius.github.io/match-3-game/ | 交互体验参考（实测可访问，8×8 棋盘、2 分钟计时、4 种 booster 文案齐备） |
| rembound 源码 | https://github.com/rembound/Match-3-Game-HTML5 | 基础三消实现参考（bazhanius 上游） |
| AlexKutepov 源码 | https://github.com/AlexKutepov/Match3-algorithm-TS-Cocos-creator | 算法架构参考 |
| AlexKutepov 在线试玩 | https://alexkutepov.github.io/Match3-algorithm-TS-Cocos-creator/ | 交互体验参考 |
| Ghamza-Jd 源码 | https://github.com/Ghamza-Jd/Match-3 | 死局预防算法参考 |
| Ghamza-Jd 轻量试玩 | http://hamzajadid.me/match3.html | 交互体验参考（HTML5 Canvas 版） |
| k8scat 源码 | https://github.com/k8scat/kaixinxiaoxiaole | 多平台/障碍物参考 |
| Capacitor 环境准备 | https://capacitorjs.com/docs/getting-started/environment-setup | Step 18 的 Node、Android 与 macOS/Xcode 前置条件；执行时重读当期版本要求 |
| Capacitor 配置 | https://capacitorjs.com/docs/config | `appId`、`appName`、`webDir` 与原生配置边界 |
| Capacitor 工作流 | https://capacitorjs.com/docs/basics/workflow | Web 资源构建/同步、平台运行、原生 IDE 与产物构建流程 |
| Capacitor Android | https://capacitorjs.com/docs/android | Android 平台添加、运行、Android Studio 与设备/模拟器验证 |
| Capacitor iOS | https://capacitorjs.com/docs/ios | iOS 平台添加、Xcode 工作区与设备/模拟器验证 |
| Capacitor App API | https://capacitorjs.com/docs/apis/app | 前后台、恢复和 Android 返回键的原生行为参考；未引入前不实施 |
| Capacitor Haptics API | https://capacitorjs.com/docs/apis/haptics | Step 16/18 的原生触感候选；仅在用户批准依赖后使用 |
| Android 应用签名 | https://developer.android.com/studio/publish/app-signing | Android APK/AAB、keystore/upload key 与 Play App Signing 流程 |
| App Store Connect 上传构建 | https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds | iOS 构建上传、处理、TestFlight/审核前的官方流程 |

---

## 5. 许可证与合规

核实时间：2026-09-18。核实方式：GitHub REST API `GET /repos/{owner}/{repo}` 的 `license` 字段（来自仓库内 LICENSE 文件的自动识别）。

| 项目 | 许可证 | 是否允许参考思路 | 是否允许复制代码 | 备注 |
|---|---|---|---|---|
| rola2005-klc/game2 | 无（无 LICENSE 文件） | 是 | **否** | 无许可证 = 保留全部权利，只能读思路 |
| jooyouss/candy-crush | MIT | 是 | 是（需保留版权声明） | 仓库内有 `LICENSE`；素材（SVG/MP3）授权状态另行确认 |
| bazhanius/match-3-game | MIT | 是 | 是（需保留版权声明） | 仓库内有 `LICENSE`；其 Material Icons 属 Google 字体资源，另有授权条款 |
| AlexKutepov/Match3-algorithm-TS-Cocos-creator | 无 | 是 | **否** | 无许可证 |
| Ghamza-Jd/Match-3 | MIT | 是 | 是（需保留版权声明） | 仓库内有 `LICENSE` |
| k8scat/kaixinxiaoxiaole | MIT | 是 | 是（需保留版权声明） | 仓库内有 `LICENSE`；内含 Cocos 美术资源，授权状态另行确认 |
| rembound/Match-3-Game-HTML5 | MIT | 是 | 是（需保留版权声明） | 基础实现，34KB 量级 |

规则：
- 无许可证项目：只可阅读思路，**不可复制代码**，连变量名/函数结构都不照抄。
- MIT / Apache 2.0：可复制代码，但必须保留原版权声明，并在 `DECISIONS.md` 记录。
- GPL 类：谨慎，避免传染本项目许可证。当前参考列表中无 GPL 项目。
- 任何复制行为必须在本文件与 `DECISIONS.md` 双重登记。
- **本项目当前策略：全部参考项目一律只借鉴思路，不复制代码**，因此上述许可证差异目前不产生实际义务；该策略一旦改变，必须重新审视本表。
- Step 18 的 Capacitor CLI/runtime、原生工程模板与插件不是“参考项目代码复制”，但它们会成为发布依赖：实施时必须锁定实际版本、核对其许可证/通知义务，并把新增依赖、权限和资源来源写入交付清单。
- 签名文件、keystore、证书、描述文件、Apple/Google 账号令牌和商店上传凭据不得进入 Git、`www/` 暂存目录、截图或 `PROGRESS.md`。日志只记录安全的保管位置说明与是否完成校验。

---

## 6. 更新记录

| 版本 | 日期 | 修改人 | 原因 | 影响范围 |
|---|---|---|---|---|
| v1.0 | 2026-09-18 | 用户 | 初始版本（结构与逐 Step 借鉴方案） | 全文 |
| v1.0.1 | 2026-09-18 | Agent | 填入实测许可证/星标/最后推送；移除已失效的 `youssefmyh/Match3Algorithm`（404）；补充 `rembound/Match-3-Game-HTML5`；新增 §3.5 性能红线；标注未复核的文件级结论 | §1、§2、§3.5、§4、§5、§6 |
| v1.0.2 | 2026-09-18 | Agent | §3.5 补测量环境与对照表（数据来源为另一项目，非本项目实测）；§1「新增」措辞明确版本号 | §1、§3.5、§6 |
| v1.0.3 | 2026-09-20 | Agent | 扩充 Step 18 为 18.1–18.7 的官方参考与执行检查：功能冻结、Web 资源暂存、WebView/原生兼容、Android/iOS、签名合规、发布回滚；补 Windows 兼容的性能检查命令 | §2.3 Step 18、§3.4、§3.5、§4、§5、§6 |
