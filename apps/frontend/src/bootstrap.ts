import { createApp } from "vue"
import "./plugins/assets"
import { setupAppVersionNotification, setupDayjs, setupIconifyOffline, setupLoading, setupNProgress } from "./plugins"
import { setupStore } from "./store"
import { setupRouter } from "./router"
import { setupI18n } from "./locales"
import App from "./App.vue"
import { captureBrowserError } from "./observability"
import { showDiagnosticNotification } from "./utils/diagnostic-message"
import { $t } from "./locales"

async function setupApp() {
  setupLoading()

  setupNProgress()

  setupIconifyOffline()

  setupDayjs()

  const app = createApp(App)
  app.config.errorHandler = (error) => {
    const eventId = captureBrowserError(error, "render")
    showDiagnosticNotification(
      $t("request.serverError"),
      { diagnostic_id: eventId },
      { source: "bootstrap", group: "render" },
    )
  }

  setupStore(app)

  await setupRouter(app)

  setupI18n(app)

  setupAppVersionNotification()

  app.mount("#app")
}

setupApp()
