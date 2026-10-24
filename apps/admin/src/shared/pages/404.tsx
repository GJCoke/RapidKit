import { ExceptionPage } from "./exception-page"

export default function NotFound() {
  return <ExceptionPage code="404" />
}

export const Component = NotFound
