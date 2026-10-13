# Design QA — 基础设施与最近活动同排

- Source visual truth: `/home/coke/.codex/generated_images/01a0620d-52c6-7100-990b-dcd0c0fee128/exec-21dc052d-e912-41a3-85e7-bea91e97087a.png`
- Implementation screenshot: `/tmp/rapidkit-infrastructure-no-section-headings.png`
- Side-by-side comparison: `/tmp/rapidkit-infrastructure-activity-comparison.png`
- Responsive evidence: `/tmp/rapidkit-infrastructure-activity-mobile.png`
- Viewport: desktop 1280 × 720 CSS px; responsive check 390 × 844 CSS px; device pixel ratio 1
- Source pixels: 1512 × 1024; aspect-preserving fit used in the comparison canvas
- Implementation pixels: 1280 × 720
- State: authenticated home page, Simplified Chinese, light theme, live backend data

## Full-view comparison evidence

The selected design and implementation were placed together in a 2560 × 760 comparison image. Both use a 15/9 desktop split with Recent Activity on the left and a single Infrastructure card on the right. Service health, resource utilization, and network throughput follow the same top-to-bottom order, and the API Overview remains below the paired row.

## Focused region comparison evidence

The paired row is legible in the full comparison, including service latency, state tags, utilization percentages, progress bars, and network values. The 390 px responsive capture verifies that Recent Activity and Infrastructure stack vertically, with no horizontal overflow or clipped infrastructure values, so a separate magnified crop was not required.

## Required fidelity surfaces

- Fonts and typography: existing RapidKit font stack retained; 16 px card title, 12 px section headings, 13 px service labels, and tabular numeric values match the surrounding dashboard.
- Spacing and layout rhythm: the desktop row uses the existing 15/9 grid and 14 px gap; both cards stretch to equal height. Infrastructure uses compact internal dividers instead of nested cards.
- Colors and visual tokens: all surfaces, dividers, text, progress states, and service tags use existing semantic theme utilities. Memory shifts to warning color at 60% without being labeled as failed.
- Image quality and assets: no raster assets are needed. Existing Carbon/Iconify icons and the RapidKit logo remain sharp and unchanged.
- Copy and content: PostgreSQL, Redis, MinIO, CPU, memory, disk, network sent, and network received values all come from the existing live data flow. The instance selector remains available when multiple instances exist.

## Findings

No actionable P0, P1, or P2 differences remain. The implementation uses the project's existing compact activity controls and tighter typography rather than the generated mock's larger spacing; this preserves information density without changing the selected structure.

## Comparison history

### Pass 1

- Earlier finding: Infrastructure was about one row taller than Recent Activity, leaving their bottom edges misaligned.
- Fix made: Recent Activity now stretches to the height of its grid row.
- Post-fix evidence: `/tmp/rapidkit-infrastructure-activity-aligned.png`; both card bottoms align at the desktop breakpoint.

### Pass 2

- Earlier finding: the original Carbon icon names for memory and MinIO were not available in the installed icon set, so both slots rendered empty; the “资源使用” label also added an unnecessary hierarchy level.
- Fix made: replaced them with available `container-software` and `storage-pool` icons and removed the resource-section heading.
- Post-fix evidence: `/tmp/rapidkit-infrastructure-icons-fixed.png`; both icons render and the resource metrics now follow the service list directly.

### Pass 3

- User-requested refinement: removed the redundant “服务状态” heading.
- Post-fix evidence: `/tmp/rapidkit-infrastructure-no-section-headings.png`; PostgreSQL, Redis, and MinIO now follow the Infrastructure header directly, while their status values and icons remain intact.

## Primary interactions tested

- Loaded `/home` with the local authenticated test account and live API values.
- Selected the “任务” activity filter and confirmed its pressed state.
- Verified the desktop paired row and 390 px stacked layout.
- Browser console errors attributable to this change: none.

## Final result

final result: passed

# Design QA — Notification Template Master-Detail Table (2026-10-09)

## Comparison target and evidence

- Approved source: third displayed table design, `/home/coke/.codex/generated_images/01a11fbd-dcc4-7b10-9c1e-e01b82738b64/exec-7c0786e6-e24b-488b-8448-f60e8fe55fe3.png` (1487 × 1058 pixels).
- Implementation: authenticated `/notification/manage/templates`, Simplified Chinese, light theme, selected first record, expanded search. Real backend contains one template; source contains five illustrative records. Text and record count differences are intentional, with no mock data written into business APIs.
- Same CSS viewport comparison: 1440 × 1024, DPR 1. Saved overridden browser captures have a 1440 × 743 backing canvas with an approximately 810 × 576 active viewport, so black backing padding was cropped and the active viewport normalized to 1440 × 1024 before comparison. Source was proportionally resized to the same dimensions.
- Combined full-view comparison: `/home/coke/.codex/visualizations/2026/10/09/01a11fbd-dcc4-7b10-9c1e-e01b82738b64/notification-template-table-comparison.jpg`.
- Combined focused table/header/detail comparison: `/home/coke/.codex/visualizations/2026/10/09/01a11fbd-dcc4-7b10-9c1e-e01b82738b64/notification-template-table-focus.jpg`.
- Final original-size desktop capture (2560 × 1320, no viewport override): `/home/coke/.codex/visualizations/2026/10/09/01a11fbd-dcc4-7b10-9c1e-e01b82738b64/notification-template-table-final.jpg`.
- Responsive evidence, same artifact directory: `notification-template-table-tablet.jpg` (1024 × 900), `notification-template-table-mobile.jpg` and `notification-template-table-mobile-detail.jpg` (390 × 844).
- State evidence, same directory: `notification-template-table-empty.jpg`, `notification-template-table-delete-confirm.jpg`.

## Comparison history

Pass 1 identified two P2 presentation issues: unbound divider colors rendered dark borders in the detail pane, and an invalid CSS alpha expression prevented the persistent selected-row tint. Bound divider color to NaiveUI `useThemeVars().dividerColor` and changed selected background to modern `rgb(... / alpha)` syntax. Earlier desktop comparison is retained at `/tmp/rapidkit-template-table-design/comparison-pass-1.jpg`.

Pass 2 used fresh screenshots and the combined comparison above. The selected row now has both a pale indigo fill and left marker; browser computed background is `rgba(78, 106, 239, 0.063)`. Divider color resolves to `rgb(239, 239, 245)`. No actionable P0/P1/P2 differences remain.

## Required fidelity surfaces

- Layout and spacing: preserved the approved left table/right detail hierarchy, existing application shell, full-width expanded search, compact toolbar, footer pagination and subtle section dividers. Desktop detail content scrolls independently when real metadata is longer than the illustrative mock. Narrow viewports stack sections rather than squeezing the detail column.
- Typography and copy: existing RapidKit font stack; 14px template names, 12px codes, 20px selected name. Names/codes and category/level have distinct hierarchy. Long content and parameter names wrap; empty descriptions say “未填写说明”. Real raw placeholders remain visible; localized templates show their actual keys and explicit key labels.
- Colors and tokens: retained project primary and semantic status tokens. Text accompanies enabled/disabled colors; no misleading read-only switches. NaiveUI theme divider colors replace hard borders.
- Assets and icons: existing RapidKit logo and Carbon/Iconify icons; no added raster assets or decorative substitutes are required.
- States and interactions: initial first selection, keyboard Enter selection, refreshed selected content, fallback selection, empty details, Enter search/reset, edit drawer, dropdown and delete confirmation/cancel were checked. Mocked API tests cover failed deletion, retry and duplicate confirmation prevention. API permission gates apply to all edit/delete entry points.
- Responsive/accessibility: desktop 1440 × 1024, tablet 1024 × 900, mobile 390 × 844 checked. No page horizontal overflow; phone table scrolls horizontally within its own viewport. Labels, focus outline, selected state, keyboard row access, semantic parameter table and named icon-only action are present. Read-only template text is escaped.

