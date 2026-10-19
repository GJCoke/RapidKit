import { expectTypeOf, it } from "vitest"
import type { useAuth } from "@/hooks/business/auth"

type HasAuthArgument = Parameters<ReturnType<typeof useAuth>["hasAuth"]>[0]

it("only accepts generated permission codes", () => {
  expectTypeOf<"user:read">().toMatchTypeOf<HasAuthArgument>()
  expectTypeOf<["user:read", "role:read"]>().toMatchTypeOf<HasAuthArgument>()
  expectTypeOf<"manage_user:edit">().not.toMatchTypeOf<HasAuthArgument>()
})
