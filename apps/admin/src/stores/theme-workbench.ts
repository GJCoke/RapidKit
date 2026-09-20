import { create } from "zustand"
import { createStore } from "zustand/vanilla"
import type { StateCreator } from "zustand"
import { defaultThemeConfig, type AdminThemeConfig } from "@/features/theme/theme-config"

interface ThemeWorkbenchState {
  draft: AdminThemeConfig
  previewActive: boolean
  updateShadcn: (patch: Partial<AdminThemeConfig["shadcn"]>) => void
  updateAppearance: (patch: Partial<AdminThemeConfig["appearance"]>) => void
  updateLayout: (patch: Partial<AdminThemeConfig["layout"]>) => void
  updateSidebar: (patch: Partial<AdminThemeConfig["sidebar"]>) => void
  updateExperience: (patch: Partial<AdminThemeConfig["experience"]>) => void
  applyPreset: (preset: string, tokens: AdminThemeConfig["tokens"]) => void
  setPreviewActive: (active: boolean) => void
  resetDraft: () => void
}

const cloneConfig = (config: AdminThemeConfig): AdminThemeConfig => structuredClone(config)

const initializer =
  (initial: AdminThemeConfig): StateCreator<ThemeWorkbenchState> =>
  (set) => ({
    draft: cloneConfig(initial),
    previewActive: false,
    updateShadcn: (patch: Partial<AdminThemeConfig["shadcn"]>) =>
      set((state) => ({
        draft: { ...state.draft, shadcn: { ...state.draft.shadcn, ...patch } },
      })),
    updateAppearance: (patch: Partial<AdminThemeConfig["appearance"]>) =>
      set((state) => ({
        draft: { ...state.draft, appearance: { ...state.draft.appearance, ...patch } },
        ...(Object.hasOwn(patch, "customPrimary") ? {} : { previewActive: true }),
      })),
    updateLayout: (patch: Partial<AdminThemeConfig["layout"]>) =>
      set((state) => ({
        draft: { ...state.draft, layout: { ...state.draft.layout, ...patch } },
        previewActive: true,
      })),
    updateSidebar: (patch: Partial<AdminThemeConfig["sidebar"]>) =>
      set((state) => ({
        draft: { ...state.draft, sidebar: { ...state.draft.sidebar, ...patch } },
        previewActive: true,
      })),
    updateExperience: (patch: Partial<AdminThemeConfig["experience"]>) =>
      set((state) => ({
        draft: { ...state.draft, experience: { ...state.draft.experience, ...patch } },
        previewActive: true,
      })),
    applyPreset: (preset, tokens) =>
      set((state) => ({
        draft: { ...state.draft, appearance: { ...state.draft.appearance, preset }, tokens },
        previewActive: true,
      })),
    setPreviewActive: (previewActive: boolean) => set(() => ({ previewActive })),
    resetDraft: () => set(() => ({ draft: cloneConfig(initial), previewActive: false })),
  })

export function createThemeWorkbenchStore(initial: AdminThemeConfig) {
  return createStore<ThemeWorkbenchState>()(initializer(initial))
}

export const useThemeWorkbenchStore = create<ThemeWorkbenchState>()(initializer(defaultThemeConfig))
