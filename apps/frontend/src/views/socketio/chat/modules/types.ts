// 定义消息类型枚举
export type MessageType = "text" | "image" | "video" | "audio" | "system" | "file"

// 国际化内容结构
export interface I18nContent {
  key: string // 翻译 key, 如 "chat.user_joined"
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  params?: Record<string, any> // 翻译参数, 如 { username: 'Doraemon' }
}

export interface MediaPayload {
  url: string // 资源链接 (Base64 或远程 URL)
  name?: string // 文件名
  size?: number // 文件大小
  duration?: number // 音视频时长 (秒)
  thumbnail?: string // 视频封面图
}

interface BaseMessage {
  id: string
  sender: string
  time: string
  isSelf: boolean
  avatar?: string
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  extra?: Record<string, any>
}

export type Message = BaseMessage &
  (
    | { type: "text"; content: string }
    | { type: "system"; content: I18nContent }
    | { type: "image" | "video" | "audio" | "file"; content: MediaPayload }
  )

export interface ChatInstance {
  id: string
  username: string
  group: string
  avatar: string
}