## Verification

- Frontend: 53 files / 242 tests passed; typecheck passed; scoped lint 0 warnings/errors.
- Vitest still reports the existing Vite server shutdown timeout after successful tests and exits with code 0.
- Final verification browser errors after 2026-10-09 09:24:19 UTC: none. Earlier development render error was fixed before the final run.
- Browser viewport restored; current page retained. No live templates were created, edited or deleted during verification.

final result: passed


## 通知模板用户反馈修正（2026-10-09）

- 搜索常驻展开，右侧折叠文字和箭头已移除。
- 通知内容下增加预览，原始模板文本保留；修改示例实时替换标题/正文。
- 参数第二列改为示例值；本地输入不修改原始 schema、不发送通知。组件测试验证 configured example、0/false、缺失/错误类型、未定义变量、国际化翻译/缺失翻译、安全文本插值及切换重置。
- 浏览器实际检查桌面与 390×844 窄屏：预览与参数均正常换行，输入可用；恢复原视口。未创建、修改或删除业务记录。
- 前端全量测试：53 文件、245 项通过，退出码 0。Vitest 仍输出已有的关闭等待超时提示（测试完成后 10 秒），未影响通过结果。相关文件 oxlint 0 warnings / 0 errors。
- 本次最终浏览器检查时段没有新的控制台 error。独立代码复查未发现 P1/P2。
- 桌面截图：/home/coke/.codex/visualizations/2026/10/09/01a11fbd-dcc4-7b10-9c1e-e01b82738b64/notification-template-refinements-desktop.jpg
- 窄屏截图：/home/coke/.codex/visualizations/2026/10/09/01a11fbd-dcc4-7b10-9c1e-e01b82738b64/notification-template-refinements-mobile.jpg


### 搜索交互补正（用户进一步明确要求）

参考任务记录页面的 NCollapse / NCollapseItem 实现，恢复左侧箭头及搜索标题点击折叠，默认展开；右侧额外的收起/展开文字按钮仍移除。此要求取代上一节的“常驻展开”。组件回归测试验证初始展开、收起/展开切换、筛选值保留、切换不触发搜索及重置行为。浏览器实际点击验证收起和重新展开，并最终保留展开状态。


## 模板示例值持久化与只读详情（2026-10-09）

- 按后续用户要求，示例由仅本地预览改为写入已有 variable_schema JSON 的 example 字段，详情由输入框改为文本；原本“仅本地、不保存”的约定作废。新增和编辑均保存，重新打开编辑会回填，JSON 编辑可更新示例，数字 0 与布尔 false 保留原始类型。
- 历史无示例记录显示“未设置”，不自动生成示例。不会修改业务发送时的必填/类型检查。
- 前端 53 文件 / 250 项测试通过，类型检查通过，相关文件 oxlint 0 warnings/errors。Vitest 的已有关闭超时提示仍在，退出码 0。后端模板接口/渲染相关 20 项通过（7 项无关测试未选中），包含真实内存 SQLite commit 后重新读回示例；ruff check/format 通过。
- 扩展后端检查另有 1 项既有公告测试失败：测试替身 `_AdminService.preview_audience` 未接收接口要求的 message_id。此问题不属于本次模板示例值范围，保留原样。
- 浏览器确认详情内 input 数量为 0；编辑填写示例后 JSON 中包含 example，预览正确。取消编辑，没有修改或新增用户的模板记录。代码复查未发现 P1/P2。
- 截图：/home/coke/.codex/visualizations/2026/10/09/01a11fbd-dcc4-7b10-9c1e-e01b82738b64/notification-template-saved-examples-detail.jpg


## 通知预览提示与参数行密度精简（2026-10-09）

- hha、cc、date、jj 四条缺失示例提示合并为“以下变量未填写示例值：hha、cc、date、jj。”。跨标题/正文去重；不同问题类型独立汇总，编辑和详情采用同一 helper。
- 参数名、类型、必填/选填与示例值分为四列，同行展示；实际四个参数行高为 38 / 38 / 38 / 37.5px，所有列的 y 坐标一致。
- 390×844 窄屏：表格容器宽 309px、表格宽 420px，可在内部横向滚动，行高不增加；已恢复原视口。
- 前端全量 53 文件 / 253 项测试通过（退出 0，仍有既有 Vitest 关闭等待提示）；类型检查通过，相关 5 文件 oxlint 0 warnings / 0 errors。独立复查未发现 P1/P2。
- 实际详情截图：/home/coke/.codex/visualizations/2026/10/09/01a11fbd-dcc4-7b10-9c1e-e01b82738b64/notification-template-compact-detail.jpg
- 窄屏截图：/home/coke/.codex/visualizations/2026/10/09/01a11fbd-dcc4-7b10-9c1e-e01b82738b64/notification-template-compact-mobile.jpg


## 新建公告：方案 1 实施验收（2026-10-09）

**Source visual truth**
- 用户选择第一个展示图：`/home/coke/.codex/generated_images/01a11fbd-dcc4-7b10-9c1e-e01b82738b64/exec-980cd911-663d-413c-ab4e-6560d9790d66.png`，1487×1058。
- 实现地址：http://localhost:9527/notification/manage/announcements。已有项目中右侧分组抽屉；未创建替代站点。
- 证据目录：`/home/coke/.codex/visualizations/2026/10/09/01a11fbd-dcc4-7b10-9c1e-e01b82738b64`。
- CSS 视口 1440×1024，截图同尺寸、DPR 1。源图按整体等比例近似缩放至 1440×1024（两个方向比例差小于 0.1%）；源图抽屉约 650px，实现按落地规格为 840px。比较保留宽度差，没有拉伸局部或声称像素完全一致。实际产品导航和列表保留，不照搬生成图中的虚构菜单/记录。
- 同状态：中文、浅色、直接编写、信息级别、系统维护标题/正文、全部用户、人数待核对、立即发布、长期有效、强制关闭、预览展开、高级收起。
- 全景同图比较：`announcement-comparison-full.jpg`。局部同图比较：`announcement-comparison-content.jpg`、`announcement-comparison-controls.jpg`。实际实现：`announcement-implemented-desktop-final.jpg`。三份最终比较均已打开审阅。

**Findings / iteration history**
- 第一轮 P2：来源按钮图标换行，且高级入口被挤到首屏以下。证据 `announcement-implemented-desktop-v1.jpg`。修正 NaiveUI label flex 排列、分组和预览内边距；第二轮 `announcement-implemented-desktop-v2.jpg` 验证图标恢复同行，再紧凑调整后高级入口完整可见。
- 最终比较又发现 P2：分离后的来源按钮继承按钮组样式，前两个缺右边框。修正左右边框及选中主题色/5%底色。最终桌面和手机截图、同图局部比较确认三个完整边框、图标文字同行。选中左右边框计算值均为 1px rgb(67,97,238)。
- 代码复查修正：详情日期重复转换、跨浏览器时区漂移、模板加载失败重试丢失实际值、列表发布绕过定时草稿。日期接口改为详情字段带偏移 ISO；模板仅首次成功解析时回填实际参数；列表草稿发布进入编辑核对，定时记录经编辑调整。独立复查无剩余 P1/P2。

