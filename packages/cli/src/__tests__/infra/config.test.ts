import { describe, it, expect } from "vitest"
import { RapidKitConfigSchema } from "../../infra/config"

describe("RapidKitConfigSchema", () => {
  it("accepts valid complete config", () => {
    const result = RapidKitConfigSchema.parse({
      runtime: "docker",
      region: "china",
      locale: "zh-CN",
    })
    expect(result.runtime).toBe("docker")
    expect(result.region).toBe("china")
    expect(result.locale).toBe("zh-CN")
  })

  it("accepts empty config", () => {
    const result = RapidKitConfigSchema.parse({})
    expect(result.runtime).toBeUndefined()
    expect(result.region).toBeUndefined()
    expect(result.locale).toBeUndefined()
  })

  it("accepts partial config", () => {
    const result = RapidKitConfigSchema.parse({ locale: "en-US" })
    expect(result.locale).toBe("en-US")
    expect(result.runtime).toBeUndefined()
  })

  it("rejects invalid runtime", () => {
    expect(() => RapidKitConfigSchema.parse({ runtime: "kubernetes" })).toThrow()
  })

  it("rejects invalid region", () => {
    expect(() => RapidKitConfigSchema.parse({ region: "europe" })).toThrow()
  })

  it("rejects invalid locale", () => {
    expect(() => RapidKitConfigSchema.parse({ locale: "fr-FR" })).toThrow()
  })

  it("accepts podman runtime", () => {
    const result = RapidKitConfigSchema.parse({ runtime: "podman" })
    expect(result.runtime).toBe("podman")
  })
})
