// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useLocation, useNavigate } from "react-router"
import { afterEach, beforeEach, expect, test } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import type { AuditDetail, AuditCatalog } from "@/services/api/audit-log"
import i18n from "@/locales"
import AuditPage from "@/views/manage/audit-log"
const base = "http://localhost:16000/api/v1/system/audit-logs"
const id = "11111111-1111-1111-1111-111111111111",
  relatedId = "22222222-2222-2222-2222-222222222222"
const record: AuditDetail = {
  id,
  createTime: "",
  updateTime: "",
  action: "user.update",
  actorType: "user",
  actorName: "Admin",
  actorUsername: "admin",
  resourceType: "user",
  resourceId: "user-1",
  resourceName: "Original person",
  result: "success",
  riskLevel: "sensitive",
  source: "http",
  occurredAt: "2026-10-21T10:00:00Z",
  requestId: "request-1",
  changes: [
    { field: "password", before: "SECRET_OLD", after: "SECRET_NEW", redacted: true },
    { field: "name", before: "Before", after: "After", redacted: false },
  ],
  metadata: {},
  targetCount: 21,
  requestSummary: { safe: "filtered", _truncated: true },
}
const catalog: AuditCatalog = {
  timezone: "Asia/Shanghai",
  actions: [
    {
      code: "user.update",
      label: "Update user",
      resourceType: "user",
      resourceLabel: "Users",
      riskLevel: "sensitive",
      fields: { name: "Display name", password: "Password" },
    },
  ],
}
let listQueries: Record<string, string>[] = []
beforeEach(async () => {
  await i18n.changeLanguage("en-US")
  useAuthStore.getState().setToken("access", "refresh")
  useAuthStore.setState({
    userInfo: {
      id: "admin",
      name: "Admin",
      username: "admin",
      email: "",
      createTime: "",
      updateTime: "",
      isAdmin: true,
      roles: [],
      buttons: [],
    },
  })
  listQueries = []
  server.use(
    http.get(`${base}/catalog`, () => HttpResponse.json({ code: 0, data: catalog })),
    http.get(`${base}/actors`, () => HttpResponse.json({ code: 0, data: [] })),
    http.get(`${base}/paginate`, ({ request }) => {
      const params = Object.fromEntries(new URL(request.url).searchParams)
      listQueries.push(params)
      return HttpResponse.json({
        code: 0,
        data: {
          records: [params.requestId ? { ...record, id: relatedId, resourceName: "Related person" } : record],
          page: Number(params.page ?? 1),
          pageSize: Number(params.pageSize ?? 20),
          total: 1,
        },
      })
    }),
    http.get(`${base}/:id/targets`, ({ request }) =>
      HttpResponse.json({
        code: 0,
        data: {
          records: [
            {
              id: "target",
              resourceId: "user-1",
              resourceType: "user",
              resourceName: "Target person",
              result: "failure",
              errorMessage: "Target failed",
            },
          ],
          page: Number(new URL(request.url).searchParams.get("page") ?? 1),
          pageSize: 20,
          total: 21,
        },
      }),
    ),
    http.get(`${base}/:id`, ({ params }) =>
      HttpResponse.json({
        code: 0,
        data: {
          ...record,
          id: params.id,
          resourceName: params.id === relatedId ? "Related person" : "Original person",
        },
      }),
    ),
  )
})
afterEach(() => useAuthStore.getState().clearAuth())
function Host() {
  const location = useLocation(),
    navigate = useNavigate()
  return (
    <>
      <AuditPage />
      <output data-testid="url">{location.search}</output>
      <button onClick={() => navigate(-1)}>History back</button>
    </>
  )
}
test("draft filters stay out of refresh until search and historical URLs restore applied filters", async () => {
  const user = userEvent.setup()
  renderAdmin(<Host />, {
    initialEntries: ["/?timeRange=all&keyword=Previous", "/?timeRange=all&keyword=Original&page=3"],
  })
  await screen.findByRole("button", { name: "Detail" })
  const input = screen.getByRole("textbox", { name: "Person or object name" })
  await user.clear(input)
  await user.type(input, "Draft")
  expect(screen.getByText(/Filters have changed/)).toBeVisible()
  await user.click(screen.getByRole("button", { name: "Refresh" }))
  await waitFor(() => expect(listQueries.at(-1)).toMatchObject({ keyword: "Original", page: "3" }))
  await user.click(screen.getByRole("button", { name: "Search" }))
  await waitFor(() => expect(listQueries.at(-1)).toMatchObject({ keyword: "Draft", page: "1" }))
  expect(screen.getByTestId("url")).toHaveTextContent("keyword=Draft")
  await user.click(screen.getByRole("button", { name: "History back" }))
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Person or object name" })).toHaveValue("Previous"))
})
test("detail hides secret changes, loads batch targets and investigates related records without replacing list state", async () => {
  const user = userEvent.setup()
  renderAdmin(<Host />, { initialEntries: ["/?timeRange=all&keyword=Original&page=3"] })
  await user.click(await screen.findByRole("button", { name: "Detail" }))
  const dialog = screen.getByRole("dialog")
  expect(await within(dialog).findByText("Changed; values are not recorded")).toBeVisible()
  expect(dialog).not.toHaveTextContent("SECRET_OLD")
  expect(dialog).not.toHaveTextContent("SECRET_NEW")
  expect(await within(dialog).findByText("Target person")).toBeVisible()
  await user.click(within(dialog).getByRole("button", { name: "Same request" }))
  expect(await within(dialog).findByText("Related person")).toBeVisible()
  expect(listQueries.at(-1)).toMatchObject({ requestId: "request-1", page: "1", pageSize: "10" })
  expect(listQueries.at(-1)).not.toHaveProperty("startTime")
  await user.click(within(dialog).getByRole("button", { name: "View event" }))
  expect(await within(dialog).findByText("Users · Related person")).toBeVisible()
  await user.click(within(dialog).getByRole("button", { name: "Back to previous event" }))
  await within(dialog).findByText("Users · Original person")
  expect(screen.getByTestId("url")).toHaveTextContent("keyword=Original")
  expect(screen.getByTestId("url")).toHaveTextContent("page=3")
  expect(screen.getByTestId("url")).toHaveTextContent(`auditId=${id}`)
})
test("an empty audit list can clear filters to all time and defaults to the last 24 hours", async () => {
  server.use(
    http.get(`${base}/paginate`, ({ request }) => {
      listQueries.push(Object.fromEntries(new URL(request.url).searchParams))
      return HttpResponse.json({ code: 0, data: { records: [], page: 1, pageSize: 20, total: 0 } })
    }),
  )
  const user = userEvent.setup()
  renderAdmin(<Host />)
  expect(await screen.findByText("No records match the current time range and filters")).toBeVisible()
  expect(listQueries[0]).toHaveProperty("startTime")
  expect(listQueries[0]).toHaveProperty("endTime")
  await user.click(screen.getByRole("button", { name: "Clear filters and search all time" }))
  await waitFor(() => expect(listQueries.at(-1)).not.toHaveProperty("startTime"))
  expect(screen.getByTestId("url")).toHaveTextContent("timeRange=all")
})

