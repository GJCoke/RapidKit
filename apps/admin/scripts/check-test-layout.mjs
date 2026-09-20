import { readdir } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

const sourceRoot = new URL("../src/", import.meta.url)
const forbiddenTestPattern = /\.(?:test|spec)\.[cm]?[jt]sx?$/
const violations = []

async function inspect(directory, relativeDirectory = "") {
  const entries = await readdir(directory, { withFileTypes: true })

  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory, entry.name)

    if (entry.isDirectory()) {
      if (relativePath === "test" || relativePath === "tests" || relativePath === "__tests__") {
        violations.push(`${relativePath}/`)
      }

      await inspect(new URL(`${relativePath}/`, sourceRoot), relativePath)
    } else if (forbiddenTestPattern.test(entry.name)) {
      violations.push(relativePath)
    }
  }
}

await inspect(sourceRoot)

if (violations.length > 0) {
  console.error("Admin tests must live under apps/admin/tests:")
  for (const violation of violations.sort()) console.error(`- src/${violation}`)
  process.exitCode = 1
}
