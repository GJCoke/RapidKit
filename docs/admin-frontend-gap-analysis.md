# Admin 与 Frontend 核心架构及缺口分析

> **状态更新（2026-09-10）：** 本文主体是 2026-09-08 的历史快照，其中关于 Admin 路由、请求、测试、布局、主题、通用表格和用户管理的多项描述已经过时。当前 P0 React 路由基建以 `docs/superpowers/specs/2026-09-10-admin-p0-react-routing-design.md` 和 `docs/superpowers/plans/2026-09-10-admin-p0-react-routing.md` 为准。

> **已实施 P1 壳层能力更新（2026-09-10）：** 国际化运行时、主题工作台、六种布局的 `fixedHeaderTabs` 滚动语义、页签操作/键盘导航、授权路由搜索、内容区全屏和浏览器全屏已完成并通过 Admin 集成门禁。证据包括 `apps/admin/src/app/app-shell.dom.test.tsx` 以及 `pnpm test`（103 files、336 tests）、`pnpm exec oxlint src`（0 warnings、0 errors）、`pnpm typecheck && pnpm build`。正文中将这些能力列为“缺少”的历史描述不再代表当前状态。
>
> 原始 P1 计划中的通知槽位/可插拔通知入口与面板契约已明确被本次完成范围排除并取代；通知、消息、未读状态及其业务页面均未标记为完成。当前 Vite React Babel `esbuild`/`oxc` 和 `optimizeDeps.rollupOptions` 弃用提示归入 P2 构建工具治理；它们不阻塞已通过的测试、类型检查和 production build。

> 分析日期：2026-09-08  
> 分析范围：`apps/admin` 与 `apps/frontend` 当前工作区代码。工作区存在未提交改动，因此本文是一份当前状态快照。

## 1. 总体结论

`apps/admin` 不是 `apps/frontend` 的等价 React 实现，而是一个已经具备登录、动态路由、基础布局和首页能力的轻量管理端骨架。

| 维度       | Admin                                                            | Frontend                                                |
| ---------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| 技术栈     | React 19、React Router、Zustand、TanStack Query、shadcn/Tailwind | Vue 3、Vue Router、Pinia、Naive UI、UnoCSS              |
| 源文件数量 | 约 86                                                            | 约 370                                                  |
| 代码量     | 约 4,214 行                                                      | 约 46,835 行                                            |
| API 模块   | `auth`、`dashboard`、`route`                                     | 认证、路由、系统管理、通知、监控、插件、脚本、Worker 等 |
| 业务页面   | 首页和内置异常页                                                 | 完整后台业务模块                                        |
| 当前定位   | 新管理端骨架                                                     | 成熟后台管理平台                                        |

按基础管理端框架衡量，Admin 当前完成度约为 30%；若按 Frontend 的全部业务覆盖衡量，约为 10%～15%。

## 2. Admin 已具备的能力

- React 应用 Provider 组合。
- 登录、RSA 密码加密、用户信息查询。
- Access Token、Refresh Token 存储。
- 后端动态路由加载和页面懒加载。
- 基础登录守卫。
- 侧边栏、面包屑、移动端导航。
- 多标签页，以及关闭、关闭其他、关闭全部操作。
- 明暗主题和基础中英文国际化。
- TanStack Query 数据请求。
- 403、404、500 页面。
- 基础 Dashboard。
- Loading、Empty、Error 状态组件。

## 3. P0：必须优先补齐

### 3.1 系统管理模块

Admin 当前缺少：

- 用户管理和用户详情。
- 新增、编辑用户。
- 修改用户密码。
- 角色管理。
- 角色权限分配。
- 部门管理。
- 菜单管理。
- 数据权限策略。
- 字段权限策略。
- 权限策略模拟器。
- 审计日志及日志详情。

Frontend 参考目录：`apps/frontend/src/views/manage`。

### 3.2 通知中心

Admin 当前缺少：

- 消息抽屉和未读数量入口。
- 消息中心。
- 消息已读、未读状态管理。
- 公告管理。
- 通知模板管理。
- 通知投递记录。
- 用户通知偏好。
- 实时通知 Socket 连接。

Frontend 参考目录：

- `apps/frontend/src/views/notification`
- `apps/frontend/src/components/notification`
- `apps/frontend/src/store/modules/notification`

### 3.3 监控模块

Admin 当前缺少：

- API 调用监控。
- 请求统计、排行和趋势图表。
- 插件运行状态监控。
- 插件依赖图。
- 插件事件和插件统计。

Frontend 参考目录：`apps/frontend/src/views/monitoring`。

### 3.4 Celery 和任务队列管理

Admin 当前缺少：

- Worker 状态和 Worker 详情。
- 队列 Dashboard。
- 定时任务管理。
- 任务列表和任务详情。
- 实时任务流。
- 手动触发任务。

Frontend 参考目录：`apps/frontend/src/views/queue`。

