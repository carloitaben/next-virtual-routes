import type { Context } from "../lib"
import { GLOBAL_IDENTIFIER } from "./parse"
import { serialize } from "./evaluate"

export function injectContextDeclaration(routeContext: Context): string {
  return `const ${GLOBAL_IDENTIFIER} = ${serialize(routeContext)}`
}
