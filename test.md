# React 组件开发规范指南

## 一、组件命名规范

### 1. 基础命名原则：PascalCase（大驼峰）

**必须使用大驼峰命名**，因为 React 只将大写字母开头的函数识别为组件。

| 示例        | 状态    | 说明                 |
| ----------- | ------- | -------------------- |
| UserProfile | ✅ 正确 | 清晰的业务含义       |
| LoginForm   | ✅ 正确 | 功能明确             |
| userProfile | ❌ 错误 | 会被识别为 HTML 标签 |
| login-form  | ❌ 错误 | 不符合 JS 命名规范   |

### 2. 通用组件命名（UI / 无业务逻辑）

**命名模式：** `名词 + 职责`

**推荐命名：**

- UserAvatar
- SearchInput
- ConfirmModal
- Pagination
- EmptyState

**避免泛化命名：**

- ❌ Component、Common、Wrapper、Box、Item（无法表达实际功能）

### 3. 业务组件命名（有状态 / 接口请求 / 业务逻辑）

**命名模式：** `业务模块 + 组件内容`

**推荐命名：**

- UserListView
- UserDetailPage
- OrderCreateForm
- AccountSettingsPanel

### 4. Props 与事件命名

| 类型       | 命名规则     | 示例                                 |
| ---------- | ------------ | ------------------------------------ |
| 事件回调   | onXxx        | onClick、onSubmit、onChange、onClose |
| 状态 Props | 形容词或名词 | open、loading、disabled、visible     |
| 数据 Props | 名词         | value、data、items、content          |

### 5. 命名黄金法则

$$\text{组件名} = \text{它是什么} + \text{它做什么}$$

**核心约定：**

- 一个文件只导出一个组件
- 文件名 = 组件名 = 默认导出
- 避免缩写（除非是团队约定）

---

## 二、目录结构规范

### 1. 小型组件（Simple UI Components）

**适用场景：** 纯展示、无业务逻辑、高度复用

```
components/
└── Button/
    ├── Button.tsx
    ├── Button.module.scss
    └── index.ts
```

**特点：** 一个目录一个组件，通过 index.ts 统一导出

### 2. 大型组件（Complex Components）

**适用场景：** 有状态、多个子组件、复杂内部逻辑

```
components/
└── DataTable/
    ├── DataTable.tsx
    ├── DataTableHeader.tsx
    ├── DataTableBody.tsx
    ├── useDataTable.ts
    ├── types.ts
    ├── DataTable.module.scss
    └── index.ts
```

**原则：** 主组件与子组件强内聚，私有 Hook 和类型不外提

### 3. 业务组件（Feature Modules）

```
features/
└── user/
    ├── components/
    │   ├── UserAvatar.tsx
    │   └── UserList.tsx
    ├── pages/
    │   └── UserListPage.tsx
    ├── hooks/
    │   └── useUserList.ts
    ├── services/
    │   └── user.api.ts
    ├── types.ts
    ├── styles.module.scss
    └── index.ts
```

**原则：** 一个业务域一个目录，内部自管理类型、接口、样式

### 4. 类型文件（Types）

**全局通用类型：**

```
typings/
├── api.ts
├── common.ts
└── index.ts
```

**私有类型规则：**

- 与组件同级：`components/DataTable/types.ts`
- 与业务模块同级：`features/user/types.ts`

**核心原则：** 能不全局就不全局，私有类型就近维护

### 5. 样式文件（SCSS）

**推荐方案：**

- 小组件：`Component.module.scss`
- 业务模块：`styles.module.scss`

**导入约定：**

```
import styles from './Button.module.scss'
import styles from './styles.module.scss'
```

### 6. index.ts 统一导出规范

**目的：** 避免深层路径引用，统一管理导出

**使用方式：**

```
// 导入
import { Button } from "@/components/Button"
import { useUserList } from "@/features/user/hooks"

// 而不是
import { Button } from "@/components/Button/Button"
```

### 7. 目录结构总结

| 类型        | 位置               | 说明                     |
| ----------- | ------------------ | ------------------------ |
| UI 通用组件 | `components/`      | 无业务含义，高度复用     |
| 业务组件    | `features/业务名/` | 承载业务逻辑，与业务绑定 |
| 通用类型    | `typings/`         | 全局共用的类型定义       |
| 业务类型    | 业务目录内         | 私有类型就近维护         |

---

## 三、通用组件封装规范

### 定位与职责

**核心特征：**

- ✅ 不包含业务含义
- ✅ 不依赖业务接口 / Store / Router
- ✅ 仅关注 UI 行为与交互
- ✅ 高度可复用

**组件定位问题：** 「_这个组件是什么？它如何被交互？_」而非「它在哪个业务中用？」

### Props 设计原则

