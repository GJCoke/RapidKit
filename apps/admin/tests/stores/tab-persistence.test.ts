import assert from "node:assert/strict"
import { test } from "vitest"
import type { StateStorage } from "zustand/middleware"

import { createTabStore, type Tab } from "@/stores/tab"

const usersTab: Tab = {
  key: "route:users",
  routeName: "users",
  label: "Users",
  path: "/users",
  closable: true,
}

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

function persistedTabs() {
  return JSON.stringify({ state: { tabs: [usersTab], activeKey: usersTab.key }, version: 2 })
}

test("disabled tab restoration skips boot hydration and clears the existing payload", () => {
  const storage = createMemoryStorage(persistedTabs())

  const store = createTabStore(storage, false)

  assert.deepEqual(store.getState().tabs, [])
  assert.equal(store.getState().activeKey, "")
  assert.equal(storage.value, undefined)
})

test("disabled tab restoration suppresses persistence after later mutations", () => {
  const storage = createMemoryStorage()
  const store = createTabStore(storage, false)

  store.getState().addTab(usersTab)
  store.getState().setActiveKey(usersTab.key)

  assert.deepEqual(store.getState().tabs, [usersTab])
  assert.equal(storage.value, undefined)
})

test("re-enabling tab restoration deliberately resumes persistence", () => {
  const storage = createMemoryStorage()
  const store = createTabStore(storage, false)
  store.getState().addTab(usersTab)

  store.getState().setPersistenceEnabled(true)
  store.getState().setActiveKey(usersTab.key)

  assert.deepEqual(JSON.parse(storage.value ?? ""), {
    state: { tabs: [usersTab], activeKey: usersTab.key },
    version: 2,
  })
})
