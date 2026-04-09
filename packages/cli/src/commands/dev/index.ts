import { defineCommand } from "citty"
import { up } from "./up"
import { down } from "./down"
import { logs } from "./logs"

export const dev = defineCommand({
  meta: { name: "dev", description: "Development environment management" },
  subCommands: { up, down, logs },
})
