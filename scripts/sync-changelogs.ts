import { execSync } from "node:child_process"
import { existsSync, mkdirSync, copyFileSync } from "node:fs"
import path from "node:path"

interface WorkspacePackage {
  name: string
  path: string
  version?: string
  private?: boolean
}

const OUTPUT_DIR = path.resolve("docs/website/src/changelog")

function getWorkspacePackages(): WorkspacePackage[] {
  try {
    const output = execSync("pnpm m ls --json", { encoding: "utf8" })
    return JSON.parse(output) as WorkspacePackage[]
  } catch (err) {
    console.error("Failed to load pnpm workspace information.")
    console.error(err)
    return []
  }
}

function normalizePackageName(name: string): string {
  const parts = name.split("/")
  return parts[parts.length - 1]
}

function syncChangelogs() {
  const packages = getWorkspacePackages()

  if (!packages.length) {
    console.log("No workspace packages found.")
    return
  }

  console.log(`Detected ${packages.length} workspace packages.`)

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  for (const pkg of packages) {
    const changelogPath = path.join(pkg.path, "CHANGELOG.md")

    if (!existsSync(changelogPath)) {
      console.log(`Package "${pkg.name}" does not contain a CHANGELOG.md file.`)
      continue
    }

    const flatName = normalizePackageName(pkg.name)
    const targetPath = path.join(OUTPUT_DIR, `${flatName}-CHANGELOG.md`)

    copyFileSync(changelogPath, targetPath)

    console.log(`Copied: ${flatName}-CHANGELOG.md`)
  }

  console.log(`All CHANGELOG files have been synced to the '${OUTPUT_DIR}' directory.`)
}

syncChangelogs()
