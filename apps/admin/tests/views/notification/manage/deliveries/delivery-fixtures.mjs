export const deliveryPattern =
  /\/(?:api\/v1|proxy-default)\/admin\/(?:notification-deliveries(?:\/[^/?]+\/(?:summary|retry-failed))?|notifications(?:\/[^/?]+)?)(?:\?.*)?$/
export const firstMessageId = "aaaaaaaa-0000-4000-8000-000000000001",
  secondMessageId = "aaaaaaaa-0000-4000-8000-000000000002"
const states = ["sent", "pending", "processing", "retrying", "dead", "cancelled"]
export function deliveryFixtures() {
  const message = {
    id: firstMessageId,
    title: "Parity notice",
    content: "Parity message body",
    category: "admin.announcement",
    contentMode: "raw",
    titles: {},
    titleParams: null,
    defaultLocale: null,
    status: "published",
    createTime: "2026-10-01T00:00:00",
    publishedAt: "2026-10-01T00:01:00",
    expireAt: null,
    level: "info",
    displayMode: "inbox",
    source: "admin",
    mandatory: false,
    contentParams: null,
    updateTime: "2026-10-01T00:01:00",
  }
  const messages = [message, { ...message, id: secondMessageId, title: "Parity recalled", status: "recalled" }]
  const names = [
    "Sent reader",
    "Pending reader",
    "Processing reader",
    "Retrying reader",
    "Failed reader",
    "Cancelled reader",
  ]
  const rows = states.map((status, index) => ({
    id: `bbbbbbbb-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    messageId: firstMessageId,
    userId: `cccccccc-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    channel: "in_app",
    status,
    attemptCount: index + 1,
    lastErrorCode: status === "dead" ? "inapp_emit_failed" : status === "retrying" ? "unknown_channel" : null,
    nextAttemptAt: status === "pending" || status === "retrying" ? "2030-01-01T00:00:00" : null,
    lockedUntil: status === "processing" ? "2030-01-01T01:00:00" : null,
    sentAt: status === "sent" ? "2026-10-01T00:02:00" : null,
    createTime: "2026-10-01T00:00:00",
    updateTime: "2026-10-01T00:02:00",
    recipient: {
      name: names[index],
      username: `reader${index}`,
      department: "Platform",
      state: index === 1 ? "pending" : index === 2 ? "disabled" : "active",
      avatar: null,
    },
    message,
  }))
  rows.push({
    ...structuredClone(rows[4]),
    id: "bbbbbbbb-0000-4000-8000-000000000007",
    recipient: {
      name: "Removed secret name",
      username: "secret-user",
      department: "Secret department",
      state: "deleted",
      avatar: "https://removed.example.invalid/private-avatar.png",
    },
  })
  rows.push({ ...structuredClone(rows[0]), id: "bbbbbbbb-0000-4000-8000-000000000008", recipient: null })
  const fixture = {
    messages,
    rows,
    lists: [],
    summaries: [],
    recent: [],
    retries: [],
    emptyRecords: false,
    failList: false,
    failSummary: false,
    failRecent: false,
    failRetry: false,
    readGate: null,
    retryGate: null,
  }
  fixture.handler = async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      method = request.method(),
      path = url.pathname.replace(/^\/(?:api\/v1|proxy-default)/, "")
    const reply = (data, code = 0) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code, message: code ? "Fixture failure" : "Success", data }),
      })
    if (path === "/admin/notifications") {
      fixture.recent.push(Object.fromEntries(url.searchParams))
      if (fixture.failRecent) return reply(null, 500)
      return reply({ records: fixture.messages, page: 1, pageSize: 20, total: fixture.messages.length })
    }
    if (path.startsWith("/admin/notifications/"))
      return reply(fixture.messages.find((message) => message.id === path.split("/").at(-1)) ?? fixture.messages[0])
    const summary = path.match(/^\/admin\/notification-deliveries\/([^/]+)\/summary$/)
    if (summary) {
      fixture.summaries.push(summary[1])
      if (fixture.readGate) await fixture.readGate
      if (fixture.failSummary) return reply(null, 500)
      const byStatus = Object.fromEntries(
        states.map((status) => [
          status,
          fixture.rows.filter((row) => row.messageId === summary[1] && row.status === status).length,
        ]),
      )
      return reply({
        messageId: summary[1],
        byStatus,
        message: fixture.messages.find((message) => message.id === summary[1]) ?? null,
      })
    }
    const retry = path.match(/^\/admin\/notification-deliveries\/([^/]+)\/retry-failed$/)
    if (retry) {
      if (method !== "POST") throw new Error("Retry must be a POST")
      fixture.retries.push({ id: retry[1], body: request.postData() })
      if (fixture.retryGate) await fixture.retryGate
      if (fixture.failRetry) return reply(null, 500)
      let retried = 0
      for (const row of fixture.rows)
        if (row.messageId === retry[1] && row.status === "dead") {
          row.status = "pending"
          row.attemptCount = 0
          row.lastErrorCode = null
          retried++
        }
      return reply({ retried })
    }
    if (path === "/admin/notification-deliveries") {
      const query = Object.fromEntries(url.searchParams)
      fixture.lists.push(query)
      if (fixture.readGate) await fixture.readGate
      if (fixture.failList) return reply(null, 500)
      const page = Number(query.page || 1),
        pageSize = Number(query.pageSize || 20),
        records = fixture.emptyRecords
          ? []
          : fixture.rows.filter(
              (row) =>
                (!query.messageId || row.messageId === query.messageId) &&
                (!query.status || row.status === query.status),
            )
      return reply({
        records: records.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        total: records.length,
      })
    }
    throw new Error(`Unexpected delivery fixture: ${method} ${path}`)
  }
  return fixture
}
