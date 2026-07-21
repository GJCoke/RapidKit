import { useEffect } from "react"
import { useThemeStore } from "@/stores/theme"

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { colorScheme, primaryColor, radius } = useThemeStore()

  useEffect(() => {
    const root = document.documentElement

    if (colorScheme === "dark") {
      root.classList.add("dark")
    } else if (colorScheme === "auto") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
      root.classList.toggle("dark", prefersDark)
    } else {
      root.classList.remove("dark")
    }
  }, [colorScheme])

  useEffect(() => {
    document.documentElement.style.setProperty("--radius", `${radius}px`)
  }, [radius])

  useEffect(() => {
    const oklch = hexToOklch(primaryColor)
    if (oklch) {
      document.documentElement.style.setProperty("--primary", oklch)
      document.documentElement.style.setProperty("--ring", oklch)
      document.documentElement.style.setProperty("--sidebar-primary", oklch)
      document.documentElement.style.setProperty("--sidebar-ring", oklch)
    }
  }, [primaryColor])

  return <>{children}</>
}

function hexToOklch(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return null

  // sRGB → linear RGB
  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const lr = toLinear(parseInt(result[1], 16) / 255)
  const lg = toLinear(parseInt(result[2], 16) / 255)
  const lb = toLinear(parseInt(result[3], 16) / 255)

  // Linear RGB → OKLab
  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const b = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_

  // OKLab → OKLCH
  const C = Math.sqrt(a * a + b * b)
  const H = C < 0.0001 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360

  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${H.toFixed(3)})`
}
