import { DEV_COMPOSE } from "../../constants"
import { createComposeCommand } from "../_shared"

export const down = createComposeCommand({
  composePath: DEV_COMPOSE,
  action: "down",
  labelKey: "dev.down.starting",
})
