import { z } from "zod"
export const chatCharacters = ["Doraemon", "Nobita", "Shizuka", "Gian", "Suneo"] as const
export const chatRooms = ["Nobis-Home", "Secret-Base", "School", "Doraemon-Fans"] as const
export type ChatCharacter = (typeof chatCharacters)[number]
export type ChatRoom = (typeof chatRooms)[number]
export interface ChatInstance {
  id: string
  username: ChatCharacter
  group: ChatRoom
}
const envelope = z.object({
  id: z.string().min(1),
  sender: z.string(),
  time: z.string(),
  avatar: z.string().nullable().optional(),
  extra: z.record(z.string(), z.unknown()).nullable().optional(),
})
const media = z.object({
  url: z.string(),
  name: z.string().nullable().optional(),
  size: z.number().finite().nullable().optional(),
  duration: z.number().finite().nullable().optional(),
  thumbnail: z.string().nullable().optional(),
})
const message = z.discriminatedUnion("type", [
  envelope.extend({ type: z.literal("text"), content: z.string() }),
  envelope.extend({
    type: z.literal("system"),
    content: z.object({ key: z.string(), params: z.record(z.string(), z.unknown()).default({}) }),
  }),
  envelope.extend({ type: z.literal("image"), content: media }),
  envelope.extend({ type: z.literal("audio"), content: media }),
  envelope.extend({ type: z.literal("video"), content: media }),
  envelope.extend({ type: z.literal("file"), content: media }),
])
export type ChatMessage = z.infer<typeof message>
export function parseChatMessage(value: unknown): ChatMessage | null {
  const result = message.safeParse(value)
  return result.success ? result.data : null
}
export function appendChatMessage(messages: ChatMessage[], next: ChatMessage) {
  return messages.some((message) => message.id === next.id) ? messages : [...messages, next]
}
export function characterAvatar(name: string) {
  return chatCharacters.some((character) => character === name)
    ? `/images/chat/avatar_${name.toLowerCase()}.jpg`
    : undefined
}