test("advanced filters, searched actor options and categorical selections reach the applied URL and request", async () => {
  const user = userEvent.setup()
  server.use(
    http.get(`${base}/actors`, () => HttpResponse.json({ code: 0, data: [{ id, name: "Lin", username: "lin" }] })),
  )
  renderAdmin(<Host />, { initialEntries: ["/?timeRange=all"] })
  await screen.findByRole("button", { name: "Detail" })
  await user.click(screen.getByText("More filters"))
  await user.type(screen.getByRole("textbox", { name: "Search actors" }), "Lin")
  const select = async (label: string, option: string) => {
    await waitFor(() => expect(screen.getByRole("combobox", { name: label })).toBeEnabled())
    await user.click(screen.getByRole("combobox", { name: label }))
    await user.click(await screen.findByRole("option", { name: option }))
  }
  await select("Actor", "Lin (lin)")
  await select("Resource Type", "Users")
  await select("Action", "Update user · user.update")
  await select("Risk Level", "Sensitive")
  await select("Record source", "HTTP")
  await select("Result", "Partially succeeded")
  for (const [label, value] of [
    ["Resource Name", "Original"],
    ["Object ID", "user-1"],
    ["Request ID", "req"],
    ["Correlation ID", "flow"],
    ["Target user ID", id],
    ["Impersonation session ID", relatedId],
    ["IP Address", "127.0.0.1"],
    ["Name or account", "Admin"],
  ])
    await user.type(screen.getByRole("textbox", { name: label }), value)
  await user.click(screen.getByRole("button", { name: "Search" }))
  await waitFor(() =>
    expect(listQueries.at(-1)).toMatchObject({
      actorId: id,
      resourceType: "user",
      action: "user.update",
      riskLevel: "sensitive",
      source: "http",
      result: "partial",
      resourceKeyword: "Original",
      resourceId: "user-1",
      requestId: "req",
      correlationId: "flow",
      subjectUserId: id,
      impersonationSessionId: relatedId,
      ip: "127.0.0.1",
      actorKeyword: "Admin",
      page: "1",
    }),
  )
  expect(screen.getByTestId("url")).toHaveTextContent("action=user.update")
})

