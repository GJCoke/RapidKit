# 请求服务

::: info
本项目前端基于 [Soybean Admin](https://github.com/soybeanjs/soybean-admin) 开发。基础功能和约定请参考 [Soybean Admin 文档](https://docs.soybeanjs.cn/zh/)。
:::

## 概述

项目的 HTTP 请求基于 `@monorepo-example/axios` 内部包封装，该包位于 `packages/axios/`。前端应用在 `src/service/` 目录下配置拦截器并组织 API 模块。

## @monorepo-example/axios 包

该包在 Axios 基础上封装了两种请求实例创建方式：

### createFlatRequest

返回扁平化的响应结构，推荐用于业务代码：

```ts
const { data, error, response } = await request({
  url: "/api/v1/auth/login",
  method: "post",
  data: { username, password },
})

if (!error) {
  // data 已经是 transform 后的业务数据
  console.log(data)
}
```

返回类型为 `{ data, error, response }`，无需 try-catch 即可处理错误。

### createRequest

返回直接的数据对象，需要通过 try-catch 处理错误：

```ts
try {
  const data = await demoRequest({ url: "/api/demo", method: "get" })
  console.log(data)
} catch (error) {
  console.error(error)
}
```

### 核心配置项

`RequestOption` 提供以下钩子：

| 钩子               | 说明                                    |
| ------------------ | --------------------------------------- |
| `transform`        | 从 AxiosResponse 中提取业务数据         |
| `onRequest`        | 请求拦截器，可注入 Token、自定义 Header |
| `isBackendSuccess` | 判断后端响应是否成功（基于响应码）      |
| `onBackendFail`    | 后端返回错误码时的处理逻辑              |
| `onError`          | 请求异常时的处理逻辑                    |

### 内置功能

- 每个请求自动生成唯一 `X-Request-Id`
- AbortController 管理，支持 `cancelAllRequest()` 取消全部请求
- 集成 `axios-retry` 自动重试

## 请求/响应拦截器

项目在 `src/service/request/index.ts` 中配置了完整的拦截器链。

### 请求拦截器（onRequest）

```ts
async onRequest(config) {
  // 1. 注入 Authorization Header（Bearer Token）
  const Authorization = getAuthorization()

  // 2. 注入 Accept-Language Header（当前语言）
  const language = localStg.get("lang") || "zh-CN"

  // 3. 过滤 params 中的 null 值
  if (config.params) {
    config.params = Object.fromEntries(
      Object.entries(config.params).filter(([, v]) => v !== null)
    )
  }

  return config
}
```

### 响应拦截器（onBackendFail）

根据后端返回的响应码，执行不同的处理策略：

| 响应码类别   | 环境变量                           | 默认值           | 行为                  |
| ------------ | ---------------------------------- | ---------------- | --------------------- |
| 成功码       | `VITE_SERVICE_SUCCESS_CODE`        | `0`              | 请求成功，返回数据    |
| 登出码       | `VITE_SERVICE_LOGOUT_CODES`        | `401`            | 静默登出，跳转登录页  |
| 弹窗登出码   | `VITE_SERVICE_MODAL_LOGOUT_CODES`  | `7777,7778`      | 弹窗提示后登出        |
| Token 过期码 | `VITE_SERVICE_EXPIRED_TOKEN_CODES` | `9999,9998,3333` | 自动刷新 Token 并重试 |

::: warning
刷新 Token 的 API 不能返回 `VITE_SERVICE_EXPIRED_TOKEN_CODES` 中的错误码，否则会导致死循环。应返回登出码或弹窗登出码。
:::

## API 模块组织

API 函数按业务模块组织在 `src/service/api/` 目录下：

| 模块文件           | 说明                                                 |
| ------------------ | ---------------------------------------------------- |
| `auth.ts`          | 认证相关：登录、获取公钥、获取用户信息               |
| `route.ts`         | 路由相关：获取常量路由、获取用户路由、路由存在性检查 |
| `system-manage.ts` | 系统管理：角色、用户、菜单管理                       |
| `script.ts`        | 脚本管理                                             |
| `worker.ts`        | Worker 管理                                          |

所有模块通过 `src/service/api/index.ts` 统一导出。

## 如何新增 API 函数

### 步骤 1：确定模块

在 `src/service/api/` 下选择或创建对应的模块文件。

### 步骤 2：编写 API 函数

```ts
import { request } from "../request"

// 使用 OpenAPI 生成的类型
export function fetchGetUserList(params?: Api.SystemManage.GetUserQuery) {
  return request<Api.SystemManage.UserList>({
    url: "/users",
    method: "get",
    params,
  })
}
```

### 步骤 3：导出

在模块的 `index.ts` 中导出新函数，确保 `src/service/api/index.ts` 中已 re-export 该模块。

### 步骤 4：在组件中使用

```ts
const { data, error } = await fetchGetUserList({ page: 1, size: 10 })
if (!error) {
  userList.value = data
}
```

## OpenAPI 类型生成

项目使用 `openapi-typescript` 从后端 OpenAPI Schema 自动生成接口类型。

### 工作流程

1. Vite 自定义插件 `vite-plugin-generate-openapi-types` 在开发服务器启动时触发
2. 从 `VITE_SERVICE_OPENAPI_URL`（如 `http://localhost:16000/openapi.json`）拉取 Schema
3. 执行 `npx openapi-typescript` 生成类型到 `src/typings/schema.d.ts`
4. HMR 模式下，Schema 文件变化时自动重新生成（基于 SHA-256 哈希比对）

### 类型使用

通过 `Service` 命名空间提供类型辅助：

```ts
// 请求参数类型
type LoginBody = Service.ApiRequest<"/api/v1/auth/login", "post", "body">

// 响应数据类型
type LoginToken = Service.ApiResponse<"/api/v1/auth/login", "post">
```

::: tip
建议在 `src/typings/` 下创建全局类型声明文件，将常用的 API 类型集中管理，方便在业务代码中直接使用 `Api.Auth.LoginBody` 等简短引用。
:::
