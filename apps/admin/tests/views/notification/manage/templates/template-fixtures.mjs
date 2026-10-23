export const templatePattern = /\/(?:api\/v1|proxy-default)\/admin\/notification-templates(?:\/[^/?]+)?(?:\?.*)?$/
export function templateFixtures() {
  const base = {
    category: "user.invited",
    level: "info",
    contentMode: "raw",
    contentFormat: "plain_text",
    titleTemplate: "Hello {name}",
    contentTemplate: "Template body for {name}",
    variableSchema: {
      name: { type: "string", required: true, example: "Ada", default: "Reader", description: "Keep metadata" },
    },
    defaultChannels: ["in_app"],
    defaultAction: null,
    mandatory: false,
    enabled: true,
    version: 1,
    createTime: "2026-10-01T00:00:00",
    updateTime: "2026-10-02T00:00:00",
  }
  const fixture = {
    rows: [
      { ...structuredClone(base), id: "first", name: "Parity welcome", code: "parity.welcome" },
      {
        ...structuredClone(base),
        id: "second",
        name: "Parity disabled",
        code: "parity.disabled",
        category: "system.security",
        enabled: false,
        mandatory: true,
        titleTemplate: "Disabled title",
        contentTemplate: "Disabled body",
        variableSchema: {},
      },
      {
        ...structuredClone(base),
        id: "localized",
        name: "Parity localized",
        code: "parity.localized",
        contentMode: "i18n",
        titleTemplate: "common.confirm",
        contentTemplate: "common.cancel",
        variableSchema: {
          returnDetails: { type: "boolean", example: true },
          returnObjects: { type: "boolean", example: true },
          lng: { type: "string", example: "en-US" },
          defaultValue: { type: "string", example: "Wrong fallback" },
        },
      },
    ],
    lists: [],
    writes: [],
    empty: false,
    failList: false,
    failWrite: false,
    failDelete: false,
    gate: null,
  }
  fixture.handler = async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      method = request.method(),
      id = url.pathname.split("/notification-templates")[1]?.slice(1)
    const reply = (data, code = 0) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code, message: code ? "Fixture failure" : "Success", data }),
      })
    if (method === "GET") {
      const params = Object.fromEntries(url.searchParams)
      fixture.lists.push(params)
      if (fixture.gate) await fixture.gate
      if (fixture.failList) return reply(null, 500)
      const page = Number(params.page || 1),
        pageSize = Number(params.pageSize || 20),
        keyword = (params.keyword || "").toLowerCase(),
        filtered = fixture.empty
          ? []
          : fixture.rows.filter(
              (row) =>
                (!keyword ||
                  [row.name, row.code, row.category].some((value) => value.toLowerCase().includes(keyword))) &&
                (params.enabled === undefined || row.enabled === (params.enabled === "true")),
            )
      return reply({
        records: filtered.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        total: filtered.length,
      })
    }
    const body = method === "DELETE" ? null : request.postDataJSON()
    fixture.writes.push({ method, id, body })
    if (method === "DELETE") {
      if (fixture.failDelete) return reply(null, 500)
      fixture.rows = fixture.rows.filter((row) => row.id !== id)
      return reply(null)
    }
    if (fixture.failWrite) return reply(null, 500)
    if (method === "POST") {
      const row = { ...structuredClone(base), ...body, id: `created-${fixture.writes.length}` }
      fixture.rows.unshift(row)
      return reply(row)
    }
    if (method === "PUT") {
      const index = fixture.rows.findIndex((row) => row.id === id)
      fixture.rows[index] = { ...fixture.rows[index], ...body }
      return reply(fixture.rows[index])
    }
    throw new Error(`Unexpected template route ${method} ${url.pathname}`)
  }
  return fixture
}
