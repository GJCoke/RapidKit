import { expect, test } from "vitest"
import { parseChatMessage, appendChatMessage } from "@/views/socketio/chat/modules/chat-model"
const text = {
  id: "message-1",
  sender: "Doraemon",
  time: "12:30:00",
  type: "text",
  content: "  hello  ",
  extra: { user_id: "real-account" },
}
test("socket payloads preserve original text and metadata, accept system/media contracts, and reject malformed envelopes", () => {
  expect(parseChatMessage(text)).toMatchObject(text)
  expect(
    parseChatMessage({
      ...text,
      type: "system",
      content: { key: "page.socketio.chat.userJoined", params: { username: "Doraemon", group: "School" } },
    })?.type,
  ).toBe("system")
  expect(
    parseChatMessage({ ...text, type: "file", content: { url: "/sample.pdf", name: "Sample", size: 20 } })?.type,
  ).toBe("file")
  for (const invalid of [
    null,
    { ...text, id: "" },
    { ...text, content: { unsafe: true } },
    { ...text, type: "unexpected" },
    { ...text, type: "system", content: { key: 7 } },
  ])
    expect(parseChatMessage(invalid)).toBeNull()
})
test("replayed message ids do not duplicate history or erase previous messages", () => {
  const one = parseChatMessage(text)!
  const two = parseChatMessage({ ...text, id: "message-2", content: "next" })!
  expect(appendChatMessage(appendChatMessage([one], two), one).map((m) => m.content)).toEqual(["  hello  ", "next"])
})
