import { beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  fetchGetNotificationPreferences: vi.fn(),
  fetchUpdateNotificationPreference: vi.fn(),
}))

vi.mock("@/service/api", () => api)

import { useNotificationPreferences } from "@/views/notification/preferences/use-notification-preferences"

function preference(enabled: boolean): Api.Notification.PreferenceItem {
  return {
    category: "system",
    nameKey: "notification.category.system",
    enabled,
    closable: true,
    reserved: false,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe("notification preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.fetchGetNotificationPreferences.mockResolvedValue({ data: [preference(true)], error: null })
  })

  it("rolls an optimistic toggle back when the API rejects it", async () => {
    api.fetchUpdateNotificationPreference.mockResolvedValue({ data: null, error: new Error("failed") })
    const preferences = useNotificationPreferences()
    await preferences.load()

    const ok = await preferences.toggle(preferences.items.value[0], false)

    expect(ok).toBe(false)
    expect(preferences.items.value[0].enabled).toBe(true)
  })

  it("ignores a stale toggle response for the same category", async () => {
    const first = deferred<{ data: Api.Notification.PreferenceItem; error: null }>()
    const second = deferred<{ data: Api.Notification.PreferenceItem; error: null }>()
    api.fetchUpdateNotificationPreference.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const preferences = useNotificationPreferences()
    await preferences.load()
    const item = preferences.items.value[0]

    const enable = preferences.toggle(item, false)
    const disable = preferences.toggle(item, true)
    second.resolve({ data: preference(true), error: null })
    await disable
    first.resolve({ data: preference(false), error: null })
    await enable

    expect(item.enabled).toBe(true)
  })
})