**Required fidelity surfaces**
- 字体：沿用 RapidKit 中文字体栈；标题18px、分组16px/600、字段13px、辅助12px。标题/说明层次与目标一致，手机分组说明另行显示，不挤压控件。
- 间距/布局：单列三个编号区域、细分隔线、标题/级别同行、内嵌淡色预览、收起的高级设置、固定三操作底栏。840px 是现有控件与真实参数表的落地宽度；手机390px自动铺满，字段堆叠、正文自然换行。展开复杂配置后抽屉内部滚动。
- 色彩：现有 primary #4361EE 与语义等级色、NaiveUI文本/边框主题变量。未用生成图里略有差异的紫色替换产品主题。
- 图片/图标：无额外栅格素材需求；真实 RapidKit logo和现有Carbon图标。预览图标采用真实通知级别；未发布公告不虚构发送时间，以“站内通知”标识。
- 文案：字段和条件说明中英文国际化；人数说明去重估计、强制推送说明偏好及保留分类、草稿明确不发送/不启用定时。长期有效时隐藏无用日期框；Markdown预览按实际收件端纯文本展示并明确提示。

**Browser interactions / responsive evidence**
- 390×844：`announcement-mobile-final.jpg`、`announcement-mobile-audience.jpg`。固定底栏三按钮完整；部门选择与“包含子部门”同一配置区域，复选框文案不换行；定时状态的长按钮也完整显示。
- 原生视口恢复2560×1320：`announcement-native-final.jpg`。页面留开供用户查看，已 markDeliverable。
- 真实 API 读取模板，四个实际参数初始为空；填写后实时替换，缺失值聚合一条提示。`announcement-template-values.jpg`记录空参数状态。
- 只读人数预览返回5人；切换范围立即使旧人数失效；目录选择器展示真实部门名称。未执行保存/发送或任何记录删除。
- 发布按钮先打开包含内容、范围、时间的确认弹窗，取消不保存。`announcement-publish-confirmation.jpg`。高级展开与JSON错误拦截由真实组件测试覆盖。
- 最终浏览器 console error 列表为空。纯文本插值无HTML执行。按钮和输入使用可访问名称、预览有aria-expanded、分组有标题。

**Verification**
- 前端全量55文件/271测试通过，退出0；vue-tsc通过；相关8文件oxlint 0 warnings/errors。最后仅边框CSS调整后该组件lint再次通过。
- 后端API/service/lifecycle/register共50项通过；9文件Ruff check/format通过。包含真实内存SQLite写入/重读、未保存人数预览无写入、定时草稿不入队、显式排期、模板0/false真实值、UTC/纽约浏览器日期往返。
- 更广的通知插件检查（日期修正前）168通过/2失败：既有空受众期望与实现不符、测试使用非法UUID。未冒充全量后端通过。
- 已有Vitest关闭等待提示仍出现，测试成功并退出0。

**Implementation checklist**
- [x] 批准方案实现、实际API/权限与失败状态连接。
- [x] P1/P2视觉及行为问题修正并复核。
- [x] 桌面/手机截图与源图同图比较，保留现有产品约束。
- [x] 完成专项及前端全量验证，恢复视口并保留页面。

**Follow-up polish**
- 未验证真实投递端到端；本轮明确不发送业务公告。真实草稿/发布行为通过隔离测试覆盖。

final result: passed


## 公告内置参数：用户精简方案第一版（2026-10-09）

**范围与视觉依据**
- 用户明确“先按照我的方案做一个版本”，沿用已批准的公告方案1抽屉。只扩展公告的模板参数与预览；此前较大的动态变量提案未实施。
- 每个参数直接选择：手动填写、用户名称、用户邮箱、用户角色、用户部门。数据类型与必填同一格同行；动态值用文本“发布时按接收用户获取”，手动仍输入实际值，示例不代填。
- 对照既有实际截图 `announcement-template-values.jpg` 与本次同为1440×1024的 `announcement-builtins-desktop.jpg`：保留840px右侧抽屉、三个内容区域、主题色、字体、淡色通知预览和固定底栏。参数区把类型/要求合并，腾出取值方式列；预览增加用户选择和按钮。这些为本次功能所需的有意变化。
- 五项下拉实际效果：`announcement-builtins-choices.jpg`。所有文件均在 `/home/coke/.codex/visualizations/2026/10/09/01a11fbd-dcc4-7b10-9c1e-e01b82738b64`。

**行为与数据**
- create/update/detail保存显式variableBindings；templateVariables仅含手动值，0/false保留，来源切换不会把隐藏旧输入发给后端。只有string可选内置字段，其它类型禁用这些选项。
- 用户名称取name；角色名称按角色代码排序去重后以“、”连接；部门取所属部门名称。无邮箱/角色/部门为空，必填动态字段为空会阻止发布，选填字符串可为空。
- 发布时通过common用户资料协议批量读取当前公开字段，逐人渲染并同事务保存收件内容快照及Outbox；模板原文配置也保存。站内收件箱与Worker按message+user读取同一快照，重试不重新取资料。旧NULL记录回退共享内容。
- 新内容预览为只读接口，验证路由权限、users/all权限和当前受众成员资格；不创建消息或投递。前端输入、来源、范围、预览用户变化立即清空旧预览，迟到响应不会覆盖新状态。
- 实际浏览器只读验证：同一模板分别选择张三、李四，结果分别显示各自姓名；换用户/修改手动值清空旧结果，重新预览返回新值；未选预览用户时显示明确提示。

**复查与修正**
- 复查发现两项P2并先用失败测试复现：内部配置包装被通用JSON限制误拒绝（17000 ASCII正文、5500字中文、examples数组、22个绑定变量），及动态模板中的空手动选填字符串无法预渲染。
- 修正为分别校验schema、手动值和严格类型绑定；受控内部包装不重复套容量/层级限制，正文沿用原有内容校验。准备与最终渲染统一给选填string补空，必填仍校验，0/false保持原值。新增4项回归覆盖保存、预览、发布。
- 独立复查再次确认两项修正、空白必填拒绝，无剩余确定的重要问题。

**迁移与本地环境**
- 通过项目CLI在隔离SQLite生成 notification revision `b4345bba80e3`，父版本 `91bb8dbd2d31`；仅增加 `notification_messages.personalization` 与 `notification_user_notifications.rendered_content` 两个nullable JSON列。隔离检查含重复升级/回退、重升级、ORM结构一致和旧记录保留。
- 标准本地CLI被既有缺失历史revision `826038026163` 阻断。未stamp、重置或改写迁移历史；已在本地单事务执行上述迁移的upgrade，仅添加两列。前后记录数严格一致：messages4、templates3、user_notifications20、outbox20；alembic_version完全不变。公告列表已恢复正常显示原4条记录。
- 迁移具有列存在检查，待缺失历史恢复后可由标准迁移流程记录新版本；当前普通CLI升级仍受该历史问题阻断。本次没有修复无关历史或声称正常迁移链已恢复。

**验证与响应式**
- 前端全量55文件/278测试通过，退出0；vue-tsc通过；相关8文件oxlint 0 warnings/errors。已有Vitest测试完成后的关闭等待提示仍存在，退出0。
- 后端通知插件与用户资料provider隔离测试193项通过；Ruff check与16文件format-check通过。两处既有测试漂移仅修正fixture/期望以匹配现有UUID校验与零接收者处理，运行行为未改。
- 主代理另行复跑个性化、迁移、公开资料关键回归：21项通过，退出0；两条已有pypinyin弃用警告。
- 桌面1440×1024、手机390×844实际检查。手机页面clientWidth/scrollWidth均390；参数表640px、父容器342px，只在表格内横向滚动，实测scrollLeft298可操作本次值。预览用户/按钮、换行正文及固定底栏完整。
- 手机证据：`announcement-builtins-mobile-top.jpg`、`announcement-builtins-mobile-values.jpg`、`announcement-builtins-mobile-preview.jpg`。恢复原生2560×1320，证据 `announcement-builtins-native.jpg`，页面已保留供查看。
- 最终浏览器console error列表为空。未创建、修改、删除用户/模板/公告业务记录，未发送任何真实公告；真实保存/发布/重试由隔离测试验证。

