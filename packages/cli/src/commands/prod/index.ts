import { defineCommand } from "citty"
import { build } from "./build"
import { up } from "./up"
import { down } from "./down"
import { logs } from "./logs"

export const prod = defineCommand({
  meta: { name: "prod", description: "Production environment management" },
  subCommands: { build, up, down, logs },
})
