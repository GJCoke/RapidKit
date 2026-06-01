import { describe, expect, it, vi } from "vitest"
import { ServiceContainer } from "../../src/core/container"
import type { IService } from "../../src/core/lifecycle"

class StubServiceA implements IService {
  readonly id = "a"
  onReady = vi.fn(async () => {})
  onDestroy = vi.fn(async () => {})
  constructor(_container: ServiceContainer) {}
}

class StubServiceB implements IService {
  readonly id = "b"
  onReady = vi.fn(async () => {})
  onDestroy = vi.fn(async () => {})
  constructor(_container: ServiceContainer) {}
}

describe("ServiceContainer", () => {
  it("registers and retrieves a service", () => {
    const container = new ServiceContainer()
    container.register(StubServiceA)
    const svc = container.get<StubServiceA>("a")
    expect(svc).toBeInstanceOf(StubServiceA)
    expect(svc.id).toBe("a")
  })

  it("throws when getting an unregistered service", () => {
    const container = new ServiceContainer()
    expect(() => container.get("missing")).toThrow("Service 'missing' not found")
  })

  it("throws when registering duplicate id", () => {
    const container = new ServiceContainer()
    container.register(StubServiceA)
    expect(() => container.register(StubServiceA)).toThrow("Service 'a' already registered")
  })

  it("bootstrap calls onReady in registration order", async () => {
    const order: string[] = []
    class OrderedA implements IService {
      readonly id = "a"
      async onReady() {
        order.push("a")
      }
      constructor(_container: ServiceContainer) {}
    }
    class OrderedB implements IService {
      readonly id = "b"
      async onReady() {
        order.push("b")
      }
      constructor(_container: ServiceContainer) {}
    }

    const container = new ServiceContainer()
    container.register(OrderedA)
    container.register(OrderedB)
    await container.bootstrap()
    expect(order).toEqual(["a", "b"])
  })

  it("shutdown calls onDestroy in reverse registration order", async () => {
    const order: string[] = []
    class OrderedA implements IService {
      readonly id = "a"
      async onDestroy() {
        order.push("a")
      }
      constructor(_container: ServiceContainer) {}
    }
    class OrderedB implements IService {
      readonly id = "b"
      async onDestroy() {
        order.push("b")
      }
      constructor(_container: ServiceContainer) {}
    }

    const container = new ServiceContainer()
    container.register(OrderedA)
    container.register(OrderedB)
    await container.shutdown()
    expect(order).toEqual(["b", "a"])
  })

  it("services can access other services via container", () => {
    class DepService implements IService {
      readonly id = "dep"
      constructor(_container: ServiceContainer) {}
    }
    class ConsumerService implements IService {
      readonly id = "consumer"
      dep: DepService
      constructor(container: ServiceContainer) {
        this.dep = container.get<DepService>("dep")
      }
    }

    const container = new ServiceContainer()
    container.register(DepService)
    container.register(ConsumerService)
    const consumer = container.get<ConsumerService>("consumer")
    expect(consumer.dep).toBeInstanceOf(DepService)
  })
})
