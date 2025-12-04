import { transformRecordToOption } from "@/utils/common"

export const yesOrNoRecord: Record<CommonType.YesOrNo, I18nFullKey> = {
  Y: "common.yesOrNo.yes",
  N: "common.yesOrNo.no",
}

export const yesOrNoOptions = transformRecordToOption(yesOrNoRecord)
