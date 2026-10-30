import { describe, expect, it } from "vitest"
import { extractCredential } from "@/views/_builtin/login/modules/credential-token"

describe("credential URL privacy", () => {
  it.each([
    ["https://app.test/login/reset-password#token=private", "https://app.test/login/reset-password"],
    ["https://app.test/login/set-password?token=private&locale=en", "https://app.test/login/set-password?locale=en"],
    ["https://app.test/#/login/reset-password?token=private", "https://app.test/#/login/reset-password"],
  ])("extracts a token without leaving it in the URL: %s", (url, clean) => {
    expect(extractCredential(url)).toEqual({ token: "private", url: clean })
  })
  it("ignores token parameters on unrelated pages", () => {
    const url = "https://app.test/other?token=private"
    expect(extractCredential(url)).toEqual({ token: "", url })
  })
})
