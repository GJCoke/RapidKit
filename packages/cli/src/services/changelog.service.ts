import { existsSync, mkdirSync, copyFileSync } from "node:fs"
import { join } from "node:path"
import { getWorkspacePackages } from "./pnpm.service"

export interface SyncResult {
  copied: string[]
  skipped: string[]
}

function normalizePackageName(name: string): string {
  const parts = name.split("/")
  return parts[parts.length - 1]
}

export function syncChangelogs(outputDir: string): SyncResult {
  const packages = getWorkspacePackages()
  const copied: string[] = []
  const skipped: string[] = []

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  for (const pkg of packages) {
    const changelogPath = join(pkg.path, "CHANGELOG.md")

    if (!existsSync(changelogPath)) {
      skipped.push(pkg.name)
      continue
    }

    const flatName = normalizePackageName(pkg.name)
    const targetPath = join(outputDir, `${flatName}-CHANGELOG.md`)
    copyFileSync(changelogPath, targetPath)
    copied.push(flatName)
  }

  return { copied, skipped }
}
