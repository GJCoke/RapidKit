import { Avatar, AvatarImage, AvatarFallback } from "@rapidkit/ui/components/avatar"
import { useId, useState } from "react"
import { useTranslation } from "react-i18next"
import { ArrowDown, Send, X } from "lucide-react"
import { Button, Input } from "@rapidkit/ui"
import { Message, MessageAvatar, MessageContent, MessageHeader, MessageFooter } from "@rapidkit/ui/components/message"
import { Bubble, BubbleContent } from "@rapidkit/ui/components/bubble"
import { Marker, MarkerContent } from "@rapidkit/ui/components/marker"
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from "@rapidkit/ui/components/message-scroller"
import { useChatWindow } from "@/services/hooks/use-chat-window"
import { characterAvatar, type ChatInstance, type ChatMessage } from "./chat-model"
export function ChatWindow({ instance, onClose }: { instance: ChatInstance; onClose: () => void }) {
  const { t } = useTranslation()
  const id = useId()
  const [input, setInput] = useState("")
  const chat = useChatWindow(instance.username, instance.group)
  const character = (name: string) => t(`socketChat.characters.${name}`, { defaultValue: name })
  const room = (name: string) => t(`socketChat.rooms.${name}`, { defaultValue: name })
  const name = character(instance.username),
    group = room(instance.group)
  function systemContent(message: Extract<ChatMessage, { type: "system" }>) {
    const { key, params } = message.content
    const translated =
      key === "page.socketio.chat.userJoined"
        ? "socketChat.userJoined"
        : key === "page.socketio.chat.userLeft"
          ? "socketChat.userLeft"
          : null
    if (!translated) return key
    return t(translated, {
      username: character(typeof params.username === "string" ? params.username : ""),
      group: room(typeof params.group === "string" ? params.group : ""),
    })
  }
  function send() {
    if (chat.send(input)) setInput("")
  }
  return (
    <section
      aria-label={`${name} · ${group}`}
      className="flex h-110 min-w-0 flex-col overflow-hidden rounded-lg border bg-card"
    >
      <header className="flex items-center gap-2 border-b p-3">
        <Avatar>
          <AvatarImage src={characterAvatar(instance.username)} alt={name} />
          <AvatarFallback>{name.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{name}</h2>
          <p role="status" className="text-xs text-muted-foreground">
            {t(`socketChat.${chat.status}`)}
          </p>
        </div>
        <span className="max-w-32 truncate rounded-full border px-2 py-1 text-xs" title={group}>
          {group}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("socketChat.closeWindow", { username: name, group })}
          onClick={onClose}
        >
          <X />
        </Button>
      </header>
      {(chat.status === "offline" || chat.status === "error") && (
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2 text-xs">
          <p
            role={chat.status === "error" ? "alert" : undefined}
            className="min-w-0 wrap-anywhere text-muted-foreground"
          >
            {chat.status === "error" ? t("socketChat.connectionError", { error: chat.error }) : t("socketChat.offline")}
          </p>
          <Button size="sm" variant="outline" onClick={chat.reconnect}>
            {t("socketChat.reconnect")}
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1">
        <MessageScrollerProvider autoScroll defaultScrollPosition="end">
          <MessageScroller>
            <MessageScrollerViewport aria-label={t("socketChat.messages", { username: name, group })} className="p-3">
              <MessageScrollerContent>
                {chat.messages.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">{t("socketChat.noMessages")}</p>
                )}
                {chat.messages.map((message) => (
                  <MessageScrollerItem key={message.id} messageId={message.id}>
                    {message.type === "system" ? (
                      <Marker variant="separator">
                        <MarkerContent className="whitespace-normal wrap-anywhere text-xs">
                          {systemContent(message)}
                        </MarkerContent>
                      </Marker>
                    ) : (
                      <Message align={message.sender === instance.username ? "end" : "start"}>
                        <MessageAvatar>
                          <Avatar size="sm">
                            <AvatarImage
                              src={message.avatar || characterAvatar(message.sender)}
                              alt={character(message.sender)}
                            />
                            <AvatarFallback>{character(message.sender).slice(0, 1)}</AvatarFallback>
                          </Avatar>
                        </MessageAvatar>
                        <MessageContent>
                          <MessageHeader>{character(message.sender)}</MessageHeader>
                          <Bubble
                            variant={message.sender === instance.username ? "default" : "secondary"}
                            align={message.sender === instance.username ? "end" : "start"}
                          >
                            <BubbleContent className="whitespace-pre-wrap wrap-anywhere">
                              {message.type === "text" ? message.content : JSON.stringify(message.content, null, 2)}
                            </BubbleContent>
                          </Bubble>
                          <MessageFooter>
                            <time>{message.time}</time>
                          </MessageFooter>
                        </MessageContent>
                      </Message>
                    )}
                  </MessageScrollerItem>
                ))}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton aria-label={t("socketChat.latestMessages")}>
              <ArrowDown />
              <span className="sr-only">{t("socketChat.latestMessages")}</span>
            </MessageScrollerButton>
          </MessageScroller>
        </MessageScrollerProvider>
      </div>
      <form
        className="flex gap-2 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
      >
        <label htmlFor={id} className="sr-only">
          {t("socketChat.sendRoomMessage", { group })}
        </label>
        <Input
          id={id}
          className="min-w-0"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t("socketChat.sendRoomMessage", { group })}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault()
          }}
        />
        <Button
          type="submit"
          size="icon"
          aria-label={t("socketChat.send")}
          disabled={chat.status !== "online" || !input.trim()}
        >
          <Send />
        </Button>
      </form>
    </section>
  )
}
