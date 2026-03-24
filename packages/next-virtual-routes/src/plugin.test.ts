import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { generateRoutes, resetRoutesWatcherForTesting, route, withRoutes } from "./index"

const tempDirectories: Array<string> = []

async function createFixture() {
  const cwd = await mkdtemp(join(tmpdir(), "next-virtual-routes-"))
  tempDirectories.push(cwd)

  await mkdir(join(cwd, ".next"), { recursive: true })
  await mkdir(join(cwd, "src", "templates"), { recursive: true })
  await writeFile(
    join(cwd, "src", "templates", "shared.ts"),
    "export const helper = 'ok'\n",
  )
  await writeFile(
    join(cwd, "src", "templates", "page.tsx"),
    [
      'import { helper } from "./shared"',
      'export const dynamic = context.enabled ? "force-static" : "force-dynamic"',
      "export default function Page() {",
      "  return helper + context.path",
      "}",
      "",
    ].join("\n"),
  )

  return cwd
}

async function waitFor(
  assert: () => Promise<void> | void,
  timeout = 3000,
): Promise<void> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeout) {
    try {
      await assert()
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  await assert()
}

afterEach(async () => {
  await resetRoutesWatcherForTesting()
  vi.restoreAllMocks()
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe(generateRoutes.name, () => {
  it("generates pages-router files using direct output paths", async () => {
    const cwd = await createFixture()

    await generateRoutes({
      cwd,
      routes: [route("src/pages/blog.tsx", "src/templates/page.tsx", { enabled: true })],
      watch: false,
    })

    const output = await readFile(join(cwd, "src", "pages", "blog.tsx"), "utf8")
    expect(output).toContain('from "../templates/shared"')
    expect(output).toContain('export const dynamic = "force-static"')
    expect(output).toContain('"path": "src/pages/blog.tsx"')
  })

  it("removes matching files before generation", async () => {
    const cwd = await createFixture()
    await mkdir(join(cwd, "src", "pages"), { recursive: true })
    await writeFile(join(cwd, "src", "pages", "stale.tsx"), "stale")

    await generateRoutes({
      cwd,
      remove: ["src/pages/**"],
      routes: [route("src/pages/index.tsx", "src/templates/page.tsx", { enabled: true })],
      watch: false,
    })

    await expect(readFile(join(cwd, "src", "pages", "stale.tsx"), "utf8")).rejects.toThrow()
  })

  it("removes matched directories and dot entries before generation", async () => {
    const cwd = await createFixture()
    await mkdir(join(cwd, "src", "pages", "generated", ".cache"), { recursive: true })
    await writeFile(join(cwd, "src", "pages", "generated", ".cache", "stale.tsx"), "stale")

    await generateRoutes({
      cwd,
      remove: ["src/pages/generated"],
      routes: [route("src/pages/index.tsx", "src/templates/page.tsx", { enabled: true })],
      watch: false,
    })

    await expect(
      readFile(join(cwd, "src", "pages", "generated", ".cache", "stale.tsx"), "utf8"),
    ).rejects.toThrow()
    await expect(readFile(join(cwd, "src", "pages", "index.tsx"), "utf8")).resolves.toContain(
      'export const dynamic = "force-static"',
    )
  })

  it("fails early when a live lockfile exists", async () => {
    const cwd = await createFixture()
    const lockFile = join(cwd, ".next", "next-virtual-routes", "lock")
    await mkdir(join(cwd, ".next", "next-virtual-routes"), { recursive: true })
    await writeFile(
      lockFile,
      JSON.stringify({
        cwd,
        pid: process.pid,
        startedAt: new Date().toISOString(),
      }),
    )

    await expect(
      generateRoutes({
        cwd,
        routes: [route("src/pages/index.tsx", "src/templates/page.tsx", { enabled: true })],
        watch: false,
      }),
    ).rejects.toThrow(/locked/)
  })

  it("replaces stale lockfiles", async () => {
    const cwd = await createFixture()
    const lockDirectory = join(cwd, ".next", "next-virtual-routes")
    await mkdir(lockDirectory, { recursive: true })
    await writeFile(
      join(lockDirectory, "lock"),
      JSON.stringify({
        cwd,
        pid: 999999,
        startedAt: new Date().toISOString(),
      }),
    )

    await generateRoutes({
      cwd,
      routes: [route("src/pages/index.tsx", "src/templates/page.tsx", { enabled: true })],
      watch: false,
    })

    const output = await readFile(join(cwd, "src", "pages", "index.tsx"), "utf8")
    expect(output).toContain("const context =")
  })

  it("copies non-code assets without running transforms", async () => {
    const cwd = await createFixture()
    await writeFile(join(cwd, "src", "templates", "robots.txt"), "User-agent: *\nAllow: /\n")

    await generateRoutes({
      cwd,
      routes: [route("src/app/robots.txt", "src/templates/robots.txt")],
      watch: false,
    })

    const output = await readFile(join(cwd, "src", "app", "robots.txt"), "utf8")
    expect(output).toBe("User-agent: *\nAllow: /\n")
  })

  it("keeps the first duplicate configured route and warns", async () => {
    const cwd = await createFixture()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    await writeFile(
      join(cwd, "src", "templates", "shop.tsx"),
      ["export default function Page() {", '  return "shop"', "}", ""].join("\n"),
    )

    await generateRoutes({
      cwd,
      routes: [
        route("src/app/page.tsx", "src/templates/page.tsx", { enabled: true }),
        route("src/app/shop/page.tsx", "src/templates/page.tsx", { enabled: true }),
        route("src/app/shop/page.tsx", "src/templates/shop.tsx"),
      ],
      watch: false,
    })

    const output = await readFile(join(cwd, "src", "app", "shop", "page.tsx"), "utf8")
    expect(output).toContain('from "../../templates/shared"')
    expect(output).toContain('"path": "src/app/shop/page.tsx"')
    expect(output).not.toContain('return "shop"')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      "Skipping duplicate configured route at src/app/shop/page.tsx; keeping src/templates/page.tsx and ignoring src/templates/shop.tsx",
    )
  })
})

describe(withRoutes.name, () => {
  it("returns a curried async next config wrapper", async () => {
    const cwd = await createFixture()
    const wrapped = withRoutes({
      cwd,
      routes: [route("src/pages/index.tsx", "src/templates/page.tsx", { enabled: true })],
      watch: false,
    })({ reactStrictMode: true })

    await expect(wrapped()).resolves.toEqual({ reactStrictMode: true })
  })

  it("skips generation in Next telemetry flush processes", async () => {
    const cwd = await createFixture()
    const originalArgv = process.argv
    process.argv = [...process.argv, "next/dist/telemetry/detached-flush.js"]

    try {
      const wrapped = withRoutes({
        cwd,
        routes: [route("src/pages/index.tsx", "src/templates/page.tsx", { enabled: true })],
        watch: true,
      })({ reactStrictMode: true })

      await expect(wrapped()).resolves.toEqual({ reactStrictMode: true })
      await expect(readFile(join(cwd, "src", "pages", "index.tsx"), "utf8")).rejects.toThrow()
    } finally {
      process.argv = originalArgv
    }
  })

  it("reuses the active watcher across repeated config evaluation", async () => {
    const cwd = await createFixture()
    const wrapped = withRoutes({
      cwd,
      routes: [route("src/pages/index.tsx", "src/templates/page.tsx", { enabled: true })],
      watch: true,
    })({ reactStrictMode: true })

    await expect(wrapped()).resolves.toEqual({ reactStrictMode: true })
    await expect(wrapped()).resolves.toEqual({ reactStrictMode: true })
  })

  it("does not reuse the active watcher when hooks change", async () => {
    const cwd = await createFixture()
    const onGenerationStartA = vi.fn()
    const onGenerationStartB = vi.fn()

    const wrappedA = withRoutes({
      cwd,
      hooks: { onGenerationStart: onGenerationStartA },
      routes: [route("src/pages/index.tsx", "src/templates/page.tsx", { enabled: true })],
      watch: true,
    })({ reactStrictMode: true })

    const wrappedB = withRoutes({
      cwd,
      hooks: { onGenerationStart: onGenerationStartB },
      routes: [route("src/pages/index.tsx", "src/templates/page.tsx", { enabled: true })],
      watch: true,
    })({ reactStrictMode: true })

    await expect(wrappedA()).resolves.toEqual({ reactStrictMode: true })
    await expect(wrappedB()).resolves.toEqual({ reactStrictMode: true })

    expect(onGenerationStartA).toHaveBeenCalledTimes(1)
    expect(onGenerationStartB).toHaveBeenCalledTimes(1)
  })

  it("keeps watching after a hook failure in watch mode", async () => {
    const cwd = await createFixture()
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const onRouteGenerated = vi
      .fn<(...args: ReadonlyArray<unknown>) => Promise<void>>()
      .mockImplementationOnce(async () => {})
      .mockImplementationOnce(async () => {
        throw new Error("formatter failed")
      })
      .mockImplementation(async () => {})

    await generateRoutes({
      cwd,
      hooks: { onRouteGenerated },
      routes: [route("src/pages/index.tsx", "src/templates/page.tsx", { enabled: true })],
      watch: true,
    })

    await writeFile(
      join(cwd, "src", "templates", "page.tsx"),
      [
        'import { helper } from "./shared"',
        'export const dynamic = context.enabled ? "force-static" : "force-dynamic"',
        "export default function Page() {",
        '  return "first watch" + helper + context.path',
        "}",
        "",
      ].join("\n"),
    )

    await waitFor(() => {
      expect(onRouteGenerated.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    await writeFile(
      join(cwd, "src", "templates", "page.tsx"),
      [
        'import { helper } from "./shared"',
        'export const dynamic = context.enabled ? "force-static" : "force-dynamic"',
        "export default function Page() {",
        '  return "second watch" + helper + context.path',
        "}",
        "",
      ].join("\n"),
    )

    await waitFor(() => {
      expect(onRouteGenerated.mock.calls.length).toBeGreaterThanOrEqual(3)
    })

    expect(onRouteGenerated.mock.calls).toEqual(
      expect.arrayContaining([
        [
          {
            kind: "watch",
            path: "src/pages/index.tsx",
            templatePath: "src/templates/page.tsx",
          },
        ],
      ]),
    )
    expect(error).toHaveBeenCalledWith("formatter failed")
  })
})
