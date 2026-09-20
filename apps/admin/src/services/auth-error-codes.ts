interface AuthErrorCodeEnv {
  VITE_SERVICE_EXPIRED_TOKEN_CODES?: string
  VITE_SERVICE_LOGOUT_CODES?: string
}

const DEFAULT_EXPIRED_TOKEN_CODES = ["14002"]
const DEFAULT_LOGOUT_CODES = ["14003", "14008"]

function parseCodeList(value: string | undefined, fallback: string[]) {
  const codes = value
    ?.split(",")
    .map((code) => code.trim())
    .filter(Boolean)

  return new Set(codes?.length ? codes : fallback)
}

export function resolveAuthErrorCodes(env: AuthErrorCodeEnv) {
  return {
    expiredTokenCodes: parseCodeList(env.VITE_SERVICE_EXPIRED_TOKEN_CODES, DEFAULT_EXPIRED_TOKEN_CODES),
    logoutCodes: parseCodeList(env.VITE_SERVICE_LOGOUT_CODES, DEFAULT_LOGOUT_CODES),
  }
}
