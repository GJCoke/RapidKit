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
      }>

      /** user search params */
      type UserSearchParams = CommonType.RecordNullable<
        { keyword?: string; status?: string } & CommonSearchParams
      >

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

      /** backend router from manage_routers table */
      type BackendRouter = Common.CommonRecord<{
        name: string
        description: string | null
        path: string
        methods: string[]
        code: string
      }>
    }
  }
}
