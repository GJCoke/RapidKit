import { spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, expect, it } from "vitest"

const repo = fileURLToPath(new URL("../../../../", import.meta.url))
const fixture = mkdtempSync(join(tmpdir(), "rapidkit-logger-lint-"))
const cases = [
  { cwd: ".", file: "apps/frontend/src/logger-probe.ts", blocked: true },
  { cwd: "apps/frontend", file: "apps/frontend/src/logger-probe.ts", blocked: true },
  { cwd: ".", file: "apps/frontend/src/utils/logger.ts", blocked: false },
  { cwd: "apps/frontend", file: "apps/frontend/src/router/elegant/transform.ts", blocked: false },
  { cwd: ".", file: "apps/admin/src/logger-probe.ts", blocked: false },
  { cwd: "apps/admin", file: "apps/admin/src/logger-probe.ts", blocked: false },
]

beforeAll(() => {
  copyFileSync(join(repo, ".oxlintrc.json"), join(fixture, ".oxlintrc.json"))
  for (const { file } of cases) {
    mkdirSync(dirname(join(fixture, file)), { recursive: true })
    writeFileSync(join(fixture, file), 'console.error("probe")\n')
  }
})
afterAll(() => rmSync(fixture, { recursive: true, force: true }))

it.each(cases)("enforces console policy for $file from $cwd", ({ cwd, file, blocked }) => {
  const result = spawnSync(
    join(repo, "node_modules/.bin/oxlint"),
    [relative(join(fixture, cwd), join(fixture, file))],
    {
      cwd: join(fixture, cwd),
      encoding: "utf8",
    },
  )
  expect(result.error).toBeUndefined()
  expect(result.status, result.stdout + result.stderr).toBe(blocked ? 1 : 0)
  if (blocked) expect(result.stdout + result.stderr).toContain("no-console")
})
