import { describe, expect, it } from "vitest"
import type { IService, ServiceConstructor } from "../../src/core/lifecycle"

describe("IService interface", () => {
  it("accepts a class with only id", () => {
    const service: IService = { id: "test" }
    expect(service.id).toBe("test")
  })

  it("accepts a class with lifecycle hooks", () => {
    const service: IService = {
      id: "test",
      onReady: async () => {},
      onDestroy: async () => {},
    }
    expect(service.id).toBe("test")
    expect(typeof service.onReady).toBe("function")
    expect(typeof service.onDestroy).toBe("function")
  })

  it("ServiceConstructor type accepts a class with container param", () => {
    class FakeService implements IService {
      readonly id = "fake"
      constructor(_container: unknown) {}
    }
    const Ctor: ServiceConstructor = FakeService as any
    expect(Ctor).toBeDefined()
  })
})
