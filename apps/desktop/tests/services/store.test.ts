import { describe, expect, it, vi } from "vitest"

const mockStore = {
  get: vi.fn(),
  set: vi.fn(),
}

vi.mock("electron-store", () => ({
  default: class {
    get = mockStore.get
    set = mockStore.set
    constructor() {}
  },
}))

import { StoreService } from "../../src/services/store"
import { ServiceContainer } from "../../src/core/container"

describe("StoreService", () => {
  it("has correct id", () => {
    const container = new ServiceContainer()
    container.register(StoreService)
    const store = container.get<StoreService>("store")
    expect(store.id).toBe("store")
  })

  it("delegates get to electron-store", () => {
    const container = new ServiceContainer()
    container.register(StoreService)
    const store = container.get<StoreService>("store")
    mockStore.get.mockReturnValue("zh-CN")
    const val = store.get("app.locale")
    expect(mockStore.get).toHaveBeenCalledWith("app.locale")
    expect(val).toBe("zh-CN")
  })

  it("delegates set to electron-store", () => {
    const container = new ServiceContainer()
    container.register(StoreService)
    const store = container.get<StoreService>("store")
    store.set("app.theme", "dark")
    expect(mockStore.set).toHaveBeenCalledWith("app.theme", "dark")
  })
})
