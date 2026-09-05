import { describe, expect, it } from "vitest"
import { createUsernamePinyinState } from "./use-username-pinyin"

describe("username pinyin state", () => {
  it("autofills only a new untouched username", () => {
    const state = createUsernamePinyinState("add")
    const requestId = state.beginRequest()
    expect(state.accept(requestId, { suggestedUsername: "zhangsan", consistent: false })).toEqual({
      username: "zhangsan",
    })
    expect(state.consistent.value).toBe(true)

    state.markUsernameEdited()
    const nextRequestId = state.beginRequest()
    expect(state.accept(nextRequestId, { suggestedUsername: "lisi", consistent: false })).toEqual({})
    expect(state.consistent.value).toBe(false)
  })

  it("never autofills edit mode", () => {
    const state = createUsernamePinyinState("edit")
    const requestId = state.beginRequest()
    expect(state.accept(requestId, { suggestedUsername: "zhangsan", consistent: false })).toEqual({})
  })

  it("ignores stale responses and failures", () => {
    const state = createUsernamePinyinState("add")
    const staleRequestId = state.beginRequest()
    const latestRequestId = state.beginRequest()

    expect(state.accept(staleRequestId, { suggestedUsername: "old", consistent: false })).toEqual({})
    state.reject(staleRequestId)
    expect(state.failed.value).toBe(false)

    state.reject(latestRequestId)
    expect(state.failed.value).toBe(true)
  })

  it("reset clears state and restores mode behavior", () => {
    const state = createUsernamePinyinState("edit")
    state.markUsernameEdited()
    state.reset("add")

    const requestId = state.beginRequest()
    expect(state.accept(requestId, { suggestedUsername: "wangwu", consistent: false })).toEqual({
      username: "wangwu",
    })
  })
})