### 3.5 脚本和 Socket.IO 工具

Admin 当前缺少：

- 在线脚本编辑器。
- 脚本 CRUD。
- Monaco Editor 集成。
- Socket.IO 调试器。
- Socket.IO 聊天页面。
- Socket.IO 仪表盘。
- Namespace、客户端、流量和事件日志监控。

Frontend 参考目录：

- `apps/frontend/src/views/script`
- `apps/frontend/src/views/socketio`

### 3.6 API 与数据访问层

Admin 当前只有 `auth`、`dashboard` 和 `route` 三组 API，缺少：

- 系统管理 API。
- 通知 API。
- 监控 API。
- 插件 API。
- Worker、队列和定时任务 API。
- 脚本 API。
- 数据权限、字段权限 API 类型。
- 相应的 Query 和 Mutation Hooks。
- 统一的 Query Key Factory。
- Mutation 成功后的缓存失效规范。
- OpenAPI 类型自动生成。

### 3.7 请求和认证可靠性

`apps/admin/src/services/request.ts` 仍有以下缺口或风险：

- 虽然定义了 `refreshTokenPromise`，但没有用于合并并发刷新请求。
- 多个请求同时过期时可能重复调用 Refresh Token 接口。
- Token 错误码写死为 `4001/4002/4003`，与 Frontend 当前使用的 `14002/14003/14008` 不一致。
- 认证错误码没有通过环境变量集中配置。
- Refresh Token 失败没有统一通过 Zustand 的 `clearAuth()` 清理状态。
- 普通错误只输出到控制台，没有统一 Toast 或 Dialog。
- 没有错误消息去重。
- 没有强制登出弹窗机制。
- 没有统一区分网络错误、服务错误和业务错误。
- 没有多服务 Base URL 支持。

## 4. P1：核心平台能力

### 4.1 路由体系

Admin 缺少：

- 静态路由和动态路由双模式。
- 路由级角色权限校验。
- 区分“路由存在但无权限”和“路由不存在”。
- 外链路由。
- iframe 页面。
- 页面标题自动更新。
- 路由切换进度条。
- 页面缓存和缓存刷新。
- 动态路由的移除与重新初始化。
- 全局菜单搜索。
- 更完整的路由 Meta 模型。
- 自动生成路由及路由类型。
- 可配置的 Hash、History、Memory 模式。
- 子路径部署需要的 Router Basename 支持。

### 4.2 标签页生命周期

Admin 标签页 Store 将首页固定为 `/home`，但实际首页由后端返回的 `home` 字段决定，仍需处理：

- 根据后端授权首页动态建立首页标签。
- 用户无 `/home` 权限时不能保留固定首页标签。
- 权限或后端路由变化后清理失效标签。
- 登出时清理标签页状态。
- 校验持久化标签是否仍有访问权限。
- 页面缓存与标签生命周期联动。
- 重新加载当前标签页。

### 4.3 全局应用壳

Admin 缺少：

- 全局菜单搜索。
- 消息入口。
- 语言切换器。
- 全屏切换。
- 当前页面重新加载。
- 全局页脚。
- 完整 Logo 和品牌配置。
- 横向、纵向、混合等多种布局模式。
- 水印。
- 主题配置抽屉。
- 主色、圆角、尺寸动态配置。
- 主题预设导入和导出。
- 页面切换加载条及动画。
- 自定义滚动条体系。
- 应用版本更新提醒。

### 4.4 通用后台组件与 Hooks

Admin 缺少：

- DataTable。
- 表格列配置。
- 表头操作栏。
- 通用搜索表单。
- 分页、筛选和排序状态封装。
- 通用 CRUD Drawer、Dialog。
- 表单字段栅格。
- 权限选择器。
- 图表 Hook。
- Socket Hook。
- 验证码 Hook。
- 图标选择器。
- 统一 Avatar。
- 通用异常页基座。

这些能力应在批量迁移业务页面之前建立，避免每个页面重复实现表格、搜索、抽屉和分页逻辑。

### 4.5 构建工具

相对 Frontend，Admin 缺少：

- OpenAPI 类型生成插件。
- 国际化 Key 类型生成。
- 路由及路由类型生成。
- SVG/Iconify 图标处理。
- 构建进度提示。
- HTML 元信息注入。
- 构建时间注入。
- 自动版本检测。
- 可配置代理策略。
- Source Map 开关。

### 4.6 测试基础设施

Admin 已存在一批测试文件，但 `apps/admin/package.json` 当前缺少：

- `test` 脚本。
- `test:watch` 脚本。
- Vitest 依赖声明。
- React Testing Library。
- jsdom 环境配置。
- 统一测试配置。
- API Mock。
- 路由集成测试。
- 登录和 Refresh Token 集成测试。
- 关键 CRUD 页面测试。
- E2E 测试。

当前状态是“已有部分测试源码，但测试工程尚未完整接通”。

