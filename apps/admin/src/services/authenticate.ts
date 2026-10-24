import type { AuthUserInfo, LoginParams, LoginResponse } from "@/services/api/auth"

interface FlatResult<T> {
  data?: T | null
  error?: unknown
}

export interface AuthenticationDependencies {
  getSession: () => number
  fetchPublicKey: () => Promise<FlatResult<string>>
  encrypt: (publicKey: string, plaintext: string) => Promise<string>
  login: (credentials: LoginParams) => Promise<FlatResult<LoginResponse>>
  setToken: (accessToken: string, refreshToken: string) => void
  clearAuth: () => void
  fetchUserInfo: () => Promise<FlatResult<AuthUserInfo>>
  setUserInfo: (info: AuthUserInfo) => void
}

export type AuthenticationResult = { ok: true } | { ok: false; error: unknown }

function failed(error: unknown, fallback: string): AuthenticationResult {
  return { ok: false, error: error ?? new Error(fallback) }
}

export async function authenticate(
  credentials: LoginParams,
  dependencies: AuthenticationDependencies,
): Promise<AuthenticationResult> {
  let session = dependencies.getSession()
  let ownsCredentials = false
  const assertCurrent = () => {
    if (dependencies.getSession() !== session)
      throw Object.assign(new Error("Login session changed"), { code: "ERR_CANCELED" })
  }
  try {
    const publicKeyResult = await dependencies.fetchPublicKey()
    assertCurrent()
    if (publicKeyResult.error || !publicKeyResult.data) {
      return failed(publicKeyResult.error, "Public key is unavailable")
    }

    const encryptedPassword = await dependencies.encrypt(publicKeyResult.data, credentials.password)
    assertCurrent()
    const loginResult = await dependencies.login({ username: credentials.username, password: encryptedPassword })
    assertCurrent()
    if (loginResult.error || !loginResult.data) return failed(loginResult.error, "Login returned no credentials")

    dependencies.setToken(loginResult.data.accessToken, loginResult.data.refreshToken)
    session = dependencies.getSession()
    ownsCredentials = true

    const userResult = await dependencies.fetchUserInfo()
    assertCurrent()
    if (userResult.error || !userResult.data) {
      dependencies.clearAuth()
      return failed(userResult.error, "User information is unavailable")
    }

    dependencies.setUserInfo(userResult.data)
    return { ok: true }
  } catch (error) {
    if (ownsCredentials && dependencies.getSession() === session) dependencies.clearAuth()
    return { ok: false, error }
  }
}
