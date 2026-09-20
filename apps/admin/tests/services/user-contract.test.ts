import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"

const serviceRoot = new URL("../../src/services/", import.meta.url)

async function read(relativePath: string) {
  return readFile(new URL(relativePath, serviceRoot), "utf8")
}

test("user requests follow the OpenAPI paths relative to the API base", async () => {
  const userApi = await read("api/user.ts")

  assert.match(userApi, /url: "\/users"/)
  assert.match(userApi, /url: `\/users\/\$\{userId\}`/)
  assert.match(userApi, /url: "\/users\/validate-username-pinyin"/)
  assert.match(userApi, /url: `\/users\/\$\{userId\}\/password`/)
  assert.match(userApi, /url: `\/users\/\$\{userId\}\/resend-invite`/)
  assert.doesNotMatch(userApi, /url: ["`]\/api\/v1/)
})

test("role and department option requests use their read-only endpoints", async () => {
  const [roleApi, departmentApi] = await Promise.all([read("api/role.ts"), read("api/department.ts")])

  assert.match(roleApi, /url: "\/roles\/all"/)
  assert.match(departmentApi, /url: "\/departments\/tree"/)
})

test("admin owns a generated OpenAPI schema instead of importing frontend types", async () => {
  const [schema, serviceTypes] = await Promise.all([read("../typings/schema.d.ts"), read("../typings/service.ts")])

  assert.match(schema, /export interface paths/)
  assert.match(serviceTypes, /from "\.\/schema"/)
  assert.doesNotMatch(serviceTypes, /apps\/frontend|frontend\/src/)
})
