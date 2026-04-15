import { describe, it, expect } from "vitest"
import { writeFileSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { readDbCredentials } from "../../infra/env"

function createTempEnv(content: string): string {
  const dir = join(tmpdir(), `cli-test-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, ".env")
  writeFileSync(path, content, "utf-8")
  return path
}

describe("readDbCredentials", () => {
  it("parses standard .env format", () => {
    const path = createTempEnv(
      ["POSTGRESQL_USERNAME=admin", "POSTGRESQL_DATABASE=mydb", "POSTGRESQL_PASSWORD=secret123"].join("\n"),
    )

    const creds = readDbCredentials(path)
    expect(creds.user).toBe("admin")
    expect(creds.database).toBe("mydb")
    expect(creds.password).toBe("secret123")

    rmSync(path)
  })

  it("returns defaults when file is empty", () => {
    const path = createTempEnv("")

    const creds = readDbCredentials(path)
    expect(creds.user).toBe("root")
    expect(creds.database).toBe("client")
    expect(creds.password).toBe("")

    rmSync(path)
  })

  it("returns defaults when file does not exist", () => {
    const creds = readDbCredentials("/nonexistent/path/.env")
    expect(creds.user).toBe("root")
    expect(creds.database).toBe("client")
    expect(creds.password).toBe("")
  })

  it("handles values with equals signs", () => {
    const path = createTempEnv("POSTGRESQL_PASSWORD=pass=word=123")

    const creds = readDbCredentials(path)
    expect(creds.password).toBe("pass=word=123")

    rmSync(path)
  })

  it("skips comments and empty lines", () => {
    const path = createTempEnv(
      [
        "# This is a comment",
        "",
        "POSTGRESQL_USERNAME=testuser",
        "# POSTGRESQL_DATABASE=skipped",
        "POSTGRESQL_DATABASE=testdb",
      ].join("\n"),
    )

    const creds = readDbCredentials(path)
    expect(creds.user).toBe("testuser")
    expect(creds.database).toBe("testdb")

    rmSync(path)
  })
})
