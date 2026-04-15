import { DEV_COMPOSE } from "../../constants"
import { createComposeLogsCommand } from "../_shared"

export const logs = createComposeLogsCommand({
  composePath: DEV_COMPOSE,
  labelKey: "dev.logs.following",
})
