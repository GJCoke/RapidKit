// @vitest-environment jsdom
import "@test/setup/layout"
import { StrictMode } from "react"
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import { queueWorker, queueWorkerId, queueOverview } from "@test/setup/queue-fixtures"
import { useAuthStore } from "@/stores/auth"
import i18n from "@/locales"
import { queueKeys } from "@/services/hooks/use-queue-dashboard"
import { getAuthSession } from "@/services/auth-session"
vi.mock("@/services/app-socket", () => ({
  openAppSocket: () => ({ connected: false, on: () => {}, off: () => {} }),
  closeAppSocket: () => {},
}))
import QueueDashboard from "@/views/queue/dashboard"
const base = "http://localhost:16000/api/v1",
  reply = (data: unknown) => HttpResponse.json({ code: 0, data })
function setup() {
  useAuthStore.getState().setToken("access", "queue-ui")
  useAuthStore.setState({
    userInfo: {
      id: "admin",
      username: "admin",
      name: "Admin",
      email: "",
      isAdmin: true,
      roles: [],
      buttons: [],
      createTime: "",
      updateTime: "",
    },
  })
  const worker = queueWorker({
    softwareInfo: { celery_version: "5.6", python_version: "3.13", platform: "Linux" },
    runtimeConcurrency: 3,
    runtimeActiveTasks: 2,
    runtimeSampledAt: new Date().toISOString(),
  })
  server.use(
    http.get(`${base}/workers/all`, () => reply([worker])),
    http.get(`${base}/workers/:id`, () => reply(worker)),
    http.get(`${base}/workers/:id/tasks/:kind`, ({ params }) =>
      reply([
        {
          id: `${params.kind}-one`,
          name: `${params.kind}.sample`,
          args: "[1]",
          kwargs: '{"flag": true}',
          workerPid: 12,
          timeStart: 1792798200,
        },
      ]),
    ),
    http.get(`${base}/tasks/stats/dashboard`, () =>
      reply(
        queueOverview({
          queues: [
            { name: "blocked", depth: 2, consumers: 0 },
            { name: "unknown", depth: null, consumers: null },
          ],
        }),
      ),
    ),
    http.get(`${base}/tasks/stats/by-name`, () =>
      reply({
        page: 1,
        pageSize: 10,
        total: 1,
        records: [
          {
            taskName: "sample.task",
            total: 10,
            success: 8,
            failure: 2,
            inProgress: 0,
            successRate: 80,
            lastExecutedAt: "2026-10-24T00:00:00Z",
            avgRuntime: 0.2,
          },
        ],
      }),
    ),
    http.get(`${base}/tasks/stats/by-worker`, () =>
      reply([{ workerHostname: "worker@host", total: 10, success: 8, failure: 2, avgRuntime: 0.2 }]),
    ),
  )
  return worker
}
async function openWorker() {
  fireEvent.click(await screen.findByRole("button", { name: "worker@host" }))
  return screen.findByRole("dialog", { name: "Worker 详情" })
}
afterEach(async () => {
  useAuthStore.getState().clearAuth()
  await i18n.changeLanguage("zh-CN")
})
test("five metrics, unknown queue data and the selected day window match the source dashboard", async () => {
  setup()
  const days: number[] = []
  server.use(
    http.get(`${base}/tasks/stats/dashboard`, ({ request }) => {
      days.push(Number(new URL(request.url).searchParams.get("days")))
      return reply(
        queueOverview({
          queues: [
            { name: "blocked", depth: 2, consumers: 0 },
            { name: "unknown", depth: null, consumers: null },
          ],
        }),
      )
    }),
  )
  renderAdmin(<QueueDashboard />)
  await screen.findByText("队列运行总览")
  await screen.findByText("队列 blocked 有 2 个待消费任务，但没有在线消费者")
  for (const name of ["待消费任务", "正在执行", "完成速率", "成功率", "P95 执行耗时"])
    expect(screen.getByRole("group", { name })).toBeInTheDocument()
  const unknown = screen.getAllByRole("row").find((row) => row.textContent?.includes("unknown"))
  expect(unknown).toBeDefined()
  expect(unknown?.textContent).toContain("—")
  expect(unknown?.textContent).toContain("采集不可用")
  fireEvent.click(screen.getByRole("button", { name: "7 天" }))
  await waitFor(() => expect(days).toContain(7))
  await act(async () => {
    await i18n.changeLanguage("en-US")
  })
  expect(screen.getByText("Queue operations overview")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "7 Days" })).toHaveAttribute("aria-pressed", "true")
})
test("worker drawer separates live runtime snapshots, environment and manually refreshed task scenes", async () => {
  setup()
  let inspections = 0
  server.use(
    http.get(`${base}/workers/:id/tasks/:kind`, ({ params }) => {
      inspections++
      return reply([
        {
          id: `${params.kind}-one`,
          name: `${params.kind}.sample`,
          args: "[1]",
          kwargs: "{}",
          workerPid: 12,
          timeStart: 1792798200,
        },
      ])
    }),
  )
  renderAdmin(<QueueDashboard />)
  const drawer = await openWorker()
  await within(drawer).findByText("67%")
  fireEvent.click(within(drawer).getByText("运行环境", { exact: true }))
  await within(drawer).findByText("Celery")
  expect(inspections).toBe(0)
  fireEvent.click(within(drawer).getByRole("tab", { name: "任务现场" }))
  await within(drawer).findByText("active.sample")
  await within(drawer).findByText("reserved.sample")
  expect(inspections).toBe(2)
  fireEvent.click(within(drawer).getByRole("tab", { name: "运行概览" }))
  fireEvent.click(within(drawer).getByRole("tab", { name: "任务现场" }))
  expect(inspections).toBe(2)
  fireEvent.click(within(drawer).getByRole("button", { name: "刷新正在执行" }))
  await waitFor(() => expect(inspections).toBe(4))
})
test("operations validate pool counts and queue names, retain failed inputs and clear only an accepted subscription", async () => {
  const worker = setup()
  let failed = true,
    puts = 0
  server.use(
    http.post(`${base}/workers/:id/queues/add`, async ({ request }) => {
      puts++
      expect(await request.json()).toEqual({ queue: "new-queue" })
      if (failed) return HttpResponse.json({ code: 422, message: "Queue failed", data: null })
      worker.activeQueues.push("new-queue")
      return reply({ success: true })
    }),
  )
  renderAdmin(<QueueDashboard />)
  const drawer = await openWorker()
  await within(drawer).findByText("67%")
  fireEvent.click(within(drawer).getByRole("tab", { name: "运维操作" }))
  const count = within(drawer).getByRole("spinbutton", { name: "进程数调整" })
  fireEvent.change(count, { target: { value: "1.5" } })
  expect(within(drawer).getByRole("button", { name: /^扩容/ })).toBeDisabled()
  fireEvent.change(count, { target: { value: "3" } })
  expect(within(drawer).getByRole("button", { name: /^缩容/ })).toBeDisabled()
  const queue = within(drawer).getByRole("textbox", { name: "队列名称" })
  fireEvent.change(queue, { target: { value: "celery" } })
  expect(within(drawer).getByRole("button", { name: "订阅队列" })).toBeDisabled()
  fireEvent.change(queue, { target: { value: " new-queue " } })
  fireEvent.click(within(drawer).getByRole("button", { name: "订阅队列" }))
  await within(drawer).findByRole("alert")
  expect(queue).toHaveValue(" new-queue ")
  expect(puts).toBe(1)
  failed = false
  fireEvent.click(within(drawer).getByRole("button", { name: "订阅队列" }))
  await waitFor(() => expect(queue).toHaveValue(""))
  expect(puts).toBe(2)
})
test("worker shutdown requires confirmation and a pending command cannot submit twice", async () => {
  setup()
  let calls = 0,
    release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.post(`${base}/workers/:id/shutdown`, async () => {
      calls++
      await gate
      return reply({ success: true })
    }),
  )
  renderAdmin(<QueueDashboard />)
  const shutdown = await screen.findByRole("button", { name: "关闭 Worker worker@host" })
  fireEvent.click(shutdown)
  const dialog = await screen.findByRole("alertdialog", { name: "关闭 Worker" })
  expect(calls).toBe(0)
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }))
  expect(calls).toBe(0)
  fireEvent.click(shutdown)
  fireEvent.click(
    within(screen.getByRole("alertdialog", { name: "关闭 Worker" })).getByRole("button", {
      name: "确定",
    }),
  )
  await waitFor(() => expect(calls).toBe(1))
  expect(shutdown).toBeDisabled()
  fireEvent.click(shutdown)
  expect(calls).toBe(1)
  await act(async () => {
    release()
  })
  await waitFor(() => expect(shutdown).toBeEnabled())
})
test("offline workers expose warnings and never perform live inspections or remote controls", async () => {
  const worker = setup()
  worker.status = "2"
  let inspections = 0,
    posts = 0
  server.use(
    http.get(`${base}/workers/:id/tasks/:kind`, () => {
      inspections++
      return reply([])
    }),
    http.post(`${base}/workers/:id/*`, () => {
      posts++
      return reply({ success: true })
    }),
  )
  renderAdmin(<QueueDashboard />)
  const drawer = await openWorker()
  await within(drawer).findByText("当前 Worker 离线或心跳不可用，下方数字仅为最后一次记录。")
  fireEvent.click(within(drawer).getByRole("tab", { name: "任务现场" }))
  expect(inspections).toBe(0)
  fireEvent.click(within(drawer).getByRole("tab", { name: "运维操作" }))
  expect(within(drawer).getByRole("button", { name: "Ping" })).toBeDisabled()
  expect(posts).toBe(0)
})
test("pool shrinking and cancelling subscriptions confirm first, and false ping acknowledgements show failure", async () => {
  const worker = setup(),
    calls: unknown[] = []
  server.use(
    http.post(`${base}/workers/:id/*`, async ({ request }) => {
      const path = new URL(request.url).pathname,
        body = await request.text()
      calls.push([path, body ? JSON.parse(body) : null])
      if (path.endsWith("/ping")) return reply({ success: false, message: "No acknowledgement" })
      if (path.endsWith("/pool/shrink")) worker.runtimeConcurrency = 2
      if (path.endsWith("/queues/cancel")) worker.activeQueues = []
      return reply({ success: true })
    }),
  )
  renderAdmin(<QueueDashboard />)
  const drawer = await openWorker()
  await within(drawer).findByText("67%")
  fireEvent.click(within(drawer).getByRole("tab", { name: "运维操作" }))
  fireEvent.click(within(drawer).getByRole("button", { name: "Ping" }))
  await within(drawer).findByText("Worker 未确认操作成功，请检查后重试。")
  expect(calls).toHaveLength(1)
  await waitFor(() => expect(within(drawer).getByRole("button", { name: /^缩容/ })).toBeEnabled())
  fireEvent.click(within(drawer).getByRole("button", { name: /^缩容/ }))
  expect(calls).toHaveLength(1)
  fireEvent.click(within(screen.getByRole("alertdialog", { name: "缩容" })).getByRole("button", { name: "确定" }))
  await waitFor(() => expect(calls).toHaveLength(2))
  await waitFor(() => expect(within(drawer).getByRole("button", { name: "停止订阅 celery" })).toBeEnabled())
  fireEvent.click(within(drawer).getByRole("button", { name: "停止订阅 celery" }))
  expect(calls).toHaveLength(2)
  fireEvent.click(within(screen.getByRole("alertdialog", { name: "停止订阅" })).getByRole("button", { name: "确定" }))
  await waitFor(() => expect(calls).toHaveLength(3))
  expect(calls).toEqual([
    [`/api/v1/workers/${queueWorkerId}/ping`, null],
    [`/api/v1/workers/${queueWorkerId}/pool/shrink`, { n: 1 }],
    [`/api/v1/workers/${queueWorkerId}/queues/cancel`, { queue: "celery" }],
  ])
})
test("control permission revocation removes open confirmations and restoring it never revives them", async () => {
  setup()
  renderAdmin(<QueueDashboard />)
  const shutdown = await screen.findByRole("button", { name: "关闭 Worker worker@host" })
  fireEvent.click(shutdown)
  await screen.findByRole("alertdialog", { name: "关闭 Worker" })
  act(() =>
    useAuthStore.setState((state) => ({
      userInfo: state.userInfo ? { ...state.userInfo, isAdmin: false, buttons: ["worker:read", "task:stats"] } : null,
    })),
  )
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
  expect(screen.queryByRole("button", { name: "关闭 Worker worker@host" })).not.toBeInTheDocument()
  act(() =>
    useAuthStore.setState((state) => ({ userInfo: state.userInfo ? { ...state.userInfo, isAdmin: true } : null })),
  )
  await screen.findByRole("button", { name: "关闭 Worker worker@host" })
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  const drawer = await openWorker()
  await within(drawer).findByText("67%")
  fireEvent.click(within(drawer).getByRole("tab", { name: "运维操作" }))
  fireEvent.click(within(drawer).getByRole("button", { name: /^缩容/ }))
  await screen.findByRole("alertdialog", { name: "缩容" })
  act(() =>
    useAuthStore.setState((state) => ({
      userInfo: state.userInfo ? { ...state.userInfo, isAdmin: false, buttons: ["worker:read", "task:stats"] } : null,
    })),
  )
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
  expect(within(drawer).queryByRole("tab", { name: "运维操作" })).not.toBeInTheDocument()
})
test("unknown live runtime stays unknown and a failed manual inspection retains its last sample", async () => {
  const worker = setup()
  worker.runtimeConcurrency = null
  worker.runtimeActiveTasks = null
  worker.runtimeSampledAt = null
  let fail = false
  server.use(
    http.get(`${base}/workers/:id/tasks/:kind`, ({ params }) =>
      fail && params.kind === "active"
        ? HttpResponse.json({ code: 422, message: "Inspect failed", data: null })
        : reply([{ id: `${params.kind}-one`, name: `${params.kind}.sample` }]),
    ),
  )
  renderAdmin(<QueueDashboard />)
  const drawer = await openWorker()
  await within(drawer).findByText("实时状态暂未采集到，请刷新确认；不能视为 0。")
  expect(within(drawer).queryByText("0%")).not.toBeInTheDocument()
  fireEvent.click(within(drawer).getByRole("tab", { name: "任务现场" }))
  await within(drawer).findByText("active.sample")
  await within(drawer).findByText("reserved.sample")
  fail = true
  fireEvent.click(within(drawer).getByRole("button", { name: "刷新正在执行" }))
  await within(drawer).findByText("更新失败，以下保留上次采集结果，请重试。")
  expect(within(drawer).getByText("active.sample")).toBeInTheDocument()
})

