import { parseApiDate } from "@/shared/date-time"
import dayjs from "dayjs"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Badge, Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@rapidkit/ui"
import type { Announcement } from "@/services/api/announcement"
import type { PermissionCode } from "@/typings/permission-codes"
import type { DataTableColumn } from "@/shared/data-table"
import { renderNotification } from "@/features/notifications/notification-model"
import { announcementActions, type AnnouncementRowAction } from "./modules/announcement-model"
import {
  announcementActionText,
  announcementCategoryText,
  announcementStatusText,
} from "./modules/announcement-presentation"
export function useAnnouncementColumns({
  can,
  busy,
  onAction,
}: {
  can: (code: PermissionCode) => boolean
  busy: ReadonlySet<string>
  onAction: (row: Announcement, action: AnnouncementRowAction) => void
}) {
  const { t, i18n } = useTranslation()
  return useMemo<DataTableColumn<Announcement>[]>(
    () => [
      {
        id: "information",
        header: t("announcement.table.information"),
        size: 360,
        meta: { title: t("announcement.table.information"), pinnable: true },
        cell: ({ row }) => {
          const text = renderNotification(row.original, i18n.language, (key, params) => t(key, params ?? {}))
          return (
            <div className="grid min-w-0 gap-1 py-1">
              <Button
                type="button"
                variant="link"
                className="h-auto justify-start whitespace-normal p-0 text-left"
                onClick={() => onAction(row.original, "detail")}
              >
                <span className="line-clamp-2 break-words">{text.title}</span>
              </Button>
              <p className="line-clamp-2 break-words text-xs text-muted-foreground">
                <span>
                  {announcementCategoryText(row.original.category, (key, fallback) =>
                    t(key, { defaultValue: fallback }),
                  )}
                </span>{" "}
                · {text.content.replace(/\s+/g, " ").trim().slice(0, 200) || t("announcement.table.emptyContent")}
              </p>
            </div>
          )
        },
      },
      {
        id: "displayMode",
        header: t("announcement.banner.displayMode"),
        size: 150,
        meta: { title: t("announcement.banner.displayMode") },
        cell: ({ row }) =>
          t(`announcement.${row.original.displayMode === "top_banner" ? "banner.topBanner" : "editor.inApp"}`),
      },
      {
        id: "level",
        header: t("announcement.level"),
        size: 100,
        meta: { title: t("announcement.level") },
        cell: ({ row }) => (
          <Badge variant={row.original.level === "error" ? "destructive" : "secondary"}>
            {t(`notification.level.${row.original.level}`)}
          </Badge>
        ),
      },
      {
        id: "status",
        header: t("announcement.status"),
        size: 110,
        meta: { title: t("announcement.status") },
        cell: ({ row }) => (
          <Badge variant={row.original.status === "published" ? "default" : "outline"}>
            {announcementStatusText(row.original, (key) => t(key))}
          </Badge>
        ),
      },
      {
        id: "time",
        header: t("announcement.table.time"),
        size: 220,
        meta: { title: t("announcement.table.time") },
        cell: ({ row }) => {
          const value = row.original,
            start = value.publishedAt ?? value.publishAt
          return (
            <div className="grid gap-1 whitespace-nowrap text-xs tabular-nums">
              <p>
                <span className="mr-2 text-muted-foreground">
                  {t(`announcement.table.${!value.publishedAt && value.publishAt ? "planned" : "start"}`)}
                </span>
                {start ? dayjs(parseApiDate(start)).format("YYYY-MM-DD HH:mm") : t("announcement.table.unpublished")}
              </p>
              <p>
                <span className="mr-2 text-muted-foreground">{t("announcement.table.end")}</span>
                {value.expireAt
                  ? dayjs(parseApiDate(value.expireAt)).format("YYYY-MM-DD HH:mm")
                  : t("announcement.banner.unlimited")}
              </p>
            </div>
          )
        },
      },
      {
        id: "actions",
        header: t("announcement.actions"),
        size: 190,
        enableHiding: false,
        meta: { title: t("announcement.actions"), hideable: false, pinnable: true },
        cell: ({ row }) => {
          const more = announcementActions(row.original, can).filter((action) => action !== "detail"),
            pending = busy.has(row.original.id)
          return (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => onAction(row.original, "detail")}
              >
                {t("announcement.table.detail")}
              </Button>
              {more.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" disabled={pending} />}>
                    {t("announcement.table.more")}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {more.map((action) => (
                      <DropdownMenuItem key={action} disabled={pending} onClick={() => onAction(row.original, action)}>
                        {announcementActionText(row.original, action, (key) => t(key))}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )
        },
      },
    ],
    [t, i18n.language, can, busy, onAction],
  )
}
