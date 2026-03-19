# Dependencies

This file is the review artifact for dependency cleanup after the Effect 4 rewrite.

Goal: make `package.json` reflect the current `src/**` implementation, not legacy `old/` / `wip/` code.

## Principles

- Prefer Effect and `@effect/platform-node` for runtime orchestration.
- Keep third-party runtime deps narrow and justified.
- Align with Next.js where it helps, but do not couple to Next internals.
- Do not keep legacy deps just because `old/` or `wip/` still imports them.

## Current Runtime Dependencies

| Package                 | Status                   | Why                                                                         |
| ----------------------- | ------------------------ | --------------------------------------------------------------------------- |
| `effect`                | keep                     | Core runtime, schema validation, tagged errors, locking/watch orchestration |
| `@effect/platform-node` | keep                     | Node services layer for fs/path/watch/runtime                               |
| `fast-glob`             | keep for now             | Used only for cleanup glob expansion behind `GlobService`                   |
| `magic-string`          | keep                     | Good fit for small source-to-source rewrites                                |
| `acorn`                 | keep for now             | Current parser base for template analysis                                   |
| `acorn-typescript`      | keep for now             | TS parsing support for templates                                            |
| `periscopic`            | keep for now             | Free/global `context` detection                                             |
| `zimmerframe`           | keep for now             | Small AST walker for transform passes                                       |
| `ts-deepmerge`          | keep for now             | Only used by `context()` helper                                             |
| `next`                  | move out of runtime deps | Current `src/**` only imports `NextConfig` as a type                        |

## Runtime Dependencies To Remove Soon

These do not belong to the rewritten package surface.

| Package                | Why remove                                       |
| ---------------------- | ------------------------------------------------ |
| `@effect/platform-bun` | Rewrite runtime is Node-only                     |
| `chokidar`             | Old watcher leftover                             |
| `debug`                | Old logging leftover                             |
| `fs-extra`             | Old fs helper leftover                           |
| `prettier`             | Formatter support is intentionally omitted in v1 |
| `valibot`              | Unused after moving to Effect Schema             |

## Current Dev Dependencies

| Package          | Status                | Why                                                  |
| ---------------- | --------------------- | ---------------------------------------------------- |
| `vitest`         | keep                  | Active tests                                         |
| `typescript`     | keep                  | Typecheck and package build inputs                   |
| `tsdown`         | keep                  | Package build                                        |
| `tsdoc-markdown` | keep                  | Existing docs/build tooling                          |
| `@types/node`    | keep                  | Node builtin typing                                  |
| `@types/estree`  | keep                  | ESTree typing for current parser stack               |
| `@swc/core`      | evaluate in next pass | Candidate parser stack replacement, currently unused |

## Dev Dependencies To Remove Soon

| Package           | Why remove |
| ----------------- | ---------- |
| `@effect/vitest`  | WIP-only   |
| `memfs`           | WIP-only   |
| `@types/debug`    | Old-only   |
| `@types/fs-extra` | Old-only   |

## Peer Dependencies

Current peer shape should be revisited.

### `next`

Keep `next` as a peer dependency.

Reason:

- this package is a Next plugin
- consumers are expected to already have Next installed
- current public code only uses `NextConfig` as a type, so `next` should not also be a hard runtime dependency

### `prettier`

Drop `prettier` as a peer unless formatter support returns.

Current rewrite has no formatter stage.

### `typescript`

Reasonable to keep as a peer if the package intends to support declaration merging and TS-first config ergonomics, but this should be reviewed along with install UX.

## Why The Current Stack Is Acceptable Now

The rewrite currently uses:

- Effect for config validation, services, locking, watch lifecycle
- Acorn-based parsing for transform work
- `magic-string` for patching source text

This is a good short-term balance:

- small enough to understand
- already working with the current fixture set
- conservative transform behavior
- low migration risk while the rewrite stabilizes

## SWC Evaluation

## Why SWC Is Attractive

SWC is worth evaluating because:

- Next.js uses SWC heavily
- TS/JSX parsing coverage is likely better long-term
- it may reduce parser-stack fragmentation if the transform grows more ambitious

## Why Not Use Next-Bundled SWC

Do not rely on the SWC bundled inside Next.

Reasons:

- it is not a stable public contract for this package
- it couples this package to Next internals and install layout
- version skew becomes hard to reason about
- this package should remain independently testable and packageable

If SWC is adopted, depend on `@swc/core` directly.

## Recommended SWC Plan

Treat SWC as the next bounded spike, not as an assumption.

The spike should prove parity for:

- module parsing of TS/JSX templates
- detection of free/global `context` references
- relative import/export specifier rewriting
- current static-folding targets for named exports

Success criteria:

- same behavior on the current transform tests
- no loss in correctness for route metadata folding
- no fragile coupling to Next internals
- simpler or more maintainable transform code than the current Acorn stack

If SWC cannot replace scope analysis cleanly, it should stay a parser-only experiment first.

## Recommended Cleanup Order

1. Document decisions here.
2. Remove clearly stale old/wip dependencies.
3. Move `next` out of runtime `dependencies`.
4. Drop `prettier` peer/runtime baggage unless formatter support returns.
5. Re-run typecheck, tests, and build.
6. Start the SWC spike with the existing transform fixtures.

## Files Expected To Change In The Cleanup Pass

- `packages/next-virtual-routes/package.json`
- `packages/next-virtual-routes/README.md`
- maybe `packages/next-virtual-routes/ARCHITECTURE.md`

If the SWC spike proceeds immediately after cleanup, then also:

- `packages/next-virtual-routes/src/transform/parse.ts`
- `packages/next-virtual-routes/src/transform/pipeline.ts`
- `packages/next-virtual-routes/src/transform/rewrite-imports.ts`
- maybe `packages/next-virtual-routes/src/transform/evaluate.ts`

## Open Questions

- Should `ts-deepmerge` stay, or should we inline a tiny local deep-merge helper?
- Should `typescript` remain a peer, or only a dev dependency?
- Can SWC replace both parsing and scope analysis cleanly, or only parsing/walking?
