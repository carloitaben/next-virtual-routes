import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { generateRoutes, route, withRoutes } from "./index"

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

afterEach(async () => {
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
        version: "0.0.0",
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
        version: "0.0.0",
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
})
