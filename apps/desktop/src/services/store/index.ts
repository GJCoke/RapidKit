import Store from "electron-store"
import type { IService } from "../../core/lifecycle"
import type { ServiceContainer } from "../../core/container"

export interface StoreSchema {
  "window.bounds": Electron.Rectangle
  "app.locale": string
  "app.theme": "light" | "dark" | "system"
  [key: string]: unknown
}

export class StoreService implements IService {
  readonly id = "store"
  private store: Store<StoreSchema>

  constructor(_container: ServiceContainer) {
    this.store = new Store<StoreSchema>({
      name: "config",
      defaults: {
        "app.locale": "zh-CN",
        "app.theme": "system",
      } as StoreSchema,
    })
  }

  get<K extends keyof StoreSchema>(key: K): StoreSchema[K] {
    return this.store.get(key)
  }

  set<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): void {
    this.store.set(key, value)
  }
}