test("removing a worker closes its shutdown confirmation and adding it back does not revive it", async () => {
  const worker = setup(),
    { queryClient } = renderAdmin(<QueueDashboard />)
  fireEvent.click(await screen.findByRole("button", { name: "关闭 Worker worker@host" }))
  await screen.findByRole("alertdialog", { name: "关闭 Worker" })
  act(() => queryClient.setQueryData(queueKeys.workers(getAuthSession()), []))
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
  act(() => queryClient.setQueryData(queueKeys.workers(getAuthSession()), [worker]))
  await screen.findByRole("button", { name: "关闭 Worker worker@host" })
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
})
test("a disappearing and returning worker resets the task scene to a fresh overview", async () => {
  const worker = setup(),
    { queryClient } = renderAdmin(<QueueDashboard />),
    drawer = await openWorker()
  await within(drawer).findByText("67%")
  fireEvent.click(within(drawer).getByRole("tab", { name: "任务现场" }))
  await within(drawer).findByText("active.sample")
  act(() => queryClient.setQueryData(queueKeys.workers(getAuthSession()), []))
  expect(await within(drawer).findAllByText("该 Worker 已不在当前列表，请关闭详情后刷新。")).toHaveLength(2)
  act(() => queryClient.setQueryData(queueKeys.workers(getAuthSession()), [worker]))
  await within(drawer).findByRole("tab", { name: "运行概览" })
  expect(within(drawer).getByRole("tab", { name: "运行概览" })).toHaveAttribute("aria-selected", "true")
  expect(within(drawer).queryByText("active.sample")).not.toBeInTheDocument()
})

