import { transformRecordToOption } from "@/utils/common"

export const enableStatusRecord: Record<Api.Common.EnableStatus, I18nFullKey> = {
  "1": "page.manage.common.status.enable",
  "2": "page.manage.common.status.disable",
}

export const enableStatusOptions = transformRecordToOption(enableStatusRecord)

export const menuTypeRecord: Record<Api.SystemManage.MenuType, I18nFullKey> = {
  "1": "page.manage.menu.type.directory",
  "2": "page.manage.menu.type.menu",
}

export const menuTypeOptions = transformRecordToOption(menuTypeRecord)

export const menuIconTypeRecord: Record<Api.SystemManage.IconType, I18nFullKey> = {
  "1": "page.manage.menu.iconType.iconify",
  "2": "page.manage.menu.iconType.local",
}

export const menuIconTypeOptions = transformRecordToOption(menuIconTypeRecord)

export const scriptLanguageRecord: Record<Api.Script.ScriptLanguage, I18nFullKey> = {
  python: "page.script.languageLabel.python",
  javascript: "page.script.languageLabel.javascript",
  shell: "page.script.languageLabel.shell",
}

export const scriptLanguageOptions = transformRecordToOption(scriptLanguageRecord)

export const workerStatusRecord: Record<Api.Worker.WorkerStatus, I18nFullKey> = {
  "1": "page.manage.worker.status.online",
  "2": "page.manage.worker.status.offline",
}

export const workerStatusOptions = transformRecordToOption(workerStatusRecord)

export const taskStatusRecord: Record<Api.Worker.TaskStatus, I18nFullKey> = {
  "1": "page.manage.worker.taskStatusMaps.pending",
  "2": "page.manage.worker.taskStatusMaps.started",
  "3": "page.manage.worker.taskStatusMaps.success",
  "4": "page.manage.worker.taskStatusMaps.failure",
  "5": "page.manage.worker.taskStatusMaps.retry",
  "6": "page.manage.worker.taskStatusMaps.revoked",
}

export const taskStatusOptions = transformRecordToOption(taskStatusRecord)

export const dataScopeRecord: Record<Api.SystemManage.DataScopeType, I18nFullKey> = {
  1: "page.manage.role.dataScopeOptions.all",
  2: "page.manage.role.dataScopeOptions.self",
  3: "page.manage.role.dataScopeOptions.dept",
  4: "page.manage.role.dataScopeOptions.deptAndChildren",
  5: "page.manage.role.dataScopeOptions.customDept",
  6: "page.manage.role.dataScopeOptions.customRule",
}

export const dataScopeOptions = transformRecordToOption(dataScopeRecord)

export const dataRuleOperatorRecord: Record<string, I18nFullKey> = {
  eq: "page.manage.dataRule.operatorOptions.eq",
  ne: "page.manage.dataRule.operatorOptions.ne",
  gt: "page.manage.dataRule.operatorOptions.gt",
  ge: "page.manage.dataRule.operatorOptions.ge",
  lt: "page.manage.dataRule.operatorOptions.lt",
  le: "page.manage.dataRule.operatorOptions.le",
  in: "page.manage.dataRule.operatorOptions.in",
  not_in: "page.manage.dataRule.operatorOptions.not_in",
}

export const dataRuleOperatorOptions = transformRecordToOption(dataRuleOperatorRecord)

export const dataRuleLogicOptions = [
  { label: "AND", value: "AND" },
  { label: "OR", value: "OR" },
]
