import type { Router } from "vue-router"
import { createRouteGuard } from "./route"
import { createProgressGuard } from "./progress"
import { createDocumentTitleGuard } from "./title"
import { captureBrowserError } from "@/observability"
import { createLogger } from "@/utils/logger"

const logger = createLogger("router")

/**
 * Router guard
 *
 * @param router - Router instance
 */
export function createRouterGuard(router: Router) {
  router.beforeEach((to, from) => {
    logger.debug("Navigation started", { from: from.name, to: to.name })
  })
  router.afterEach((to, from, failure) => {
    logger.debug("Navigation completed", { from: from.name, to: to.name, result: failure ? "failed" : "success" })
  })
  router.onError((error) => {
    captureBrowserError(error, "route")
  })
  createProgressGuard(router)
  createRouteGuard(router)
  createDocumentTitleGuard(router)
}
