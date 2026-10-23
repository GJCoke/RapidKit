import assert from "node:assert/strict"
export const onlineId = "aaaaaaaa-0000-4000-8000-000000000001",
  offlineId = "aaaaaaaa-0000-4000-8000-000000000002",
  staleId = "aaaaaaaa-0000-4000-8000-000000000003",
  newId = "aaaaaaaa-0000-4000-8000-000000000004"
export const queuePattern =
  /\/(?:api\/v1|proxy-default)\/(?:workers(?:\/[^?]+)?|tasks\/stats\/(?:dashboard|by-name|by-worker))(?:\?|$)/
const stamp = () => new Date().toISOString()
function worker(id, hostname, status = "1") {
  return {
    id,
    hostname,
    status,
    activeQueues: ["celery", "critical"],
    concurrency: 4,
    activeTaskCount: 2,
    processedCount: 20,
    loadAverage: {},
    softwareInfo: {
      celery_version: "5.6.0",
      python_version: "3.13.0",
      platform: "Linux arm64",
      custom: { region: "local", enabled: true },
    },
    lastHeartbeat: status === "1" ? stamp() : new Date(Date.now() - 90000).toISOString(),
    runtimeConcurrency: 3,
    runtimeActiveTasks: 2,
    runtimeSampledAt: stamp(),
    createTime: "2026-10-01T00:00:00Z",
    updateTime: stamp(),
  }
}
export function queueFixtures() {
  const state = {
    workers: [
      worker(onlineId, "worker@migration-parity-long-hostname"),
      worker(offlineId, "offline@migration", "2"),
      worker(staleId, "stale@migration"),
    ],
    empty: false,
    sampleAge: 0,
    failOverview: false,
    failTasks: false,
    failWorkerRank: false,
    failWorkers: false,
    failDetail: false,
    failActive: false,
    failReserved: false,
    runtimeUnknown: false,
    readGate: null,
    commandGate: null,
    commandFailed: false,
    pingSuccess: true,
    overviewQueries: [],
    taskQueries: [],
    workerRankingQueries: [],
    inventories: 0,
    details: [],
    inspections: [],
    commands: [],
  }
  state.workers[2].lastHeartbeat = new Date(Date.now() - 90000).toISOString()
  const stale = new Set([staleId])
  const snapshot = (row) => ({
    ...structuredClone(row),
    lastHeartbeat: row.status === "1" && !stale.has(row.id) ? stamp() : row.lastHeartbeat,
    runtimeSampledAt: stamp(),
    ...(state.runtimeUnknown ? { runtimeConcurrency: null, runtimeActiveTasks: null, runtimeSampledAt: null } : {}),
  })
  const handler = async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      endpoint = url.pathname.replace(/^\/(api\/v1|proxy-default)/, ""),
      method = request.method(),
      query = Object.fromEntries(url.searchParams)
    const respond = async (data, failed = false, message = "Queue fixture failure") =>
      route.fulfill({ json: failed ? { code: 422, message, data: null } : { code: 0, data } })
    if (method === "GET") {
      let data,
        failed = false,
        message = "Queue fixture failure"
      if (endpoint === "/workers/all") {
        state.inventories++
        data = state.empty ? [] : state.workers.map(snapshot)
        failed = state.failWorkers
        message = "Worker inventory failed"
      } else if (endpoint === "/tasks/stats/dashboard") {
        state.overviewQueries.push(query)
        const days = Number(query.days)
        assert([1, 7, 30].includes(days))
        const healthy = state.workers.filter((row) => row.status === "1" && !stale.has(row.id))
        data = {
          sampledAt: new Date(Date.now() - state.sampleAge).toISOString(),
          queues: state.empty
            ? []
            : [
                { name: "stuck", depth: 5, consumers: 0 },
                {
                  name: "celery",
                  depth: 12,
                  consumers: healthy.filter((row) => row.activeQueues.includes("celery")).length,
                },
                {
                  name: "critical",
                  depth: 0,
                  consumers: healthy.filter((row) => row.activeQueues.includes("critical")).length,
                },
                { name: "idle", depth: 0, consumers: 0 },
                { name: "unavailable", depth: null, consumers: null },
              ],
          queueDepth: state.empty ? 0 : null,
          onlineWorkers: state.empty ? 0 : healthy.length,
          totalWorkers: state.empty ? 0 : state.workers.length,
          activeTasks: state.empty ? 0 : healthy.reduce((total, row) => total + row.activeTaskCount, 0),
          concurrency: state.empty ? 0 : healthy.reduce((total, row) => total + row.concurrency, 0),
          throughput: state.empty ? 0 : 0.5,
          success: state.empty ? 0 : 8 * days,
          failure: state.empty ? 0 : 2,
          retry: state.empty ? 0 : 1,
          revoked: state.empty ? 0 : 1,
          successRate: state.empty ? null : 80,
          avgRuntime: state.empty ? null : 0.2,
          p95Runtime: state.empty ? null : 0.35,
          timeline: state.empty
            ? []
            : [
                { timeBucket: new Date(Date.now() - 3600000).toISOString(), success: 4, failure: 1 },
                { timeBucket: stamp(), success: 4, failure: 1 },
              ],
          depthTimeline: state.empty
            ? []
            : [
                { timeBucket: new Date(Date.now() - 7200000).toISOString(), depth: 4 },
                { timeBucket: new Date(Date.now() - 3600000).toISOString(), depth: null },
                { timeBucket: stamp(), depth: 2 },
              ],
        }
        failed = state.failOverview
        message = "Overview failed"
      } else if (endpoint === "/tasks/stats/by-name") {
        state.taskQueries.push(query)
        assert.equal(query.page, "1")
        assert.equal(query.pageSize, "10")
        assert.equal(query.sortBy, "total")
        assert.equal(query.sortOrder, "desc")
        data = {
          page: 1,
          pageSize: 10,
          total: state.empty ? 0 : 1,
          records: state.empty
            ? []
            : [
                {
                  taskName: "migration.sample",
                  total: 10,
                  success: 8,
                  failure: 2,
                  inProgress: 0,
                  successRate: 80,
                  lastExecutedAt: stamp(),
                  avgRuntime: 0.2,
                },
              ],
        }
        failed = state.failTasks
        message = "Task ranking failed"
      } else if (endpoint === "/tasks/stats/by-worker") {
        state.workerRankingQueries.push(query)
        data = state.empty
          ? []
          : [
              {
                workerHostname: "worker@migration-parity-long-hostname",
                total: 9,
                success: 8,
                failure: 1,
                avgRuntime: 0.2,
              },
            ]
        failed = state.failWorkerRank
        message = "Worker ranking failed"
      } else {
        const match = endpoint.match(/^\/workers\/([^/]+)(?:\/tasks\/(active|reserved))?$/)
        assert(match, `unexpected queue read ${endpoint}`)
        const [, id, kind] = match,
          row = state.workers.find((worker) => worker.id === id)
        assert(row, "fixture worker exists")
        if (kind) {
          state.inspections.push({ id, kind })
          data = [
            {
              id: `${id}-${kind}`,
              name: `migration.${kind}.task`,
              args: "['example', 1]",
              kwargs: "{'enabled': False}",
              workerPid: 412,
              timeStart: Date.now() / 1000 - 20,
            },
          ]
          failed = kind === "active" ? state.failActive : state.failReserved
          message = `${kind} inspection failed`
        } else {
          state.details.push(id)
          data = snapshot(row)
          failed = state.failDetail
          message = "Worker detail failed"
        }
      }
      if (state.readGate) await state.readGate
      await respond(data, failed, message)
      return
    }
    assert.equal(method, "POST")
    const match = endpoint.match(/^\/workers\/([^/]+)\/(ping|shutdown|pool\/(?:grow|shrink)|queues\/(?:add|cancel))$/)
    assert(match, `unexpected queue write ${endpoint}`)
    const [, id, action] = match,
      row = state.workers.find((worker) => worker.id === id)
    assert(row)
    const raw = request.postData(),
      body = raw ? JSON.parse(raw) : null
    state.commands.push({ id, action, body })
    if (action.startsWith("pool/")) {
      assert.deepEqual(Object.keys(body), ["n"])
      assert(Number.isInteger(body.n) && body.n >= 1 && body.n <= 10)
    } else if (action.startsWith("queues/")) {
      assert.deepEqual(Object.keys(body), ["queue"])
      assert.equal(body.queue, body.queue.trim())
      assert(body.queue)
    } else assert.equal(body, null)
    if (state.commandGate) await state.commandGate
    if (state.commandFailed) {
      await respond(null, true, "Worker command failed")
      return
    }
    if (action === "ping") {
      await respond({ success: state.pingSuccess, message: "Ping result" })
      return
    }
    if (action === "shutdown") row.status = "2"
    if (action === "pool/grow") {
      row.runtimeConcurrency += body.n
      row.concurrency = row.runtimeConcurrency
    }
    if (action === "pool/shrink") {
      row.runtimeConcurrency -= body.n
      row.concurrency = row.runtimeConcurrency
    }
    if (action === "queues/add" && !row.activeQueues.includes(body.queue)) row.activeQueues.push(body.queue)
    if (action === "queues/cancel") row.activeQueues = row.activeQueues.filter((queue) => queue !== body.queue)
    await respond({ success: true, message: "Accepted" })
  }
  return {
    state,
    handler,
    onlineId,
    offlineId,
    staleId,
    newId,
    addWorker: () => {
      const row = worker(newId, "new@migration")
      state.workers.push(row)
      return snapshot(row)
    },
    statusEvent: (id = onlineId, overrides = {}) => {
      const row = state.workers.find((worker) => worker.id === id)
      assert(row)
      Object.assign(row, overrides)
      return {
        hostname: row.hostname,
        status: row.status,
        concurrency: row.concurrency,
        activeTaskCount: row.activeTaskCount,
        processedCount: row.processedCount,
        activeQueues: row.activeQueues,
        lastHeartbeat: stamp(),
      }
    },
  }
}
