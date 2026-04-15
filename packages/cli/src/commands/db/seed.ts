import { defineFluxCommand } from "../_shared"
import * as databaseService from "../../services/database.service"

export const seed = defineFluxCommand({
  meta: { description: "Run database seed" },
  async run({ runner }) {
    await databaseService.seed(runner)
  },
})
