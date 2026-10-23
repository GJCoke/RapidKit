// Browser-only API boundary: no fixture mutation reaches a real recipient.
export function announcementFixtures() {
  let sequence = 20,
    revision = 1
  const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`
  const message = (n, title, status = "draft", displayMode = "inbox") => ({
    id: id(n),
    title,
    content: `Body of ${title}`,
    category: "admin.announcement",
    level: "info",
    status,
    displayMode,
    source: "admin",
    contentMode: "raw",
    mandatory: false,
    channels: displayMode === "inbox" ? ["in_app"] : [],
    audiences: [{ type: "all", includeDescendants: false }],
    createTime: "2026-10-23 08:00:00",
    updateTime: "2026-10-23 08:00:00",
    publishAt: status === "scheduled" ? "2030-10-23T08:00:00" : null,
    publishedAt: status === "published" ? "2026-10-23T08:00:00" : null,
    expireAt: null,
    contentFormat: "plain_text",
    contentParams: null,
    variableBindings: {},
    action: null,
    meta: null,
    templateId: null,
    templateCode: null,
    supersededAt: null,
    supersededById: null,
  })
  const rows = [
    message(1, "Parity draft"),
    message(2, "Parity scheduled", "scheduled"),
    message(3, "Parity published", "published"),
    message(4, "Parity expired", "expired"),
    message(5, "Parity banner current", "published", "top_banner"),
    message(6, "Parity banner upcoming", "scheduled", "top_banner"),
  ]
  const writes = [],
    lists = [],
    previews = []
  const state = {
    rows,
    writes,
    lists,
    previews,
    failSave: 0,
    failPublish: 0,
    failDetail: 0,
    failList: false,
    empty: false,
    listGate: null,
    detailGate: null,
    conflict: 0,
  }
  const template = {
    id: id(90),
    code: "parity.welcome",
    name: "Parity welcome",
    category: "user.invited",
    level: "success",
    contentMode: "raw",
    titleTemplate: "Hello {name}",
    contentTemplate: "Welcome {name}",
    variableSchema: { name: { type: "string", required: true, example: "Not a default" } },
    defaultChannels: ["in_app"],
    mandatory: false,
    enabled: true,
    version: 1,
    createTime: "",
    updateTime: "",
  }
  const apply = (body, old) => ({
    ...old,
    displayMode: body.displayMode,
    category: body.category,
    level: body.level,
    title:
      body.rawTitle ??
      body.templateCode ??
      body.i18NKey ??
      body.localizedContent?.translations?.[body.localizedContent.defaultLocale]?.title ??
      "",
    content: body.rawContent ?? "Template or localized body",
    contentMode: body.localizedContent ? "local" : body.i18NKey ? "i18n" : "raw",
    contentParams: body.localizedContent ?? body.i18NParams ?? body.templateVariables ?? null,
    templateCode: body.templateCode ?? null,
    variableBindings: body.variableBindings ?? {},
    meta: body.templateCode ? { templateVariables: body.templateVariables } : null,
    audiences: body.audience,
    mandatory: body.mandatory,
    channels: body.channels,
    action: body.action ?? null,
    contentFormat: body.rawFormat ?? "plain_text",
    status: body.saveAsDraft ? "draft" : body.publishAt ? "scheduled" : "published",
    publishAt: body.publishAt ?? null,
    expireAt: body.expireAt ?? null,
  })
  state.handler = async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace(/^\/(?:api\/v1|proxy-default)/, ""),
      method = request.method()
    const ok = (data) => route.fulfill({ json: { code: 0, message: "ok", data } }),
      fail = () => route.fulfill({ json: { code: 500, message: "Parity backend failure", data: null } })
    if (path === "/admin/notification-templates") return ok({ records: [template], page: 1, pageSize: 100, total: 1 })
    if (path === "/users/all")
      return ok([{ id: id(80), name: "Parity Reader", username: "parity-reader", email: "reader@example.test" }])
    if (path === "/roles/all") return ok([{ id: id(81), name: "Parity role", code: "PARITY_READER", status: 1 }])
    if (path === "/departments/tree")
      return ok([{ id: id(82), name: "Parity department", parentId: null, children: [] }])
    if (path === "/admin/notifications/banner-check")
      return ok({
        revision: revision++,
        serverNow: new Date().toISOString(),
        current: rows.find((row) => row.displayMode === "top_banner" && row.status === "published") ?? null,
        scheduled: rows.find((row) => row.displayMode === "top_banner" && row.status === "scheduled") ?? null,
      })
    if (path === "/admin/notifications/action-targets")
      return ok([
        {
          menuId: id(83),
          label: "Parity destination",
          breadcrumb: ["Management", "Parity destination"],
          route: "home",
          path: "/home",
          parameters: [
            {
              name: "view",
              location: "query",
              required: true,
              defaultValue: "summary",
              example: null,
              descriptionKey: null,
            },
          ],
        },
      ])
    if (path.endsWith("-preview")) {
      const body = request.postDataJSON()
      previews.push({ path, body })
      if (path.endsWith("audience-preview")) return ok({ total: 2, byType: { all: 2 } })
      if (path.endsWith("content-preview"))
        return ok({
          contentMode: "raw",
          title: "Hello Parity Reader",
          content: "Personalized parity body",
          contentParams: null,
        })
      return ok({
        type: "menu",
        menuId: id(83),
        label: "Parity destination",
        route: "home",
        path: "/home",
        params: {},
        query: body.query ?? {},
      })
    }
    if (path === "/admin/notifications" && method === "GET") {
      lists.push(Object.fromEntries(url.searchParams))
      if (state.listGate) await state.listGate
      if (state.failList) return fail()
      const filtered = state.empty
        ? []
        : rows.filter(
            (row) =>
              (!url.searchParams.get("category") || row.category === url.searchParams.get("category")) &&
              (!url.searchParams.get("status") || row.status === url.searchParams.get("status")) &&
              (!url.searchParams.get("displayMode") || row.displayMode === url.searchParams.get("displayMode")),
          )
      const page = Number(url.searchParams.get("page") || 1),
        pageSize = Number(url.searchParams.get("pageSize") || 10)
      return ok({
        records: filtered.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        total: filtered.length,
      })
    }
    if (path === "/admin/notifications" && method === "POST") {
      const body = request.postDataJSON()
      writes.push({ method, path, body })
      if (state.failSave-- > 0) return fail()
      if (state.conflict-- > 0)
        return route.fulfill({ json: { code: 92099, message: "Parity banner conflict", data: null } })
      const row = apply(body, message(sequence++, "New"))
      rows.unshift(row)
      return ok({ messageId: row.id, recipientCount: 0 })
    }
    const match = path.match(/^\/admin\/notifications\/([^/]+)(?:\/(publish|cancel|recall))?$/)
    if (!match) throw Error(`Unrecognized announcement fixture ${method} ${path}`)
    const row = rows.find((row) => row.id === match[1])
    if (!row) throw Error(`Missing announcement fixture ${path}`)
    if (method === "GET") {
      if (state.detailGate) await state.detailGate
      if (state.failDetail-- > 0) return fail()
      return ok(row)
    }
    const body = request.postData() ? request.postDataJSON() : null
    writes.push({ method, path, body })
    if (method === "PUT") {
      if (state.failSave-- > 0) return fail()
      Object.assign(row, apply(body, row))
      return ok(row)
    }
    if (method === "DELETE") {
      rows.splice(rows.indexOf(row), 1)
      return ok(null)
    }
    if (match[2] === "publish") {
      if (state.failPublish-- > 0) return fail()
      row.status = "published"
      return ok({ recipientCount: 2 })
    }
    row.status = match[2] === "cancel" ? "cancelled" : "recalled"
    return ok(null)
  }
  return state
}
export const fixturePattern =
  /\/(?:api\/v1|proxy-default)\/(?:admin\/(?:notifications(?:\/[^?]*)?|notification-templates)|users\/all|roles\/all|departments\/tree)(?:\?|$)/
