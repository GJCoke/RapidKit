import { captureBrowserError, setupBrowserObservability } from "./observability"

setupBrowserObservability()
void import("./bootstrap").catch((error) => {
  captureBrowserError(error, "bootstrap")
  throw error
})
