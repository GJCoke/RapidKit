import { defineCommand } from "citty"
import { create } from "./create"

export const plugin = defineCommand({
  meta: { name: "plugin", description: "Plugin management" },
  subCommands: { create },
})
