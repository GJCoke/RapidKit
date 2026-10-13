import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const drawerSource = readFileSync(
  fileURLToPath(new URL("../../src/components/notification/message-popover.vue", import.meta.url)),
  "utf8",
)
const itemSource = readFileSync(
  fileURLToPath(new URL("../../src/components/notification/message-item.vue", import.meta.url)),
  "utf8",
)

describe("notification popover presentation", () => {
  it("uses project components for popover states and actions", () => {
    expect(drawerSource).toContain("<NPopover")
    expect(drawerSource).toContain("<NSkeleton")
    expect(drawerSource).toContain("<NEmpty")
    expect(drawerSource).toContain("<NButton")
    expect(drawerSource).toContain("<MessageItem")
    expect(drawerSource).toContain("compact")
  })

  it("keeps popover-specific styling behind compact mode", () => {
    expect(itemSource).toContain("compact?: boolean")
    expect(itemSource).toContain('v-else-if="compact"')
    expect(itemSource).toContain("isActionable")
    expect(itemSource).toContain("notification-preview-action")
    expect(itemSource).toContain("actionLabel")
    expect(itemSource).not.toContain("carbon:chevron-right")
  })
})
