import type { Service } from "@/typings/service"
import { createLogger } from "./logger"
import { createServiceConfig } from "./service-config"

const logger = createLogger("service")

/**
 * get backend service base url
 *
 * @param env - the current env
 * @param isProxy - if use proxy
 */
export function getServiceBaseURL(env: Env.ImportMeta, isProxy: boolean) {
  const { baseURL, other, proxyPattern } = createServiceConfig(env, () => {
    logger.error("VITE_OTHER_SERVICE_BASE_URL is not a valid json5 string")
  })

  const otherBaseURL = {} as Record<Service.OtherBaseURLKey, string>

  other.forEach((item) => {
    otherBaseURL[item.key] = isProxy ? item.proxyPattern : item.baseURL
  })

  return {
    baseURL: isProxy ? proxyPattern : baseURL,
    otherBaseURL,
  }
}
