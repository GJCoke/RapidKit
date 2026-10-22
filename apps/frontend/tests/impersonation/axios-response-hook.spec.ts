import { createRequire } from "node:module"
const { CanceledError } = createRequire(new URL("../../../../packages/axios/package.json", import.meta.url))("axios")
import { expect, it, vi } from "vitest"
vi.mock("@rapidkit/utils", () => ({ nanoid: () => "request" }))
import { createFlatRequest } from "../../../../packages/axios/src/index"

it.each(["json", "blob"] as const)(
  "runs optional cancellation hook before %s results are transformed",
  async (responseType) => {
    const transform = vi.fn(() => "transformed")
    const onResponse = vi.fn(() => {
      throw new CanceledError("stale")
    })
    const request = createFlatRequest(
      { adapter: async (config) => ({ status: 200, statusText: "OK", headers: {}, config, data: "old-data" }) },
      { transform, onResponse },
    )
    const result = await request({ url: "/old", responseType })
    expect(onResponse).toHaveBeenCalledOnce()
    expect(result.data).toBeNull()
    expect(result.error?.code).toBe("ERR_CANCELED")
    expect(transform).not.toHaveBeenCalled()
  },
)

it("keeps existing callers without a hook working", async () => {
  const request = createFlatRequest({
    adapter: async (config) => ({ status: 200, statusText: "OK", headers: {}, config, data: "data" }),
  })
  expect((await request({ url: "/normal" })).data).toBe("data")
})
