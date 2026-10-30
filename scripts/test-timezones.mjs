import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const cwd = fileURLToPath(new URL("../", import.meta.url))
const suites = [
  [
    "apps/frontend",
    [
      "tests/utils/datetime.test.ts",
      "tests/store/modules/auth/identity-runtime.test.ts",
      "tests/notification/platform-timezone.spec.ts",
      "tests/notification/delivery-expiry.spec.ts",
      "tests/notification/announcement-timezone.spec.ts",
      "tests/notification/announcement-form.spec.ts",
      "tests/notification/presentation.spec.ts",
      "tests/notification/recall-presentation.spec.ts",
      "tests/task-record-views/search-page.spec.ts",
      "tests/views/manage/audit-log/audit-log-display.test.ts",
    ],
  ],
  [
    "apps/admin",
    [
      "tests/utils/datetime.test.ts",
      "tests/views/home/home.test.ts",
      "tests/views/home/modules/dashboard-data.test.ts",
    ],
  ],
]

// Separate processes make the host/browser-local calendar observable to Date,
// Intl and jsdom, including DST normalization inside real input components.
for (const zone of ["UTC", "Asia/Shanghai", "America/New_York"]) {
  for (const [app, files] of suites) {
    console.log(`\n[timezone regression] ${app}: browser TZ=${zone}`)
    const result = spawnSync("pnpm", ["--dir", app, "exec", "vitest", "run", ...files], {
      cwd,
      env: { ...process.env, TZ: zone },
      stdio: "inherit",
    })
    if (result.error) throw result.error
    if (result.status !== 0) process.exit(result.status ?? 1)
  }
}
