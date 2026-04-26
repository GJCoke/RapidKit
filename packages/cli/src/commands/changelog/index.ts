import { defineCommand } from "citty"
import { sync } from "./sync"

export const changelog = defineCommand({
  meta: { name: "changelog", description: "Changelog management" },
  subCommands: { sync },
})
