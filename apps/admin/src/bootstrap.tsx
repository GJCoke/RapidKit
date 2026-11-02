import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@fontsource-variable/geist"

import "@/styles/globals.css"
import App from "@/app/App"
import { setupBootstrapLoading } from "@/app/bootstrap-loading"
import { AppErrorBoundary } from "@/app/app-error-boundary"
import { captureBrowserError } from "@/observability"

setupBootstrapLoading()

createRoot(document.getElementById("app")!, {
  onUncaughtError: (error) => {
    captureBrowserError(error, "render")
  },
}).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
