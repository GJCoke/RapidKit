export interface SerializedJson {
  valid: boolean
  code: string
}

function validateJson(value: unknown, ancestors = new WeakSet<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return
  if (typeof value === "number" && Number.isFinite(value)) return
  if (typeof value !== "object" || value === null) throw new TypeError("Unsupported JSON value")
  const prototype = Object.getPrototypeOf(value)
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Unsupported JSON object")
  }
  if (ancestors.has(value) || typeof (value as { toJSON?: unknown }).toJSON === "function") {
    throw new TypeError("Unsupported JSON conversion")
  }
  ancestors.add(value)
  if (Array.isArray(value)) {
    for (const item of value) validateJson(item, ancestors)
  } else {
    for (const key of Object.keys(value)) validateJson((value as Record<string, unknown>)[key], ancestors)
  }
  ancestors.delete(value)
}

/** Serialize actual values without guessing whether strings contain encoded JSON. */
export function serializeJson(value: unknown): SerializedJson {
  try {
    validateJson(value)
    const code = JSON.stringify(
      value,
      (_key, item: unknown) => {
        if (
          ["undefined", "function", "symbol", "bigint"].includes(typeof item) ||
          (typeof item === "number" && !Number.isFinite(item))
        ) {
          throw new TypeError("Unsupported JSON value")
        }
        if (item !== null && typeof item === "object" && !Array.isArray(item)) {
          const prototype = Object.getPrototypeOf(item)
          if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Unsupported JSON object")
        }
        return item
      },
      2,
    )
    return typeof code === "string" ? { valid: true, code } : { valid: false, code: "" }
  } catch {
    return { valid: false, code: "" }
  }
}
