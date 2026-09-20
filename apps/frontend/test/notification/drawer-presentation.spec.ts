import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const drawerSource = readFileSync(
  fileURLToPath(new URL("../../src/components/notification/message-drawer.vue", import.meta.url)),
  "utf8",
)
const itemSource = readFileSync(
  fileURLToPath(new URL("../../src/components/notification/message-item.vue", import.meta.url)),
  "utf8",
)

describe("notification drawer presentation", () => {
  it("uses project components for drawer states and actions", () => {
    expect(drawerSource).toContain("<NDrawer")
    expect(drawerSource).toContain("<NSkeleton")
    expect(drawerSource).toContain("<NEmpty")
    expect(drawerSource).toContain("<NButton")
    expect(drawerSource).toContain("<MessageItem")
    expect(drawerSource).toContain("compact")
  })

  it("keeps drawer-specific styling behind compact mode", () => {
    expect(itemSource).toContain("compact?: boolean")
    expect(itemSource).toContain('v-if="compact"')
    expect(itemSource).toContain("isActionable")
    expect(itemSource).toContain("carbon:chevron-right")
  })
})
