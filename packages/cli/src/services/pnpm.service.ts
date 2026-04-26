import { execCommand } from "../infra/runner"

export interface WorkspacePackage {
  name: string
  path: string
  version?: string
  private?: boolean
}

export function getWorkspacePackages(): WorkspacePackage[] {
  const output = execCommand("pnpm m ls --json")
  return JSON.parse(output) as WorkspacePackage[]
}