test("task inspection opened after app mount survives StrictMode replay without duplicate reads", async () => {
  setup()
  let reads = 0
  server.use(
    http.get(`${base}/workers/:id/tasks/:kind`, ({ params }) => {
      reads++
      return reply([{ id: `${params.kind}-strict`, name: `${params.kind}.sample` }])
    }),
  )
  renderAdmin(
    <StrictMode>
      <QueueDashboard />
    </StrictMode>,
  )
  const drawer = await openWorker()
  await within(drawer).findByText("67%")
  fireEvent.click(within(drawer).getByRole("tab", { name: "任务现场" }))
  await within(drawer).findByText("active.sample")
  await within(drawer).findByText("reserved.sample")
  expect(reads).toBe(2)
})

test("worker commands refresh worker snapshots without recollecting the hidden manual task scene", async () => {
  setup()
  let inspections = 0,
    details = 0
  server.use(
    http.get(`${base}/workers/:id/tasks/:kind`, ({ params }) => {
      inspections++
      return reply([{ id: `${params.kind}-one`, name: `${params.kind}.sample` }])
    }),
    http.get(`${base}/workers/${queueWorkerId}`, () => {
      details++
      return reply(
        queueWorker({ runtimeConcurrency: 3, runtimeActiveTasks: 2, runtimeSampledAt: new Date().toISOString() }),
      )
    }),
    http.post(`${base}/workers/:id/ping`, () => reply({ success: true, message: "OK" })),
  )
  renderAdmin(<QueueDashboard />)
  const drawer = await openWorker()
  await within(drawer).findByText("67%")
  fireEvent.click(within(drawer).getByRole("tab", { name: "任务现场" }))
  await within(drawer).findByText("active.sample")
  await within(drawer).findByText("reserved.sample")
  expect(inspections).toBe(2)
  fireEvent.click(within(drawer).getByRole("tab", { name: "运维操作" }))
  fireEvent.click(within(drawer).getByRole("button", { name: "Ping" }))
  await waitFor(() => expect(details).toBe(2))
  expect(inspections).toBe(2)
})
