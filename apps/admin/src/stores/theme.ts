import { create } from "zustand"
import { persist } from "zustand/middleware"

type ColorScheme = "light" | "dark" | "auto"

interface ThemeState {
  colorScheme: ColorScheme
  primaryColor: string
  radius: number
  setColorScheme: (scheme: ColorScheme) => void
  setPrimaryColor: (color: string) => void
  setRadius: (radius: number) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      colorScheme: "light",
      primaryColor: "#4361EE",
      radius: 8,
      setColorScheme: (colorScheme) => set({ colorScheme }),
      setPrimaryColor: (primaryColor) => set({ primaryColor }),
      setRadius: (radius) => set({ radius }),
    }),
    {
      name: "admin-theme",
    },
  ),
)
