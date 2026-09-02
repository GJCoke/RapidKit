import { create } from "zustand"
import { persist } from "zustand/middleware"

export type ColorScheme = "light" | "dark" | "auto"

interface ThemeState {
  colorScheme: ColorScheme
  primaryColor: string
  radius: number
  toggleScheme: () => void
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
      toggleScheme: () =>
        set((state) => ({
          colorScheme: state.colorScheme === "light" ? "dark" : state.colorScheme === "dark" ? "auto" : "light",
        })),
      setColorScheme: (colorScheme) => set({ colorScheme }),
      setPrimaryColor: (primaryColor) => set({ primaryColor }),
      setRadius: (radius) => set({ radius }),
    }),
    {
      name: "admin-theme",
    },
  ),
)
