import { execSync } from "child_process"
import fs from "fs"
import path from "path"

// 要删除的目录列表，可以扩展
const dirsToDelete = ["node_modules", "dist", "build", "coverage", ".venv", ".turbo", ".pnpm-lock.yaml", "uv.lock"]

// 获取 workspace 子包路径
function getWorkspacePackages(): string[] {
  try {
    const output = execSync("pnpm m ls --json", { encoding: "utf8" })
    const packages = JSON.parse(output)

    return packages.map((pkg: any) => pkg.path as string)
  } catch (err) {
    console.error("get pnpm workspace children packages fail:", err)
    process.exit(1)
  }
}

function deleteDirs(pkgPath: string) {
  dirsToDelete.forEach((dir) => {
    const fullPath = path.join(pkgPath, dir)
    if (fs.existsSync(fullPath)) {
      console.log(`delete ${fullPath} ...`)
      execSync(`rm -rf "${fullPath}"`, { stdio: "inherit" })
    }
  })
}

function main() {
  const root = process.cwd()
  const packages = getWorkspacePackages()

  if (packages.length === 0) {
    console.log("not find workspace children packages.")
    return
  }

  packages.forEach((pkgPath) => {
    deleteDirs(pkgPath)
  })

  deleteDirs(root)

  console.log("clean done.")
}

main()
