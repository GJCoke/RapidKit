import { defineCommand } from "citty"
import { docker } from "./docker"
import { workspace } from "./workspace"

export const clean = defineCommand({
  meta: { name: "clean", description: "Cleanup commands" },
  subCommands: { docker, workspace },
})
