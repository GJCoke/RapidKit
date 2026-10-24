import { ExceptionPage } from "./exception-page"

export default function Forbidden() {
  return <ExceptionPage code="403" />
}

export const Component = Forbidden
