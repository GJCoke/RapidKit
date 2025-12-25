"""
应用程序状态码定义。

采用 4 位自定义状态码格式：[错误类型(1位)][序号(3位)]

错误类型：
- 0XXX：成功
- 1XXX：参数/请求错误（验证失败、格式错误等）
- 2XXX：业务错误（用户、角色、菜单等业务逻辑错误）
- 3XXX：状态/并发/幂等（冲突、重复、已存在等状态相关）
- 4XXX：权限/安全（认证失败、权限不足等）
- 5XXX：资源不存在（用户不存在、菜单不存在等）
- 6XXX：第三方/依赖错误（外部服务调用失败）
- 7XXX：系统错误（数据库、服务器等系统级错误）
- 8XXX：Socket/实时通信错误（WebSocket 连接、消息传输等）

序号：001-999

例如：
- 0000：成功
- 1001：参数验证失败
- 2001：业务逻辑错误
- 3001：资源已存在
- 4001：权限不足
- 4002：认证失败
- 5001：用户不存在
- 5002：菜单不存在
- 6001：外部服务错误
- 7001：数据库错误
- 8001：WebSocket 连接失败

Author : Coke
Date   : 2025-12-25
"""

from enum import Enum


class StatusCodeType(Enum):
    """状态码类型定义。"""

    SUCCESS = 0  # 成功
    PARAMETER_ERROR = 1  # 参数/请求错误
    BUSINESS_ERROR = 2  # 业务错误
    STATE_CONFLICT = 3  # 状态/并发/幂等
    PERMISSION_ERROR = 4  # 权限/安全
    RESOURCE_NOT_FOUND = 5  # 资源不存在
    THIRD_PARTY_ERROR = 6  # 第三方/依赖错误
    SYSTEM_ERROR = 7  # 系统错误
    SOCKET_ERROR = 8  # Socket/实时通信错误


class StatusCode(Enum):
    """应用程序状态码定义。使用 4 位自定义格式。"""

    # ==================== 成功 (0XXX) ====================
    SUCCESS = (0, "common.response.success")

    # ==================== 参数/请求错误 (1XXX) ====================
    VALIDATION_ERROR = (1001, "common.response.validationError")
    INVALID_INPUT = (1002, "common.response.invalidInput")
    MISSING_REQUIRED_FIELD = (1003, "common.response.missingRequiredField")
    INVALID_FORMAT = (1004, "common.response.invalidFormat")
    BAD_REQUEST = (1005, "common.response.badRequest")

    # ==================== 业务错误 (2XXX) ====================
    USER_OPERATION_ERROR = (2001, "common.response.userOperationError")
    ROLE_OPERATION_ERROR = (2002, "common.response.roleOperationError")
    MENU_OPERATION_ERROR = (2003, "common.response.menuOperationError")
    PERMISSION_OPERATION_ERROR = (2004, "common.response.permissionOperationError")
    INVALID_OPERATION = (2005, "common.response.invalidOperation")

    # ==================== 状态/并发/幂等 (3XXX) ====================
    ALREADY_EXISTS = (3001, "common.response.alreadyExists")
    DUPLICATE_REQUEST = (3002, "common.response.duplicateRequest")
    STATE_CONFLICT = (3003, "common.response.stateConflict")
    CONCURRENT_MODIFICATION = (3004, "common.response.concurrentModification")

    # ==================== 权限/安全 (4XXX) ====================
    AUTHENTICATION_FAILED = (4001, "common.response.authenticationFailed")
    TOKEN_EXPIRED = (4002, "common.response.tokenExpired")
    TOKEN_INVALID = (4003, "common.response.tokenInvalid")
    INSUFFICIENT_PERMISSIONS = (4004, "common.response.insufficientPermissions")
    ROLE_PERMISSION_DENIED = (4005, "common.response.rolePermissionDenied")
    MENU_PERMISSION_DENIED = (4006, "common.response.menuPermissionDenied")
    RESOURCE_PERMISSION_DENIED = (4007, "common.response.resourcePermissionDenied")
    USER_DISABLED = (4008, "common.response.userDisabled")
    TOKEN_REFRESH_FAILED = (4009, "common.response.tokenRefreshFailed")

    # ==================== 资源不存在 (5XXX) ====================
    USER_NOT_FOUND = (5001, "common.response.userNotFound")
    ROLE_NOT_FOUND = (5002, "common.response.roleNotFound")
    MENU_NOT_FOUND = (5003, "common.response.menuNotFound")
    RESOURCE_NOT_FOUND = (5004, "common.response.resourceNotFound")
    MENU_INVALID_PARENT = (5005, "common.response.menuInvalidParent")

    # ==================== 第三方/依赖错误 (6XXX) ====================
    EXTERNAL_SERVICE_ERROR = (6001, "common.response.externalServiceError")
    THIRD_PARTY_ERROR = (6002, "common.response.thirdPartyError")
    DEPENDENCY_ERROR = (6003, "common.response.dependencyError")

    # ==================== 系统错误 (7XXX) ====================
    INTERNAL_SERVER_ERROR = (7001, "common.response.internalServerError")
    DATABASE_ERROR = (7002, "common.response.databaseError")
    SYSTEM_BUSY = (7003, "common.response.systemBusy")

    # ==================== Socket/实时通信错误 (8XXX) ====================
    SOCKET_CONNECTION_ERROR = (8001, "common.response.socketConnectionError")
    SOCKET_CONNECTION_CLOSED = (8002, "common.response.socketConnectionClosed")
    SOCKET_MESSAGE_SEND_ERROR = (8003, "common.response.socketMessageSendError")
    SOCKET_INVALID_MESSAGE = (8004, "common.response.socketInvalidMessage")
    SOCKET_AUTHENTICATION_FAILED = (8005, "common.response.socketAuthenticationFailed")
    SOCKET_NAMESPACE_NOT_FOUND = (8006, "common.response.socketNamespaceNotFound")

    def __init__(self, code: int, description: str) -> None:
        """
        初始化状态码。

        Args:
            code: 4位状态码数值
            description: 状态码描述
        """
        self.code = code
        self.description = description

    def __int__(self) -> int:
        """返回状态码数值，便于与整数进行比较。"""
        return self.code

    def __str__(self) -> str:
        """返回状态码描述。"""
        return self.description

    @property
    def type(self) -> int:
        """提取错误类型（第1位）。"""
        return self.code // 1000

    @property
    def sequence(self) -> int:
        """提取序号（后3位）。"""
        return self.code % 1000

    @property
    def type_name(self) -> str:
        """获取错误类型名称。"""
        type_map = {
            0: "成功",
            1: "参数/请求错误",
            2: "业务错误",
            3: "状态/并发/幂等",
            4: "权限/安全",
            5: "资源不存在",
            6: "第三方/依赖错误",
            7: "系统错误",
            8: "Socket/实时通信错误",
        }
        return type_map.get(self.type, "未知")


def get_status_code(code: int) -> StatusCode | None:
    """
    根据数值获取对应的状态码枚举。

    Args:
        code: 状态码数值

    Returns:
        对应的 StatusCode 枚举，如果不存在则返回 None
    """
    for status in StatusCode:
        if status.code == code:
            return status
    return None


def get_status_description(code: int) -> str:
    """
    获取状态码对应的描述信息。

    Args:
        code: 状态码数值

    Returns:
        描述信息，如果状态码不存在则返回状态码本身字符串
    """
    status = get_status_code(code)
    return status.description if status else str(code)
