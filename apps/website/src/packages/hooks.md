# @rapidkit/hooks

Vue 3 Composition API 组合式函数库,提供布尔值管理、加载状态、倒计时、上下文注入、表格数据等通用 Hook。

## 安装与引用

```jsonc
// package.json
{
  "dependencies": {
    "@rapidkit/hooks": "workspace:*",
  },
}
```

```ts
import { useBoolean, useLoading, useCountDown, useContext, useTable } from "@rapidkit/hooks"
```

## 依赖关系

| 依赖              | 用途                                             |
| ----------------- | ------------------------------------------------ |
| `@vueuse/core`    | `useRafFn` 等底层组合函数                        |
| `@rapidkit/axios` | `createHookRequest` 内部使用 `createFlatRequest` |
| `@rapidkit/utils` | 被 axios 包间接引用                              |

## 导出一览

| 导出               | 说明                                  |
| ------------------ | ------------------------------------- |
| `useBoolean`       | 布尔值状态管理                        |
| `useLoading`       | 加载状态管理(基于 useBoolean)         |
| `useCountDown`     | 基于 `requestAnimationFrame` 的倒计时 |
| `useContext`       | 类型安全的 provide / inject 封装      |
| `useSvgIconRender` | SVG 图标渲染辅助                      |
| `useTable`         | 通用表格数据与分页管理                |

## 详细说明

### useBoolean

管理一个响应式布尔值,提供 `setTrue` / `setFalse` / `toggle` 快捷方法。

```ts
const { bool, setTrue, setFalse, toggle } = useBoolean(false)

setTrue() // bool.value === true
toggle() // bool.value === false
```

### useLoading

基于 `useBoolean` 的语义化封装,专门用于加载状态。

```ts
const { loading, startLoading, endLoading } = useLoading()

startLoading()
await fetchData()
endLoading()
```

### useCountDown

基于 `requestAnimationFrame` 的高精度倒计时,不受屏幕刷新率影响。组件卸载时自动清理。

```ts
const { count, isCounting, start, stop } = useCountDown(60)

start() // 开始 60 秒倒计时
start(30) // 重新开始 30 秒倒计时
stop() // 停止并重置为 0
```

::: tip
`count` 返回向上取整的秒数(整数),适合直接用于 UI 显示。
:::

### useContext

对 Vue `provide` / `inject` 的类型安全封装,返回 `[useProvide, useInject]` 元组。

```ts
// context.ts
import { ref } from "vue"
import { useContext } from "@rapidkit/hooks"

export const [provideCounter, useCounter] = useContext("counter", () => {
  const count = ref(0)
  const increment = () => {
    count.value++
  }
  return { count, increment }
})
```

```vue
<!-- Parent.vue -->
<script setup>
  import { provideCounter } from "./context"
  provideCounter()
</script>

<!-- Child.vue -->
<script setup>
  import { useCounter } from "./context"
  const { count, increment } = useCounter("ChildComponent")
  // 传入组件名后,若未在 Provider 内使用会抛出明确错误
</script>
```

### useSvgIconRender

接收一个 SVG 图标组件,返回 `SvgIconVNode` 工厂函数,用于在表格列、菜单等需要渲染函数的场景中快速创建图标 VNode。

```ts
import SvgIcon from "@/components/SvgIcon.vue"
const { SvgIconVNode } = useSvgIconRender(SvgIcon)

const icon = SvgIconVNode({ icon: "mdi:home", color: "#333", fontSize: 18 })
```

### useTable

通用表格数据管理 Hook,支持分页、列可见性控制、数据加载与转换。

```ts
const { data, loading, columns, columnChecks, getData, searchParams } = useTable({
  api: () => fetchUserList(params),
  pagination: true,
  transform: (res) => ({ data: res.records, pageNum: res.current, pageSize: res.size, total: res.total }),
  columns: () => [...],
  getColumnChecks: (cols) => cols.map(c => ({ key: c.key, title: c.title, checked: true, visible: true })),
  getColumns: (cols, checks) => cols.filter(c => checks.find(ch => ch.key === c.key)?.checked),
});
```

::: warning
`useTable` 的 `api` 参数应为无参函数。如需传递搜索参数,在外部通过闭包引用响应式变量即可。
:::
