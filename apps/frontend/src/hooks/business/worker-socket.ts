import { useSocket, type Result } from "@/hooks/common/socket"
import { getToken } from "@/store/modules/auth/shared"

/** Page-owned connection to worker events. */
export function useWorkerSocket(): Omit<Result, "connect"> & { connect: () => ReturnType<Result["connect"]> } {
  const connection = useSocket()
  const connect = () =>
    connection.connect({
      url: new URL(import.meta.env.VITE_SERVICE_BASE_URL || "", window.location.origin).origin,
      namespace: "/worker",
      path: "/socket.io",
      auth: (callback: (data: { access_token: string }) => void) => callback({ access_token: getToken() }),
      ioOptions: { forceNew: true },
    })
  return { ...connection, connect }
}
