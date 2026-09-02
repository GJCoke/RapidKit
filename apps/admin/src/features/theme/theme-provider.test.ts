import assert from "node:assert/strict"
import test from "node:test"
import { syncColorScheme } from "./theme-provider"

class ThemeClassList {
  readonly values = new Set<string>()

  add(token: string) {
    this.values.add(token)
  }

  remove(token: string) {
    this.values.delete(token)
  }

  toggle(token: string, force?: boolean) {
    if (force === undefined ? !this.values.has(token) : force) this.values.add(token)
    else this.values.delete(token)
    return this.values.has(token)
  }
}

test("auto theme follows system changes and removes its listener on cleanup", () => {
  const classList = new ThemeClassList()
  let listener: ((event: { matches: boolean }) => void) | undefined
  let removedListener: ((event: { matches: boolean }) => void) | undefined
  const media = {
    matches: false,
    addEventListener: (_type: "change", nextListener: (event: { matches: boolean }) => void) => {
      listener = nextListener
    },
    removeEventListener: (_type: "change", nextListener: (event: { matches: boolean }) => void) => {
      removedListener = nextListener
    },
  }

  const cleanup = syncColorScheme("auto", classList, () => media)
  assert.equal(classList.values.has("dark"), false)
  listener?.({ matches: true })
  assert.equal(classList.values.has("dark"), true)

  cleanup()
  assert.equal(removedListener, listener)
})

test("explicit light and dark themes do not create a system listener", () => {
  const classList = new ThemeClassList()
  let matchMediaCalls = 0
  const matchMedia = () => {
    matchMediaCalls += 1
    throw new Error("explicit schemes must not query system theme")
  }

  syncColorScheme("dark", classList, matchMedia)
  assert.equal(classList.values.has("dark"), true)
  syncColorScheme("light", classList, matchMedia)
  assert.equal(classList.values.has("dark"), false)
  assert.equal(matchMediaCalls, 0)
})
