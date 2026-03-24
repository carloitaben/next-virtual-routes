import { Data } from "effect"

export class InvalidRoutesConfigError extends Data.TaggedError(
  "InvalidRoutesConfigError",
)<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class MissingTemplateError extends Data.TaggedError(
  "MissingTemplateError",
)<{
  readonly templatePath: string
  readonly routePath: string
}> {}

export class MissingRouteContextError extends Data.TaggedError(
  "MissingRouteContextError",
)<{
  readonly routePath: string
}> {}

export class RoutesLockError extends Data.TaggedError("RoutesLockError")<{
  readonly lockFile: string
  readonly message: string
}> {}

export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }

  return new Error(String(error))
}

export function formatBuildError(error: unknown): Error {
  if (error instanceof InvalidRoutesConfigError) {
    return new Error(error.message, { cause: error.cause })
  }

  if (error instanceof MissingTemplateError) {
    return new Error(
      `Missing template \`${error.templatePath}\` for route \`${error.routePath}\``,
    )
  }

  if (error instanceof MissingRouteContextError) {
    return new Error(
      `Template for route \`${error.routePath}\` references \`context\` but no route context was provided`,
    )
  }

  if (error instanceof RoutesLockError) {
    return new Error(error.message)
  }

  return toError(error)
}
