import { describe, expect, it } from "vitest"
import { requestIdFromHeaders, sanitizeBrowserEvent, shouldReportRequestFailure } from "@rapidkit/utils"

describe("browser observability privacy boundary", () => {
  it("keeps safe stack positions and trusted IDs while dropping arbitrary payloads", () => {
    const result = sanitizeBrowserEvent({
      event_id: "a".repeat(32),
      release: "rapidkit@test",
      environment: "production",
      request: {
        url: "https://private.test/account?token=private-value#private-fragment",
        headers: { Authorization: "private-token" },
        data: "private-body",
      },
      user: { email: "private-email" },
      breadcrumbs: [{ message: "private-console" }],
      extra: { storage: "private-storage" },
      tags: { request_id: "abcdefghijklmnopqrstu", arbitrary: "private-tag", category: "request", application: "vue" },
      exception: {
        values: [
          {
            type: "TypeError",
            value: "private-password",
            stacktrace: {
              frames: [
                {
                  filename: "https://app.test/assets/index-a1b2.js?token=private-url#fragment",
                  lineno: 4,
                  colno: 9,
                  vars: { password: "private-var" },
                  context_line: "private-source",
                },
                { filename: "https://other.test/users/private-name", lineno: 1 },
              ],
            },
          },
        ],
      },
      debug_meta: {
        images: [
          {
            type: "sourcemap",
            debug_id: "12345678-1234-4234-8234-123456789abc",
            code_file: "https://app.test/assets/index-a1b2.js?token=private-url",
          },
        ],
      },
    })
    expect(result?.exception?.values?.[0].stacktrace?.frames?.[0]).toMatchObject({
      filename: "https://app.test/assets/index-a1b2.js",
      lineno: 4,
      colno: 9,
    })
    expect(result?.tags?.request_id).toBe("abcdefghijklmnopqrstu")
    expect(JSON.stringify(result)).not.toContain("private-")
    expect(result).not.toHaveProperty("request")
    expect(result).not.toHaveProperty("user")
    expect(result?.debug_meta?.images).toHaveLength(1)
  })

  it("accepts only server request or edge IDs and never arbitrary headers", () => {
    expect(requestIdFromHeaders({ "x-request-id": "abcdefghijklmnopqrstu", "x-edge-request-id": "a".repeat(32) })).toBe(
      "abcdefghijklmnopqrstu",
    )
    expect(requestIdFromHeaders({ "x-request-id": "Bearer private-token", "x-edge-request-id": "b".repeat(32) })).toBe(
      "b".repeat(32),
    )
    expect(requestIdFromHeaders({ "x-request-id": "<script>private</script>" })).toBeUndefined()
  })

  it("does not report expected business rejection or cancellation", () => {
    expect(
      shouldReportRequestFailure({ code: "BACKEND_ERROR", response: { status: 200, data: { code: 15001 } } }),
    ).toBe(false)
    expect(shouldReportRequestFailure({ code: "ERR_CANCELED" })).toBe(false)
    expect(shouldReportRequestFailure({ code: "ERR_NETWORK" })).toBe(true)
    expect(shouldReportRequestFailure({ code: "BACKEND_ERROR", response: { status: 200, data: { code: 7001 } } })).toBe(
      true,
    )
    expect(shouldReportRequestFailure({ response: { status: 503 } })).toBe(true)
  })
})

it("disables SDK user/IP inference and content collection explicitly", async () => {
  const { browserSentryOptions } = await import("@rapidkit/utils")
  const options = browserSentryOptions(
    { PROD: true, MODE: "prod", VITE_SENTRY_DSN: "https://public@example.invalid/1", VITE_SENTRY_RELEASE: "release" },
    "vue",
  )
  expect(options?.transportOptions).toMatchObject({
    fetchOptions: { credentials: "omit", referrerPolicy: "no-referrer" },
  })
  expect(options?.dataCollection).toMatchObject({
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    stackFrameVariables: false,
    frameContextLines: 0,
  })
})
