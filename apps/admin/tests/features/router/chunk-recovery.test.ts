import assert from "node:assert/strict"
import { test } from "vitest"

import { isChunkLoadError, shouldReloadChunk } from "@/features/router/chunk-recovery"

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  }
}

test("recognizes Vite dynamic import failures without classifying render errors", () => {
  assert.equal(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: /assets/page.js")), true)
  assert.equal(isChunkLoadError(new Error("Loading chunk 42 failed")), true)
  assert.equal(isChunkLoadError(new Error("Cannot read properties of undefined")), false)
})

test("allows one chunk reload for each build and canonical url", () => {
  const storage = createMemoryStorage()
  const error = new TypeError("Failed to fetch dynamically imported module")
  assert.equal(shouldReloadChunk(error, "/manage/user?b=2&a=1", "build-1", storage), true)
  assert.equal(shouldReloadChunk(error, "/manage/user?a=1&b=2", "build-1", storage), false)
  assert.equal(shouldReloadChunk(error, "/manage/user?a=1&b=2", "build-2", storage), true)
})

test("storage failures safely disable automatic reload", () => {
  const storage = createMemoryStorage()
  storage.getItem = () => {
    throw new Error("blocked")
  }
  assert.equal(shouldReloadChunk(new Error("Loading chunk 1 failed"), "/home", "build-1", storage), false)
})
