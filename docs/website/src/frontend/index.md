# 前端项目说明

本前端项目基于 **Soybean Admin** 开发，如果有基础问题，可访问其 [官网](https://docs.soybeanjs.cn/zh/) 查看文档和指南。

## 功能升级

我们对 **Soybean Admin** 的部分功能进行了升级，以提升开发体验和效率。

## I18n 升级

当前项目对多语言的处理方式进行了优化：

- 只需在 `apps/frontend/src/locales/langs` 下配置对应语言及 `namespace` 文件
- 程序会自动生成对应的 **TypeScript 类型文件**
- 开发过程中可以获得完整类型提示，减少人为错误

## Service 升级

使用 `openapi-typescript` 自动生成接口 Schema 类型文件，实现以下目标：

- 避免重复定义类型
- 请求参数和返回值类型 **自动推导**
- 提升开发效率和类型安全

### 示例

以接口 `/api/v1/auth/login` 为例，我们可以通过以下方式获取请求参数类型：

:::tabs
== Body

```ts
Service.ApiRequest<"/api/v1/auth/login", "post", "body">
```

== Query

```ts
Service.ApiRequest<"/api/v1/auth/login", "post", "query">
```

== Path

```ts
Service.ApiRequest<"/api/v1/auth/login", "post", "path">
```

:::

获取接口响应类型：

```ts
Service.ApiResponse<"/api/v1/auth/login", "post">
```

::: info 提示
你也可以在 request 封装中增加更智能的类型推导，但通常我们希望类型定义不仅在接口调用时使用，因此当前实现更灵活可扩展。
:::

## 全局 API 类型示例

下面是一个完整的全局类型声明示例：

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
