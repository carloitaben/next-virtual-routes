import { Effect } from "effect"
import type {
  GenerationEndEvent,
  GenerationErrorEvent,
  GenerationStartEvent,
  RouteGeneratedEvent,
  RoutesHooks,
} from "../hooks"

export class RoutesHookError extends Error {
  override readonly cause: unknown

  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause })
    this.name = "RoutesHookError"
    this.cause = cause
  }
}

function runHook<Event>(
  hook: ((event: Event) => void | Promise<void>) | undefined,
  event: Event,
) {
  if (!hook) {
    return Effect.void
  }

  return Effect.tryPromise({
    try: () => Promise.resolve(hook(event)),
    catch: (cause) => new RoutesHookError(cause),
  })
}

export function notifyGenerationStart(
  hooks: RoutesHooks | undefined,
  event: GenerationStartEvent,
) {
  return runHook(hooks?.onGenerationStart, event)
}

export function notifyRouteGenerated(
  hooks: RoutesHooks | undefined,
  event: RouteGeneratedEvent,
) {
  return runHook(hooks?.onRouteGenerated, event)
}

export function notifyGenerationEnd(
  hooks: RoutesHooks | undefined,
  event: GenerationEndEvent,
) {
  return runHook(hooks?.onGenerationEnd, event)
}

export function notifyGenerationError(
  hooks: RoutesHooks | undefined,
  event: GenerationErrorEvent,
) {
  return runHook(hooks?.onError, event)
}
