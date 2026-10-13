export const announcementTitleLimit = 256
export const announcementContentLimit = 20_000

/** Match backend character limits, including supplementary Unicode characters such as emoji. */
export function countAnnouncementCharacters(value: string): number {
  return Array.from(value).length
}
