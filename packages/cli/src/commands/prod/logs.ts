import { PROD_COMPOSE } from "../../constants"
import { createComposeLogsCommand } from "../_shared"

export const logs = createComposeLogsCommand({
  composePath: PROD_COMPOSE,
  labelKey: "prod.logs.following",
})