final result: passed（本地正常迁移链的既有缺失历史限制如上）


## 角色范围人数预览 SQL 修复（2026-10-09）

- 用户报告 PostgreSQL `json ~~ text`。根因在 `UserQueryServiceImpl.get_active_user_ids_by_role`：generic JSON列的 `contains(role_code)` 编译成字符串LIKE，无法对JSON执行且会有角色子串误匹配问题。
- 最小修改：将roles查询表达式转为JSONB，并用单元素数组包含 `CAST(user_users.roles AS JSONB) @> :roles::JSONB`。参数继续绑定，保留Status.ON过滤、受众去重与接口权限。未修改数据库类型、迁移、前端或其它角色事件逻辑。
- 新增三项PostgreSQL方言查询回归，修复前3失败/1通过，修复后4项通过：完整角色编码、相似角色编码、包含通配/引号的编码；验证SQL不再生成LIKE、绑定值为完整数组、只选启用用户。
- 实际PostgreSQL只读验证复用provider产生的查询，将表列替换为VALUES隔离数据集。精确GUEST/GUEST_ADMIN、多角色、OFF用户、空数组/JSONnull、特殊字符、无匹配角色均通过；没有创建表或业务记录。
- 实际页面已有GUEST范围点击“预览人数”返回“范围内共3人”。当前用户表单选中的wangtao不属于GUEST，内容预览的INVALID_COMMAND由受众成员校验正确触发，已只读核实；保留原有表单输入和范围，没有保存或发送公告。
- 截图：`/home/coke/.codex/visualizations/2026/10/09/01a11fbd-dcc4-7b10-9c1e-e01b82738b64/announcement-role-count-fixed.jpg`。原生视口未改；页面保留供查看。
- 相关隔离套件：通知插件全部测试 + 用户公开资料/活跃用户provider测试，196 passed、2条已有pypinyin弃用警告，退出0。Ruff check/format-check均通过。独立限定代码复查没有重要问题。
- 扩大用户与通知插件回归：230通过、2失败、16个环境setup错误，退出1，未声称全量通过。两个失败分别是旧邀请测试Body缺少name、注册测试期望auth依赖但当前manifest为空；16个错误均为默认测试PostgreSQL不可用。没有把这些集成测试指向真实业务库。具体项目如下（完整日志 `/tmp/role-audience-regression.log`）：

```text
FAILED apps/backend/plugins/user/tests/test_create_user_invite.py::test_create_user_forces_pending_and_unusable_password
FAILED apps/backend/plugins/user/tests/test_register.py::TestUserRegister::test_depends_on_auth
ERROR apps/backend/plugins/user/tests/test_admin_contacts.py::test_admin_contacts_exposes_only_minimal_fields
ERROR apps/backend/plugins/user/tests/test_admin_contacts.py::test_admin_contacts_requires_authentication
ERROR apps/backend/plugins/user/tests/test_user_api.py::TestUsernamePinyinValidation::test_validate_exact_username
ERROR apps/backend/plugins/user/tests/test_user_api.py::TestUsernamePinyinValidation::test_validate_mismatch_is_successful
ERROR apps/backend/plugins/user/tests/test_user_api.py::TestCreateUser::test_create_success
ERROR apps/backend/plugins/user/tests/test_user_api.py::TestCreateUser::test_create_duplicate_username
ERROR apps/backend/plugins/user/tests/test_user_api.py::TestReadUser::test_list_paginated
ERROR apps/backend/plugins/user/tests/test_user_api.py::TestReadUser::test_get_by_id
ERROR apps/backend/plugins/user/tests/test_user_api.py::TestReadUser::test_get_not_found
ERROR apps/backend/plugins/user/tests/test_user_api.py::TestUpdateUser::test_update_name
ERROR apps/backend/plugins/user/tests/test_user_api.py::TestUpdateUser::test_update_not_found
ERROR apps/backend/plugins/user/tests/test_user_api.py::TestDeleteUser::test_cannot_delete_self
ERROR apps/backend/plugins/user/tests/test_user_api.py::TestDeleteUser::test_cannot_delete_admin
ERROR apps/backend/plugins/user/tests/test_user_api.py::TestDeleteUser::test_delete_regular_user
ERROR apps/backend/plugins/user/tests/test_user_api.py::TestDeleteUser::test_delete_not_found
ERROR apps/backend/plugins/user/tests/test_user_api.py::TestDeleteUser::test_batch_delete
```

角色人数修复验收：通过；扩大回归限制如上。

## 2026-10-09 公告模板 92012 参数错误提示

- 根因已通过只读数据检查和实际页面确认：`task.completed.notice` 的 `task_name` 为必填字符串，当前绑定用户部门；预览用户李四（lisi0）属于活跃 GUEST，但未设置部门，因此正确触发 92012。没有修改用户资料或绕过必填校验。
- 后端收集缺失的必填收件人字段，通过 `data.variableErrors` 返回参数名、来源字段和原因，不返回用户资料值。前端仅解析允许的来源字段，合并提示“task_name（用户部门）”，并说明补全资料或改为手动填写；格式异常时回退通用提示。
- 修复通知语言文件重复前缀：改为 error/category 嵌套结构，由真实语言加载器生成正确的 notification.error 命名空间。中英文原有文案保留，types.py 由后端监听器自动生成。
- 回归测试先失败后修复：实际语言加载器的命名空间和运行时翻译、缺失字段结构化错误、前端详细提示及非法字段安全回退。通知插件 + 用户公开资料/活跃用户 provider 共 199 passed；前端全量 55 文件、279 passed；vue-tsc、限定 Oxlint、Ruff check/format-check 均通过，退出 0。Vitest 仍有既存关闭超时提示，但进程成功退出。扩大用户回归的既有失败/环境限制见上一节，本次没有重复运行或声称解决。
- 浏览器验证真实请求后，toast 正常显示“模板变量不符合声明约束”，行内提示明确展示“以下必填参数对应的用户资料为空：task_name（用户部门）。请补全用户资料，或改为手动填写。”。页面保留未保存配置供核对；未保存草稿、发布通知或改动业务记录。
- 截图：`/home/coke/.codex/visualizations/2026/10/09/01a11fbd-dcc4-7b10-9c1e-e01b82738b64/announcement-template-required-error.jpg`。原生视口下根据当前对话框和预览区域边界裁剪，并已目视检查。
- 独立只读审查未发现重要问题。

## 2026-10-10 接收范围切换保留公告内容预览

- 根因：内容、预览用户、接收范围共用 fingerprint 监听；切换接收范围执行 invalidate，清空 renderedContent，预览组件随即回到初始占位状态。
- 修复：分开内容与范围监听。仅范围变化时保留上次结果和已选预览用户，标记为旧范围下的预览，并提示重新预览核对用户范围；模板、参数、预览用户变化及关闭抽屉仍清空旧状态。
- 范围变化立即废弃尚未返回的旧请求并恢复按钮可用。重新预览使用当前范围重新校验；旧响应不会覆盖新范围状态。编辑区与发布确认区均展示旧范围提示，正式发布校验未改动。
- 回归测试先复现原问题：切换指定范围后 DOM 中渲染内容消失，新测试失败，19 项通过；修复后前端全量 55 文件、281 项通过，vue-tsc 和限定 Oxlint 均通过，退出 0。Vitest 保留既有关闭超时提示但进程成功退出。新增测试覆盖保留内容及范围提示、按新范围重试并处理校验失败、丢弃旧范围 pending 响应。
- 实际浏览器只读预览：任务完成通知模板 username 绑定用户名称，task_name 手动填入队列深度检查，李四预览成功；全部用户切换指定范围后，标题“队列深度检查已完成”、正文、已选用户继续展示，并显示接收范围已调整提示。未保存草稿、发布通知或修改数据库记录。
- 截图：`/home/coke/.codex/visualizations/2026/10/09/01a11fbd-dcc4-7b10-9c1e-e01b82738b64/announcement-audience-preview-retained.jpg`。原生视口，按当前预览区域裁剪并目视核对；页面保留供查看。
- 独立只读代码审查未发现重要行为、并发或校验回归问题。

