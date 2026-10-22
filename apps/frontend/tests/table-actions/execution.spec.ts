// @vitest-environment jsdom
import { createApp, h } from "vue"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import ImpersonationConfirmModal from "@/components/impersonation/impersonation-confirm-modal.vue"
const auth = vi.hoisted(() => ({
  userInfo: { id: "actor", isAdmin: true },
  impersonation: null,
  startImpersonation: vi.fn(),
}))
vi.mock("@/store/modules/auth", () => ({ useAuthStore: () => auth }))
vi.mock("vue-router", () => ({ useRoute: () => ({ fullPath: "/manage/user" }) }))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))
vi.mock("naive-ui", () => {
  const slot = {
    setup:
      (_: unknown, { slots }: { slots: Record<string, () => unknown> }) =>
      () =>
        h("div", slots.default?.() as never),
  }
  return {
    NModal: slot,
    NAlert: slot,
    NDescriptions: slot,
    NDescriptionsItem: slot,
    NInput: slot,
    NButton: {
      props: ["onClick"],
      setup:
        (props: { onClick: () => void }, { slots }: { slots: Record<string, () => unknown> }) =>
        () =>
          h("button", { onClick: props.onClick }, slots.default?.() as never),
    },
  }
})
let app: ReturnType<typeof createApp>
beforeEach(() => {
  auth.userInfo.isAdmin = true
  auth.startImpersonation.mockReset()
  auth.startImpersonation.mockResolvedValue(true)
})
afterEach(() => app?.unmount())

function mount() {
  const user: Api.SystemManage.User = {
    id: "target",
    username: "target",
    name: "Target",
    email: "target@example.test",
    roles: [],
    isAdmin: false,
    status: "1",
    createTime: "2026-10-19",
    updateTime: "2026-10-19",
  }
  const host = document.createElement("div")
  app = createApp({ render: () => h(ImpersonationConfirmModal, { user, show: true }) })
  app.mount(host)
  return host
}

it("does not submit a stale impersonation confirmation after administrator access is revoked", async () => {
  const host = mount()
  auth.userInfo.isAdmin = false
  host.querySelectorAll("button")[1].click()
  await Promise.resolve()
  expect(auth.startImpersonation).not.toHaveBeenCalled()
})

it("submits an eligible target once while the request is pending", async () => {
  const host = mount()
  host.querySelectorAll("button")[1].click()
  host.querySelectorAll("button")[1].click()
  expect(auth.startImpersonation).toHaveBeenCalledOnce()
  expect(auth.startImpersonation).toHaveBeenCalledWith({ targetUserId: "target", reason: null }, "/manage/user")
})