test("batch targets and related records retry and paginate independently", async () => {
  const user = userEvent.setup()
  const targetPages: string[] = [],
    relatedPages: string[] = []
  let failed = true
  server.use(
    http.get(`${base}/:id/targets`, ({ request }) => {
      const page = new URL(request.url).searchParams.get("page")!
      targetPages.push(page)
      return HttpResponse.json({ code: 0, data: { records: [], page: Number(page), pageSize: 20, total: 21 } })
    }),
    http.get(`${base}/paginate`, ({ request }) => {
      const params = Object.fromEntries(new URL(request.url).searchParams)
      if (params.requestId) {
        relatedPages.push(params.page)
        return HttpResponse.json(
          failed
            ? { code: 500, message: "Related unavailable", data: null }
            : {
                code: 0,
                data: {
                  records: [{ ...record, id: relatedId, resourceName: "Related person" }],
                  page: Number(params.page),
                  pageSize: 10,
                  total: 21,
                },
              },
        )
      }
      return HttpResponse.json({ code: 0, data: { records: [record], page: 3, pageSize: 20, total: 1 } })
    }),
  )
  renderAdmin(<Host />, { initialEntries: [`/?timeRange=all&page=3&auditId=${id}`] })
  const dialog = await screen.findByRole("dialog")
  const targets = await within(dialog).findByRole("region", { name: "Batch targets" })
  await user.click(await within(targets).findByRole("button", { name: "Next" }))
  await waitFor(() => expect(targetPages.at(-1)).toBe("2"))
  await user.click(within(dialog).getByRole("button", { name: "Same request" }))
  const related = await within(dialog).findByRole("region", { name: "Continue investigation" })
  expect(await within(related).findByText("Could not load records. Please retry.")).toBeVisible()
  failed = false
  await user.click(within(related).getByRole("button", { name: "Retry" }))
  await within(related).findByText("Related person")
  await user.click(within(related).getByRole("button", { name: "Next" }))
  await waitFor(() => expect(relatedPages.at(-1)).toBe("2"))
  expect(screen.getByTestId("url")).toHaveTextContent("page=3")
})

test("system initiator and zero attempt are retained while unknown outcomes do not claim field changes", async () => {
  server.use(
    http.get(`${base}/${id}`, () =>
      HttpResponse.json({
        code: 0,
        data: {
          ...record,
          actorType: "system",
          actorName: "worker",
          result: "unknown",
          targetCount: 0,
          metadata: { initiated_by: { name: "Lin" }, attempt: 0 },
        },
      }),
    ),
  )
  renderAdmin(<Host />, { initialEntries: [`/?timeRange=all&auditId=${id}`] })
  const dialog = await screen.findByRole("dialog")
  expect(await within(dialog).findByText("Lin")).toBeVisible()
  expect(within(dialog).getByText("0", { exact: true })).toBeVisible()
  expect(within(dialog).getByText("worker", { exact: true })).toBeVisible()
  expect(
    within(dialog).getByText(
      "The business outcome is unconfirmed; field changes cannot be determined from this record.",
    ),
  ).toBeVisible()
  expect(within(dialog).queryByText("Before", { exact: true })).not.toBeInTheDocument()
})

test("unclassified related HTTP records use the same localized action label as list and detail", async () => {
  const user = userEvent.setup()
  server.use(
    http.get(`${base}/paginate`, ({ request }) => {
      const related = new URL(request.url).searchParams.has("requestId")
      return HttpResponse.json({
        code: 0,
        data: {
          records: [related ? { ...record, id: relatedId, action: "http.request" } : record],
          page: 1,
          pageSize: 20,
          total: 1,
        },
      })
    }),
  )
  renderAdmin(<Host />, { initialEntries: [`/?timeRange=all&auditId=${id}`] })
  const dialog = await screen.findByRole("dialog")
  await user.click(await within(dialog).findByRole("button", { name: "Same request" }))
  const related = await within(dialog).findByRole("region", { name: "Continue investigation" })
  expect(await within(related).findByText("Unclassified operation")).toBeVisible()
})