## 2026-10-10 指定范围删除按钮图标

- 浏览器 DOM 确认旧 carbon:subtract SVG 存在，但按钮宽 32px，普通按钮左右 padding 各 14px，图标受到挤压而几乎不可见。
- 改为圆形无文字图标按钮，使用项目已有 carbon:trash-can，error 主题色，32px 按钮与 18px 图标，通过 icon slot 渲染，并补充本地化 title。原有 aria-label、禁用条件和删除逻辑保留。
- 实际 DOM 验证按钮 32×32、SVG 18×18。新增第二条范围后垃圾桶可见，删除第二条正常，剩一条时删除禁用；未保存或发布公告。
- 原生视口截图已目视确认：`/home/coke/.codex/visualizations/2026/10/09/01a11fbd-dcc4-7b10-9c1e-e01b82738b64/announcement-audience-delete-icon.jpg`。

## 2026-10-10 公告菜单跳转绑定

- 用户已确认技术方案并授权执行。公告高级设置改为不跳转、系统菜单、外部链接；新配置无需输入路由名或 JSON。菜单树可搜索且目录禁选，选择后自动填写按钮名称，路径及查询参数逐项填写并展示必填、说明、已有示例或默认值。旧 route 配置保留兼容编辑入口。
- common 菜单协议隔离跨插件 ORM；menu Provider 过滤禁用目标、禁用/缺失祖先、未授权页面、登录/错误/iframe/外链页面。新增 GET action-targets、POST action-preview 权限与只读接口。通知保存检查绑定，发布和定时 process 重读菜单并保存 route/path/规范化 params/query 快照，使用既有 action JSON，无数据库迁移。
- 编辑器提供验证目标和单独打开页面验证，编辑后废弃旧结果并拒绝过期异步响应。实际浏览器发现直接导航会丢失未保存公告，已改为仅编辑器验证在隔离的新标签页打开，当前表单保留。收件人点击仍沿用站内导航；无法访问或目标变更时提示原因。外链限定无凭据 HTTP/HTTPS 并使用 noopener,noreferrer。
- 独立审查发现路径编码差异和静态/动态路由冲突，均先新增失败测试再修复：路径逐段解码核对且保留层级，站内按菜单名称导航；新标签页额外核对 URL 解析后的菜单身份。后端另覆盖独立可选路径段移除及默认值/布尔值规范化，保证快照参数与路径一致。复查未发现剩余重要问题。
- 最终验证：前端全量 57 文件、324 项通过（`/tmp/menu-actions-frontend-delivery.log`），vue-tsc 退出 0，限定 Oxlint 0 警告/0 错误；后端通知全套与菜单新增/注册隔离测试 240 passed、2 条既有警告（`/tmp/menu-actions-backend-complete.log`），14 个 Python 文件 Ruff check/format-check 通过，末次修改的两文件再次通过。Vitest 保留既有关闭超时提示，退出码 0。后端核心模块 ty 通过；admin_api 中旧 content-preview 的两处 str→Literal 诊断不属于本次修改。
- 浏览器实际验证：用户菜单搜索和选择、按钮名称自动填充、目标解析 `/manage/user`、编辑后旧验证清空、外链验证及新标签页正常加载用户管理，同时原公告表单保持开启。真实库无用户详情菜单、无旧版草稿，本次未创建测试菜单/草稿；动态参数说明及旧配置回填由真实 NaiveUI 组件测试与隔离后端测试覆盖。没有保存、发布或撤回真实公告，也没有修改业务数据库记录。未执行 Git 操作。
- 最终菜单截图按实际 `.n-drawer` 边界 840×1320 裁剪并目视检查：`/home/coke/.codex/visualizations/2026/10/09/01a11fbd-dcc4-7b10-9c1e-e01b82738b64/announcement-menu-action.png`。浏览器保留未保存配置供查看。

## 2026-10-12 消息通知浮层重构

- Source visual truth: `/home/coke/.codex/generated_images/01a11fbd-dcc4-7b10-9c1e-e01b82738b64/exec-1fafea25-00c4-4c92-9ec9-ab0acbdb30f4.png` (1254×1254).
- Final implementation: `/tmp/notification-popover-final-full.png` (2560×1320 browser screenshot), cropped with surrounding header context to `/tmp/notification-popover-final.png`.
- Same-input comparisons: initial `/tmp/notification-popover-comparison.png`; final `/tmp/notification-popover-comparison-final.png`. Source popover region was resized proportionally to 400px width; implementation is native 400 CSS px. No source content was retouched. Final live popover measures 400×502 CSS px.
- State: Simplified Chinese, light theme, three actual messages visible. The selected concept has one unread message; the final live account has zero. This intentional data-state difference explains the disabled read-all button and absent unread tint/dot. An isolated instance of the actual component verified the one-unread style without mutating live messages; `/tmp/notification-popover-refactored.png` records that state before the final spacing adjustment.

### Comparison history and findings

- [P2, fixed] Initial combined comparison showed excessive header, group and row spacing. Reduced header/tab padding, date-group spacing, and compact row padding, retaining 14px titles, 13px two-line summaries and 12px metadata. Final combined comparison shows the approved segmented header, consistent icon/text columns, one timestamp per message, bounded scrolling and stable footer.
- [P2, fixed] Dark emphasis text initially lacked sufficient contrast. Added a scoped theme accent using the existing primary-300 palette in dark mode, with separate hover/focus colors. Browser computed color after repair: `rgb(153, 179, 255)`. Level icons and unread marks also use their light palette in dark mode.
- [P2, fixed] Existing expired-message summary exposed a translation key. Corrected it to the existing `statusOptions.expired`; browser now shows “已过期”. Recalled/expired messages do not navigate.
- [P3] Native Carbon icon strokes and the existing font stack differ slightly from the generated illustration. Existing application icons and typography were retained as required by the product conventions.

### Verified behavior and limits

- Actual page: segmented tab switching, empty unread inbox, disabled read-all at zero, date grouping and one time per row. Clean loaded page rendered normally; the initial fresh-page console check returned no errors. A temporary fixture experienced a Vite router-cycle error during hot reload; clean page loading succeeded, and the fixture was removed.
- Isolated actual components: one unread and 99+, read-all clears the count and disables the button, Escape closes, long unbroken text clamps to two lines, long required title fits without horizontal overflow, loading skeletons, empty state, recalled/expired summaries, dark mode and 360px viewport. Narrow popover measured 270px wide, left 12px/right 282px, with no horizontal overflow. Browser viewport was restored. No actual read status or database records were changed by these tests.
- Focused tests: 30 passed across 5 files, including segmented selection, read-all events, mark-read/navigation guards and dismissal. Typecheck and focused lint passed. Navigation success/no-action/recalled/expired cases use mocked navigation in tests; no real test messages were published.
- No actionable P0/P1/P2 visual findings remain. Existing backend routes and the previously observed view-all routing issue were outside this visual refactor and were not changed.

final result: passed

## 2026-10-10 放开公告隐藏系统页面筛选

