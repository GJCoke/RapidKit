import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Copy } from "lucide-react"
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
  ScrollArea,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@rapidkit/ui"
import { EmptyState } from "@/features/layout/components/states/empty-state"
import { ConfirmActionDialog } from "@/shared/crud/confirm-action-dialog"
import { instrumentClientKey, type InstrumentClient } from "./instrument-model"
function clientTime(value: string, locale: string) {
  const time = Date.parse(value)
  return Number.isFinite(time)
    ? new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "medium" }).format(time)
    : "—"
}
function jsonValue(value: unknown) {
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}
function ClientDetail({ client, onClose }: { client: InstrumentClient; onClose: () => void }) {
  const { t, i18n } = useTranslation(),
    [copyState, setCopyState] = useState<"copied" | "copyFailed" | null>(null)
  const fields = {
    socketId: client.id,
    clientId: client.clientId || "—",
    namespace: client.nsp,
    ipAddress: client.handshake.address,
    transport: client.transport,
    connectTime: clientTime(client.handshake.time, i18n.language),
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-3xl"
      >
        <DialogHeader>
          <DialogTitle>{t("socketInstrument.clientDetail")}</DialogTitle>
          <DialogDescription>{client.id}</DialogDescription>
        </DialogHeader>
        <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
          {Object.entries(fields).map(([key, value]) => (
            <div key={key} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{t(`socketInstrument.${key}`)}</dt>
              <dd className="mt-1 break-all font-mono text-sm">{value}</dd>
            </div>
          ))}
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-xs text-muted-foreground">{t("socketInstrument.rooms")}</dt>
            <dd className="mt-2 flex flex-wrap gap-1">
              {client.rooms.map((room) => (
                <Badge key={room} variant="outline" className="max-w-full break-all whitespace-normal">
                  {room}
                </Badge>
              ))}
            </dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(client.id)
                setCopyState("copied")
              } catch {
                setCopyState("copyFailed")
              }
            }}
          >
            <Copy data-icon="inline-start" />
            {t("socketInstrument.copySocketId")}
          </Button>
          {copyState && (
            <p role={copyState === "copyFailed" ? "alert" : "status"} className="text-xs">
              {t(`socketInstrument.${copyState}`)}
            </p>
          )}
        </div>
        <Tabs defaultValue="headers" className="min-w-0">
          <TabsList>
            <TabsTrigger value="headers">{t("socketInstrument.httpHeaders")}</TabsTrigger>
            <TabsTrigger value="query">{t("socketInstrument.queryParams")}</TabsTrigger>
          </TabsList>
          <TabsContent value="headers" className="min-w-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("socketInstrument.key")}</TableHead>
                  <TableHead>{t("socketInstrument.value")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(client.handshake.headers).map(([key, value]) => (
                  <TableRow key={key}>
                    <TableCell className="break-all whitespace-normal">{key}</TableCell>
                    <TableCell className="break-all whitespace-pre-wrap">
                      {typeof value === "string" ? value : jsonValue(value)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>
          <TabsContent value="query">
            <pre className="whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs">
              {jsonValue(client.handshake.query)}
            </pre>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("socketInstrument.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
function ClientCard({
  client,
  onDetail,
  onKick,
  connected,
}: {
  client: InstrumentClient
  onDetail: () => void
  onKick?: () => void
  connected: boolean
}) {
  const { t, i18n } = useTranslation()
  return (
    <Card className="min-w-0 gap-3 py-4">
      <CardHeader className="min-w-0 flex-row items-center justify-between gap-2 px-4">
        <CardTitle className="min-w-0">
          <Button
            variant="ghost"
            className="h-auto max-w-full justify-start p-0 font-mono text-xs whitespace-normal break-all"
            aria-label={t("socketInstrument.viewClient", { sid: client.id })}
            onClick={onDetail}
          >
            {client.id}
          </Button>
        </CardTitle>
        <Badge variant="secondary" className="shrink-0">
          {client.transport.toUpperCase()}
        </Badge>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-3 px-4">
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div className="min-w-0">
            <dt className="text-muted-foreground">{t("socketInstrument.namespace")}</dt>
            <dd className="break-all">{client.nsp}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">{t("socketInstrument.ipAddress")}</dt>
            <dd className="break-all">{client.handshake.address}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-1">
          {client.rooms.slice(0, 5).map((room) => (
            <Badge key={room} variant="outline" className="max-w-full break-all whitespace-normal">
              {room}
            </Badge>
          ))}
          {client.rooms.length > 5 && <span className="text-xs">+{client.rooms.length - 5}</span>}
        </div>
        <time className="text-xs text-muted-foreground">{clientTime(client.handshake.time, i18n.language)}</time>
        {onKick && (
          <Button
            variant="outline"
            size="sm"
            disabled={!connected}
            aria-label={t("socketInstrument.disconnectClient", { sid: client.id })}
            onClick={onKick}
          >
            {t("socketInstrument.terminateConnection")}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
export type InstrumentClientPanel = { type: "history" } | { type: "namespace"; name: string }
export function InstrumentClients({
  panel,
  onClose,
  clients,
  history,
  connected,
  onKick,
}: {
  panel: InstrumentClientPanel | null
  onClose: () => void
  clients: InstrumentClient[]
  history: InstrumentClient[]
  connected: boolean
  onKick: (client: InstrumentClient) => void
}) {
  const { t } = useTranslation(),
    [selected, setSelected] = useState<string | null>(null),
    [pending, setPending] = useState<string | null>(null)
  const list =
    panel?.type === "history"
      ? history
      : clients.filter((client) => panel?.type === "namespace" && client.nsp === panel.name)
  const detail = list.find((client) => instrumentClientKey(client) === selected),
    candidate = list.find((client) => instrumentClientKey(client) === pending)
  const title =
    panel?.type === "namespace"
      ? t("socketInstrument.clientsInNamespace", { namespace: panel.name })
      : t("socketInstrument.connectedHistory")
  return (
    <>
      <Sheet
        open={Boolean(panel)}
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
      >
        <SheetContent showCloseButton={false} className="w-[calc(100vw-1rem)] sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>
              {list.length} {t("socketInstrument.clients")}
            </SheetDescription>
            <SheetClose render={<Button variant="outline" size="sm" />}>{t("socketInstrument.close")}</SheetClose>
          </SheetHeader>
          <ScrollArea className="min-h-0 flex-1 px-4 pb-4">
            {list.length ? (
              <div className="grid min-w-0 gap-3">
                {list.map((client) => (
                  <ClientCard
                    key={instrumentClientKey(client)}
                    client={client}
                    connected={connected}
                    onDetail={() => setSelected(instrumentClientKey(client))}
                    onKick={panel?.type === "history" ? () => setPending(instrumentClientKey(client)) : undefined}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                message={t(
                  panel?.type === "history" ? "socketInstrument.eventsEmpty" : "socketInstrument.noInNamespace",
                )}
              />
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
      {detail && <ClientDetail key={instrumentClientKey(detail)} client={detail} onClose={() => setSelected(null)} />}
      <ConfirmActionDialog
        open={Boolean(candidate)}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        title={t("socketInstrument.terminateConnection")}
        description={t("socketInstrument.terminateContent", { sid: candidate?.id ?? "" })}
        confirmLabel={t("socketInstrument.disconnect")}
        onConfirm={() => {
          if (candidate) onKick(candidate)
          setPending(null)
        }}
      />
    </>
  )
}
