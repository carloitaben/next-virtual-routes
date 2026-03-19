import { posix } from "node:path"
import { NodePath } from "@effect/platform-node"
import { Effect, FileSystem, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { route } from "../lib"
import { resolveConfig } from "../domain/config"
import { buildRoutePlan } from "../domain/plan"
import { GlobService } from "./services"
import { generateRoutesProgram } from "./programs"

class VirtualFileSystem {
  private readonly directories = new Set<string>(["/"])
  private readonly files = new Map<string, Uint8Array>()

  constructor(initialFiles: Readonly<Record<string, string | Uint8Array>>) {
    for (const [path, value] of Object.entries(initialFiles)) {
      this.write(path, typeof value === "string" ? new TextEncoder().encode(value) : value)
    }
  }

  exists(path: string): boolean {
    const normalized = this.normalize(path)
    return this.files.has(normalized) || this.directories.has(normalized)
  }

  makeDirectory(path: string): void {
    this.ensureDirectory(path)
  }

  read(path: string): Uint8Array {
    const normalized = this.normalize(path)
    const file = this.files.get(normalized)
    if (!file) {
      throw new Error(`Missing file: ${normalized}`)
    }
    return file
  }

  readString(path: string): string {
    return new TextDecoder().decode(this.read(path))
  }

  remove(path: string, recursive: boolean): void {
    const normalized = this.normalize(path)
    this.files.delete(normalized)

    if (!recursive) {
      this.directories.delete(normalized)
      return
    }

    for (const file of this.files.keys()) {
      if (file === normalized || file.startsWith(`${normalized}/`)) {
        this.files.delete(file)
      }
    }

    for (const directory of [...this.directories]) {
      if (directory === normalized || directory.startsWith(`${normalized}/`)) {
        this.directories.delete(directory)
      }
    }

    this.directories.add("/")
  }

  write(path: string, bytes: Uint8Array): void {
    const normalized = this.normalize(path)
    this.ensureDirectory(posix.dirname(normalized))
    this.files.set(normalized, new Uint8Array(bytes))
  }

  private ensureDirectory(path: string): void {
    const normalized = this.normalize(path)
    const segments = normalized.split("/").filter((segment) => segment.length > 0)
    let current = ""

    this.directories.add("/")

    for (const segment of segments) {
      current = `${current}/${segment}`
      this.directories.add(current)
    }
  }

  private normalize(path: string): string {
    const normalized = posix.normalize(path)
    return normalized.startsWith("/") ? normalized : `/${normalized}`
  }
}

function makeFileSystemLayer(virtualFs: VirtualFileSystem) {
  return FileSystem.layerNoop({
    exists: (path) => Effect.succeed(virtualFs.exists(path)),
    makeDirectory: (path) => Effect.sync(() => virtualFs.makeDirectory(path)),
    readFile: (path) => Effect.sync(() => virtualFs.read(path)),
    readFileString: (path) => Effect.sync(() => virtualFs.readString(path)),
    remove: (path, options) =>
      Effect.sync(() => virtualFs.remove(path, options?.recursive ?? false)),
    writeFile: (path, data) => Effect.sync(() => virtualFs.write(path, data)),
    writeFileString: (path, data) =>
      Effect.sync(() => virtualFs.write(path, new TextEncoder().encode(data))),
  })
}

function makeGlobLayer(matches: ReadonlyArray<string>) {
  return Layer.succeed(GlobService)({
    match: () => Effect.succeed([...matches]),
  })
}

async function runGeneration(
  initialFiles: Readonly<Record<string, string | Uint8Array>>,
  configInput: Parameters<typeof resolveConfig>[0],
  cleanupMatches: ReadonlyArray<string> = [],
) {
  const virtualFs = new VirtualFileSystem(initialFiles)
  const config = await resolveConfig(configInput)
  const plan = buildRoutePlan(config)
  const layer = Layer.mergeAll(
    makeFileSystemLayer(virtualFs),
    makeGlobLayer(cleanupMatches),
    NodePath.layerPosix,
  )

  await Effect.runPromise(generateRoutesProgram(config, plan).pipe(Effect.provide(layer)))

  return virtualFs
}

describe(generateRoutesProgram.name, () => {
  it("generates transformed code with an injected virtual filesystem", async () => {
    const virtualFs = await runGeneration(
      {
        "/repo/src/templates/page.tsx": 'export const dynamic = context.enabled ? "a" : "b"',
      },
      {
        cwd: "/repo",
        routes: [route("src/app/page.tsx", "src/templates/page.tsx", { enabled: true })],
        watch: false,
      },
    )

    expect(virtualFs.readString("/repo/src/app/page.tsx")).toBe(
      'export const dynamic = "a"',
    )
  })

  it("copies raw assets with an injected virtual filesystem", async () => {
    const virtualFs = await runGeneration(
      {
        "/repo/src/templates/robots.txt": "User-agent: *\nAllow: /\n",
      },
      {
        cwd: "/repo",
        routes: [route("src/app/robots.txt", "src/templates/robots.txt")],
        watch: false,
      },
    )

    expect(virtualFs.readString("/repo/src/app/robots.txt")).toBe(
      "User-agent: *\nAllow: /\n",
    )
  })

  it("runs cleanup matches before generation", async () => {
    const virtualFs = await runGeneration(
      {
        "/repo/src/templates/page.tsx": "export default function Page() {}",
        "/repo/src/app/stale.tsx": "stale",
      },
      {
        cwd: "/repo",
        remove: ["src/app/**"],
        routes: [route("src/app/page.tsx", "src/templates/page.tsx")],
        watch: false,
      },
      ["/repo/src/app/stale.tsx"],
    )

    expect(virtualFs.exists("/repo/src/app/stale.tsx")).toBe(false)
    expect(virtualFs.exists("/repo/src/app/page.tsx")).toBe(true)
  })
})
