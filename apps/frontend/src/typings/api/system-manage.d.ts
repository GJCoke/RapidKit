import type { Service } from "@/typings/service"

declare global {
  namespace Api {
    /**
     * namespace SystemManage
     *
     * backend api module: "systemManage"
     */
    namespace SystemManage {
      /** "1" active, "2" disabled, "3" awaiting invite activation */
      type UserStatus = Api.Common.EnableStatus | "3"

      type CommonSearchParams = Pick<Common.PaginatingCommonParams, "page" | "pageSize">

      /** role */
      type Role = Common.CommonRecord<{
        /** role name */
        name: string
        /** role description */
        description: string
        /** role code */
        code: string
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

      /** role update body (permissions are managed by the dedicated endpoint) */
      type UpdateRoleBody = Omit<
        Service.ApiRequest<"/api/v1/roles/{role_id}", "put", "body">,
        "routerPermissions" | "buttonPermissions" | "interfacePermissions"
      >

      /** role list */
      type RoleList = Common.PaginatingQueryRecord<Role>

      /** all role */
      type AllRole = Pick<Role, "id" | "name" | "code">

      /** user */
      type User = Omit<
        Common.CommonRecord<{
          /** user name */
          username: string
          /** display name */
          name: string
          /** user email */
          email: string
          /** phone number */
          phone?: string | null
          /** avatar URL */
          avatar?: string | null
          /** nickname */
          nickname?: string | null
          /** gender: male/female/other */
          gender?: string | null
          /** user role code collection */
          roles: string[]
          /** is admin */
          isAdmin: boolean
          /** department id */
          departmentId?: string | null
          /** last login time */
          lastLoginTime?: string | null
          /** last login IP */
          lastLoginIp?: string | null
          /** remark */
          remark?: string | null
        }>,
        "status"
      > & { status: UserStatus | null }

      /** user search params */
      type UserSearchParams = Service.ApiRequest<"/api/v1/users", "get", "query">

      /** create user body */
      type CreateUserBody = Service.ApiRequest<"/api/v1/users", "post", "body">

      type UsernamePinyinValidationBody = Service.ApiRequest<"/api/v1/users/validate-username-pinyin", "post", "body">

      type UsernamePinyinValidation = Service.ApiResponse<"/api/v1/users/validate-username-pinyin", "post">

      type ResendInvitePath = Service.ApiRequest<"/api/v1/users/{user_id}/resend-invite", "post", "path">

      /** user option (for select dropdowns) */
      type UserOption = {
        id: string
        name: string
        username: string
      }

      /** user list */
      type UserList = Common.PaginatingQueryRecord<User>

      /** enabled super-administrator contacts */
      type AdminContacts = Service.ApiResponse<"/api/v1/users/admin-contacts">

      /** role permissions response */
      type RolePermissions = Service.ApiResponse<"/api/v1/roles/{role_id}/permissions">

      /** role permissions update body */
      type RolePermissionsUpdate = Service.ApiRequest<"/api/v1/roles/{role_id}/permissions", "put", "body">

      /** permission code catalog */
      type PermissionCatalog = Service.ApiResponse<"/api/v1/permission-catalog">

      /**
       * menu type
       *
       * - "1": directory
       * - "2": menu
       */
      type MenuType = "1" | "2"

      /**
       * icon type
       *
       * - "1": iconify icon
       * - "2": local icon
       */
      type IconType = "1" | "2"

      type MenuPropsOfRoute = Omit<
        Pick<
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
        >,
        "i18nKey"
      > & {
        i18nKey?: string | null
      }

      type MenuSearchParams = Service.ApiRequest<"/api/v1/manage/menus", "get", "query">

      /** Query parameters for the active-menu ancestor candidates endpoint. */
      type ActiveMenuOptionsParams = Service.ApiRequest<"/api/v1/manage/menus/active-menu-options", "get", "query">

      /** An eligible visible ancestor page that can be highlighted for a hidden child page. */
      type ActiveMenuOption = Service.ApiResponse<"/api/v1/manage/menus/active-menu-options">[number]

      type Menu = Common.CommonRecord<{
        /** parent menu id */
        parentId?: string | null
        /** menu type */
        menuType: MenuType
        /** menu name */
        menuName: string
        /** route name */
        routeName: string
        /** route path */
        routePath: string
        /** component */
        component?: string | null
        /** iconify icon name or local icon name */
        icon?: string | null
        /** icon type */
        iconType?: IconType | null
        /** permission code required to open the page */
        permission?: string | null
        /** children menu */
        children?: Menu[] | null
      }> &
        MenuPropsOfRoute

      /** menu list */
      type MenuList = Common.PaginatingQueryRecord<Menu>

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
      type DataRule = {
        id: string
        createTime: string
        updateTime: string
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
      }

      /** data rule search params */
      type DataRuleSearchParams = Service.ApiRequest<"/api/v1/data-rules", "get", "query">

      /** data rule list */
      type DataRuleList = Service.ApiResponse<"/api/v1/data-rules">

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

      /** change password request */
      type ChangePassword = Service.ApiRequest<"/api/v1/users/{user_id}/password", "put", "body">

      type AuditLogQuery = Service.ApiRequest<"/api/v1/system/audit-logs/paginate", "get", "query">
      type AuditLogList = Service.ApiResponse<"/api/v1/system/audit-logs/paginate">
      type AuditLogItem = AuditLogList["records"][number]
      type AuditLogDetail = Service.ApiResponse<"/api/v1/system/audit-logs/{item_id}">
      type AuditCatalog = Service.ApiResponse<"/api/v1/system/audit-logs/catalog">
      type AuditActorQuery = Service.ApiRequest<"/api/v1/system/audit-logs/actors", "get", "query">
      type AuditActors = Service.ApiResponse<"/api/v1/system/audit-logs/actors">
      type AuditTargets = Service.ApiResponse<"/api/v1/system/audit-logs/{item_id}/targets">
      type AuditTargetQuery = Service.ApiRequest<"/api/v1/system/audit-logs/{item_id}/targets", "get", "query">
      type AuditResult = NonNullable<AuditLogQuery["result"]>
      type AuditRiskLevel = AuditLogItem["riskLevel"]
      type AuditSource = AuditLogItem["source"]
    }
  }
}
