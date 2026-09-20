import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@fontsource-variable/geist"

import "@/styles/globals.css"
import App from "@/app/App"
import { setupBootstrapLoading } from "@/app/bootstrap-loading"

setupBootstrapLoading()

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
