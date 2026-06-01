import type { IService, ServiceConstructor } from "./lifecycle"

export class ServiceContainer {
  private services = new Map<string, IService>()
  private order: string[] = []

  register<T extends IService>(Ctor: ServiceConstructor<T>): void {
    const instance = new Ctor(this)
    if (this.services.has(instance.id)) {
      throw new Error(`Service '${instance.id}' already registered`)
    }
    this.services.set(instance.id, instance)
    this.order.push(instance.id)
  }

  get<T extends IService>(id: string): T {
    const service = this.services.get(id)
    if (!service) {
      throw new Error(`Service '${id}' not found`)
    }
    return service as T
  }

  async bootstrap(): Promise<void> {
    for (const id of this.order) {
      const service = this.services.get(id)!
      if (service.onReady) {
        await service.onReady()
      }
    }
  }

  async shutdown(): Promise<void> {
    const reversed = [...this.order].reverse()
    for (const id of reversed) {
      const service = this.services.get(id)!
      if (service.onDestroy) {
        await service.onDestroy()
      }
    }
  }
}
