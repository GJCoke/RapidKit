import { expect, it, vi } from "vitest"
import { up } from "../commands/prod/up"

vi.mock("../commands/_shared", () => ({ defineFluxCommand: (options: unknown) => options }))
vi.mock("@clack/prompts", () => ({ confirm: vi.fn().mockResolvedValue(false), isCancel: () => false }))

it("starts workers through lifecycle orchestration and does not recreate them without its token", async () => {
  const run = vi.fn().mockResolvedValue(undefined)
  await (up.run as any)({
    ctx: { runtime: "docker", region: "global", locale: "zh-CN", cwd: "/workspace" },
    runner: { run },
    args: {},
  })
  const workerCall = run.mock.calls.find((call) => call[1] === "python3")
  expect(workerCall).toBeDefined()
  const args = workerCall![2] as string[]
  expect(args[0]).toBe("/workspace/docker/prod/deploy-backend.py")
  const prefix = JSON.parse(args[args.indexOf("--compose-command") + 1])
  expect(prefix).toContain("/workspace/docker/prod/.env.prod")
  const finalArgs = run.mock.calls.at(-1)![2] as string[]
  expect(finalArgs.slice(-4)).toEqual(["up", "-d", "--no-deps", "nginx"])
})