| 原则                | 说明                            | 示例                     |
| ------------------- | ------------------------------- | ------------------------ |
| **稳定可预测**      | Props 代表能力而非业务状态      | value、disabled、loading |
| **封装实现细节**    | 不暴露内部 state、DOM、事件顺序 | 提供清晰 API 接口        |
| **受控/非受控模式** | 支持外部控制或内部状态          | Input、Modal、Select     |
| **样式可定制**      | 支持 className、style 注入      | 避免写死业务样式         |

### 通用组件禁止事项

- ❌ 直接调用业务接口
- ❌ 直接操作路由（navigate、push 等）
- ❌ 直接依赖业务 Context
- ❌ 包含业务相关样式或词汇

### 合格通用组件的验收标准

- ✅ 能在多个业务模块中使用
- ✅ 不修改代码即可适配不同场景
- ✅ API 文档清晰完整
- ✅ 不包含任何业务词汇或逻辑

---

## 四、业务组件封装规范

### 定位与职责

**核心特征：**

- 承载具体业务逻辑
- 包含状态、接口请求、业务规则
- 与业务域强绑定
- 通常不可复用或低复用

**组件定位问题：** 「_这个组件在此业务中要完成什么？_」

### 业务组件三层拆分架构

| 层级        | 职责                 | 说明                   |
| ----------- | -------------------- | ---------------------- |
| **容器层**  | 处理数据、接口、状态 | 与后端交互、状态管理   |
| **展示层**  | 调用通用组件         | 纯 UI 组件，接收 Props |
| **Hook 层** | 承载业务逻辑         | 可复用的业务逻辑       |

**反面示例：** 避免所有逻辑集中在一个组件文件中

### 状态管理原则

| 状态类型     | 管理位置   | 说明                          |
| ------------ | ---------- | ----------------------------- |
| 业务状态     | 组件内     | 单页面业务状态                |
| 跨页面状态   | 全局 Store | Redux、Zustand 等             |
| 临时 UI 状态 | 组件内     | 不要放在全局（如 modal 开关） |

---

## 五、核心原则总结

### 通用组件 vs 业务组件

| 维度       | 通用组件   | 业务组件          |
| ---------- | ---------- | ----------------- |
| 知道使用者 | ❌ 不知道  | ✅ 明确知道       |
| 业务依赖   | ❌ 无      | ✅ 强绑定         |
| 复用范围   | ✅ 多业务  | ❌ 单业务或低复用 |
| Props 设计 | 通用、稳定 | 业务驱动          |
| 维护方式   | 中心化     | 分散化            |

### 项目架构黄金法则

```
UI 无业务 → components/
有业务逻辑 → features/业务名/
类型和样式就近维护
目录结构 = 业务边界
```

### 快速决策表

| 问题             | 是否 | 组件类型 |
| ---------------- | ---- | -------- |
| 有具体业务含义？ | 是   | 业务组件 |
| 调用后端接口？   | 是   | 业务组件 |
| 多个业务会用？   | 是   | 通用组件 |
| 只是 UI 展示？   | 是   | 通用组件 |
| 包含业务规则？   | 是   | 业务组件 |

---

## 六、Hook 规范与最佳实践

### Hook 命名规范

**命名模式：** `useXxx`

**推荐命名：**

- useCounter
- useFetch
- useLocalStorage
- useUserInfo
- useForm

**分类：**

- **通用 Hook**（可复用）：`hooks/useXxx.ts`
- **业务 Hook**（私有）：`features/user/hooks/useXxx.ts`

### Hook 设计原则

| 原则         | 说明                      | 示例                             |
| ------------ | ------------------------- | -------------------------------- |
| **职责单一** | 一个 Hook 做一件事        | useCounter、useFetch 分开        |
| **API 简洁** | 返回值清晰，易于使用      | 返回数组或对象，而非 object 混乱 |
| **处理依赖** | 正确处理依赖数组          | 避免无限循环、缺少依赖           |
| **错误处理** | Hook 内部处理异常         | 向外暴露 error 状态              |
| **性能优化** | 使用 useMemo、useCallback | 避免不必要的重渲染               |

### 通用 Hook vs 业务 Hook

| 类型          | 位置                   | 说明                   | 示例                                    |
| ------------- | ---------------------- | ---------------------- | --------------------------------------- |
| **通用 Hook** | `hooks/`               | 不依赖业务，多处复用   | useLocalStorage、useFetch、useCountdown |
| **业务 Hook** | `features/业务/hooks/` | 依赖业务逻辑，私有使用 | useUserList、useOrderSubmit             |

### Hook 的禁止事项

- ❌ 在 Hook 中直接调用 console
- ❌ 在 Hook 中操作 DOM（除非必要，使用 useRef）
- ❌ Hook 命名不以 use 开头
- ❌ 在条件语句中调用 Hook

---

## 七、常见组件类型详解

### 1. 表单组件

**特点：** 管理输入状态、验证、提交

**推荐文件夹结构：**

