import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { build } from "vite"
import { expect, it } from "vitest"
import { browserSentryBuild } from "../../../../scripts/sentry-build"

it("keeps real hidden source maps and debug IDs private and release-bound without a token", async () => {
  const root = await mkdtemp(join(tmpdir(), "rapidkit-sentry-"))
  try {
    await writeFile(join(root, "index.html"), '<script type="module" src="/main.js"></script>')
    await writeFile(join(root, "main.js"), 'window.exercise = () => { throw new Error("synthetic-private-message") }')
    const monitoring = browserSentryBuild(
      {
        VITE_SENTRY_RELEASE: "rapidkit@synthetic",
        VITE_SENTRY_DSN: "https://public@example.invalid/1",
        SENTRY_AUTH_TOKEN: "synthetic-private-auth-token",
      },
      "vue",
      root,
    )
    await build({
      configFile: false,
      root,
      logLevel: "silent",
      plugins: monitoring.plugins,
      build: { sourcemap: monitoring.sourcemap, minify: true },
    })
    const assets = await readdir(join(root, "dist/assets"))
    expect(assets.some((name) => name.endsWith(".map"))).toBe(false)
    const directories = await readdir(join(root, ".sentry-artifacts/vue"))
    const privateRoot = join(root, ".sentry-artifacts/vue", directories[0])
    const manifest = JSON.parse(await readFile(join(privateRoot, "manifest.json"), "utf8"))
    expect(manifest.release).toBe("rapidkit@synthetic")
    expect(manifest.uploadConfigured).toBe(false)
    const maps = (await readdir(join(privateRoot, "assets"))).filter((name) => name.endsWith(".js.map"))
    expect(maps.length).toBeGreaterThan(0)
    const map = JSON.parse(await readFile(join(privateRoot, "assets", maps[0]), "utf8"))
    expect(map.debug_id).toMatch(/^[a-f\d-]{36}$/)
    expect(map.sourcesContent.join("")).toContain("synthetic-private-message")
    const chunk = await readFile(join(root, "dist/assets", maps[0].slice(0, -4)), "utf8")
    expect(chunk).toContain(map.debug_id)
    expect(chunk).not.toContain("sourceMappingURL=")
    expect(chunk).not.toContain("synthetic-private-auth-token")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it("fails required upload without credentials, and maps stay private if later build work fails", async () => {
  expect(() =>
    browserSentryBuild({ VITE_SENTRY_RELEASE: "release", REQUIRE_SENTRY_UPLOAD: "true" }, "vue", tmpdir()),
  ).toThrow()
  const root = await mkdtemp(join(tmpdir(), "rapidkit-sentry-fail-"))
  try {
    await writeFile(join(root, "index.html"), '<script type="module" src="/main.js"></script>')
    await writeFile(join(root, "main.js"), 'console.log("synthetic")')
    const monitoring = browserSentryBuild({ VITE_SENTRY_RELEASE: "release" }, "react", root)
    await expect(
      build({
        configFile: false,
        root,
        logLevel: "silent",
        plugins: [
          monitoring.plugins,
          {
            name: "synthetic-upload-failure",
            writeBundle() {
              throw new Error("synthetic upload unavailable")
            },
          },
        ],
        build: { sourcemap: monitoring.sourcemap },
      }),
    ).rejects.toThrow("synthetic upload unavailable")
    expect((await readdir(join(root, "dist/assets"))).some((name) => name.endsWith(".map"))).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
