# Architecture

This document explains the current rewrite architecture of `next-virtual-routes`, the main design decisions behind it, and the tradeoffs the package currently makes.

## Goals

- Keep the public API plain TypeScript and Promise-based.
- Use Effect 4 for internal orchestration, validation, resource management, and lifecycle.
- Treat route paths as direct output paths instead of inferring router roots.
- Support both App Router and Pages Router by generating files wherever the user points the DSL.
- Fail early on invalid config.
- Keep the template transform conservative: fold what is safe, inject runtime `context` when needed.
- Accept arbitrary output/template file names, but only run the code transform pipeline for code-like files.

## Public Surface

The public entrypoint is `src/index.ts`.

It exposes two kinds of APIs:

- Authoring helpers from `src/lib.ts`
  - `route(path, template, context?)`
  - `prefix(pathPrefix, ...children)`
  - `context(value, ...children)`
- Next integration from `src/plugin.ts`
  - `generateRoutes(input)`
  - `withRoutes(routes)(nextConfig)`

Effect types do not cross the public boundary.

## High-Level Structure

The package is split by responsibility:

- `src/lib.ts`
  - Public DSL and `Context` declaration-merging contract.
- `src/plugin.ts`
  - Thin boundary that resolves config, runs generation, manages the watch runtime, and maps internal failures to plain `Error`s.
- `src/domain/`
  - Pure planning and validation-adjacent logic.
- `src/transform/`
  - Template parsing, partial static evaluation, import rewriting, and conditional context injection.
- `src/runtime/`
  - Effect services, layers, generation program, cleanup, locking, and watching.

This split is intentional: the more logic we can keep pure, the easier it is to test and evolve without coupling everything to Effect.

## Public DSL

`src/lib.ts` is intentionally small.

### `route`

`route(path, template, context?)` defines one generated file.

- `path` is the final output path relative to `cwd`.
- `template` is the source template path relative to `cwd`.
- `context` is optional data exposed to the template through the global `context` variable.

The important design choice here is that `path` is not router-relative. The user writes the final destination directly:

- App Router: `src/app/blog/page.tsx`
- Pages Router: `src/pages/blog.tsx`

That keeps the core router-agnostic.

### `prefix`

`prefix(pathPrefix, ...children)` is only a composition helper.

- It flattens nested route groups.
- It joins the prefix with each child path.
- It does not encode router semantics.

### `context`

`context(value, ...children)` deep-merges parent and child context using `ts-deepmerge`.

This preserves the old ergonomic idea while keeping the implementation small.

### `Context`

`Context` remains declaration-mergable so consumers can type template context without the library exporting any runtime schema to users.

## Config Boundary

`src/domain/config.ts` is the public input boundary.

It accepts either:

- an object with `routes` and extra options

Supported options today:

- `routes`
- `banner`
- `footer`
- `cwd`
- `lockFile`
- `remove`
- `watch`

### Why Effect Schema

Config is validated with Effect Schema before any filesystem work starts.

That gives us:

- one normalization path
- early failure
- consistent defaults
- a clean place to tighten validation later

Current validation verifies config shape and checks that route `context` values are serializable by the generator.

### Defaults

Current defaults:

- `cwd`: `process.cwd()`
- `banner`: `""`
- `footer`: `""`
- `lockFile`: `.next/next-virtual-routes/lock`
- logging: derived from `DEBUG`
- `remove`: `[]`
- `watch`: enabled only in local development, disabled in CI

## Planning Model

`src/domain/plan.ts` turns resolved config into a pure route plan.

Each `PlannedRoute` includes:

- absolute template path
- absolute output path
- original output path
- template path
- final route context

### Direct Output Paths

The route plan does not resolve `app` or `pages` roots.

Instead, it treats every route path as the output contract. This was a deliberate design decision:

- avoids App Router assumptions in the core
- makes Pages Router support natural
- makes generated paths explicit in user config
- simplifies prefixing and examples

### Duplicate Detection

Duplicate generated destinations are rejected during planning.

