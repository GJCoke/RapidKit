/* oxlint-disable @typescript-eslint/no-explicit-any */
import localforage from "localforage"
/** TODO: 这里有一个问题, 只能在浏览器环境中使用这个库 */
/** The storage type */
export type StorageType = "local" | "session"

export function createStorage<T extends object>(type: StorageType, storagePrefix: string) {
  const stg = type === "session" ? window.sessionStorage : window.localStorage

  return {
    /**
     * Set session
     *
     * @param key Session key
     * @param value Session value
     */
    set<K extends keyof T>(key: K, value: T[K]) {
      const json = JSON.stringify(value)

      stg.setItem(`${storagePrefix}${key as string}`, json)
    },
    /**
     * Get session
     *
     * @param key Session key
     */
    get<K extends keyof T>(key: K): T[K] | null {
      const json = stg.getItem(`${storagePrefix}${key as string}`)
      if (json) {
        let storageData: T[K] | null = null

        try {
          storageData = JSON.parse(json)
        } catch {}

        // storageData may be `false` if it is boolean type
        if (storageData !== null) {
          return storageData as T[K]
        }
      }

      stg.removeItem(`${storagePrefix}${key as string}`)

      return null
    },
    remove(key: keyof T) {
      stg.removeItem(`${storagePrefix}${key as string}`)
    },
    clear() {
      stg.clear()
    },
  }
}

type LocalForage<T extends object> = Omit<typeof localforage, "getItem" | "setItem" | "removeItem"> & {
  getItem<K extends keyof T>(key: K, callback?: (err: any, value: T[K] | null) => void): Promise<T[K] | null>

  setItem<K extends keyof T>(key: K, value: T[K], callback?: (err: any, value: T[K]) => void): Promise<T[K]>

  removeItem(key: keyof T, callback?: (err: any) => void): Promise<void>
}

type LocalforageDriver = "local" | "indexedDB" | "webSQL"

export function createLocalforage<T extends object>(driver: LocalforageDriver) {
  const driverMap: Record<LocalforageDriver, string> = {
    local: localforage.LOCALSTORAGE,
    indexedDB: localforage.INDEXEDDB,
    webSQL: localforage.WEBSQL,
  }

  localforage.config({
    driver: driverMap[driver],
  })

  return localforage as LocalForage<T>
}
