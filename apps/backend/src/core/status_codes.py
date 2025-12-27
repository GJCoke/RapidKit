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
    SUCCESS = (0, "common.response.success")  # 请求成功

    # ==================== 参数/请求错误 (1XXX) ====================
    VALIDATION_ERROR = (1001, "common.response.validationError")  # 请求参数验证失败
    INVALID_INPUT = (1002, "common.response.invalidInput")  # 输入数据无效
    MISSING_REQUIRED_FIELD = (1003, "common.response.missingRequiredField")  # 缺少必需字段
    INVALID_FORMAT = (1004, "common.response.invalidFormat")  # 数据格式错误
    BAD_REQUEST = (1005, "common.response.badRequest")  # 请求格式错误
    TOO_MANY_REQUESTS = (1006, "common.response.tooManyRequests")  # 请求过于频繁，已被限流

    # ==================== 业务错误 (2XXX) ====================
    USER_OPERATION_ERROR = (2001, "common.response.userOperationError")  # 用户操作失败
    ROLE_OPERATION_ERROR = (2002, "common.response.roleOperationError")  # 角色操作失败
    MENU_OPERATION_ERROR = (2003, "common.response.menuOperationError")  # 菜单操作失败
    PERMISSION_OPERATION_ERROR = (2004, "common.response.permissionOperationError")  # 权限操作失败
    INVALID_OPERATION = (2005, "common.response.invalidOperation")  # 无效的操作

    # ==================== 状态/并发/幂等 (3XXX) ====================
    ALREADY_EXISTS = (3001, "common.response.alreadyExists")  # 资源已存在，无法重复创建
    DUPLICATE_REQUEST = (3002, "common.response.duplicateRequest")  # 重复请求
    STATE_CONFLICT = (3003, "common.response.stateConflict")  # 资源状态冲突
    CONCURRENT_MODIFICATION = (3004, "common.response.concurrentModification")  # 并发修改冲突

    # ==================== 权限/安全 (4XXX) ====================
    AUTHENTICATION_FAILED = (4001, "common.response.authenticationFailed")  # 认证失败，用户名或密码错误
    TOKEN_EXPIRED = (4002, "common.response.tokenExpired")  # 认证令牌已过期
    TOKEN_INVALID = (4003, "common.response.tokenInvalid")  # 认证令牌无效
    INSUFFICIENT_PERMISSIONS = (4004, "common.response.insufficientPermissions")  # 权限不足，无法执行此操作
    ROLE_PERMISSION_DENIED = (4005, "common.response.rolePermissionDenied")  # 角色权限不足
    MENU_PERMISSION_DENIED = (4006, "common.response.menuPermissionDenied")  # 菜单权限不足，无权访问此菜单
    RESOURCE_PERMISSION_DENIED = (4007, "common.response.resourcePermissionDenied")  # 资源权限不足
    USER_DISABLED = (4008, "common.response.userDisabled")  # 用户已被禁用，无法登录
    TOKEN_REFRESH_FAILED = (4009, "common.response.tokenRefreshFailed")  # 令牌刷新失败

    # ==================== 资源不存在 (5XXX) ====================
    USER_NOT_FOUND = (5001, "common.response.userNotFound")  # 用户不存在
    ROLE_NOT_FOUND = (5002, "common.response.roleNotFound")  # 角色不存在
    MENU_NOT_FOUND = (5003, "common.response.menuNotFound")  # 菜单不存在
    RESOURCE_NOT_FOUND = (5004, "common.response.resourceNotFound")  # 资源不存在
    MENU_INVALID_PARENT = (5005, "common.response.menuInvalidParent")  # 菜单父级不存在

    # ==================== 第三方/依赖错误 (6XXX) ====================
    EXTERNAL_SERVICE_ERROR = (6001, "common.response.externalServiceError")  # 外部服务调用失败
    THIRD_PARTY_ERROR = (6002, "common.response.thirdPartyError")  # 第三方服务错误
    DEPENDENCY_ERROR = (6003, "common.response.dependencyError")  # 依赖服务错误

    # ==================== 系统错误 (7XXX) ====================
    INTERNAL_SERVER_ERROR = (7001, "common.response.internalServerError")  # 服务器内部错误
    DATABASE_ERROR = (7002, "common.response.databaseError")  # 数据库操作失败
    SYSTEM_BUSY = (7003, "common.response.systemBusy")  # 系统繁忙，请稍后重试

    # ==================== Socket/实时通信错误 (8XXX) ====================
    SOCKET_CONNECTION_ERROR = (8001, "common.response.socketConnectionError")  # WebSocket 连接失败
    SOCKET_CONNECTION_CLOSED = (8002, "common.response.socketConnectionClosed")  # WebSocket 连接已关闭
    SOCKET_MESSAGE_SEND_ERROR = (8003, "common.response.socketMessageSendError")  # WebSocket 消息发送失败
    SOCKET_INVALID_MESSAGE = (8004, "common.response.socketInvalidMessage")  # WebSocket 消息格式错误
    SOCKET_AUTHENTICATION_FAILED = (8005, "common.response.socketAuthenticationFailed")  # WebSocket 认证失败
    SOCKET_NAMESPACE_NOT_FOUND = (8006, "common.response.socketNamespaceNotFound")  # WebSocket 命名空间不存在

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
