import json5 from "json5"
import type { Service } from "@/typings/service"

export function createServiceConfig(env: Env.ImportMeta, reportInvalidConfig: () => void): Service.ServiceConfig {
  const { VITE_SERVICE_BASE_URL, VITE_OTHER_SERVICE_BASE_URL } = env
  let other = {} as Record<Service.OtherBaseURLKey, string>
  try {
    other = json5.parse(VITE_OTHER_SERVICE_BASE_URL)
  } catch {
    reportInvalidConfig()
  }
  return {
    baseURL: VITE_SERVICE_BASE_URL,
    proxyPattern: "/proxy-default",
    other: (Object.keys(other) as Service.OtherBaseURLKey[]).map((key) => ({
      key,
      baseURL: other[key],
      proxyPattern: `/proxy-${key}`,
    })),
  }
}