- 用户要求允许选择登录等隐藏系统页面。移除 Provider 的系统路由名称黑名单，公共 constant 页面沿用公共路由可访问规则；受限业务页面仍检查角色权限，禁用目标/祖先、iframe 和外链仍排除。列表与保存/发布目标校验共用 Provider。
- 前端仅菜单动作允许数字开头的已注册路由名，覆盖 403 等系统页面；旧版动作名称规则和后端白名单不变。登录守卫未改，已登录访问普通 /login 仍跳首页。
- 测试先 RED：菜单目标 2 failed/3 passed，数字路由导航 2 failed/22 passed。修改后完整前端 57 文件、328 passed，typecheck 退出 0；通知全套 + 菜单目标/注册隔离测试 241 passed、2 条既有警告。限定 Ruff check/format-check、Oxlint 均通过。日志 `/tmp/system-action-frontend-green.log`、`/tmp/system-action-targets-green.log`、`/tmp/system-action-types.log`。Vitest 仍输出既有关闭超时提示但退出 0。独立只读复查未发现重要问题。
- 浏览器真实搜索并选择 login，显示选填 module 路径参数，留空只读验证成功为 /login。点击打开验证新标签页按现有登录守卫跳至 /home，原公告表单保持；临时标签页已关闭。未保存/发布公告、修改业务记录或执行 Git。
- 验收截图按实际抽屉 840×1320 边界裁剪并目视检查：`/home/coke/.codex/visualizations/2026/10/09/01a11fbd-dcc4-7b10-9c1e-e01b82738b64/announcement-login-target.png`，表单保留供查看。

## 2026-10-12 消息块与配置跳转按钮（方案 1）

- Source visual truth: `/home/coke/.codex/generated_images/01a11fbd-dcc4-7b10-9c1e-e01b82738b64/exec-324fd42c-a060-47b3-99a2-d3e2ac05c6f5.png` (1145×1374).
- Implementation: `/tmp/notification-action-blocks-full.png` (2560×1376 viewport, 400×658 CSS panel); focused result `/tmp/notification-action-blocks.png`. The reference panel crop (815×1162) was normalized to 400×570; the implementation retains readable 14px titles and 13px body, so its panel is intentionally taller. Screenshots are 1× CSS density.
- Full and focused comparison: `/tmp/notification-action-blocks-comparison.png` before fixes, `/tmp/notification-action-blocks-comparison-final.png` after fixes. Both show the same four notification states: three consecutive unread items (two actions, one without) and one expired read item. Icons retain the existing Carbon library; category labels and relative-time formatting use actual project translations.
- Earlier [P2] card/footer height clipped the fourth item: card padding reduced to 10px, footer gap to 8px, NaiveUI icon vertical margins removed for a 26px action button, and list height increased to a viewport-bounded 500px. Post-fix comparison shows all four rows and persistent footer.
- Earlier [P2] dark metadata contrast was weak: changed compact metadata and group labels to the second text token in dark mode. Final computed metadata is rgb(204,204,204) on rgb(72,72,78). Post-fix evidence `/tmp/notification-action-blocks-dark-final.png`.
- Fonts/typography: project sans family and original title/body scale retained; long titles and content remain capped at two lines. Long CTA labels wrap, with arrow kept visible.
- Spacing/layout: independent rounded blocks, 8px gutters and isolated unread accent strokes prevent consecutive unread items merging. Action and metadata wrap within the content column. Narrow evidence `/tmp/notification-action-blocks-narrow.png` at 360×780; panel 258px wide, long action 170×42px, no horizontal overflow. The list scrolls while header/footer remain visible.
- Colors/tokens: semantic primary/unread fill, level-specific warning/success/info icons, existing light/dark surfaces; named buttons use popover accent variables including hover/focus/pressed states.
- Assets/content: native UI and project Carbon icons; no raster assets required. Configured `action.label` displayed, translated fallback for absent labels. No action for missing configuration, expired or recalled notifications.
- Interactions: isolated browser fixture verified content click only marks read, CTA navigates to an isolated registered route and dismisses. Unit tests cover double-click suppression, loading guards, label fallback, unavailable destinations, expiration and preserved full message-center archive behavior. Real inbox read-only verification shows saved `API 监控` action label; screenshot `/tmp/notification-action-blocks-live.png`.
- Validation: 36 tests passed across three related files; frontend typecheck and focused lint passed. Fresh real-app browser console had no errors. Temporary fixtures deleted; viewport override reset. No business records changed by verification.
- No actionable P0/P1/P2 findings remain. Reference panel height and project icon/category/date presentation differences are accepted adaptations for readable production typography and existing product data.

final result: passed

## 2026-10-12 Header notification inline reading

- Approved source visual: `/home/coke/.codex/generated_images/01a11fbd-dcc4-7b10-9c1e-e01b82738b64/exec-eb4d1009-9bab-440d-9954-8bf468038fbd.png` (1536×1024). The user replaced the detail-modal proposal with card-inline disclosure and explicitly approved it.
- Browser implementation evidence: `/tmp/notification-inline-collapsed.png`, `/tmp/notification-inline-expanded.png`; full 2560×1376 viewport originals with `-full` suffix. Actual popover is 400×658 CSS px at DPR 1. Source expanded panel crop 560×720 normalized to width 400, height 514 for comparison; preserve existing production panel height rather than adopting the illustrative board's shorter panel.
- Full and focused comparison in one image: `/tmp/notification-inline-comparison.png` (840×690), approved expanded panel on left and browser expanded panel on right. Both display the same maintenance message, inline reading surface, collapse and named action. First browser card has become read through the required existing read event; its neutral gray background and reduced unread count are intentional. The mock retains the blue unread state. No modal/backdrop is added.
- Typography: project fonts retained, title 14px/20px, body 13px/20px collapsed and 13px/22px expanded. Actual computed `-webkit-line-clamp` equals 2. Long collapsed body is 40px tall with 460px full content; long title is also limited to 40px. Full expanded title wraps inside the bounded reading region, including pathological titles.
- Spacing/layout: original header, tabs, footer and 400px panel retained. Expanded region max height 260px; metadata appears beneath the full title, collapse and action remain outside the scrolling region. Footer remains visible. Source generated image fits the title on one line; production text wraps to two lines at the existing readable scale, an accepted adaptation. No nested interactive controls.
- Colors/tokens: existing semantic level colors, theme accent hover/active/focus states, neutral read fill and rounded blue unread border preserved. Dark-state evidence `/tmp/notification-inline-dark-full.png`; dark read background computed rgba(224,224,224,0.06). No hardcoded product colors added.
- Assets: existing Carbon icons and native UI; no raster assets needed for implementation. Copy uses translated expand/collapse labels in zh-CN and en-US; no fabricated notification functionality.
- Interaction checks: short messages omit disclosure; click long summary or expand reads and opens in place, collapse does not navigate or mark read again. Ctrl+End reaches scrollTop 276 of max 276 in the final reading region. Configured action navigates to the fixture's registered `/home` route and closes the panel. Collapse retains selected all tab and list scrollTop 0. Read-state updates do not collapse the reader. Recalled content resets expansion and remains suppressed.
- Responsive evidence: `/tmp/notification-inline-narrow.png` at 360×780. Panel width 328px, no document horizontal overflow. Long URL/huge-title expanded region width and scrollWidth both 274px, height 260px with 804px full content. Reading works independently from outer list scrolling. Temporary viewport override reset.
- Actual application read-only check: `/tmp/notification-inline-live-full.png`; real popover shows two expand controls and no browser console errors. No real message was opened or marked read by QA. Isolated fixture tabs and files removed; actual application kept open.
- Validation: focused notification interaction, presentation and store suites pass (40 tests); frontend typecheck, focused oxlint and formatting check pass. Existing Vitest shutdown warning remains after successful assertions and exit status 0.
- Comparison history: first combined review found no actionable P0/P1/P2 differences. Source panel density, read-state change and full-title wrapping are the accepted adaptations above. Required typography, layout, tokens, icons/assets and copy checks completed.

