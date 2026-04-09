# @rapidkit/axios

基于 Axios 的 HTTP 请求封装层,提供拦截器管线、自动重试、请求取消、以及两种风格的请求实例创建方式。

## 安装与引用

```jsonc
// package.json
{
  "dependencies": {
    "@rapidkit/axios": "workspace:*",
  },
}
```

```ts
import { createRequest, createFlatRequest, BACKEND_ERROR_CODE, REQUEST_ID_KEY } from "@rapidkit/axios"
```

## 依赖关系

| 依赖              | 用途                      |
| ----------------- | ------------------------- |
| `axios`           | HTTP 客户端               |
| `axios-retry`     | 请求失败自动重试          |
| `qs`              | Query 参数序列化          |
| `@rapidkit/utils` | 使用 `nanoid` 生成请求 ID |

## 核心概念

### 请求管线

每个请求实例在内部经历以下阶段:

1. **请求拦截器** -- 注入 `X-Request-Id` 头,配置 `AbortController`,调用用户的 `onRequest` 钩子
2. **发送请求** -- 通过 Axios 发送,超时默认 10 秒
3. **响应拦截器** -- 判断 `isBackendSuccess`; 成功则返回数据,失败则调用 `onBackendFail` / `onError`
4. **重试** -- 由 `axios-retry` 根据配置自动处理

### 默认配置

```ts
{
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
  paramsSerializer: (params) => qs.stringify(params),  // 数组友好的序列化
}
```

## 两种请求风格

### createRequest -- 直接返回数据

请求成功直接返回转换后的数据,失败时抛出异常,需要 `try/catch` 捕获。

```ts
const request = createRequest<BackendResponse, ApiData, State>(
  { baseURL: "/api" },
  {
    transform: (response) => response.data.data,
    isBackendSuccess: (response) => response.data.code === "0000",
    onError: (error) => console.error(error),
  },
)

try {
  const data = await request({ url: "/users", method: "GET" })
} catch (error) {
  // 处理错误
}
```

### createFlatRequest -- 扁平化返回

返回 `{ data, error, response }` 对象,无需 `try/catch`。**项目内推荐使用此方式。**

```ts
const request = createFlatRequest<BackendResponse, ApiData, State>(
  { baseURL: "/api" },
  {
    transform: (response) => response.data.data,
    isBackendSuccess: (response) => response.data.code === "0000",
    onError: (error) => console.error(error),
  },
)

const { data, error } = await request({ url: "/users", method: "GET" })
if (error) {
  // data 为 null, error 为 AxiosError
} else {
  // data 为转换后的业务数据
}
```

## RequestOption 配置项

| 属性               | 类型                              | 说明                       |
| ------------------ | --------------------------------- | -------------------------- |
| `transform`        | `(response) => ApiData`           | 将后端响应转换为业务数据   |
| `onRequest`        | `(config) => config`              | 请求前钩子,如注入 Token    |
| `isBackendSuccess` | `(response) => boolean`           | 判断业务码是否成功         |
| `onBackendFail`    | `(response, instance) => Promise` | 业务失败处理,如 Token 刷新 |
| `onError`          | `(error) => void`                 | 错误统一处理,如弹出提示    |
| `defaultState`     | `State`                           | 请求实例上的自定义状态对象 |

## 前端项目中的实际用法

在 `apps/frontend/src/service/request/index.ts` 中,项目使用 `createFlatRequest` 创建主请求实例:

```ts
import { createFlatRequest, BACKEND_ERROR_CODE } from "@rapidkit/axios"

export const request = createFlatRequest(
  { baseURL },
  {
    defaultState: { errMsgStack: [], refreshTokenPromise: null },
    transform: (response) => response.data.data,
    onRequest: async (config) => {
      // 注入 Authorization 和 Accept-Language 头
      return config
    },
    isBackendSuccess: (response) => String(response.data.code) === "0000",
    onBackendFail: async (response, instance) => {
      // 处理登出、Token 过期刷新等逻辑
    },
    onError: (error) => {
      // 统一错误提示
    },
  },
)
```

::: tip
`cancelAllRequest()` 方法可一次性取消所有进行中的请求,适合在路由切换时调用以避免竞态问题。
:::
