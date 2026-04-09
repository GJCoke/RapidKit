import { build, Platform, type Configuration } from "electron-builder"

const config: Configuration = {
  appId: "com.rapidkit.monorepo",
  productName: "rapidkit",
  directories: {
    buildResources: "public",
    output: "release/v${version}-${platform}",
  },
  publish: [
    {
      provider: "generic",
      url: "https://your-server.com/updates/",
    },
  ],
  files: ["dist/**/*", "package.json"],
  mac: {
    target: ["dmg"],
  },
  linux: {
    target: [
      {
        target: "deb",
        arch: ["x64"],
      },
    ],
    category: "Development",
  },
  nsis: {
    oneClick: false,
    perMachine: true,
    shortcutName: "${productName}",
    uninstallDisplayName: "${productName}",
    runAfterFinish: true,
    deleteAppDataOnUninstall: true,
    allowToChangeInstallationDirectory: true,
  },
  win: {
    target: ["nsis"],
  },
}

async function main() {
  await build({
    targets: Platform.MAC.createTarget(),
    config,
  })
  console.log("打包完成")
}

main().catch((err) => console.error("打包失败:", err))
