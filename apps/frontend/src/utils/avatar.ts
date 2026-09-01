export const AVATAR_PALETTE_V1 = [
  "#245BDB",
  "#5B4BDB",
  "#7C3AED",
  "#C2416C",
  "#D14343",
  "#C76B00",
  "#16835D",
  "#087F8C",
] as const

export const AVATAR_DEFAULT_COLOR = "#52647A"

export function normalizeAvatarName(name?: string | null): string {
  return name?.trim().replace(/\s+/gu, " ") ?? ""
}

export function getAvatarText(name?: string | null): string {
  const normalizedName = normalizeAvatarName(name)
  const hanCharacters = Array.from(normalizedName.matchAll(/\p{Script=Han}/gu), (match) => match[0])

  if (hanCharacters.length > 0) {
    return hanCharacters.slice(-2).join("")
  }

  const words = normalizedName.split(" ").filter(Boolean)

  if (words.length > 1) {
    return words
      .slice(0, 2)
      .map((word) => Array.from(word)[0] ?? "")
      .join("")
      .toLocaleUpperCase()
  }

  return Array.from(words[0] ?? "")
    .slice(0, 2)
    .join("")
    .toLocaleUpperCase()
}

export function hashAvatarSeed(seed: string): number {
  let hash = 0x811c9dc5

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return hash >>> 0
}

export function getAvatarColor(seed?: string | number | null, name?: string | null): string {
  const normalizedSeed = seed === null || seed === undefined ? normalizeAvatarName(name) : String(seed)

  if (!normalizedSeed) {
    return AVATAR_DEFAULT_COLOR
  }

  return AVATAR_PALETTE_V1[hashAvatarSeed(normalizedSeed) % AVATAR_PALETTE_V1.length]
}
