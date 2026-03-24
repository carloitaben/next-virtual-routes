import { posix } from "node:path"
import { NodePath } from "@effect/platform-node"
import { Effect, FileSystem, Layer } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
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

  write(path: string, bytes: Uint8Array, flag?: string): void {
    const normalized = this.normalize(path)

    if (flag === "wx" && this.files.has(normalized)) {
      throw new Error(`File exists: ${normalized}`)
    }

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
    writeFile: (path, data, options) => Effect.sync(() => virtualFs.write(path, data, options?.flag)),
    writeFileString: (path, data, options) =>
      Effect.sync(() => virtualFs.write(path, new TextEncoder().encode(data), options?.flag)),
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

afterEach(() => {
  vi.restoreAllMocks()
})

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

  it("removes directory cleanup matches recursively", async () => {
    const virtualFs = await runGeneration(
      {
        "/repo/src/templates/page.tsx": "export default function Page() {}",
        "/repo/src/app/generated/stale.tsx": "stale",
      },
      {
        cwd: "/repo",
        remove: ["src/app/generated"],
        routes: [route("src/app/page.tsx", "src/templates/page.tsx")],
        watch: false,
      },
      ["/repo/src/app/generated"],
    )

    expect(virtualFs.exists("/repo/src/app/generated")).toBe(false)
    expect(virtualFs.exists("/repo/src/app/generated/stale.tsx")).toBe(false)
    expect(virtualFs.exists("/repo/src/app/page.tsx")).toBe(true)
  })

  it("tolerates overlapping cleanup matches", async () => {
    const virtualFs = await runGeneration(
      {
        "/repo/src/templates/page.tsx": "export default function Page() {}",
        "/repo/src/app/generated/stale.tsx": "stale",
      },
      {
        cwd: "/repo",
        remove: ["src/app/**", "src/app/generated/**"],
        routes: [route("src/app/page.tsx", "src/templates/page.tsx")],
        watch: false,
      },
      ["/repo/src/app/generated", "/repo/src/app/generated/stale.tsx", "/repo/src/app/generated"],
    )

    expect(virtualFs.exists("/repo/src/app/generated")).toBe(false)
    expect(virtualFs.exists("/repo/src/app/generated/stale.tsx")).toBe(false)
    expect(virtualFs.exists("/repo/src/app/page.tsx")).toBe(true)
  })

  it("keeps the first duplicate configured route and warns once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    const virtualFs = await runGeneration(
      {
        "/repo/src/templates/page.tsx": 'export const value = "first"',
        "/repo/src/templates/other.tsx": 'export const value = "second"',
      },
      {
        cwd: "/repo",
        routes: [
          route("src/app/page.tsx", "src/templates/page.tsx"),
          route("./src/app/page.tsx", "src/templates/other.tsx"),
        ],
        watch: false,
      },
    )

    expect(virtualFs.readString("/repo/src/app/page.tsx")).toBe('export const value = "first"')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      "Skipping duplicate configured route at ./src/app/page.tsx; keeping src/templates/page.tsx and ignoring src/templates/other.tsx",
    )
  })

  it("keeps the first duplicate route context", async () => {
    const virtualFs = await runGeneration(
      {
        "/repo/src/templates/page.tsx": 'export const enabled = context.enabled ? "yes" : "no"',
      },
      {
        cwd: "/repo",
        routes: [
          route("src/app/page.tsx", "src/templates/page.tsx", { enabled: true }),
          route("src/app/page.tsx", "src/templates/page.tsx", { enabled: false }),
        ],
        watch: false,
      },
    )

    expect(virtualFs.readString("/repo/src/app/page.tsx")).toBe('export const enabled = "yes"')
  })

  it("emits hooks around successful generation", async () => {
    const onGenerationStart = vi.fn()
    const onRouteGenerated = vi.fn()
    const onGenerationEnd = vi.fn()

    await runGeneration(
      {
        "/repo/src/templates/page.tsx": 'export const dynamic = "a"',
      },
      {
        cwd: "/repo",
        hooks: {
          onGenerationEnd,
          onGenerationStart,
          onRouteGenerated,
        },
        routes: [route("src/app/page.tsx", "src/templates/page.tsx")],
        watch: false,
      },
    )

    expect(onGenerationStart).toHaveBeenCalledWith({
      cwd: "/repo",
      kind: "initial",
      routeCount: 1,
    })
    expect(onRouteGenerated).toHaveBeenCalledWith({
      kind: "initial",
      path: "src/app/page.tsx",
      templatePath: "src/templates/page.tsx",
    })
    expect(onGenerationEnd).toHaveBeenCalledWith({
      generatedPaths: ["src/app/page.tsx"],
      kind: "initial",
    })
  })

  it("does not route hook failures through onError", async () => {
    const onError = vi.fn()

    await expect(
      runGeneration(
        {
          "/repo/src/templates/page.tsx": 'export const dynamic = "a"',
        },
        {
          cwd: "/repo",
          hooks: {
            onError,
            onRouteGenerated: async () => {
              throw new Error("formatter failed")
            },
          },
          routes: [route("src/app/page.tsx", "src/templates/page.tsx")],
          watch: false,
        },
      ),
    ).rejects.toThrow("formatter failed")

    expect(onError).not.toHaveBeenCalled()
  })

  it("emits onError for library generation errors", async () => {
    const onError = vi.fn()

    await expect(
      runGeneration(
        {},
        {
          cwd: "/repo",
          hooks: { onError },
          routes: [route("src/app/page.tsx", "src/templates/missing.tsx")],
          watch: false,
        },
      ),
    ).rejects.toBeDefined()

    expect(onError).toHaveBeenCalledWith({
      error: expect.objectContaining({
        message: "Missing template `src/templates/missing.tsx` for route `src/app/page.tsx`",
      }),
      kind: "initial",
    })
  })

  it("treats malformed lockfile json as an unknown owner", async () => {
    await expect(
      runGeneration(
        {
          "/repo/.next/next-virtual-routes/lock": "not-json",
          "/repo/src/templates/page.tsx": 'export const dynamic = "a"',
        },
        {
          cwd: "/repo",
          routes: [route("src/app/page.tsx", "src/templates/page.tsx")],
          watch: false,
        },
      ),
    ).rejects.toThrow(
      "next-virtual-routes is locked by another process. Remove /repo/.next/next-virtual-routes/lock if this is stale.",
    )
  })

  it("treats invalid lockfile metadata as an unknown owner", async () => {
    await expect(
      runGeneration(
        {
          "/repo/.next/next-virtual-routes/lock": JSON.stringify({
            cwd: "/repo",
            pid: "1234",
            startedAt: new Date().toISOString(),
          }),
          "/repo/src/templates/page.tsx": 'export const dynamic = "a"',
        },
        {
          cwd: "/repo",
          routes: [route("src/app/page.tsx", "src/templates/page.tsx")],
          watch: false,
        },
      ),
    ).rejects.toThrow(
      "next-virtual-routes is locked by another process. Remove /repo/.next/next-virtual-routes/lock if this is stale.",
    )
  })
})
