// @vitest-environment jsdom
import type { ReactNode } from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { createTestQueryClient } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import { useNotificationBanner, invalidateNotificationBanner } from "@/services/hooks/use-notification-banner"

afterEach(() => useAuthStore.getState().clearAuth())
test("banner display uses server time despite a skewed client clock and hides an invalidated revision immediately", async () => {
  useAuthStore.getState().setToken("one", "banner-refresh")
  const client = createTestQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  let calls = 0,
    release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get("http://localhost:16000/api/v1/notifications/top-banner", async () => {
      if (++calls > 1) await gate
      return HttpResponse.json({
        code: 0,
        data: {
          revision: calls === 1 ? 1 : 2,
          serverNow: "2000-01-01T00:30:00Z",
          current: {
            id: "banner",
            title: "Service notice",
            content: "Body",
            contentMode: "raw",
            level: "warning",
            status: "published",
            publishAt: "2000-01-01T00:00:00Z",
            expireAt: "2000-01-01T01:00:00Z",
          },
        },
      })
    }),
  )
  const { result } = renderHook(() => useNotificationBanner(), { wrapper })
  await waitFor(() => expect(result.current.current?.title).toBe("Service notice"))
  act(() => invalidateNotificationBanner(client, getAuthSession(), 2))
  await waitFor(() => expect(result.current.current).toBeNull())
  await act(async () => {
    release()
    await gate
  })
  await waitFor(() => expect(result.current.current?.title).toBe("Service notice"))
})

test("a revision arriving during the first banner request fetches a newer snapshot immediately", async () => {
  useAuthStore.getState().setToken("one", "banner-first-load-refresh")
  const client = createTestQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  let calls = 0,
    release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get("http://localhost:16000/api/v1/notifications/top-banner", async () => {
      const revision = ++calls
      if (revision === 1) await gate
      return HttpResponse.json({
        code: 0,
        data: {
          revision,
          serverNow: "2026-10-23T08:00:00Z",
          current: {
            id: `banner-${revision}`,
            title: `Banner ${revision}`,
            content: "Body",
            contentMode: "raw",
            level: "info",
            status: "published",
          },
        },
      })
    }),
  )
  const { result } = renderHook(() => useNotificationBanner(), { wrapper })
  try {
    await waitFor(() => expect(calls).toBe(1))
    act(() => invalidateNotificationBanner(client, getAuthSession(), 2))
    act(() => release())
    await waitFor(() => expect(result.current.isFetching).toBe(false))
    expect(result.current.current?.title).toBe("Banner 2")
  } finally {
    release()
  }
})
