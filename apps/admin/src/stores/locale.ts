import { create } from "zustand"
import { createStore } from "zustand/vanilla"
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware"

import { DEFAULT_LOCALE, isAppLocale, resolveLocale, type AppLocale } from "@/features/locale/locale-model"

interface LocaleState {
  locale: AppLocale
  setLocale: (locale: AppLocale) => void
}

const unavailableStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}

function safeStorage(storage: StateStorage): StateStorage {
  return {
    getItem: (name) => {
      try {
        return storage.getItem(name)
      } catch {
        return null
      }
    },
    setItem: (name, value) => {
      try {
        return storage.setItem(name, value)
      } catch {
        return undefined
      }
    },
    removeItem: (name) => {
      try {
        return storage.removeItem(name)
      } catch {
        return undefined
      }
    },
  }
}

function localeState(set: (state: Partial<LocaleState>) => void, initialLocale: AppLocale): LocaleState {
  return {
    locale: initialLocale,
    setLocale: (locale) => set({ locale: resolveLocale(locale) }),
  }
}

function persistedLocale(storage: StateStorage, initialLocale: AppLocale = DEFAULT_LOCALE) {
  return persist<LocaleState>((set) => localeState(set, initialLocale), {
    name: "admin-locale",
    version: 1,
    storage: createJSONStorage(() => safeStorage(storage)),
    partialize: (state) => ({ locale: state.locale }) as LocaleState,
    merge: (persisted, current) => {
      const persistedState = persisted as Partial<LocaleState> | undefined
      return {
        ...current,
        ...persistedState,
        locale: isAppLocale(persistedState?.locale) ? persistedState.locale : current.locale,
      }
    },
  })
}

export function createLocaleStore(storage: StateStorage, initialLocale: AppLocale = DEFAULT_LOCALE) {
  return createStore<LocaleState>()(persistedLocale(storage, initialLocale))
}

function browserStorage(): StateStorage {
  if (typeof window === "undefined") return unavailableStorage
  try {
    return window.localStorage
  } catch {
    return unavailableStorage
  }
}

const configuredLocale = resolveLocale(import.meta.env.VITE_I18N_DEFAULT_LOCALE)

export const useLocaleStore = create<LocaleState>()(persistedLocale(browserStorage(), configuredLocale))
