// Browser-only API fixtures keep account invitations and password changes away from real users.
export function userFixtures(account) {
  const id = (number) => `10000000-0000-4000-8000-${String(number).padStart(12, "0")}`
  const stamp = "2026-10-24T00:00:00Z"
  const departments = Array.from({ length: 7 }, (_, index) => ({
    id: id(100 + index),
    name: `Migration Dept ${index + 1}`,
    code: `migration-dept-${index + 1}`,
    parentId: index ? id(99 + index) : null,
    sort: index,
    status: "1",
    leaderId: null,
    createTime: stamp,
    updateTime: stamp,
  }))
  const profile = {
    createTime: stamp,
    updateTime: stamp,
    phone: "123456789",
    nickname: "",
    gender: "other",
    avatar: null,
    remark: "Migration test",
    isAdmin: false,
    status: "1",
    roles: ["READER"],
    departmentId: id(101),
  }
  const state = {
    actorId: id(1),
    listMode: "ready",
    writeFailure: false,
    pinyinMode: "ready",
    gate: null,
    departmentGate: null,
    rows: [
      {
        ...profile,
        id: id(2),
        name: "Migration Alice",
        username: "migration_alice",
        email: account === "guest" ? "m***@example.test" : "alice@example.test",
      },
      {
        ...profile,
        id: id(3),
        name: "Migration Pending",
        username: "migration_pending",
        email: account === "guest" ? "p***@example.test" : "pending@example.test",
        status: "3",
        departmentId: null,
      },
      {
        ...profile,
        id: id(4),
        name: "Migration Disabled",
        username: "migration_disabled",
        email: account === "guest" ? "d***@example.test" : "disabled@example.test",
        status: "2",
        departmentId: id(106),
      },
    ],
    departments,
    writes: [],
    lists: [],
    countReads: 0,
    handlerErrors: [],
  }
  let sequence = 500
  const tree = (parentId = null) =>
    state.departments
      .filter((department) => department.parentId === parentId)
      .map((department) => ({ ...department, children: tree(department.id) }))
  const descendants = (parent) => [
    parent,
    ...state.departments
      .filter((department) => department.parentId === parent)
      .flatMap((department) => descendants(department.id)),
  ]
  const actor = () => ({
    ...profile,
    id: state.actorId,
    name: "Migration Administrator",
    username: "migration_admin",
    email: account === "guest" ? "a***@example.test" : "admin@example.test",
    isAdmin: true,
  })
  const allUsers = () => [...state.rows, actor()]
  async function handler(route) {
    const incoming = route.request(),
      url = new URL(incoming.url())
    const match = url.pathname.match(/\/(users|departments|roles)(\/.*)?$/)
    if (!match) return route.fallback()
    const resource = `/${match[1]}${match[2] || ""}`,
      method = incoming.method()
    const reply = (data, code = 0) =>
      route.fulfill({ json: { code, message: code ? "Migration fixture failure" : "OK", data } })
    try {
      if (resource === "/users/validate-username-pinyin") {
        if (state.pinyinMode === "failed") return reply(null, 15001)
        const body = incoming.postDataJSON()
        return reply({
          suggestedUsername: body.name.toLowerCase().replaceAll(/[^a-z0-9]/g, ""),
          consistent: state.pinyinMode !== "mismatch",
        })
      }
      if (resource === "/users/department-counts" && method === "GET") {
        state.countReads++
        const rows = allUsers(),
          counts = {}
        for (const row of rows) if (row.departmentId) counts[row.departmentId] = (counts[row.departmentId] || 0) + 1
        return reply({
          total: rows.length,
          unassigned: rows.filter((row) => !row.departmentId).length,
          departments: counts,
        })
      }
      if (resource === "/users/all" && method === "GET")
        return reply(allUsers().map(({ id, name, username, email }) => ({ id, name, username, email })))
      if (resource === "/roles/all" && method === "GET") return reply([{ id: id(200), name: "Reader", code: "READER" }])
      if (resource === "/departments/tree" && method === "GET") {
        if (state.departmentGate) await state.departmentGate
        return reply(tree())
      }
      if (resource === "/users" && method === "GET") {
        state.lists.push(Object.fromEntries(url.searchParams))
        if (state.gate) await state.gate
        if (state.listMode === "failed") return reply(null, 15001)
        let rows = allUsers()
        const keyword = (url.searchParams.get("keyword") || "").toLowerCase(),
          status = url.searchParams.get("status"),
          department = url.searchParams.get("departmentId")
        if (keyword)
          rows = rows.filter((row) => `${row.name} ${row.username} ${row.email}`.toLowerCase().includes(keyword))
        if (status) rows = rows.filter((row) => row.status === status)
        if (url.searchParams.get("unassigned") === "true") rows = rows.filter((row) => !row.departmentId)
        if (department) {
          const allowed = url.searchParams.get("includeChildren") === "false" ? [department] : descendants(department)
          rows = rows.filter((row) => allowed.includes(row.departmentId))
        }
        const page = Number(url.searchParams.get("page") || 1),
          pageSize = Number(url.searchParams.get("pageSize") || 20)
        return reply({
          records: rows.slice((page - 1) * pageSize, page * pageSize),
          total: rows.length,
          page,
          pageSize,
        })
      }
      if (method === "GET") return route.fallback()
      if (match[1] === "roles") return route.fallback()
      const body = incoming.postData() ? incoming.postDataJSON() : null
      state.writes.push({ resource, method, body })
      if (state.writeFailure) {
        state.writeFailure = false
        return reply(null, 15001)
      }
      if (resource === "/users" && method === "POST") {
        const user = { ...profile, ...body, id: id(sequence++), status: "3" }
        state.rows.push(user)
        return reply(user)
      }
      if (resource === "/users" && method === "DELETE") {
        state.rows = state.rows.filter((row) => !body.ids.includes(row.id))
        return reply(true)
      }
      const user = resource.match(/^\/users\/([^/]+)(?:\/(password|resend-invite))?$/)
      if (user) {
        if (user[2]) return reply(true)
        const row = state.rows.find((row) => row.id === user[1])
        if (method === "DELETE") {
          state.rows = state.rows.filter((row) => row.id !== user[1])
          return reply(true)
        }
        if (method === "PUT" && row) {
          Object.assign(row, body)
          return reply(row)
        }
      }
      if (resource === "/departments" && method === "POST") {
        const department = { ...body, id: id(sequence++), createTime: stamp, updateTime: stamp }
        state.departments.push(department)
        return reply(department)
      }
      const department = resource.match(/^\/departments\/([^/]+)$/)
      if (department) {
        const row = state.departments.find((row) => row.id === department[1])
        if (method === "PUT" && row) {
          Object.assign(row, body)
          return reply(row)
        }
        if (method === "DELETE" && row) {
          if (state.departments.some((child) => child.parentId === row.id)) return reply(null, 15001)
          state.departments = state.departments.filter((item) => item.id !== row.id)
          return reply(row)
        }
      }
      throw new Error(`Unrecognized isolated write ${method} ${resource}`)
    } catch (error) {
      state.handlerErrors.push(String(error))
      return reply(null, 15001)
    }
  }
  return { state, handler, tree }
}
