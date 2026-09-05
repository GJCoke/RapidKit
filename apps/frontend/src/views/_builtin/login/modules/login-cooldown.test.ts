import { describe, expect, it } from "vitest"
import { formatCooldown } from "./login-cooldown"

describe("formatCooldown", () => {
  it("formats cooldowns shorter than one hour", () => {
    expect(formatCooldown(287)).toBe("04:47")
  })

  it("includes hours for longer cooldowns", () => {
    expect(formatCooldown(3887)).toBe("01:04:47")
  })

  it("clamps non-positive values", () => {
    expect(formatCooldown(0)).toBe("00:00")
    expect(formatCooldown(-3)).toBe("00:00")
  })
})
