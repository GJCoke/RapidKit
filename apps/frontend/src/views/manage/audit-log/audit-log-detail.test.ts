import { expect, it } from "vitest"
import { useAuditDetail } from "./audit-log-detail"

it("does not let a late response replace the selected audit", async () => {
  const pending = new Map<string, (value: { data: { id: string }; error: null }) => void>()
  const detail = useAuditDetail<{ id: string }>((id) => new Promise((resolve) => pending.set(id, resolve)))
  const first = detail.load("A")
  const second = detail.load("B")
  pending.get("B")!({ data: { id: "B" }, error: null })
  await second
  pending.get("A")!({ data: { id: "A" }, error: null })
  await first
  expect(detail.data.value?.id).toBe("B")
  await detail.load(null)
  expect(detail.data.value).toBeNull()
})

it("returns the newest list response when an older filter request finishes late", async () => {
  const { createLatestAuditRequest } = await import("./audit-log-detail")
  const pending: Array<(value: string) => void> = []
  const request = createLatestAuditRequest(() => new Promise<string>((resolve) => pending.push(resolve)))
  const first = request()
  const second = request()
  pending[1]("new filter")
  expect(await second).toBe("new filter")
  pending[0]("old filter")
  expect(await first).toBe("new filter")
})
