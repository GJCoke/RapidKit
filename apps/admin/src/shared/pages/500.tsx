import { ExceptionPage } from "./exception-page"

export default function ServerError() {
  return <ExceptionPage code="500" />
}

export const Component = ServerError
