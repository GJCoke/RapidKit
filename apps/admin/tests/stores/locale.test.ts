import assert from "node:assert/strict"
import { test } from "vitest"
import type { StateStorage } from "zustand/middleware"

import { createLocaleStore } from "@/stores/locale"

function createMemoryStorage(initialValue?: string): StateStorage & { value?: string } {
  return {
    value: initialValue,
    getItem() {
      return this.value ?? null
    },
    setItem(_name, value) {
      this.value = value
    },
    removeItem() {
      this.value = undefined
    },
  }
}

test("defaults to zh-CN and persists only the selected locale", () => {
  const storage = createMemoryStorage()
  const store = createLocaleStore(storage)

  assert.equal(store.getState().locale, "zh-CN")
  store.getState().setLocale("en-US")

  assert.equal(store.getState().locale, "en-US")
  assert.deepEqual(JSON.parse(storage.value ?? ""), {
    state: { locale: "en-US" },
    version: 1,
  })
})

test("uses the configured locale when storage has no selection", () => {
  const store = createLocaleStore(createMemoryStorage(), "en-US")

  assert.equal(store.getState().locale, "en-US")
})

test("normalizes an invalid persisted locale", async () => {
  const storage = createMemoryStorage(JSON.stringify({ state: { locale: "fr-FR" }, version: 1 }))
  const store = createLocaleStore(storage)

  await store.persist.rehydrate()

  assert.equal(store.getState().locale, "zh-CN")
})

test("retains a valid configured locale when the persisted locale is invalid", async () => {
  const storage = createMemoryStorage(JSON.stringify({ state: { locale: "fr-FR" }, version: 1 }))
  const store = createLocaleStore(storage, "en-US")

  await store.persist.rehydrate()

  assert.equal(store.getState().locale, "en-US")
})

test("continues to work when storage is unavailable", () => {
  const storage: StateStorage = {
    getItem: () => {
      throw new Error("storage disabled")
    },
    setItem: () => {
      throw new Error("storage disabled")
    },
    removeItem: () => undefined,
  }
  const store = createLocaleStore(storage)

  assert.doesNotThrow(() => store.getState().setLocale("en-US"))
  assert.equal(store.getState().locale, "en-US")
})
