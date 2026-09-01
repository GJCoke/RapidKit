import assert from "node:assert/strict"
import test from "node:test"
import {
  AVATAR_DEFAULT_COLOR,
  AVATAR_PALETTE_V1,
  getAvatarColor,
  getAvatarText,
  hashAvatarSeed,
  normalizeAvatarName,
} from "./avatar"

test("normalizes surrounding and repeated whitespace", () => {
  assert.equal(normalizeAvatarName("  John   Doe  "), "John Doe")
})

test("uses the last two Han characters", () => {
  assert.equal(getAvatarText("王小明"), "小明")
  assert.equal(getAvatarText("李雷"), "李雷")
  assert.equal(getAvatarText("李"), "李")
})

test("uses initials for multiple non-Han words", () => {
  assert.equal(getAvatarText("John Doe"), "JD")
  assert.equal(getAvatarText("Alice Smith Cooper"), "AS")
})

test("uses the first two characters for a single non-Han word", () => {
  assert.equal(getAvatarText("Alexander"), "AL")
  assert.equal(getAvatarText("7zip"), "7Z")
})

test("handles mixed and empty input deterministically", () => {
  assert.equal(getAvatarText("Team 王小明 2026"), "小明")
  assert.equal(getAvatarText("  "), "")
  assert.equal(getAvatarText(null), "")
})

test("locks the FNV-1a implementation with a fixed vector", () => {
  assert.equal(hashAvatarSeed("user-123"), 2358496403)
})

test("maps the same immutable seed to the same V1 color", () => {
  assert.equal(getAvatarColor("user-123", "Old Name"), AVATAR_PALETTE_V1[3])
  assert.equal(getAvatarColor("user-123", "New Name"), AVATAR_PALETTE_V1[3])
})

test("falls back from seed to normalized name and then the default color", () => {
  assert.equal(getAvatarColor(null, null), AVATAR_DEFAULT_COLOR)
  assert.equal(getAvatarColor(undefined, "John Doe"), getAvatarColor(undefined, "  John   Doe "))
})
