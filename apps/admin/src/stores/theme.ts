import { create } from "zustand"
import { persist } from "zustand/middleware"

export type ColorScheme = "light" | "dark" | "auto"

interface ThemeState {
  colorScheme: ColorScheme
  toggleScheme: () => void
  setColorScheme: (scheme: ColorScheme) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      colorScheme: "light",
      toggleScheme: () =>
        set((state) => ({
          colorScheme: state.colorScheme === "light" ? "dark" : state.colorScheme === "dark" ? "auto" : "light",
        })),
      setColorScheme: (colorScheme) => set({ colorScheme }),
    }),
    {
      name: "admin-theme",
      version: 2,
      partialize: (state) => ({ colorScheme: state.colorScheme }),
    },
  ),
)
