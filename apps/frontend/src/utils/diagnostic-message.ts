import { h } from "vue"
import { NButton } from "naive-ui"
import { copyRequestId, safeRequestId } from "@rapidkit/utils"
import { $t } from "@/locales"

export function diagnosticMessage(message: string, id?: string) {
  const requestId = safeRequestId(id)
  if (!requestId) return message
  return () =>
    h("div", { class: "flex flex-col gap-1" }, [
      h("span", message),
      h("code", { class: "select-all", "aria-label": $t("request.requestId") }, requestId),
      h(
        NButton,
        {
          size: "tiny",
          onClick: () => {
            void copyRequestId(requestId)
          },
        },
        { default: () => $t("request.copyRequestId") },
      ),
    ])
}
