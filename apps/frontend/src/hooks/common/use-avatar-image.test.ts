import assert from "node:assert/strict"
import test from "node:test"
import { nextTick, ref } from "vue"
import { useAvatarImage } from "./use-avatar-image"

test("hides a failed image URL", () => {
  const source = ref<string | null>("https://example.com/avatar.png")
  const { displaySrc, imageFailed, handleImageError } = useAvatarImage(source)

  handleImageError()

  assert.equal(imageFailed.value, true)
  assert.equal(displaySrc.value, undefined)
})

test("retries when the image URL changes", async () => {
  const source = ref<string | null>("https://example.com/old.png")
  const { displaySrc, imageFailed, handleImageError } = useAvatarImage(source)

  handleImageError()
  source.value = "https://example.com/new.png"
  await nextTick()

  assert.equal(imageFailed.value, false)
  assert.equal(displaySrc.value, "https://example.com/new.png")
})

test("does not produce a source for an empty URL", () => {
  const source = ref<string | null>(null)
  const { displaySrc } = useAvatarImage(source)

  assert.equal(displaySrc.value, undefined)
})
