/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASE_URL: string
  readonly VITE_SERVICE_BASE_URL: string
  readonly VITE_SERVICE_SUCCESS_CODE: string
  readonly VITE_SERVICE_OPENAPI_URL: string
  readonly VITE_AUTH_ROUTE_MODE: "dynamic" | "static"
  readonly VITE_I18N_DEFAULT_LOCALE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
