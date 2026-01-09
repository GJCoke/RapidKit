import { transformRecordToOption } from "@/utils/common"

export const yesOrNoRecord: Record<CommonType.YesOrNo, I18nFullKey> = {
  Y: "common.yesOrNo.yes",
  N: "common.yesOrNo.no",
}

export const sentOrReceivedRecord: Record<CommonType.SentOrReceived, I18nFullKey> = {
  S: "common.sentOrReceived.sent",
  R: "common.sentOrReceived.received",
}

export const yesOrNoOptions = transformRecordToOption(yesOrNoRecord)
