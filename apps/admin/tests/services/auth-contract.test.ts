import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"

const adminRoot = new URL("../../", import.meta.url)

async function read(relativePath: string) {
  return readFile(new URL(relativePath, adminRoot), "utf8")
}

test("admin service bases include the backend API prefix", async () => {
  const [development, testEnv, production] = await Promise.all([read(".env"), read(".env.test"), read(".env.prod")])

  assert.match(development, /^VITE_SERVICE_BASE_URL=http:\/\/localhost:16000\/api\/v1$/m)
  assert.match(testEnv, /^VITE_SERVICE_BASE_URL=http:\/\/localhost:16000\/api\/v1$/m)
  assert.match(production, /^VITE_SERVICE_BASE_URL=\/api\/v1$/m)
})

test("auth requests use paths relative to the API base", async () => {
  const [authApi, request] = await Promise.all([read("src/services/api/auth.ts"), read("src/services/request.ts")])

  assert.match(authApi, /url: "\/auth\/login"/)
  assert.match(request, /fetch\(`\$\{SERVICE_BASE_URL\}\/auth\/token\/refresh`/)
  assert.match(request, /body: JSON\.stringify\(\{ refreshToken \}\)/)
  assert.doesNotMatch(request, /\/auth\/refreshToken/)
})
