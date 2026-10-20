import type { ApiRequest, ApiResponse } from "@/typings/service"
import { request } from "@/services/request"

export type UserSearchParams = ApiRequest<"/api/v1/users", "get", "query">
export type UserList = ApiResponse<"/api/v1/users">
export type User = UserList["records"][number]
export type CreateUserBody = ApiRequest<"/api/v1/users", "post", "body">
export type UpdateUserBody = ApiRequest<"/api/v1/users/{user_id}", "put", "body">
export type BatchDeleteUsersBody = ApiRequest<"/api/v1/users", "delete", "body">
export type ChangePasswordBody = ApiRequest<"/api/v1/users/{user_id}/password", "put", "body">
export type UsernamePinyinBody = ApiRequest<"/api/v1/users/validate-username-pinyin", "post", "body">
export type UsernamePinyinResult = ApiResponse<"/api/v1/users/validate-username-pinyin", "post">
export type UserOption = ApiResponse<"/api/v1/users/all">[number]

export function fetchUsers(params?: UserSearchParams) {
  return request<UserList>({ url: "/users", method: "get", params })
}

export function createUser(data: CreateUserBody) {
  return request<User>({ url: "/users", method: "post", data })
}

export function updateUser(userId: string, data: UpdateUserBody) {
  return request<User>({ url: `/users/${userId}`, method: "put", data })
}

export function deleteUser(userId: string) {
  return request<boolean>({ url: `/users/${userId}`, method: "delete" })
}

export function batchDeleteUsers(data: BatchDeleteUsersBody) {
  return request<boolean>({ url: "/users", method: "delete", data })
}

export function changeUserPassword(userId: string, data: ChangePasswordBody) {
  return request<boolean>({ url: `/users/${userId}/password`, method: "put", data })
}

export function validateUsernamePinyin(data: UsernamePinyinBody) {
  return request<UsernamePinyinResult>({ url: "/users/validate-username-pinyin", method: "post", data })
}

export function resendUserInvite(userId: string) {
  return request<boolean>({ url: `/users/${userId}/resend-invite`, method: "post" })
}

export function fetchAllUsers() {
  return request<UserOption[]>({ url: "/users/all", method: "get" })
}
