import { expect, it, vi } from "vitest"
import type { ElegantConstRoute } from "@elegant-router/types"
import { getGlobalMenusByAuthRoutes } from "@/store/modules/route/shared"

vi.mock("@/hooks/common/icon", () => ({ useSvgIcon: () => ({ SvgIconVNode: () => null }) }))
vi.mock("@/locales", () => ({ $t: (key: string) => key }))

function routes(withUsers: boolean): ElegantConstRoute[] {
  return [
    {
      name: "manage",
      path: "/manage",
      meta: { title: "Manage" },
      children: [
        ...(withUsers ? [{ name: "manage_user", path: "/manage/user", meta: { title: "Users" } }] : []),
        { name: "manage_department", path: "/manage/department", meta: { title: "Departments" } },
      ],
    },
  ] as ElegantConstRoute[]
}

it("merges the department menu only when the user workspace is accessible", () => {
  expect(getGlobalMenusByAuthRoutes(routes(true))[0].children?.map((menu) => menu.key)).toEqual(["manage_user"])
  expect(getGlobalMenusByAuthRoutes(routes(false))[0].children?.map((menu) => menu.key)).toEqual(["manage_department"])
})
