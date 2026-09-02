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

export function migrateThemeState(persistedState: unknown, version: number): Partial<ThemeState> {
  const state = (persistedState && typeof persistedState === "object" ? persistedState : {}) as Partial<ThemeState>
  // Version 0 shipped with 8 as its default. Other values are unambiguously user-selected.
  return version === 0 && state.radius === 8 ? { ...state, radius: 6 } : state
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      colorScheme: "light",
      primaryColor: "#4361EE",
      radius: 6,
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
      version: 1,
      migrate: migrateThemeState,
    },
  ),
)
