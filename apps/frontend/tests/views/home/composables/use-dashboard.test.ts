import { beforeEach, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ admin: false, connect: vi.fn() }))
vi.mock("@/store/modules/auth", () => ({ useAuthStore: () => ({ userInfo: { isAdmin: state.admin } }) }))
vi.mock("@/hooks/common/app-socket", () => ({
  useAppSocket: () => ({ on: vi.fn(), connect: state.connect, isConnected: { value: false } }),
}))
vi.mock("@/service/api", () => ({}))
import { useDashboard } from "@/views/home/composables/use-dashboard"
import { useMonitoring } from "@/views/monitoring/api/composables/use-monitoring"

beforeEach(() => {
  state.admin = false
  vi.clearAllMocks()
  vi.stubGlobal("window", { location: { origin: "http://localhost" } })
})
it.each(["home", "monitoring"])("skips dashboard realtime for non-admin on %s", (page) => {
  if (page === "home") useDashboard().setupSocket([])
  else useMonitoring().setupSocket()
  expect(state.connect).not.toHaveBeenCalled()
})
it.each(["home", "monitoring"])("connects admin to dashboard namespace on %s", (page) => {
  state.admin = true
  if (page === "home") useDashboard().setupSocket([])
  else useMonitoring().setupSocket()
  expect(state.connect).toHaveBeenCalledExactlyOnceWith("/dashboard")
})
