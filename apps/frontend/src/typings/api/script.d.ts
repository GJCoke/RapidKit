declare global {
  namespace Api {
    /**
     * namespace Script
     *
     * backend api module: "script"
     */
    namespace Script {
      /** script language */
      type ScriptLanguage = "python" | "javascript" | "shell"

      /** script list item (without code field) */
      type ScriptListItem = Common.CommonRecord<{
        name: string
        description: string
        language: ScriptLanguage
      }>

      /** script detail (includes code) */
      type ScriptDetail = ScriptListItem & { code: string }

      /** script search params */
      type ScriptSearchParams = Common.CommonSearchParams & {
        keyword?: string
        status?: Common.EnableStatus | null
        language?: ScriptLanguage | null
      }

      /** script list */
      type ScriptList = Common.PaginatingQueryRecord<ScriptListItem>

      /** script create/update payload */
      type ScriptEdit = {
        name: string
        description?: string
        language: ScriptLanguage
        code?: string
        status?: Common.EnableStatus
      }

      /** script execute result */
      type ScriptExecuteResult = {
        stdout: string | null
        stderr: string | null
        exit_code: number
        runtime: number
      }
    }
  }
}

export {}
