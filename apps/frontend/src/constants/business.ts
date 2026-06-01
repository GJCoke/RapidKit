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

export const policyOperatorRecord: Record<Api.DataPolicy.Operator, I18nFullKey> = {
  eq: "page.manage.dataPolicy.ruleEditor.op.eq",
  ne: "page.manage.dataPolicy.ruleEditor.op.ne",
  gt: "page.manage.dataPolicy.ruleEditor.op.gt",
  ge: "page.manage.dataPolicy.ruleEditor.op.ge",
  lt: "page.manage.dataPolicy.ruleEditor.op.lt",
  le: "page.manage.dataPolicy.ruleEditor.op.le",
  in: "page.manage.dataPolicy.ruleEditor.op.in",
  not_in: "page.manage.dataPolicy.ruleEditor.op.not_in",
  is_null: "page.manage.dataPolicy.ruleEditor.op.is_null",
  is_not_null: "page.manage.dataPolicy.ruleEditor.op.is_not_null",
  between: "page.manage.dataPolicy.ruleEditor.op.between",
}

export const policyOperatorOptions = transformRecordToOption(policyOperatorRecord)

export const templateVariableRecord: Record<string, I18nFullKey> = {
  "${user.id}": "page.manage.dataPolicy.ruleEditor.tplVar.userId",
  "${user.dept_id}": "page.manage.dataPolicy.ruleEditor.tplVar.deptId",
  "${user.dept_ids}": "page.manage.dataPolicy.ruleEditor.tplVar.deptIds",
  "${user.roles}": "page.manage.dataPolicy.ruleEditor.tplVar.roles",
  "${now}": "page.manage.dataPolicy.ruleEditor.tplVar.now",
  "${today}": "page.manage.dataPolicy.ruleEditor.tplVar.today",
}

export const templateVariables = Object.entries(templateVariableRecord).map(([value, label]) => ({ label, value }))
