import { readFileSync } from "node:fs"
import { z } from "zod"

export const DbCredentialsSchema = z.object({
  user: z.string().min(1),
  database: z.string().min(1),
  password: z.string(),
})

export type DbCredentials = z.infer<typeof DbCredentialsSchema>

export function readDbCredentials(envPath: string): DbCredentials {
  let user = "root"
  let database = "client"
  let pwd = ""

  try {
    const content = readFileSync(envPath, "utf-8")
    for (const line of content.split("\n")) {
      const trimmed = line.trim()
      if (trimmed.startsWith("#") || !trimmed.includes("=")) continue
      const [key, ...rest] = trimmed.split("=")
      const value = rest.join("=").trim()
      if (key.trim() === "POSTGRESQL_USERNAME") user = value
      if (key.trim() === "POSTGRESQL_DATABASE") database = value
      if (key.trim() === "POSTGRESQL_PASSWORD") pwd = value
    }
  } catch {
    // 读取失败时使用默认值
  }

  return { user, database, password: pwd }
}
