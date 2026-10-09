import { useLocaleStore } from "@/stores/locale"

export const SUCCESS_CODE = import.meta.env.VITE_SERVICE_SUCCESS_CODE || "0"
export const SERVICE_BASE_URL = import.meta.env.VITE_SERVICE_BASE_URL

export interface BackendResponse<T = unknown> {
  code: number
  message: string
  data: T
}

export function getRequestLocale() {
  return useLocaleStore.getState().locale
}
