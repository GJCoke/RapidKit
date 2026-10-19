// @vitest-environment jsdom

import { afterEach, test, expect, expectTypeOf } from "vitest"
import { render, screen } from "@testing-library/react"
import type { AuthUserInfo } from "@/services/api/auth"
import { useAuthStore } from "@/stores/auth"
import type { PermissionRequirement } from "@/features/auth/permissions"
import { Can, hasPermission } from "@/features/auth/permissions"

const user: AuthUserInfo = {
  id: "user-1",
  createTime: "",
  updateTime: "",
  name: "User",
  email: "user@example.com",
  username: "user",
  isAdmin: false,
  roles: [],
  buttons: ["user:create", "user:update"],
}

afterEach(() => useAuthStore.setState({ token: "", refreshToken: "", userInfo: null, lastLogoutReason: null }))

test("permission checks reject anonymous users and grant administrators every permission", () => {
  expect(hasPermission(null, "user:create")).toBe(false)
  expect(hasPermission({ ...user, isAdmin: true, buttons: [] }, "user:read")).toBe(true)
})

test("permission arrays use any-match semantics", () => {
  expect(hasPermission(user, "user:create")).toBe(true)
  expect(hasPermission(user, ["user:delete", "user:update"])).toBe(true)
  expect(hasPermission(user, ["user:delete", "role:update"])).toBe(false)
})

test("Can reacts to auth state changes and renders its fallback", () => {
  const { rerender } = render(
    <Can permission="user:create" fallback={<span>Forbidden</span>}>
      <span>Allowed</span>
    </Can>,
  )
  expect(screen.getByText("Forbidden")).toBeInTheDocument()

  useAuthStore.setState({ token: "token", userInfo: user })
  rerender(
    <Can permission="user:create" fallback={<span>Forbidden</span>}>
      <span>Allowed</span>
    </Can>,
  )
  expect(screen.getByText("Allowed")).toBeInTheDocument()
})

test("permission requirements only accept generated permission codes", () => {
  expectTypeOf<"user:read">().toMatchTypeOf<PermissionRequirement>()
  expectTypeOf<"manage_user:edit">().not.toMatchTypeOf<PermissionRequirement>()
})
