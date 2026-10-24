import { hasImpersonationStorage } from "@/features/auth/impersonation-storage"

let recover: (() => Promise<void>) | null = null

/** Keeps transport/store independent of the API-backed identity coordinator. */
export function setImpersonationRecovery(handler: () => Promise<void>) {
  recover = handler
  return () => {
    if (recover === handler) recover = null
  }
}
export function recoverImpersonation(): Promise<void> | null {
  return hasImpersonationStorage() && recover ? recover() : null
}
