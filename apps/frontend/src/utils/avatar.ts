export interface AvatarGradient {
  readonly start: string
  readonly end: string
}

export const AVATAR_GRADIENT_PALETTE_V2 = [
  { start: "#5B5CF6", end: "#22B8E6" },
  { start: "#3B82F6", end: "#20C997" },
  { start: "#8B5CF6", end: "#E48AD8" },
  { start: "#6D5DF6", end: "#B56DE2" },
  { start: "#FF4D4F", end: "#FF9F43" },
  { start: "#F05A67", end: "#F7B267" },
  { start: "#16A085", end: "#35C98B" },
  { start: "#0F8FA8", end: "#35BFD3" },
] as const satisfies readonly AvatarGradient[]

export const AVATAR_DEFAULT_GRADIENT = AVATAR_GRADIENT_PALETTE_V2[0]

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
  let hash = 0x9e3779b9

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x85ebca6b)
    hash ^= hash >>> 13
  }

  hash ^= seed.length
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b)
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0xc2b2ae35)
  hash ^= hash >>> 16

  return hash >>> 0
}

export function getAvatarGradient(seed?: string | number | null, name?: string | null): AvatarGradient {
  const normalizedSeed = seed === null || seed === undefined ? normalizeAvatarName(name) : String(seed)

  if (!normalizedSeed) {
    return AVATAR_DEFAULT_GRADIENT
  }

  return AVATAR_GRADIENT_PALETTE_V2[hashAvatarSeed(normalizedSeed) % AVATAR_GRADIENT_PALETTE_V2.length]
}
