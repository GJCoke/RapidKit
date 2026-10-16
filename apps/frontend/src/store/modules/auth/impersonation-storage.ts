import { localStg } from "@/utils/storage"

export function beginImpersonationStorage(created: Api.Impersonation.Created, returnPath: string) {
  if (localStg.get("impersonation") || localStg.get("impersonatorToken")) {
    throw new Error("Nested impersonation is not supported")
  }
  const token = localStg.get("token")
  if (!token) throw new Error("Missing administrator credentials")
  localStg.set("impersonatorToken", token)
  const refresh = localStg.get("refreshToken")
  if (refresh) localStg.set("impersonatorRefreshToken", refresh)
  else localStg.remove("impersonatorRefreshToken")
  localStg.set("impersonatorReturnPath", returnPath)
  localStg.set("impersonation", {
    sessionId: created.sessionId,
    subject: created.subject,
    expiresAt: created.expiresAt,
  })
  localStg.set("token", created.accessToken)
  localStg.remove("refreshToken")
}

export function restoreImpersonatorStorage(): string | null {
  if (!localStg.get("impersonation") && !localStg.get("impersonatorToken")) return null
  const token = localStg.get("impersonatorToken")
  const refresh = localStg.get("impersonatorRefreshToken")
  const returnPath = localStg.get("impersonatorReturnPath") || "/"
  if (token) localStg.set("token", token)
  else localStg.remove("token")
  if (token && refresh) localStg.set("refreshToken", refresh)
  else localStg.remove("refreshToken")
  localStg.remove("impersonation")
  localStg.remove("impersonatorToken")
  localStg.remove("impersonatorRefreshToken")
  localStg.remove("impersonatorReturnPath")
  return returnPath
}
