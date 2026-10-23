import { Avatar, AvatarImage, AvatarFallback } from "@rapidkit/ui/components/avatar"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Button,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@rapidkit/ui"
import { usePermission, hasPermission } from "@/features/auth"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import { PageHeader } from "@/features/layout/components/page-header"
import { FormSelect } from "@/shared/crud/form-select"
import { ChatWindow } from "./modules/chat-window"
import {
  chatCharacters,
  chatRooms,
  characterAvatar,
  type ChatCharacter,
  type ChatRoom,
  type ChatInstance,
} from "./modules/chat-model"
function ChatWorkbench() {
  const { t } = useTranslation()
  const session = useRef(getAuthSession()).current
  const [instances, setInstances] = useState<ChatInstance[]>([])
  const [group, setGroup] = useState<ChatRoom>("Nobis-Home")
  const [pending, setPending] = useState<ChatCharacter | null>(null)
  const [warning, setWarning] = useState<{ username: ChatCharacter; group: ChatRoom } | null>(null)
  const room = t(`socketChat.rooms.${group}`)
  function join() {
    if (
      !pending ||
      session !== getAuthSession() ||
      !useAuthStore.getState().token ||
      !hasPermission(useAuthStore.getState().userInfo, "socketio:read")
    )
      return
    if (instances.some((instance) => instance.username === pending && instance.group === group))
      setWarning({ username: pending, group })
    else if (instances.length < 4) {
      setInstances([...instances, { id: crypto.randomUUID(), username: pending, group }])
      setWarning(null)
    }
    setPending(null)
  }
  return (
    <div className="grid min-w-0 gap-4">
      <PageHeader title={t("socketChat.title")} description={t("socketChat.description")} />
      <section
        aria-label={t("socketChat.selectCharacter")}
        className="flex min-w-0 flex-wrap items-end justify-between gap-5 rounded-lg border bg-card p-4"
      >
        <div className="grid min-w-0 gap-3">
          <h2 className="text-sm font-medium">{t("socketChat.selectCharacter")}</h2>
          <div className="flex flex-wrap gap-3">
            {chatCharacters.map((character) => (
              <Button
                key={character}
                variant="ghost"
                className="h-auto flex-col gap-2 p-2"
                aria-label={t("socketChat.joinCharacter", { username: t(`socketChat.characters.${character}`) })}
                disabled={instances.length >= 4}
                onClick={() => setPending(character)}
              >
                <Avatar size="lg">
                  <AvatarImage src={characterAvatar(character)} alt={t(`socketChat.characters.${character}`)} />
                  <AvatarFallback>{character.slice(0, 1)}</AvatarFallback>
                </Avatar>
                <span className="text-xs">{t(`socketChat.characters.${character}`)}</span>
              </Button>
            ))}
          </div>
        </div>
        <div className="grid min-w-40 gap-2">
          <span className="text-sm font-medium">{t("socketChat.targetRoom")}</span>
          <FormSelect
            label={t("socketChat.targetRoom")}
            value={group}
            options={chatRooms.map((value) => ({ value, label: t(`socketChat.rooms.${value}`) }))}
            onChange={(value) => {
              const next = chatRooms.find((room) => room === value)
              if (next) setGroup(next)
            }}
          />
        </div>
      </section>
      {warning && (
        <p role="alert" className="text-sm text-amber-600">
          {t("socketChat.alreadyInRoom", {
            username: t(`socketChat.characters.${warning.username}`),
            group: t(`socketChat.rooms.${warning.group}`),
          })}
        </p>
      )}
      {instances.length ? (
        <>
          <p className="text-right text-xs text-muted-foreground">
            {t("socketChat.activeInstances", { current: instances.length, max: 4 })}
          </p>
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            {instances.map((instance) => (
              <ChatWindow
                key={instance.id}
                instance={instance}
                onClose={() => setInstances((previous) => previous.filter((item) => item.id !== instance.id))}
              />
            ))}
          </div>
        </>
      ) : (
        <p className="grid min-h-64 place-content-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">
          {t("socketChat.noInstances")}
        </p>
      )}
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("socketChat.joinTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("socketChat.confirmJoin", {
                username: pending ? t(`socketChat.characters.${pending}`) : "",
                group: room,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel render={<Button variant="outline" />}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction render={<Button onClick={join} />}>{t("form.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
export default function ChatPage() {
  useAuthStore((state) => state.token)
  const read = usePermission("socketio:read"),
    { t } = useTranslation()
  return read ? <ChatWorkbench key={getAuthSession()} /> : <p role="alert">{t("error.403")}</p>
}
