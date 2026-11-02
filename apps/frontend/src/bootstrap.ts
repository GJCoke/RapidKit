import { createApp } from "vue"
import "./plugins/assets"
import { setupAppVersionNotification, setupDayjs, setupIconifyOffline, setupLoading, setupNProgress } from "./plugins"
import { setupStore } from "./store"
import { setupRouter } from "./router"
import { setupI18n } from "./locales"
import App from "./App.vue"
import { captureBrowserError } from "./observability"
import { diagnosticMessage } from "./utils/diagnostic-message"
import { $t } from "./locales"

async function setupApp() {
  setupLoading()

  setupNProgress()

  setupIconifyOffline()

  setupDayjs()

  const app = createApp(App)
  app.config.errorHandler = (error) => {
    const eventId = captureBrowserError(error, "render")
    window.$message?.error(diagnosticMessage($t("request.serverError"), eventId))
  }

  setupStore(app)

  await setupRouter(app)

  setupI18n(app)

  setupAppVersionNotification()

  app.mount("#app")
}

setupApp()
