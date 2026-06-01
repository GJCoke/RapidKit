export interface IService {
  readonly id: string
  onReady?(): Promise<void>
  onDestroy?(): Promise<void>
}

export interface ServiceConstructor<T extends IService = IService> {
  new (container: import("./container").ServiceContainer): T
}
