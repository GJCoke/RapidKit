import { PROD_COMPOSE } from "../../constants"
import { createComposeCommand } from "../_shared"

export const down = createComposeCommand({
  composePath: PROD_COMPOSE,
  action: "down",
  labelKey: "prod.down.starting",
})
