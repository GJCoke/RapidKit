// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { useAuthStore } from "@/stores/auth"
import { useUsernamePinyin } from "@/views/manage/user/hooks/use-username-pinyin"
const validation = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock("@/services/api/user", async (original) => ({
  ...(await original<typeof import("@/services/api/user")>()),
  validateUsernamePinyin: validation.run,
}))
type Props = { name: string; username: string; enabled: boolean; mode: "add" | "edit" }
function setup(props: Partial<Props> = {}) {
  const autofill = vi.fn()
  const initialProps: Props = { name: "Alpha", username: "", enabled: true, mode: "add", ...props }
  return {
    autofill,
    ...renderHook(
      (values: Props) => useUsernamePinyin(values.name, values.username, autofill, values.enabled, values.mode),
      { initialProps },
    ),
  }
}
beforeEach(() => {
  vi.useFakeTimers()
  useAuthStore.getState().setToken("access", "pinyin-hook-refresh")
  useAuthStore.setState({
    userInfo: {
      id: "reader",
      username: "reader",
      name: "Reader",
      email: "",
      isAdmin: false,
      roles: [],
      buttons: ["user:validate-name"],
      createTime: "",
      updateTime: "",
    },
  })
  validation.run.mockImplementation(async ({ name, username }: { name: string; username: string }) => ({
    data: { suggestedUsername: name.toLowerCase(), consistent: username === name.toLowerCase() },
    error: null,
  }))
})
afterEach(() => {
  cleanup()
  useAuthStore.getState().clearAuth()
  validation.run.mockReset()
  vi.useRealTimers()
})
test("new-user pinyin validation debounces, autofills an untouched username and never overwrites a manual edit", async () => {
  const hook = setup()
  await act(() => vi.advanceTimersByTimeAsync(299))
  expect(validation.run).not.toHaveBeenCalled()
  await act(() => vi.advanceTimersByTimeAsync(1))
  expect(hook.autofill).toHaveBeenCalledWith("alpha")
  expect(hook.result.current.consistent).toBe(true)
  act(() => hook.result.current.markEdited())
  hook.rerender({ name: "Bravo", username: "custom", enabled: true, mode: "add" })
  await act(() => vi.advanceTimersByTimeAsync(300))
  expect(hook.autofill).toHaveBeenCalledTimes(1)
  expect(hook.result.current.suggestedUsername).toBe("bravo")
  expect(hook.result.current.consistent).toBe(false)
})
test("editing never autofills, submit revalidates current values and a failed check is explicit rather than silently accepted", async () => {
  const hook = setup({ username: "existing", mode: "edit" })
  await act(() => vi.advanceTimersByTimeAsync(300))
  expect(hook.autofill).not.toHaveBeenCalled()
  expect(hook.result.current.consistent).toBe(false)
  let result: unknown
  await act(async () => {
    result = await hook.result.current.validateNow()
  })
  expect(validation.run).toHaveBeenCalledTimes(2)
  expect(validation.run).toHaveBeenLastCalledWith({ name: "Alpha", username: "existing" })
  expect(result).toEqual({ suggestedUsername: "alpha", consistent: false })
  validation.run.mockResolvedValueOnce({ data: null, error: new Error("offline") })
  await act(async () => {
    result = await hook.result.current.validateNow()
  })
  expect(result).toBeNull()
  expect(hook.result.current.failed).toBe(true)
  expect(hook.result.current.consistent).toBeNull()
  expect(hook.result.current.checking).toBe(false)
})
test("clearing the name invalidates an already in-flight suggestion even before another debounced request starts", async () => {
  let release!: (value: unknown) => void
  const pending = new Promise((resolve) => {
    release = resolve
  })
  validation.run.mockReturnValueOnce(pending)
  const hook = setup()
  await act(() => vi.advanceTimersByTimeAsync(300))
  expect(hook.result.current.checking).toBe(true)
  hook.rerender({ name: "", username: "", enabled: true, mode: "add" })
  await act(async () => {
    release({ data: { suggestedUsername: "alpha", consistent: false }, error: null })
    await pending
  })
  expect(hook.autofill).not.toHaveBeenCalled()
  expect(hook.result.current.suggestedUsername).toBe("")
  expect(hook.result.current.consistent).toBeNull()
  expect(hook.result.current.checking).toBe(false)
})
test("closing, permission loss and identity changes reject retained validation actions and late responses", async () => {
  let release!: (value: unknown) => void
  const pending = new Promise((resolve) => {
    release = resolve
  })
  validation.run.mockReturnValueOnce(pending)
  const hook = setup()
  await act(() => vi.advanceTimersByTimeAsync(300))
  const validate = hook.result.current.validateNow
  hook.rerender({ name: "Alpha", username: "", enabled: false, mode: "add" })
  await act(async () => {
    release({ data: { suggestedUsername: "secret", consistent: false }, error: null })
    await pending
  })
  expect(hook.autofill).not.toHaveBeenCalled()
  let result: unknown
  await act(async () => {
    result = await validate()
  })
  expect(result).toBeNull()
  expect(validation.run).toHaveBeenCalledTimes(1)
  hook.rerender({ name: "Alpha", username: "", enabled: true, mode: "add" })
  act(() => useAuthStore.setState({ userInfo: { ...useAuthStore.getState().userInfo!, buttons: [] } }))
  await act(() => vi.advanceTimersByTimeAsync(300))
  expect(validation.run).toHaveBeenCalledTimes(1)
  act(() => useAuthStore.getState().setToken("other", "other-pinyin-session"))
  await act(async () => {
    result = await validate()
  })
  expect(result).toBeNull()
  expect(validation.run).toHaveBeenCalledTimes(1)
})
