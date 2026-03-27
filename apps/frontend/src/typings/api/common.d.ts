/**
 * Namespace Api
 *
 * All backend api type
 */
declare namespace Api {
  namespace Common {
    /** common params of paginating */
    interface PaginatingCommonParams {
      /** current page number */
      page: number
      /** page size */
      pageSize: number
      /** total count */
      total: number
    }

    /** common params of paginating query list data */
    interface PaginatingQueryRecord<T = any> extends PaginatingCommonParams {
      records: T[]
    }

    /** common search params of table */
    type CommonSearchParams = Pick<Common.PaginatingCommonParams, "page" | "pageSize">

    /**
     * enable status
     *
     * - "1": enabled
     * - "2": disabled
     */
    type EnableStatus = "1" | "2"

    /** common record */
    type CommonRecord<T = any> = {
      /** record id */
      id: string
      /** record create time */
      createTime: string
      /** record update time */
      updateTime: string
      /** record status */
      status: EnableStatus | null
    } & T
  }
}