This happens before generation, so path conflicts in user config fail deterministically.

### Automatic `context.path`

Every planned route injects `path` into the final context.

That supports patterns like the serializer example, where templates need to recover richer runtime data from a user-owned registry.

This is a design choice: `context.path` is treated as reserved, library-generated metadata.

## File Classification

Route and template paths are intentionally broad now.

- users can generate code files
- users can generate assets like `robots.txt` or `favicon.ico`
- the transform pipeline only runs for code-like source/output pairs

Non-code templates are copied through without import rewriting, static folding, or context injection.

## Transform Pipeline

The transform entrypoint is `src/transform/pipeline.ts`.

The pipeline is:

1. Parse the template module.
2. Rewrite relative imports for the generated file location.
3. Check whether the template actually references the global `context`.
4. If it does, try to statically fold safe named export initializers.
5. Reparse the transformed source.
6. If runtime `context` references still remain, inject `const context = ...` after any directive prologue.
7. Apply banner and footer.

### Parsing and Scope Analysis

- Parsing uses Acorn with the TypeScript plugin.
- Global `context` detection uses `periscopic`.

That matters because we only want to react to real global `context` usage, not shadowed locals.

### Relative Import Rewriting

`src/transform/rewrite-imports.ts` rewrites relative specifiers based on the move from template path to output path.

Rules:

- only rewrite relative imports
- leave aliases and package imports untouched
- preserve extensionless imports
- preserve explicit extensions when present

This is one of the major rewrite improvements over the old implementation, which relied on users preferring aliases to avoid broken relative imports.

### Static Folding

`src/transform/evaluate.ts` contains a small partial evaluator.

It is intentionally not a general JS evaluator.

It currently handles a useful subset of expressions such as:

- literals
- arrays and objects
- member access
- conditionals
- logical expressions
- template literals
- unary and binary expressions

The key constraint is that folding is conservative. If evaluation is not clearly safe, the transform leaves the original code in place.

### Why Only Named Export Folding

Static folding currently targets named export initializers.

This keeps the rewrite focused on the cases that matter most for Next route metadata, such as route segment config, while avoiding a much riskier whole-module evaluation strategy.

### Runtime Context Injection

If transformed code still references the global `context`, the pipeline injects:

```ts
const context = { ... }
```

This gives templates a runtime fallback while still allowing partial compile-time specialization.

Important detail: injection is directive-aware. `"use client"` and `"use server"` stay at the top of the file.

### Banner and Footer

Banner and footer are plain strings and are applied last.

They are treated as source decoration, not part of evaluation.

## Runtime Architecture

The runtime lives in `src/runtime/`.

### Services and Layers

`src/runtime/services.ts` defines a small custom `GlobService`.

`src/runtime/layers.ts` builds the live runtime by merging:

- Node services from `@effect/platform-node`
- the custom glob service

The goal is to delegate as much as possible to Effect and `@effect/platform`, while keeping non-Effect dependencies narrow and explicit.

### Generation Program

`generateRoutesProgram` in `src/runtime/programs.ts` is the one-shot generation workflow.

It does this in order:

1. acquire the physical lockfile
2. run cleanup globs
3. generate each planned route
4. return the list of generated paths

Each route generation step:

1. checks for output collisions
2. checks that the template exists
3. reads the template
4. transforms it
5. creates parent directories
6. writes the output file

### Collision Policy

If an output path already exists and was not created by the current run, generation warns and skips it.

This is a safety choice. The generator should not overwrite user-owned files silently.

## Cleanup Model

Cleanup is user-owned.

The `remove` option is a list of glob patterns resolved from `cwd`, expanded with `fast-glob`, and deleted before generation.

This is intentionally simple:

- the library does not try to infer ownership
- the user chooses what is safe to delete
- the system stays predictable and pure

Tradeoff: broad globs are dangerous. Docs and examples should encourage generated-only subtrees.

## Logging

The rewrite no longer exposes a `log` config flag.

Instead, logging is derived from `DEBUG`.

