import { expect, test } from "vitest"

import { createTabFromLocation } from "@/features/router/route-instance-key"
import type { NormalizedRoute } from "@/features/router/route-model"

test("creates a tab with the translated route title", () => {
  const route = {
    name: "manage_user",
    title: "用户管理",
    i18nKey: "route.manage_user",
    fullPath: "/manage/user",
    defaultSearch: "",
    kind: "view",
  } as NormalizedRoute

  const tab = createTabFromLocation(route, route.fullPath, (key) => (key === "route.manage_user" ? "Users" : key))

  expect(tab.label).toBe("Users")
})
