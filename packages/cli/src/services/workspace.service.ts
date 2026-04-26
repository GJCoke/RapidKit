import { existsSync } from "node:fs"
import { join } from "node:path"
import { type TaskRunner } from "../infra/runner"
import { t } from "../infra/i18n"
import { getWorkspacePackages } from "./pnpm.service"

const DIRS_TO_CLEAN = ["node_modules", "dist", "build", "coverage", ".venv", ".turbo"]

export interface CleanResult {
  packages: string[]
  dirs: string[]
}

export function discoverCleanTargets(rootPath: string): CleanResult {
  const packages = getWorkspacePackages()
  const allPaths = [...packages.map((p) => p.path), rootPath]
  const dirs: string[] = []

  for (const pkgPath of allPaths) {
    for (const dir of DIRS_TO_CLEAN) {
      const fullPath = join(pkgPath, dir)
      if (existsSync(fullPath)) {
        dirs.push(fullPath)
      }
    }
  }

  return { packages: allPaths, dirs }
}

export async function cleanDirs(runner: TaskRunner, dirs: string[]): Promise<void> {
  for (const dir of dirs) {
    await runner.run({ label: t("clean.workspace.cleaning", { dir }) }, "rm", ["-rf", dir])
  }
}