## 5. P2：工程完善和体验增强

### 5.1 国际化

Admin 缺少：

- 按 `route`、`page`、`system`、`request`、`theme`、`form`、`datatable`、`notification` 等领域拆分翻译资源。
- Day.js Locale 同步。
- 语言持久化。
- `Accept-Language` 与运行时语言切换联动。
- 路由标题国际化更新。
- 类型安全的翻译 Key。

### 5.2 环境和应用配置

Admin 缺少或尚未统一：

- Router History Mode。
- Storage Prefix。
- Logout、Refresh Token 错误码配置。
- 自动更新检测开关。
- Source Map 开关。
- 应用标题和描述。
- Proxy 开关与日志。
- 静态、动态权限路由模式。
- 默认首页配置。

## 6. 技术栈差异，不应直接视为缺失

以下内容应采用 React 方案实现，不需要从 Frontend 原样复制：

- Pinia：Admin 已使用 Zustand。
- Naive UI：Admin 已使用 shadcn 和 `@rapidkit/ui`。
- UnoCSS：Admin 已使用 Tailwind CSS。
- Vue Composables：应转换为 React Hooks。
- Vue KeepAlive：需要单独设计 React 页面缓存方案。
- Elegant Router：可以保留 Admin 自有路由注册器，但应补齐 Meta、权限和类型生成能力。
- Vue 自动组件导入：React 项目不一定需要对应机制。

## 7. 基建优先实施计划

总体策略是先建立可复用、可验证的公共能力，再迁移业务；但不追求一次性做完所有基建。用户管理作为首个样板业务，用于验证并定型通用 CRUD 体系，之后再批量迁移其他业务模块。

### M1：核心基建可用

1. 稳定请求和认证链路：统一认证状态、Token 并发刷新、错误码配置、错误展示和登出清理。
2. 完善路由与权限：补齐动态路由 Meta、页面权限、动态首页、403/404 判定和标签页生命周期。
3. 接通测试工程：配置 Vitest、Testing Library、jsdom 和 API Mock，优先覆盖认证、请求与动态路由。

当前进度（2026-09-08）：

- 已接通 Vitest，现有测试已统一到同一运行器。
- 已完成认证错误码环境配置、并发 Refresh Token 单飞和统一 Store 清理。
- 已完成后端授权首页与固定标签同步，以及失效持久化标签清理。
- 已完成统一错误分类、去重通知、会话失效反馈以及请求流 MSW 集成测试。
- 已完成按钮权限 Hook/组件、外链安全打开、403/404 判定、页面标题和导航进度状态。
- 已接通 Testing Library、jsdom 和 MSW，并将 Admin 测试加入根级 `check:push`。
- M1 已完成；iframe 和 React KeepAlive 因需要新增协议或独立状态设计，保留为后续专项。

### M2：用户管理样板闭环

> 2026-09-08：已完成。Admin 已接入 OpenAPI 类型、TanStack Query/Table、DataTable 列设置与 CRUD 容器，并实现用户列表、搜索、分页、新增、编辑、拼音建议、角色/部门选项、RSA 改密、重发邀请、单删/批删、详情和按钮权限。

4. 建立 API 数据层：接入 OpenAPI 类型生成，统一 Service、Query Key、Query/Mutation Hooks、缓存失效和分页参数。
5. 建立通用业务组件：实现 DataTable、搜索表单、分页、CRUD Drawer/Dialog、确认操作、权限选择器和统一页面状态。
6. 实现用户管理样板：完成列表、搜索、分页、新增、编辑、删除、详情和修改密码，以真实业务验证上述基建。
7. 根据样板实现中的反馈收敛公共接口，避免业务页面依赖不稳定的抽象。

### M3：批量补齐业务

8. 按依赖关系迁移核心模块：部门 → 角色 → 菜单 → 数据/字段权限 → 审计日志。
9. 补齐通知中心和实时消息。
10. 补齐 API 监控、插件监控和 Celery 队列。
11. 补齐脚本编辑器和 Socket.IO 工具。
12. 最后补语言切换、全局搜索、版本提醒、主题抽屉、多布局和水印等体验增强能力。

业务实施顺序为：`用户/部门 → 角色/菜单/权限 → 审计日志 → 通知 → 监控/插件 → 队列 → 脚本/Socket.IO`。

## 8. 验收建议

完成 Admin 对齐时，至少应满足：

- Frontend 当前主要业务菜单均有可用的 React 页面。
- 后端动态路由可以正确控制菜单、页面和操作权限。
- 登录、刷新 Token、登出和权限变化不存在状态残留。
- 主要 CRUD 页面复用统一表格、搜索、表单和弹层组件。
- API 类型由 OpenAPI 生成或校验，避免手写类型长期漂移。
- 单元测试、集成测试可以通过统一 workspace 命令执行。
- 用户、角色、菜单、通知、监控和队列等核心链路具备回归测试。
