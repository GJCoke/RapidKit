// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { fireEvent, screen, waitFor, act } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { server } from "@test/setup/server"
import { renderAdmin } from "@test/setup/render"
import { useAuthStore } from "@/stores/auth"
import i18n from "@/locales"
import Preferences from "@/views/notification/preferences"
const base = "http://localhost:16000/api/v1/notification-preferences",
  rows = [
    {
      category: "user.mention",
      nameKey: "notification.category.userMention",
      enabled: true,
      closable: true,
      reserved: false,
    },
    {
      category: "system.security",
      nameKey: "notification.category.systemSecurity",
      enabled: true,
      closable: false,
      reserved: false,
    },
    {
      category: "user.invited",
      nameKey: "notification.category.userInvited",
      enabled: true,
      closable: true,
      reserved: true,
    },
  ]
const reply = (data: unknown) => HttpResponse.json({ code: 0, data })
afterEach(async () => {
  useAuthStore.getState().clearAuth()
  await i18n.changeLanguage("zh-CN")
})
test("category translations, mandatory hints and independent saving states preserve toggles and rollback errors", async () => {
  useAuthStore.getState().setToken("access", "preferences-ui")
  let release!: () => void
  const gate = new Promise<void>((r) => {
    release = r
  })
  server.use(
    http.get(base, () => reply(rows)),
    http.put(`${base}/:category`, async () => {
      await gate
      return HttpResponse.json({ code: 422, message: "Save failed", data: null })
    }),
  )
  renderAdmin(<Preferences />)
  const optional = await screen.findByRole("switch", { name: "提及我的消息" })
  expect(screen.getByRole("switch", { name: "系统安全" })).toHaveAttribute("aria-disabled", "true")
  expect(screen.getByRole("switch", { name: "用户邀请" })).toHaveAttribute("aria-disabled", "true")
  expect(screen.getAllByText("该分类为强制或保留通知，不可关闭")).toHaveLength(2)
  fireEvent.click(optional)
  await waitFor(() => expect(optional).toHaveAttribute("aria-disabled", "true"))
  await waitFor(() => expect(optional).toHaveAttribute("aria-checked", "false"))
  expect(optional).toHaveAttribute("aria-busy", "true")
  await act(async () => {
    release()
  })
  await waitFor(() => expect(optional).not.toHaveAttribute("aria-disabled", "true"))
  expect(optional).toHaveAttribute("aria-checked", "true")
  await act(async () => {
    await i18n.changeLanguage("en-US")
  })
  expect(screen.getByRole("switch", { name: "Mentions" })).not.toHaveAttribute("aria-disabled", "true")
})
test("read loading, backend failure retry and empty result remain visible", async () => {
  useAuthStore.getState().setToken("access", "preferences-empty")
  let fail = true,
    release!: () => void
  const gate = new Promise<void>((r) => {
    release = r
  })
  server.use(
    http.get(base, async () => {
      if (fail) {
        await gate
        return HttpResponse.json({ code: 422, message: "Read failed", data: null })
      }
      return reply([])
    }),
  )
  renderAdmin(<Preferences />)
  expect(screen.getByRole("status")).toBeInTheDocument()
  await act(async () => {
    release()
  })
  await screen.findByText("加载通知偏好失败")
  fail = false
  fireEvent.click(screen.getByRole("button", { name: "重试" }))
  await screen.findByText("暂无消息")
})
