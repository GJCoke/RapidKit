import { expect, test } from "vitest"
import { defaultThemeConfig } from "@/features/theme/theme-config"

test("Cloud Indigo is a complete Base UI source configuration", () => {
  expect(defaultThemeConfig.shadcn.base).toBe("base")
  expect(defaultThemeConfig.shadcn.style).toBe("nova")
  expect(defaultThemeConfig.appearance.preset).toBe("cloud-indigo")
  expect(defaultThemeConfig.layout.density).toBe("comfortable")
  expect(defaultThemeConfig.layout.mode).toBe("vertical")
  expect(defaultThemeConfig.layout.scrollMode).toBe("content")
  expect(defaultThemeConfig.sidebar).toEqual({
    width: 220,
    collapsedWidth: 64,
    mixWidth: 90,
    mixCollapsedWidth: 64,
    mixChildMenuWidth: 200,
    autoSelectFirstMenu: false,
  })
  expect(defaultThemeConfig.experience.motionPreset).toBe("fade-slide")
  expect(defaultThemeConfig.tokens.light.primary).toMatch(/^oklch\(/)
  expect(defaultThemeConfig.tokens.dark.primary).toMatch(/^oklch\(/)
})
