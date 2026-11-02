import { createHash } from "node:crypto"
import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { sentryVitePlugin } from "@sentry/vite-plugin"
import type { PluginOption } from "vite"

type Artifact = {
  type: string
  fileName: string
  code?: string
  source?: string | Uint8Array
  map?: unknown
  sourcemapFileName?: string
}

/** Source maps are removed from the emitted bundle before any upload can fail. */
export function browserSentryBuild(
  env: Record<string, string | undefined>,
  application: "vue" | "react",
  root: string,
): { sourcemap: "hidden" | false; plugins: PluginOption[] } {
  const release = env.VITE_SENTRY_RELEASE || env.SENTRY_RELEASE
  if (env.VITE_SENTRY_DSN && !release) throw new Error("VITE_SENTRY_RELEASE is required when browser Sentry is enabled")
  const upload = Boolean(release && env.SENTRY_AUTH_TOKEN && env.SENTRY_ORG && env.SENTRY_PROJECT)
  if (env.REQUIRE_SENTRY_UPLOAD === "true" && !upload)
    throw new Error("Private Sentry upload requires release, token, organization and project")
  const key = createHash("sha256")
    .update(release || "unreleased")
    .digest("hex")
    .slice(0, 16)
  const privateRoot = resolve(root, ".sentry-artifacts", application, key)
  let outputRoot = resolve(root, "dist")
  const checksums: Record<string, string> = {}

  function archive(filename: string, content: string | Uint8Array) {
    const path = join(privateRoot, filename)
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    writeFileSync(path, content, { mode: 0o600 })
    chmodSync(path, 0o600)
    checksums[filename] = createHash("sha256").update(content).digest("hex")
  }

  function removePublicMaps(directory: string) {
    if (!existsSync(directory)) return
    for (const file of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, file.name)
      if (file.isDirectory()) removePublicMaps(path)
      else if (file.name.endsWith(".map")) rmSync(path)
    }
  }

  const privacy = {
    name: "rapidkit-private-source-maps",
    enforce: "post" as const,
    configResolved(config: { build: { outDir: string } }) {
      outputRoot = resolve(root, config.build.outDir)
    },
    generateBundle: {
      order: "post" as const,
      handler(_options: unknown, bundle: Record<string, Artifact>) {
        for (const artifact of Object.values(bundle)) {
          if (artifact.type !== "chunk" || typeof artifact.code !== "string") continue
          const mapName = artifact.sourcemapFileName || `${artifact.fileName}.map`
          const rawMap = bundle[mapName]?.source ?? artifact.map
          if (!rawMap) continue
          archive(artifact.fileName, artifact.code)
          const map = typeof rawMap === "string" || rawMap instanceof Uint8Array ? rawMap : JSON.stringify(rawMap)
          archive(mapName, map)
          artifact.map = null
        }
        for (const [name, artifact] of Object.entries(bundle)) {
          if (!name.endsWith(".map")) continue
          if (artifact.source) archive(name, artifact.source)
          delete bundle[name]
        }
        if (Object.keys(checksums).length)
          archive(
            "manifest.json",
            JSON.stringify({ application, release: release || null, uploadConfigured: upload, checksums }, null, 2),
          )
      },
    },
    closeBundle() {
      removePublicMaps(outputRoot)
    },
  }

  return {
    sourcemap: release || env.VITE_SOURCE_MAP === "Y" ? ("hidden" as const) : (false as const),
    plugins: [
      ...(release
        ? sentryVitePlugin({
            org: env.SENTRY_ORG,
            project: env.SENTRY_PROJECT,
            authToken: env.SENTRY_AUTH_TOKEN,
            url: env.SENTRY_URL || undefined,
            telemetry: false,
            release: { name: release, create: false, finalize: false, setCommits: false },
            sourcemaps: {
              disable: upload ? false : "disable-upload",
              assets: `${privateRoot.replaceAll("\\", "/")}/**`,
            },
          })
        : []),
      privacy,
    ],
  }
}
