import type {
  CreateImpersonationBody,
  ImpersonationCreated,
  ImpersonationCurrent,
  ImpersonationSnapshot,
} from "@/services/api/impersonation"
import { getAuthSession } from "@/services/auth-session"
import {
  beginImpersonation,
  clearIdentityStorage,
  getCredentials,
  hasImpersonationStorage,
  readImpersonation,
  restoreImpersonator,
  updateImpersonation,
} from "./impersonation-storage"

interface Dependencies {
  create: (body: CreateImpersonationBody) => Promise<{ data: ImpersonationCreated | null; error: unknown }>
  validate: () => Promise<{ data: ImpersonationCurrent | null; error: unknown }>
  stop: () => Promise<unknown>
  clearRuntime: () => Promise<void>
  loadIdentity: (isCurrent: () => boolean) => Promise<boolean>
  navigate: (path: string) => Promise<unknown>
  login: () => Promise<unknown>
  changed: (snapshot: ImpersonationSnapshot | null) => void
  busy: (busy: boolean) => void
}

/** Serializes identity transitions; every asynchronous boundary verifies ownership again. */
export function createImpersonationSession(deps: Dependencies) {
  let revision = 0
  let entering: Promise<boolean> | null = null
  let stopping: Promise<void> | null = null
  let restoring: Promise<void> | null = null
  let validating: Promise<boolean> | null = null
  const operations = new Set<symbol>()
  const changed = () => deps.changed(readImpersonation())
  function working() {
    const operation = Symbol()
    operations.add(operation)
    deps.busy(true)
    return () => {
      operations.delete(operation)
      deps.busy(operations.size > 0)
    }
  }
  function cancel() {
    revision++
    operations.clear()
    entering = stopping = restoring = validating = null
    deps.busy(false)
  }
  function restore(): Promise<void> {
    if (restoring) return restoring
    const owner = ++revision
    const path = restoreImpersonator()
    changed()
    if (path === null) return Promise.resolve()
    const generation = getAuthSession()
    const current = () => owner === revision && generation === getAuthSession()
    const done = working()
    const pending = (async () => {
      try {
        await deps.clearRuntime()
        if (!current()) return
        if (!getCredentials().accessToken || !(await deps.loadIdentity(current))) {
          if (!current()) return
          clearIdentityStorage()
          await deps.login()
          return
        }
        if (current()) await deps.navigate(path)
      } catch {
        if (!current()) return
        clearIdentityStorage()
        await deps.login()
      }
    })().finally(() => {
      if (restoring === pending) restoring = null
      done()
    })
    restoring = pending
    return pending
  }
  function stop(): Promise<void> {
    if (stopping) return stopping
    const sessionId = readImpersonation()?.sessionId
    if (!sessionId) return restore()
    const owner = ++revision
    const generation = getAuthSession()
    const done = working()
    const pending = (async () => {
      try {
        await deps.stop()
      } catch {
        /* A timed out/offline server must not strand the administrator. */
      }
      if (owner === revision && generation === getAuthSession() && readImpersonation()?.sessionId === sessionId)
        await restore()
    })().finally(() => {
      if (stopping === pending) stopping = null
      done()
    })
    stopping = pending
    return pending
  }
  function enter(body: CreateImpersonationBody, returnPath: string): Promise<boolean> {
    if (entering) return entering
    if (stopping) return stopping.then(() => enter(body, returnPath))
    if (hasImpersonationStorage()) return Promise.resolve(false)
    const owner = ++revision
    let generation = getAuthSession()
    const current = () => owner === revision && generation === getAuthSession()
    let done = () => {}
    const pending = (async () => {
      try {
        const { data, error } = await deps.create(body)
        if (error || !data || !current()) return false
        beginImpersonation(data, returnPath)
        done = working()
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
        return current()
      } catch {
        if (current() && readImpersonation()) await stop()
        return false
      }
    })().finally(() => {
      if (entering === pending) entering = null
      done()
    })
    entering = pending
    return pending
  }
  function validate(): Promise<boolean> {
    if (validating) return validating
    const snapshot = readImpersonation()
    if (!snapshot) return Promise.resolve(!hasImpersonationStorage())
    const owner = revision,
      generation = getAuthSession()
    const current = () =>
      owner === revision && generation === getAuthSession() && readImpersonation()?.sessionId === snapshot.sessionId
    const pending = (async () => {
      try {
        const { data, error } = await deps.validate()
        if (!current()) return false
        if (
          error ||
          !data ||
          data.sessionId !== snapshot.sessionId ||
          data.subject.id !== snapshot.subject.id ||
          !Number.isFinite(Date.parse(data.expiresAt)) ||
          Date.parse(data.expiresAt) <= Date.now()
        ) {
          await stop()
          return false
        }
        updateImpersonation(data)
        changed()
        return true
      } catch {
        if (current()) await stop()
        return false
      }
    })().finally(() => {
      if (validating === pending) validating = null
    })
    validating = pending
    return pending
  }
  return { enter, stop, restore, validate, cancel }
}