final result: passed

## 2026-10-12 Inline reading layout correction

- User reported three design mismatches in the previous implementation: no fixed body region, inherited card background, and title scrolling with the body. These are P2 findings; the earlier QA's acceptance of a combined title/body scroller was incorrect and is superseded by this correction.
- Root cause: `.notification-preview-reading` wrapped both the expanded header and body, used `max-height`, and had no surface background.
- Fix: move `.notification-preview-expanded-header` outside the reading region. Make the body region height 240px with short-viewport adjustment, `bg-container`, 12px padding, 8px radius and a subtle semantic border. Only the body has overflow scrolling. Collapse and navigation remain outside it.
- Approved source remains `exec-eb4d1009-9bab-440d-9954-8bf468038fbd.png` in the generated-image directory above, 1536×1024. Corrected implementation `/tmp/notification-reading-fixed-full.png` (2560×1376 viewport, DPR 1), panel crop `/tmp/notification-reading-fixed.png` (440×698, includes 20px contextual margins).
- Source and rendered state compared together in `/tmp/notification-reading-fixed-comparison.png` (840×700). Source panel normalized from 560×720 to 400×514; production panel 400×658 retained, source unread state vs production marked-read state intentionally differs. The corrected body is a separate light surface within the gray read card; header and controls are visually separate.
- Browser scroll verification: body scrollTop 0 → 292, header Y remains 215, collapse button Y remains 537, outer list scrollTop remains 0. Fixed reading region is 240px. Light body background rgb(255,255,255); dark body rgb(28,28,28), distinct from dark read card rgba(224,224,224,0.06).
- Responsive/dark evidence `/tmp/notification-reading-fixed-dark-narrow.png`: viewport 360×780, body height 240px, clientWidth and scrollWidth both 272px, no document horizontal overflow. Browser console had no errors. Override reset, isolated fixture removed; real messages untouched.
- Required fidelity checks: project fonts/14px title and 13px body retained; header/body/footer spacing now follows the source composition; independent semantic background works in both themes; existing Carbon icons retained; content and translated controls unchanged.
- Regression coverage now asserts that the scrolling body never contains the full title, while the fixed header does, including long titles/recalled state. All 40 related tests passed, typecheck and focused lint passed; formatting applied. Existing Vitest successful-shutdown warning unchanged.
- No remaining actionable P0/P1/P2 findings after the corrected browser comparison. Prior height/title-scrolling adaptations are no longer accepted.

final result: passed

## 2026-10-12 Unread disclosure and scroll restoration correction

- Scope: user requested a clearer unread surface, expansion only from the disclosure control, no read side effect from expansion, and restoration of the pre-expansion outer scroll position.
- Root cause: toggle emitted the same event as reading a message, so opening changed the card to the gray read background. Summary click also called the toggle. No outer scroll snapshot existed. Initial restoration alone was still overridden by browser scroll anchoring; list scroll anchoring is now explicitly disabled.
- Fixes: only the disclosure button toggles expansion, it emits no read event. Summary click retains existing mark-read behavior without expanding. Unread primary fill increases to 8% (12% hover, 12% dark/16% dark hover). Capture list scrollTop before opening, restore after collapsed layout is measured, and reset body scrollTop to zero on every new expansion.
- Regression: updated test verifies long-summary click does not expand, disclosure does not mark read, outer position restores 300 → saved 140, body starts at zero when reopened, and external read-state updates do not collapse the card. All 40 focused tests passed; frontend typecheck and focused lint passed.
- Browser evidence: isolated 12-item list, long message initially below the fold. Summary click leaves `aria-expanded=false`. After resetting disposable fixture state, expansion keeps read calls at 0 and the card unread. Body scroll reached 600px; outer list moved to 378px while reading; collapse restored exactly 315px, equal to the saved position. Reopening resets body to 0. Browser console had no errors; no real message state changed. Temporary fixture removed.
- Visual evidence: `/tmp/notification-unread-disclosure-full.png` (2560×1376, DPR 1), `/tmp/notification-unread-disclosure.png` (440×698 contextual crop). Combined source/implementation comparison `/tmp/notification-unread-disclosure-comparison.png` (840×700), source normalized to 400px panel width, same maintenance content and expanded unread state. Production 400×658 panel height remains unchanged.
- Typography/layout: existing title/body scale, fixed header, 240px independent white body surface, collapse and named action retained. Tokens: unread computed rgba(67,97,238,0.08), curved accent retained; expanded unread now matches the source state. Icons/assets and translated content unchanged. Source illustrative density and fixture count/time differences remain intentional.
- Comparison history: restoration first returned 315 instead of saved 226 due to browser anchoring; after disabling it, a full new expand/read/collapse cycle restored saved 315 exactly. No remaining actionable P0/P1/P2 findings.

final result: passed

## 2026-10-12 Read-card surface, disclosure motion and centering

- User-approved adjustments: replace gray read-card block with a clean surface, animate disclosure, center the expanded message in the visible list. Existing body-only scroll, explicit toggle/no read side effect, original-position restoration remain required.
- Read card now uses the container theme background and a subtle 8% inset outline (16% hover). Its body uses a separate 2.5% neutral surface with the existing border. Light background computed rgb(255,255,255), dark rgb(28,28,28). Unread primary fill/rounded accent unchanged.
- Disclosure uses a cancellable 220ms Web Animations height/opacity transition. Toggle disabled during animation to prevent overlapping layout changes; cleanup cancels animation when unmounted or content changes. Reduced-motion mode skips animation and smooth scrolling. Fallback without Web Animations switches directly.
- Centering computes the expanded card center against the actual scroll viewport, clamps to list bounds, and smoothly scrolls after height transition. Browser measured card center 423px and list center 423px on desktop and at 360×780. Collapse restored exactly saved 315px after centering. Reading alone caused zero mark-read calls.
- Browser observed intermediate height 164px with the animating class and disabled toggle during both expansion and collapse, compared with final expanded height 368px; transition ends with toggle enabled. Browser rendering verifies actual motion, not only declared CSS classes.
- Evidence: `/tmp/notification-motion-centered-full.png` at 2560×1376, DPR 1; `/tmp/notification-motion-centered.png` (440×698 contextual panel crop). Combined source/implementation comparison `/tmp/notification-motion-comparison.png` (840×700), original generated source normalized to 400px panel width. Current read state, white surface and centered list position intentionally implement the latest requests and supersede the source's unread state/top alignment. Native panel height remains 658px.
- Dark narrow evidence `/tmp/notification-motion-dark-narrow.png`: 360×780 viewport, no horizontal overflow, 240px body, identical card/list centers. Console errors absent. Temporary viewport reset, isolated fixtures deleted; actual app kept open, real messages untouched.
- Fidelity surfaces: original project fonts/title-body scale, 12px body padding, existing spacing/radii and Carbon icons retained. Independent card/body boundaries remain visible. Semantic light/dark colors adapt; content and translated controls unchanged. Comparison has no remaining actionable P0/P1/P2 findings.
- Verification: 42 focused notification interaction/presentation/store tests passed, including smooth vs reduced-motion centering and saved-scroll restoration. Frontend typecheck, focused lint and formatting passed. Existing Vitest successful-shutdown warning unchanged.

final result: passed

## 2026-10-12 Unread indicators — selected option 1

