import { crashReporter } from "electron"
import type { IService } from "../../core/lifecycle"
import type { ServiceContainer } from "../../core/container"

export class CrashReporterService implements IService {
  readonly id = "crash-reporter"

  constructor(_container: ServiceContainer) {}

  async onReady(): Promise<void> {
    crashReporter.start({
      productName: "RapidKit",
      submitURL: "",
      uploadToServer: false,
    })
  }
}
