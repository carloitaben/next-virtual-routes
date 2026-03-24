export type GenerationKind = "initial" | "watch"

export type GenerationStartEvent = Readonly<{
  cwd: string
  kind: GenerationKind
  routeCount: number
}>

export type RouteGeneratedEvent = Readonly<{
  kind: GenerationKind
  path: string
  templatePath: string
}>

export type GenerationEndEvent = Readonly<{
  generatedPaths: ReadonlyArray<string>
  kind: GenerationKind
}>

export type GenerationErrorEvent = Readonly<{
  error: Error
  kind: GenerationKind
}>

export type RoutesHooks = Readonly<{
  onError?: (event: GenerationErrorEvent) => void | Promise<void>
  onGenerationEnd?: (event: GenerationEndEvent) => void | Promise<void>
  onGenerationStart?: (event: GenerationStartEvent) => void | Promise<void>
  onRouteGenerated?: (event: RouteGeneratedEvent) => void | Promise<void>
}>
