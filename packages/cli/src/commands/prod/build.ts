import { PROD_COMPOSE } from "../../constants"
import { createComposeCommand } from "../_shared"

export const build = createComposeCommand({
  composePath: PROD_COMPOSE,
  action: "build",
  labelKey: "prod.build.starting",
})
