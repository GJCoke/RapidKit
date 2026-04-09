# @rapidkit/utils

通用工具函数库,提供加密、存储、ID 生成、深拷贝等常用能力。所有工具均为纯函数或轻量类,不依赖任何 UI 框架。

## 安装与引用

该包已在 `pnpm-workspace.yaml` 中声明,其他包通过 `workspace:*` 协议依赖:

```jsonc
// package.json
{
  "dependencies": {
    "@rapidkit/utils": "workspace:*",
  },
}
```

```ts
import { Crypto, jsonClone, nanoid, createStorage, createLocalforage } from "@rapidkit/utils"
```

## 构建方式

通过 `@rapidkit/builder`(Rollup)构建,输出 ESM / CJS / IIFE 三种格式,入口为 `dist/index.esm.js`。

## 导出一览

| 导出                | 来源          | 说明                                              |
| ------------------- | ------------- | ------------------------------------------------- |
| `Crypto`            | `crypto-js`   | AES 加解密类                                      |
| `createStorage`     | 原生 Storage  | 类型安全的 localStorage / sessionStorage 封装     |
| `createLocalforage` | `localforage` | 支持 IndexedDB / WebSQL / localStorage 的异步存储 |
| `nanoid`            | `nanoid`      | 短 ID 生成                                        |
| `jsonClone`         | `klona/json`  | 高性能 JSON 深拷贝                                |

## 详细说明

### Crypto -- AES 加解密

基于 `crypto-js` 的泛型加解密类,用于敏感数据(如 token)在本地存储前加密。

```ts
const crypto = new Crypto<{ token: string }>("my-secret-key")

const encrypted = crypto.encrypt({ token: "abc123" })
const decrypted = crypto.decrypt(encrypted)
// => { token: 'abc123' }
```

::: tip
解密失败时返回 `null` 而非抛出异常,调用方需做空值判断。
:::

### createStorage -- 浏览器存储封装

对 `localStorage` / `sessionStorage` 的类型安全封装,自动序列化与反序列化,支持统一前缀。

```ts
interface StorageSchema {
  token: string
  userInfo: { name: string; role: string }
}

const localStg = createStorage<StorageSchema>("local", "app_")

localStg.set("token", "xxx")
const token = localStg.get("token") // string | null
localStg.remove("token")
localStg.clear()
```

### createLocalforage -- 异步持久化存储

对 `localforage` 的泛型封装,支持 IndexedDB、WebSQL、localStorage 三种驱动。适合存储较大的离线数据。

```ts
interface ForageSchema {
  cacheData: ArrayBuffer
}

const forage = createLocalforage<ForageSchema>("indexedDB")

await forage.setItem("cacheData", buffer)
const data = await forage.getItem("cacheData")
```

### nanoid -- 短 ID 生成

直接从 `nanoid` 库再导出,生成 URL 安全的唯一 ID,默认 21 位。

```ts
const id = nanoid() // "V1StGXR8_Z5jdHi6B-myT"
```

### jsonClone -- JSON 深拷贝

基于 `klona/json`,仅克隆 JSON 安全的值(不含函数、Symbol 等),性能优于 `structuredClone` 和
`JSON.parse(JSON.stringify(...))`。

```ts
const original = { a: 1, b: { c: [2, 3] } }
const cloned = jsonClone(original)
cloned.b.c.push(4)
// original.b.c 仍为 [2, 3]
```

::: warning
`jsonClone` 不支持 `Date`、`RegExp`、`Map`、`Set` 等非 JSON 类型,这些值会被丢弃或转换。如需完整结构化克隆,请使用浏览器原生
`structuredClone`。
:::
