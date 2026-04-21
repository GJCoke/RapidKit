import { defineCommand } from "citty"
import { migrate } from "./migrate"
import { upgrade } from "./upgrade"
import { downgrade } from "./downgrade"
import { status } from "./status"
import { reset } from "./reset"
import { seed } from "./seed"
import { clean } from "./clean"

export const db = defineCommand({
  meta: { name: "db", description: "Database migration management" },
  subCommands: { migrate, upgrade, downgrade, status, reset, seed, clean },
})
