import { ref } from "vue"

export type UsernamePinyinValidation = {
  suggestedUsername: string
  consistent: boolean
}

export function createUsernamePinyinState(initialMode: NaiveUI.TableOperateType) {
  const suggestedUsername = ref("")
  const consistent = ref<boolean | null>(null)
  const failed = ref(false)

  let mode = initialMode
  let manuallyEdited = false
  let latestRequestId = 0

  function reset(nextMode: NaiveUI.TableOperateType) {
    mode = nextMode
    manuallyEdited = false
    latestRequestId = 0
    suggestedUsername.value = ""
    consistent.value = null
    failed.value = false
  }

  function markUsernameEdited() {
    manuallyEdited = true
  }

  function beginRequest() {
    failed.value = false
    latestRequestId += 1
    return latestRequestId
  }

  function accept(
    requestId: number,
    result: UsernamePinyinValidation,
    allowAutofill = true,
  ): { username?: string } {
    if (requestId !== latestRequestId) return {}

    suggestedUsername.value = result.suggestedUsername
    consistent.value = result.consistent
    failed.value = false

    if (allowAutofill && mode === "add" && !manuallyEdited) {
      consistent.value = true
      return { username: result.suggestedUsername }
    }

    return {}
  }

  function reject(requestId: number) {
    if (requestId !== latestRequestId) return
    failed.value = true
    consistent.value = null
  }

  function clearValidation() {
    latestRequestId += 1
    suggestedUsername.value = ""
    consistent.value = null
    failed.value = false
  }

  return {
    suggestedUsername,
    consistent,
    failed,
    reset,
    markUsernameEdited,
    beginRequest,
    accept,
    reject,
    clearValidation,
  }
}