Current simple behavior:

- `DEBUG=true`
- `DEBUG=1`
- `DEBUG=*`
- `DEBUG=next-virtual-routes`

all enable package logs.

## Locking

Generation and watch mode use a physical lockfile.

Default path:

- `.next/next-virtual-routes/lock`

The lock contains:

- `pid`
- `cwd`
- `startedAt`
- `version`

### Why a Physical Lockfile

Effect concurrency primitives help inside a process, but they do not protect against multiple Next/plugin processes.

The lockfile is meant to prevent cross-process races around cleanup and generation.

### Stale Lock Recovery

If a lock already exists:

- the library reads its metadata
- checks whether the PID is still alive
- removes the lock if the PID is gone
- otherwise fails early with a clear error

This avoids timeout heuristics and keeps crash recovery automatic.

## Watch Architecture

Watch mode is built around two pieces:

- `watchRoutesProgram` in `src/runtime/programs.ts`
- watcher lifecycle management in `src/plugin.ts`

### In-Process Watch Flow

The watch program:

- watches `cwd`
- maps filesystem events to candidate template paths
- looks up affected routes from a template index
- regenerates matched routes

### Serialization of Rebuilds

A `Semaphore(1)` prevents overlapping regenerations within the watcher.

This keeps rebuilds simple and avoids concurrent writes from bursts of file events.

### Single Active Watcher

`src/plugin.ts` stores one active watcher keyed by a config fingerprint.

When config changes:

- the previous watcher is interrupted
- the managed runtime is disposed
- a new watcher is started

This prevents duplicate long-lived watchers during repeated Next config evaluation.

### Why ManagedRuntime

The watcher is long-lived and scoped. `ManagedRuntime` gives the plugin a clean boundary to:

- start a background fiber
- keep its environment alive
- interrupt it later
- dispose resources deterministically

## Why Effect Is Internal Only

Effect is used for:

- config validation
- typed failures
- resource-safe locking
- filesystem/runtime access
- watch lifecycle
- concurrency control

It is not exposed publicly because the library is a Next plugin first, not an Effect-first framework.

Users should be able to adopt it without changing their app architecture.

## Routing Patterns Supported by Design

The architecture is intentionally router-agnostic at the path level.

That means these are just configuration choices, not different subsystems:

- App Router outputs under `app/` or `src/app/`
- Pages Router outputs under `pages/` or `src/pages/`
- route groups
- dynamic segments
- localized trees
- serializer-assisted runtime metadata lookup

Examples currently cover:

- basic generation
- prefix composition
- i18n with declaration-merged context
- serializer-style `context.path` usage
- pages router generation

## Design Decisions Summary

### Direct output paths over inferred router roots

Chosen because it is simpler, more explicit, and router-agnostic.

### Effect at the boundary, pure logic in the middle

Chosen to keep testing and reasoning simple while still getting strong runtime/resource semantics.

### Conservative transform, runtime fallback when needed

Chosen to avoid incorrect rewrites while still specializing common metadata exports.

### User-owned cleanup globs

Chosen to avoid hidden ownership tracking and make deletion policy explicit.

### No formatter in v1

Chosen to keep the rewrite focused on correctness, architecture, and generation semantics first.

## Current Limitations

- Formatter support is intentionally omitted.
- Static evaluation only supports a subset of JavaScript/TypeScript syntax.
- Static folding is limited to named export initializers.
- Watch mode reacts to template file changes, not arbitrary dependencies of route config functions.
- Cleanup is powerful but entirely user-directed.
- The public README still needs to be aligned with the new curried plugin API and current feature set.
- Lock metadata currently uses a placeholder package version.

## Follow-Ups

Likely next areas of work:

- update the package README to match the new API
- document config and example usage more thoroughly
- improve watch-time error isolation
- expand evaluator coverage carefully where it unlocks real Next metadata use cases
- revisit formatter support after the core rewrite stabilizes
- do the deferred dependency audit against Effect/platform and Next-adjacent packages
