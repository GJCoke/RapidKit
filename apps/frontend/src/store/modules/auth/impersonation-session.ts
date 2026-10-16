import { getAuthSession } from "@/service/request/auth-session"
import { localStg } from "@/utils/storage"
import { beginImpersonationStorage, restoreImpersonatorStorage } from "./impersonation-storage"

interface Dependencies {
  create: (body: Api.Impersonation.CreateBody) => Promise<{ data: Api.Impersonation.Created | null; error: unknown }>
  validate: () => Promise<{ data: Api.Impersonation.Current | null; error: unknown }>
  stop: () => Promise<unknown>
  clearRuntime: () => Promise<void>
  loadIdentity: (isCurrent?: () => boolean) => Promise<boolean>
  navigate: (path: string) => Promise<unknown>
  login: () => Promise<unknown>
  reconnect: () => void
  changed?: (snapshot: Api.Impersonation.Snapshot | null) => void
}

export function createImpersonationSession(deps: Dependencies) {
  let revision = 0
  let entering: Promise<boolean> | null = null
  let stopping: Promise<void> | null = null
  let restoring: Promise<void> | null = null
  const changed = () => deps.changed?.(localStg.get("impersonation"))

  function cancel() {
    revision++
  }

  function restore(): Promise<void> {
    if (restoring) return restoring
    const owner = ++revision
    const path = restoreImpersonatorStorage()
    changed()
    if (path === null) return Promise.resolve()
    const generation = getAuthSession()
    const current = () => owner === revision && generation === getAuthSession()
    restoring = (async () => {
      await deps.clearRuntime()
      if (!current()) return
      if (!localStg.get("token") || !(await deps.loadIdentity(current))) {
        if (!current()) return
        localStg.remove("token")
        localStg.remove("refreshToken")
        getAuthSession()
        await deps.login()
        return
      }
      if (!current()) return
      await deps.navigate(path)
      if (current()) deps.reconnect()
    })().finally(() => {
      restoring = null
    })
    return restoring
  }

  function stop(): Promise<void> {
    if (stopping) return stopping
    const sessionId = localStg.get("impersonation")?.sessionId
    if (!sessionId) return restore()
    const owner = ++revision
    stopping = (async () => {
      try {
        await deps.stop()
      } catch {
        /* Offline recovery still restores local administrator credentials. */
      }
      if (owner === revision && localStg.get("impersonation")?.sessionId === sessionId) await restore()
    })().finally(() => {
      stopping = null
    })
    return stopping
  }

  function enter(body: Api.Impersonation.CreateBody, returnPath: string): Promise<boolean> {
    if (entering) return entering
    if (stopping) return stopping.then(() => enter(body, returnPath))
    if (localStg.get("impersonation") || localStg.get("impersonatorToken")) return Promise.resolve(false)
    const owner = ++revision
    let generation = getAuthSession()
    const current = () => owner === revision && generation === getAuthSession()
    entering = (async () => {
      try {
        const { data, error } = await deps.create(body)
        if (error || !data || !current()) return false
        beginImpersonationStorage(data, returnPath)
        generation = getAuthSession()
        changed()
        await deps.clearRuntime()
        if (!current()) return false
        const loaded = await deps.loadIdentity(current)
        if (!current()) return false
        if (!loaded) {
          await stop()
          return false
        }
        await deps.navigate("/")
        if (!current()) return false
        deps.reconnect()
        return true
      } catch {
        if (current() && localStg.get("impersonation")) await stop()
        return false
      }
    })().finally(() => {
      entering = null
    })
    return entering
  }

  async function validate(): Promise<boolean> {
    const sessionId = localStg.get("impersonation")?.sessionId
    if (!sessionId) return true
    const owner = revision
    try {
      const { data, error } = await deps.validate()
      if (owner !== revision || localStg.get("impersonation")?.sessionId !== sessionId) return false
      const expiry = data && Date.parse(data.expiresAt)
      if (error || !data || !expiry || !Number.isFinite(expiry) || expiry <= Date.now()) {
        await stop()
        return false
      }
      localStg.set("impersonation", { sessionId: data.sessionId, subject: data.subject, expiresAt: data.expiresAt })
      changed()
      return true
    } catch {
      if (owner === revision && localStg.get("impersonation")?.sessionId === sessionId) await stop()
      return false
    }
  }

  return { enter, stop, restore, validate, cancel }
}
