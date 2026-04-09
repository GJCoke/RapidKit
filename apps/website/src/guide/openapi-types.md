## 方案背景

在前后端分离项目中，OpenAPI（Swagger）是后端接口标准化描述的主流方案，而 openapi-typescript 可将 OpenAPI 规范自动转换为 TypeScript 类型，结合 Vite 插件实现开发阶段类型自动更新，彻底解决前后端接口类型不一致、手动维护类型繁琐的问题。

本文基于实际项目代码，讲解如何落地 openapi-typescript，实现 API 类型全链路类型安全。

## 核心目标

1. 从后端 OpenAPI 文档地址自动生成 TypeScript 类型文件；
2. 结合 Vite 插件实现开发阶段热更新时自动同步接口类型；
3. 封装通用的 API 请求类型工具，快速推导请求参数、响应数据类型；
4. 基于生成的类型封装业务级 API 命名空间，提升代码可读性和复用性。

## 实现步骤

### Vite 插件自动生成类型

封装 Vite 插件 `generateOpenapiTypesPlugin`，实现「构建启动时生成类型 + 热更新时校验并更新类型」，核心逻辑如下：

#### 插件核心功能

1. 加载环境变量：通过 Vite 的 `loadEnv` 获取后端 OpenAPI 地址（VITE_SERVICE_OPENAPI_URL）；
2. 类型生成逻辑：调用 `openapi-typescript` 命令，从远程 OpenAPI 地址生成类型文件到指定路径（src/typings/schema.d.ts）；
3. 哈希校验：通过 SHA256 计算生成文件的哈希值，避免热更新时重复生成相同类型；
4. 热更新处理：开发模式下，热更新触发时校验类型文件是否变更，仅当哈希值变化时重新生成。

#### 插件关键逻辑说明

- 路径处理：通过 `fileURLToPath` 和 `path` 模块解析类型文件输出路径，确保跨平台兼容性；
- 子进程执行：使用 `child_process.exec` 执行 `openapi-typescript` 命令，捕获执行日志和错误；
- 环境隔离：仅在开发环境（NODE_ENV=development）执行类型生成，避免生产构建时重复操作。

### 封装通用 API 类型工具

基于生成的 `schema.d.ts` 中的 `paths` 类型（openapi-typescript 自动生成），封装 `ApiRequest` 和 `ApiResponse` 类型工具，快速推导请求参数和响应数据类型：

#### 1. ApiRequest：推导请求参数类型

按参数位置（path/query/body）分类推导，支持：

- path：URL 路径参数（如 /api/v1/roles/{role_id} 中的 role_id）；
- query：URL 查询参数（如 /api/v1/roles?page=1&size=10）；
- body：POST/PUT 请求的 JSON 体参数；
- 泛型参数：P 为接口路径，M 为请求方法，T 为参数位置，精准定位对应参数类型。

#### 2. ApiResponse：推导响应数据类型

默认取 200 状态码的响应数据，且自动解析 JSON 格式的响应体，若响应体包含 `data` 字段则提取 `data` 类型，否则返回完整响应体类型，适配后端常见的响应格式（如 { code: number, data: T, message: string }）。

### 封装业务级 API 命名空间

在全局命名空间 `Api` 下按业务模块（如 Auth、Role）封装类型，简化业务代码中类型的使用：

#### 命名空间设计原则

1. 按后端接口模块划分：如 Auth 对应认证相关接口，Role 对应角色管理相关接口；
2. 类型命名语义化：如 LoginBody 对应登录接口的请求体，LoginToken 对应登录接口的响应数据；
3. 复用通用类型工具：通过 `Service.ApiRequest`/`Service.ApiResponse` 快速推导类型，无需重复定义。

#### 示例：Auth 模块类型封装

```ts
import type { Service } from "@/typings/service"

declare global {
  namespace Api {
    /**
     * namespace Auth
     *
     * backend api module: "auth"
     */
    namespace Auth {
      type LoginBody = Service.ApiRequest<"/api/v1/auth/login", "post", "body">

      type LoginToken = Service.ApiResponse<"/api/v1/auth/login", "post">

      type UserInfo = Service.ApiResponse<"/api/v1/auth/user/info">

      type PublicKey = Service.ApiResponse<"/api/v1/auth/keys/public">
    }

    namespace Role {
      type GetRoleQuery = Service.ApiRequest<"/api/v1/roles", "get", "query">

      type PutRolePath = Service.ApiRequest<"/api/v1/roles/{role_id}", "put", "path">
    }
  }
}
```

## 实际业务场景使用

### 接口请求函数封装

基于封装的类型，实现类型安全的请求函数：

```ts
import { request } from "../request"

/** login */
export function fetchLogin(data: Api.Auth.LoginBody) {
  return request<Api.Auth.LoginToken>({
    url: "/auth/login",
    method: "POST",
    data,
  })
}

/** Get user info */
export function fetchGetPublicKey() {
  return request<Api.Auth.PublicKey>({ url: "/auth/keys/public" })
}

/** Get user info */
export function fetchGetUserInfo() {
  return request<Api.Auth.UserInfo>({ url: "/auth/user/info" })
}
```

- 优势：请求参数和响应数据均有严格类型校验，编辑器自动提示参数字段，避免传参错误；
- 自动推导：无需手动定义请求 / 响应类型，完全复用 OpenAPI 生成的类型。

## 常见问题与解决方案

### 类型文件生成失败

- 检查 OpenAPI 地址是否可访问：确保 VITE_SERVICE_OPENAPI_URL 配置正确，后端服务已启动且 OpenAPI 文档路径正确；
- 检查 OpenAPI 文档格式：确保文档符合 OpenAPI 3.0+ 规范，避免语法错误导致 openapi-typescript 解析失败；
- 权限问题：若 OpenAPI 文档需要认证，需在地址中携带 token（如？token=xxx）。

### 热更新时类型未更新

- 检查哈希值计算逻辑：确保文件路径解析正确，fs.readFileSync 能读取到最新的类型文件；
- 确认环境变量：开发环境下 NODE_ENV 需为 development，否则插件不会执行热更新逻辑；
- 手动触发：若自动更新失效，可删除生成的 schema.d.ts 文件，重启 Vite 开发服务重新生成。

### 响应类型推导错误

- 检查后端响应格式：确保 200 状态码的响应体包含 application/json 格式；
- 调整 ApiResponse 类型：若后端响应状态码不是 200（如 201），可修改泛型参数适配（如将 200 改为 201）；
- 嵌套类型解析：若响应体嵌套层级较深，可扩展 ApiResponse 类型增加多层解析逻辑。

## 总结

通过 openapi-typescript + Vite 插件的组合，实现了「OpenAPI 文档 → TS 类型 → 业务代码」的全链路类型安全，核心价值体现在：

- 提效：无需手动维护接口类型，后端文档变更后前端自动同步类型；
- 降错：编译阶段校验请求参数和响应数据类型，避免运行时类型错误；
- 易维护：按业务模块封装类型命名空间，代码结构清晰，便于团队协作；
- 适配性：支持开发环境热更新，兼顾效率与体验。

该方案适用于所有基于 OpenAPI 规范的前后端分离项目，尤其适合中大型项目，能显著提升接口开发的效率和稳定性。