- Approved source: `/home/coke/.codex/generated_images/01a11fbd-dcc4-7b10-9c1e-e01b82738b64/exec-64833f1e-82fe-4f34-acfd-055c2e84428a.png`, 1074×1464 pixels. User selected the first displayed option. Scope is the unread dot and left marker, including spacing needed for these indicators; other mockup differences are outside the approved request.
- Implementation: the full-height curved border is replaced with a 3×24px capsule at left 10px/top 14px. Card padding reserves space for it. The 6px dot is now a single article-level decoration at right 16px/top 17px, independent of title flex flow, with a heading status lane in collapsed and expanded states. Both use `--notification-accent`.
- Real app screenshot: `/tmp/notification-unread-indicators-full.png` (1704×902, DPR 1), contextual crop `/tmp/notification-unread-indicators.png` (440×698, 400×658 panel). Actual unread cards measured first-line-center minus dot-center = 0px and right inset = 16px. Existing unread/read records were not modified.
- Isolated component fixture evidence: `/tmp/notification-indicators-fixture-full.png` (1704×902), `/tmp/notification-indicators-fixture.png` (440×698), `/tmp/notification-indicators-expanded-full.png` (1704×846). Single-line, two-line mandatory and expanded headings all measured dot-center delta 0px. No horizontal card overflow. Read cards have neither decoration. Temporary fixture files and tab were deleted after verification.
- Full combined comparison: `/tmp/notification-indicators-comparison.png` (840×700). Source panel crop 954×1402 normalized without stretching to 400px maximum width; rendered 400×658 panel retained. Both show expanded content. Production's previously approved fixed 240px reading region and centering intentionally scroll earlier cards outside view; mockup illustrative body height and density do not override them.
- Focused comparison: `/tmp/notification-indicators-focused.png` compares the first collapsed unread card at normalized 400px width, matching the short marker, inner spacing and first-line-aligned dot. First combined review found no actionable P0/P1/P2 discrepancies within this scope.
- Typography/layout: retained project font, 14px/20px title, 13px body and existing buttons. Left padding is 22px, right padding 16px, title reserves an additional 16px status lane. Tokens: existing unread/read surfaces remain; indicator colors share the existing notification accent. Icons/assets: retained Carbon severity icons rather than changing category semantics to match illustrative mock icons. Copy: existing i18n and message content unchanged; source and fixture copy illustrate the same title-length cases.
- Dark/narrow evidence: `/tmp/notification-indicators-dark-narrow.png`, 360×780 viewport, 336px fixture panel, first-line dot delta 0px for all unread cards including the mandatory and expanded cases; no horizontal overflow. Accent computed rgb(167,159,255). Temporary viewport reset. Browser console errors absent.
- Verification: 42 focused notification interaction/presentation/store tests passed (exit 0); frontend typecheck, focused oxlint and oxfmt check passed. Existing successful Vitest shutdown warning unchanged. Disclosure/read side effects, motion, original scroll restoration and action handling remain covered by those suites.

final result: passed

## 2026-10-12 Right-aligned text operations and content-height marker

- Latest user instructions extend option 1 to its operation layout, with text-only controls at the right and a left highlight matching content height. These supersede the earlier fixed 24px marker requirement.
- Source: same selected `exec-64833f1e-82fe-4f34-acfd-055c2e84428a.png` (1074×1464). Combined evidence `/tmp/notification-text-layout-comparison.png` (840×700) includes the source normalized without distortion to 400px maximum panel width, and the actual 400×658 component. Source fourth message is expanded; the full comparison's fourth message is collapsed to expose the longer action label. Expanded state separately captured in `/tmp/notification-text-layout-expanded-full.png` and contextual crop `/tmp/notification-text-layout-expanded.png`.
- Layout: collapsed category/time and operations share a wrapping footer. Operations group is right-aligned in all modes. A 1px neutral separator divides disclosure and destination when both exist. Destination is a native text button, retaining accessible name, disabled/loading state, icon and existing action event. Disclosure retains its independent behavior and keyboard focus; neither control has visible border or fill, with underline hover and focus outline.
- Marker: top/bottom insets both 10px, width 3px, fully rounded caps, left inset 10px. Browser measured 98px card → 78px marker; 138px card → 118px marker; expanded 370px card → 350px marker. Dynamic height follows the existing disclosure animation. Operations right inset remains 16px in all cases.
- Main evidence `/tmp/notification-text-layout-collapsed-full.png` (1704×902, DPR 1), contextual crop `/tmp/notification-text-layout-collapsed.png`. Actual application `/tmp/notification-text-layout-live-full.png` and `/tmp/notification-text-layout-live.png` show right-aligned disclosure-only and action-only cases without modifying real message read state. Browser left on actual app.
- Dark/narrow evidence `/tmp/notification-text-layout-dark-narrow.png`, 360×780: required long title, expanded independent body, long action label, and read card all fit with no horizontal overflow; operations remain right-aligned. Temporary viewport reset and isolated fixture files/tab deleted. Browser console errors absent.
- Fidelity surfaces: project font, 14px/20px titles and 13px bodies retained; operation text is consistently 12px with 26px minimum target height. Layout now follows source metadata-left/actions-right pattern with wrapping where necessary. Existing theme surfaces and accent token retained; Carbon icons preserve severity/destination semantics. Existing translations and configured labels remain unchanged. Short marker intentionally differs from source according to the latest user instruction. No new image assets required.
- Comparison found no actionable P0/P1/P2 issues in the requested scope. Native source panel density, previously approved 240px independent body, and centering behavior remain intentional product constraints.
- Verification: 43 focused notification interaction/presentation/store tests pass (exit 0), including the new deferred-navigation text-control disabled/aria-busy check. Frontend typecheck, focused oxlint and formatting pass. Existing successful Vitest shutdown warning unchanged.

final result: passed

## 2026-10-12 Fixed notification title — approved option 2

- Selected source: `/home/coke/.codex/generated_images/01a11fbd-dcc4-7b10-9c1e-e01b82738b64/exec-e369c59c-a695-42e7-a557-f9d689a18b68.png` (995×1582). Source/render comparison: `/tmp/notification-fixed-title-comparison.png`, with source scaled proportionally and actual component cropped with surrounding panel context.
- Title reserves 40px/two lines in a 64px header, with required tag/category/time and complete-title text control on one metadata row. Overflow measurement determines whether the complete-title control appears. Short titles retain the same reserved height.
- New reusable title popover is click-triggered, has a close button and independently scrollable 180px maximum title viewport. Escape closes only this popup and returns focus to its trigger. Its width is bounded by the viewport. The popup is removed on message collapse; opening it has no read side effect.
- Real application evidence: `/tmp/notification-fixed-title-live-full.png` and contextual crop `/tmp/notification-fixed-title-live.png`. Actual 6-character and 256-character titles both produced 370px expanded cards, 64px headers and 240px body viewports. Opening the full title did not change these dimensions. Full-title scroll reached its maximum 106px; Escape retained the outer message panel. No real message was marked read or navigated during this verification.
- Isolated actual-component evidence: `/tmp/notification-fixed-title-fixture-full.png` and contextual crop `/tmp/notification-fixed-title-result.png`. Close button dismissed only the title popup while the message remained expanded. Layout matches selected option's two-line title, metadata-row entry, floating complete title and fixed independent body. Existing full-height unread marker and right-aligned text operations retained.
- Dark/narrow evidence: `/tmp/notification-fixed-title-dark-narrow.png` at 360×780. Card remained 370px; page scroll width was 360px and popup content spanned x=34–306, with no horizontal overflow. Actual application narrow evidence: `/tmp/notification-fixed-title-narrow.png`. Temporary viewport reset; fixture tab and both fixture files removed.
- Existing project typography, palette and Carbon icons retained. Chinese/English full-title labels added. No new bitmap assets required. Comparison found no actionable P0/P1/P2 defects in scope.
- Verification: 46 notification interaction/presentation/store tests passed (exit 0), including long/newline title access, popup dismissal, collapse cleanup, independent body content, short-title omission and no read side effect. Frontend typecheck and focused lint passed. Existing successful Vitest shutdown warning unchanged.

final result: passed
