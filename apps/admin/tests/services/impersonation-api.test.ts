// @vitest-environment jsdom
import { expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { createImpersonation, fetchCurrentImpersonation, stopImpersonation } from "@/services/api/impersonation"
const base = "http://localhost:16000/api/v1"
test("impersonation create, current and stop use their exact methods and preserve snapshot identity and expiry", async () => {
  const calls: unknown[] = []
  const snapshot = {
    sessionId: "s1",
    expiresAt: "2026-10-24T02:00:00Z",
    subject: { id: "u1", name: "Subject", username: "subject" },
  }
  server.use(
    http.all(`${base}/auth/impersonations*`, async ({ request }) => {
      calls.push([
        request.method,
        new URL(request.url).pathname,
        request.method === "POST" ? await request.json() : null,
      ])
      return HttpResponse.json({
        code: 0,
        data:
          request.method === "DELETE"
            ? true
            : request.method === "POST"
              ? { ...snapshot, accessToken: "subject-token" }
              : {
                  ...snapshot,
                  actor: { id: "admin", name: "Admin", username: "admin" },
                  createdAt: "2026-10-24T01:00:00Z",
                },
      })
    }),
  )
  expect((await createImpersonation({ targetUserId: "u1", reason: "Investigate" })).data).toMatchObject({
    ...snapshot,
    accessToken: "subject-token",
  })
  expect((await fetchCurrentImpersonation()).data).toMatchObject(snapshot)
  expect((await stopImpersonation()).data).toBe(true)
  expect(calls).toEqual([
    ["POST", "/api/v1/auth/impersonations", { targetUserId: "u1", reason: "Investigate" }],
    ["GET", "/api/v1/auth/impersonations/current", null],
    ["DELETE", "/api/v1/auth/impersonations/current", null],
  ])
})
