import type { Router } from "vue-router"
import { createRouteGuard } from "./route"
import { createProgressGuard } from "./progress"
import { createDocumentTitleGuard } from "./title"
import { captureBrowserError } from "@/observability"

/**
 * Router guard
 *
 * @param router - Router instance
 */
export function createRouterGuard(router: Router) {
  router.onError((error) => {
    captureBrowserError(error, "route")
  })
  createProgressGuard(router)
  createRouteGuard(router)
  createDocumentTitleGuard(router)
}
