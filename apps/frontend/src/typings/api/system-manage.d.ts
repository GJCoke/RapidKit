import type { Service } from "@/typings/service"

declare global {
  namespace Api {
    /**
     * namespace SystemManage
     *
     * backend api module: "systemManage"
     */
    namespace SystemManage {
      type CommonSearchParams = Pick<Common.PaginatingCommonParams, "page" | "pageSize">

      /** role */
      type Role = Common.CommonRecord<{
        /** role name */
        name: string
        /** role description */
        description: string
        /** role code */
        code: string
        /** interface permissions */
        interfacePermissions: string[]
        /** button permissions */
        buttonPermissions: string[]
        /** router permissions */
        routerPermissions: string[]
        /** data scope */
        dataScope: number
        /** custom department ids (for dataScope=5) */
        customDeptIds: string[]
        /** data rule ids (for dataScope=6) */
        dataRuleIds: string[]
      }>

      /** role search params */
      type RoleSearchParams = Service.ApiRequest<"/api/v1/roles", "get", "query">

      /** role list */
      type RoleList = Service.ApiResponse<"/api/v1/roles">

      /** all role */
      type AllRole = Pick<Role, "id" | "name" | "code">

      /** user */
      type User = Common.CommonRecord<{
        /** user name */
        username: string
        /** display name */
        name: string
        /** user email */
        email: string
        /** user role code collection */
        roles: string[]
        /** is admin */
        isAdmin: boolean
        /** department id */
        departmentId: string | null
      }>

      /** user search params */
      type UserSearchParams = CommonType.RecordNullable<{ keyword?: string; status?: string } & CommonSearchParams>

      /** user option (for select dropdowns) */
      type UserOption = {
        id: string
        name: string
        username: string
      }

      /** user list */
      type UserList = Common.PaginatingQueryRecord<User>

      /** role permissions response */
      type RolePermissions = {
        routerPermissions: string[]
        buttonPermissions: string[]
        interfacePermissions: string[]
      }

      /**
       * menu type
       *
       * - "1": directory
       * - "2": menu
       */
      type MenuType = "1" | "2"

      type MenuButton = {
        /**
         * button code
         *
         * it can be used to control the button permission
         */
        code: string
        /** button description */
        desc: string
      }

      /**
       * icon type
       *
       * - "1": iconify icon
       * - "2": local icon
       */
      type IconType = "1" | "2"

      type MenuPropsOfRoute = Pick<
        import("vue-router").RouteMeta,
        | "i18nKey"
        | "keepAlive"
        | "constant"
        | "order"
        | "href"
        | "hideInMenu"
        | "activeMenu"
        | "multiTab"
        | "fixedIndexInTab"
        | "query"
      >

      type MenuSearchParams = Common.PaginatingQueryParams & {
        keyword?: string
        status?: number
      }

      type Menu = Common.CommonRecord<{
        /** parent menu id */
        parentId: number
        /** menu type */
        menuType: MenuType
        /** menu name */
        menuName: string
        /** route name */
        routeName: string
        /** route path */
        routePath: string
        /** component */
        component?: string
        /** iconify icon name or local icon name */
        icon: string
        /** icon type */
        iconType: IconType
        /** buttons */
        buttons?: MenuButton[] | null
        /** bound interface permission codes */
        interfaces?: string[] | null
        /** children menu */
        children?: Menu[] | null
      }> &
        MenuPropsOfRoute

      /** menu list */
      type MenuList = Common.PaginatingQueryRecord<Menu>

      type MenuTree = {
        id: string
        menuName: string
        routeName: string
        children?: MenuTree[] | null
        buttons?: MenuButton[] | null
        interfaces?: string[] | null
      }

      /** backend router from auth_routers table */
      type BackendRouter = Common.CommonRecord<{
        name: string
        description: string | null
        path: string
        methods: string[]
        code: string
      }>

      /** department */
      type Department = Common.CommonRecord<{
        /** parent department id */
        parentId: string | null
        /** department name */
        name: string
        /** department code */
        code: string
        /** sort order */
        sort: number
        /** leader user id */
        leaderId: string | null
      }>

      /** department tree node */
      type DepartmentTree = Department & {
        children: DepartmentTree[]
      }

      /** data rule */
      type DataRule = Common.CommonRecord<{
        /** rule name */
        name: string
        /** target model/table name */
        modelName: string
        /** target field */
        field: string
        /** operator (eq, ne, gt, ge, lt, le, in, not_in) */
        operator: string
        /** value (supports ${user_id}, ${dept_id} templates) */
        value: string
        /** logic combinator (AND / OR) */
        logic: string
      }>

      /** data rule search params */
      type DataRuleSearchParams = CommonSearchParams

      /** data rule list */
      type DataRuleList = Common.PaginatingQueryRecord<DataRule>

      /**
       * data scope enum
       *
       * - 1: all data
       * - 2: self only
       * - 3: own department
       * - 4: department and children
       * - 5: custom departments
       * - 6: custom rules
       */
      type DataScopeType = 1 | 2 | 3 | 4 | 5 | 6

      /** audit dictionary item */
      type AuditDict = Common.CommonRecord<{
        /** key name (e.g., user, create) */
        key: string
        /** category: resource or action */
        category: string
        /** Chinese label */
        labelZh: string
        /** English label */
        labelEn: string
      }>

      /** audit dict search params */
      type AuditDictSearchParams = CommonSearchParams & {
        category?: string
      }

      /** audit dict list */
      type AuditDictList = Common.PaginatingQueryRecord<AuditDict>

      /** change password request */
      type ChangePassword = {
        oldPassword?: string
        newPassword: string
      }
    }
  }
}
