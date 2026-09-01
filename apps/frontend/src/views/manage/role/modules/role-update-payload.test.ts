import assert from "node:assert/strict"
import test from "node:test"
import { buildRoleUpdatePayload } from "./role-update-payload"

test("role metadata updates omit permission fields from a complete role row", () => {
  const payload = buildRoleUpdatePayload({
    name: "Guest",
    code: "GUEST",
    description: "Guest role",
    status: "1",
    dataPolicyIds: ["data-policy"],
    fieldPolicyIds: ["field-policy"],
    routerPermissions: [],
    buttonPermissions: [],
    interfacePermissions: [],
  })

  assert.deepEqual(payload, {
    name: "Guest",
    code: "GUEST",
    description: "Guest role",
    status: "1",
    dataPolicyIds: ["data-policy"],
    fieldPolicyIds: ["field-policy"],
  })
})
