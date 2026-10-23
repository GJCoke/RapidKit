import { expect, test } from "vitest"
import { debugConnectionSchema, parseDebugPayload, formatDebugData } from "@/views/socketio/debug/modules/debug-model"
const config = { url: "https://socket.example.test/", path: "/custom", namespace: "room", auth: '{"key":"explicit"}' }
test("connection form joins namespace once and preserves custom path and explicit authentication", () => {
  expect(debugConnectionSchema.parse(config)).toEqual({
    url: "https://socket.example.test/room",
    path: "/custom",
    auth: { key: "explicit" },
  })
  expect(debugConnectionSchema.parse({ ...config, namespace: "/", auth: "{}" }).url).toBe(
    "https://socket.example.test/",
  )
})
test("invalid URLs, missing paths and invalid or non-object authentication cannot start a transport", () => {
  for (const change of [
    { url: "broken" },
    { url: "javascript:alert(1)" },
    { path: "" },
    { auth: "{" },
    { auth: "null" },
    { auth: "[]" },
  ])
    expect(debugConnectionSchema.safeParse({ ...config, ...change }).success).toBe(false)
})
test("payload parsing preserves all JSON value kinds, zero and false rather than coercing them to objects", () => {
  for (const [text, value] of [
    ['{"msg":"hello"}', { msg: "hello" }],
    ["[1,null]", [1, null]],
    ["null", null],
    ["0", 0],
    ["false", false],
    ['"hello"', "hello"],
  ] as const)
    expect(parseDebugPayload(text)).toEqual({ success: true, data: value })
  expect(parseDebugPayload("{")).toEqual({ success: false })
})
test("received payload formatting keeps false/null visible and tolerates non-JSON values without crashing", () => {
  expect(formatDebugData(false)).toBe("false")
  expect(formatDebugData(null)).toBe("null")
  expect(formatDebugData({ value: 1 })).toBe('{\n  "value": 1\n}')
  expect(formatDebugData(undefined)).toBe("undefined")
  expect(formatDebugData(12n)).toBe("12")
})
test("connection URL queries stay unchanged while a namespace is appended to the pathname", () => {
  expect(
    debugConnectionSchema.parse({ ...config, url: "https://debug.example.test?tenant=alpha", namespace: "/room" }).url,
  ).toBe("https://debug.example.test/room?tenant=alpha")
})