```
features/user/
├── components/
│   └── UserForm.tsx
├── hooks/
│   ├── useUserForm.ts
│   └── useFormValidation.ts
├── types.ts
└── services/
    └── user.api.ts
```

**设计要点：**

- 支持受控模式（外部传 value、onChange）
- 内置验证逻辑
- 提供 onSubmit 回调
- 支持初始值重置

### 2. 列表组件

**特点：** 展示数据列表、分页、排序、筛选

**推荐结构：**

```
components/DataTable/
├── DataTable.tsx （主容器）
├── DataTableHeader.tsx （表头）
├── DataTableBody.tsx （表体）
├── DataTablePagination.tsx （分页）
├── useDataTable.ts （业务逻辑 Hook）
└── types.ts
```

**设计要点：**

- 数据与业务分离（通过 Props 传入）
- 支持列自定义
- 提供排序、筛选、分页回调
- 虚拟滚动（长列表优化）

### 3. 弹框/模态框

**特点：** 浮层交互、动画、键盘处理

**推荐命名：**

- Modal（通用模态框）
- Drawer（抽屉式面板）
- Dialog（对话框）
- Toast（提示）
- Popover（气泡）

**设计要点：**

- 支持 visible 或 open Props
- 提供 onClose、onConfirm 回调
- 处理 Esc 关闭、背景点击关闭
- 支持自定义宽度、位置、动画

### 4. 加载/骨架屏

**推荐命名：**

- Skeleton（骨架屏）
- Loader/Spinner（加载动画）
- LoadingBar（加载进度条）

**设计要点：**

- 支持不同大小和形状
- 可定制动画时长
- 组合使用（列表+骨架屏）

---

## 八、编码最佳实践

### 1. Props 验证与文档

**通用组件必须：**

- 使用 TypeScript 定义 Props 类型
- 为每个 Props 添加 JSDoc 注释
- 标注必传项与可选项

**示例：**

```
interface ButtonProps {
  /** 按钮文本 */
  children: ReactNode
  /** 按钮类型 */
  variant?: 'primary' | 'secondary'
  /** 是否禁用 */
  disabled?: boolean
  /** 点击回调 */
  onClick?: () => void
}
```

### 2. 性能优化检查清单

| 项目       | 检查点              | 工具                    |
| ---------- | ------------------- | ----------------------- |
| **重渲染** | 是否过度重渲染      | React DevTools Profiler |
| **依赖**   | 依赖数组是否正确    | ESLint exhaustive-deps  |
| **Memo**   | 是否需要 React.memo | 比对 Props 变化频率     |
| **列表**   | Key 是否稳定唯一    | 避免用 index 作为 key   |
| **事件**   | 事件回调是否稳定    | useCallback 缓存函数    |

### 3. 可访问性（A11y）

**最小化要求：**

- 表单标签与输入框关联（htmlFor）
- 按钮有语义化标签
- 颜色对比度符合 WCAG 标准
- 键盘导航支持
- 添加 aria-label / aria-describedby

### 4. 错误边界处理

**业务组件应使用 Error Boundary：**

- 捕获子组件异常
- 显示降级 UI
- 记录错误日志
- 提供重试按钮

---

## 九、版本管理与文档

### 1. 通用组件发版策略

| 版本号 | 场景                 | 说明               |
| ------ | -------------------- | ------------------ |
| Major  | Props 删除、功能移除 | 需要升级所有依赖项 |
| Minor  | 新增 Props、新增功能 | 向后兼容           |
| Patch  | Bug 修复、文档更新   | 无破坏性变更       |

### 2. 组件文档模板

每个通用组件应提供：

- 使用示例
- Props 说明表
- 常见用法
- 已知限制

**文档位置：** `components/ComponentName/README.md`

---

## 十、检查清单（组件上线前）

通用组件上线前：

- ✅ Props 类型完整，有 JSDoc 文档
- ✅ 支持受控/非受控（如适用）
- ✅ 样式可定制（className、style）
- ✅ 处理边界情况（空状态、错误状态）
- ✅ 没有硬编码的业务信息
- ✅ 单元测试覆盖主要功能
- ✅ Storybook 示例完整

业务组件上线前：

- ✅ Hook 逻辑清晰，职责单一
- ✅ 接口错误处理完善
- ✅ 状态管理符合规范
- ✅ 与通用组件正确分层
- ✅ 样式模块化，避免全局污染
- ✅ 功能测试覆盖核心流程

---

## 总结

一个完美的 React 项目应该：

1. **命名规范清晰** → 代码自说明
2. **目录结构合理** → 易于导航与维护
3. **通用与业务分离** → 提高复用与可维护性
4. **Props 设计稳定** → 降低组件耦合度
5. **就近原则** → 类型、样式、逻辑紧密相关
6. **Hook 规范一致** → 可预测的数据流
7. **文档完整** → 降低新人学习成本
8. **测试覆盖** → 保证代码质量
