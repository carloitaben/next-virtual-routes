Rewrite `packages/next-virtual-routes/src/` around a pure domain pipeline with Effect 4 only in internal orchestration.

Goals
- Keep Effect internal. Public API stays plain TS/Promise/Next config.
- First milestone: DSL, transform, generation.
- Include cleanup + watch if they fit cleanly.
- Defer cache.
- Expand transform beyond old behavior: always support runtime `context` injection when needed, fix evaluator bugs, rewrite relative imports based on template->generated destination.
- Remove hardcoded App Router assumptions from core design. Route paths are user-authored output paths.
- Include `pages` router support in v1.
- Validate config with Effect Schema and fail early at the public boundary.
- Keep extra dependencies tight; prefer Effect/platform pieces first, then align any additional packages with what Next.js commonly uses when that reduces risk.

Recommended module layout
- `packages/next-virtual-routes/src/index.ts`
  - Public barrel only.
- `packages/next-virtual-routes/src/lib.ts`
  - `Context`, `Route`, `route`, `prefix`, `context`.
  - Keep declaration merging contract for `Context`.
- `packages/next-virtual-routes/src/plugin.ts`
  - Public `generateRoutes` / curried `withRoutes`.
  - Boundary: normalize user input, run internal runtime, map typed failures to JS errors.
- `packages/next-virtual-routes/src/domain/config.ts`
  - Accept route arrays, sync/async functions, object config.
  - Defaults, validation, path policy, cleanup config normalization.
  - Effect Schema is the source of truth for config decoding.
- `packages/next-virtual-routes/src/domain/plan.ts`
  - Canonical route plan from config.
  - Resolve template path, target path, merged context, metadata.
  - No router-specific root resolution; route path is already the output path contract.
  - Detect duplicate virtual outputs.
- `packages/next-virtual-routes/src/domain/errors.ts`
  - Tagged internal errors for missing template, no app dir, duplicate target, unsafe cleanup, formatter failure, watcher failure.
- `packages/next-virtual-routes/src/transform/parse.ts`
  - Shared parser/scope helpers.
- `packages/next-virtual-routes/src/transform/evaluate.ts`
  - Conservative evaluator for static export folding.
  - Fix old template literal bug.
- `packages/next-virtual-routes/src/transform/rewrite-imports.ts`
  - Rewrite relative specifiers from generated file location.
  - Leave aliases/package specifiers untouched.
- `packages/next-virtual-routes/src/transform/inject-context.ts`
  - Inject serialized `context` only if still referenced after folding.
- `packages/next-virtual-routes/src/transform/pipeline.ts`
  - Full transform order + banner/footer.
- `packages/next-virtual-routes/src/runtime/services.ts`
  - Internal service defs for fs, path, glob, logger, formatter runner, watch.
- `packages/next-virtual-routes/src/runtime/layers.ts`
  - Node live layers + test layers.
- `packages/next-virtual-routes/src/runtime/programs.ts`
  - Generate / cleanup / watch programs.
- `packages/next-virtual-routes/src/test-support/`
  - Memfs/live fixture helpers.

Execution design
1. Public entry normalizes config shape and decodes it with Effect Schema.
   - Reject invalid config before touching fs/watch/transform.
2. Build route plan:
   - merge nested `context`
   - resolve template absolute path from `cwd`
   - resolve virtual output path directly from user-authored route path
   - derive route metadata like `context.path`
   - infer router-specific validation only when useful for warnings/docs, not path rewriting
4. Validate upfront:
   - missing template = fatal
   - duplicate virtual target = fatal
   - existing real fs route at same project-relative path = warn + skip
   - cleanup patterns must stay inside app dir / generated ownership scope
5. For each planned route:
   - read template
   - transform
   - write generated file
6. Wrap generation in a physical lockfile protocol.
   - acquire lock before cleanup/generation/watch startup
   - fail early with clear message if another generation process holds the lock
   - default lock path under `.next/next-virtual-routes/lock`
   - write metadata like pid, startedAt, cwd, version
   - treat lock as stale if pid is gone; then remove and continue
   - release lock on success/failure via scoped cleanup
7. If watch enabled:
   - keep template->routes index
   - watch relevant template paths/root
   - regenerate affected routes on change
8. `withRoutes(routesOptions)(nextConfig)` follows standard Next plugin style, runs initial generation, then returns enhanced Next config.

Transform pipeline
- Parse template once with TS-capable parser.
- Detect real global `context` refs, not shadowed locals.
- Statically fold safe named export initializers.
- Keep evaluator conservative, but improve coverage for real route-segment use cases.
- Recompute/refind globals after edits.
- Rewrite relative imports:
  - resolve original import relative to template file
  - compute replacement relative to generated destination
  - preserve `./` / `../` semantics and explicit extensions
  - for extensionless relative imports, rewrite only the relative path; keep the specifier extensionless
  - do not touch aliases, packages, or URLs
- Inject `const context = ...` when unresolved `context` remains.
- Keep transform router-agnostic; only route-file conventions / examples differ by target.
- Serialize more carefully than old impl:
  - support JSON-like values reliably
  - preserve `Date` with constructor output
  - document unsupported runtime values; serializer example should still work through identifiers like `context.path`
- Prepend banner, append footer, format last.
- Prepend banner and append footer; no formatter in v1.

Effect 4 usage
- Use Effect only behind `plugin.ts` boundary.
- Pure modules stay plain functions + data.
- Use Effect Schema at input boundaries for config/path validation and defaults.
- Internal runtime uses `ServiceMap.Service` and `Layer.effect`.
- Use scoped resources for lockfile lifecycle and watcher lifecycle.
- Use `ManagedRuntime.make` for long-lived watch lifecycle.
- Public functions return plain `Promise` and never expose `Effect`, `Layer`, services, or typed causes.

Formatter direction
- No formatter support in v1.
- Write transformed source as-is.
- Keep internals open for a later formatter hook without changing the public DSL.

Test plan
- Port old tests around `transform` + evaluator.
- Add missing transform coverage:
  - template literal expressions
  - injected context only when needed
  - no injection when fully folded
  - relative import rewriting from nested outputs
  - serializer example using `context.path`
  - banner/footer behavior
- Add DSL tests:
  - `route`
  - `prefix`
  - nested `context` deep merge
- Add schema tests:
  - accepted config shapes
  - defaults
  - invalid route entries
  - good early failures with actionable messages
- Add planning tests:
  - direct output path handling
  - duplicate virtual outputs
  - collision skip with real routes
  - missing template fatal
  - cleanup safety
- Add integration tests from examples:
  - `examples/basic`
  - `examples/with-prefix`
  - `examples/with-serializer`
  - `examples/i18n`
  - Add `pages` router example + integration coverage.
  - Update existing examples so target dir is explicit.
- Add cleanup tests:
  - glob patterns remove matched files before generation
  - cleanup responsibility stays user-controlled
  - no hidden ownership tracking required
- Add lockfile tests:
  - concurrent generation fails fast when lock exists
  - lock released on success
  - lock released on failure/interruption
  - watch mode does not spawn duplicate generators under same lock policy
- Add watch tests with fake watcher service.

Migration order
1. Lock current/desired behavior with tests from `old/` and `examples/`.
2. Design Effect Schema for config and fail-early error shape.
3. Remove App Router assumptions from plan/config model; make route paths direct output paths.
4. Model any target-specific validations needed for v1, including `pages`.
5. Specify cleanup glob semantics + lockfile protocol.
6. Implement public DSL in `src/lib.ts`.
7. Implement config normalization + route planning.
8. Implement transform pipeline, especially import rewriting + context injection.
9. Implement Effect runtime services + generation program.
10. Wire `generateRoutes`.
11. Wire `withRoutes` + watch + cleanup.
12. Add/update examples, including `pages` router.
13. Refresh docs + TS suggestions after behavior stabilizes.

Backlog worth pulling into rewrite shape
- Stop baking `app` / `src/app` assumptions into generation. Route declarations directly state output paths.
- Replace App Router naming/docs where the core is actually router-agnostic.
- Make examples specify full output paths explicitly.
- Add TypeScript suggestions / helper types around route file paths and config ergonomics.
- Ship `pages` router support and an example in the first milestone.
- Make config validation explicit and documented, with early schema errors.
- Keep cleanup simple and explicit: user-provided glob patterns, delete matches before generation.
- Add physical lockfile protection to avoid concurrent generation races.
- After v1, audit external dependencies and try to replace bespoke libs with Effect/platform or Next-adjacent choices where practical.
- Explicitly defer broad dependency evaluation to a post-v1 audit.

Critical files to modify
- `packages/next-virtual-routes/src/index.ts`
- `packages/next-virtual-routes/src/lib.ts`
- `packages/next-virtual-routes/src/plugin.ts`
- `packages/next-virtual-routes/src/domain/config.ts`
- `packages/next-virtual-routes/src/domain/plan.ts`
- `packages/next-virtual-routes/src/domain/errors.ts`
- `packages/next-virtual-routes/src/transform/parse.ts`
- `packages/next-virtual-routes/src/transform/evaluate.ts`
- `packages/next-virtual-routes/src/transform/rewrite-imports.ts`
- `packages/next-virtual-routes/src/transform/inject-context.ts`
- `packages/next-virtual-routes/src/transform/pipeline.ts`
- `packages/next-virtual-routes/src/runtime/services.ts`
- `packages/next-virtual-routes/src/runtime/layers.ts`
- `packages/next-virtual-routes/src/runtime/programs.ts`
- tests under `packages/next-virtual-routes/src/` or adjacent test dirs

Verification
- Run schema decode tests and assert early failures before fs access.
- Run unit tests for DSL, plan, evaluator, transform.
- Run integration tests against example fixtures and compare generated outputs.
- Run one end-to-end generation per example app.
- Run watch-mode test with fake watcher service.
- Run concurrency test to verify lockfile prevents overlapping runs.
- Manual verify import rewriting by generating into nested route groups and dynamic segments.
- Review final dependency list and justify each non-Effect, non-Next-adjacent package.

Notable risks
- `pages` support changes naming constraints and examples; we need a clean model for target-specific conventions without splitting the core pipeline.
- Cleanup is user-controlled via globs, so docs and validation must make deletion scope obvious.
- Schema defaults and unions need careful design so curried plugin ergonomics stay simple while validation stays strict.
- Cross-platform pid checks and stale lock cleanup need careful implementation.
- Watch lifecycle inside Next dev must avoid duplicate long-lived watchers.
- Over-optimizing for dependency parity with Next too early could slow v1; do a focused dependency audit after the first working rewrite.

Architecture doc plan
- Add a dedicated markdown doc for the rewrite architecture and design decisions at `packages/next-virtual-routes/ARCHITECTURE.md`.
- Cover these sections:
  - Overview: public surface vs internal layers
  - Public API: `route`, `prefix`, `context`, `generateRoutes`, curried `withRoutes`
  - Config boundary: accepted shapes, Effect Schema validation, defaults, fail-early behavior
  - Planning model: direct output paths, duplicate detection, automatic `context.path`
  - Transform pipeline: parse, relative import rewrite, static export folding, conditional context injection, banner/footer
  - Runtime architecture: Effect services/layers, one-shot generation, watch lifecycle, cleanup, lockfile
  - Supported routing patterns: app router, pages router, examples map
  - Design decisions: why Effect stays internal, why route paths are direct output paths, why cleanup is user-owned via globs, why formatter is omitted in v1
  - Current limitations / follow-ups: partial evaluator scope, broad watch scope, stale README/API docs, deferred formatter/dependency audit
- Source the doc from current implementation, not the old README:
  - `packages/next-virtual-routes/src/lib.ts`
  - `packages/next-virtual-routes/src/plugin.ts`
  - `packages/next-virtual-routes/src/domain/config.ts`
  - `packages/next-virtual-routes/src/domain/plan.ts`
  - `packages/next-virtual-routes/src/runtime/programs.ts`
  - `packages/next-virtual-routes/src/transform/pipeline.ts`
  - `examples/basic/next.config.ts`
  - `examples/with-prefix/next.config.ts`
  - `examples/with-serializer/next.config.ts`
  - `examples/i18n/next.config.ts`
  - `examples/pages-router/next.config.ts`
- Keep the doc decision-oriented, not API-reference-heavy; explain why each boundary exists and what tradeoff it encodes.

Verification for architecture doc
- Check the markdown against current code paths and example configs.
- Ensure every public API statement matches current implementation.
- Ensure known limitations are documented explicitly, especially formatter omission and cleanup/watch caveats.

Dependency audit plan
- Goal: tighten `packages/next-virtual-routes/package.json` so published deps match the rewritten `src/**` surface, not `old/` or `wip/` leftovers.
- Document the audit in `packages/next-virtual-routes/DEPS.md` for review before changing dependencies.
- Dependency buckets:
  - Keep now: `effect`, `@effect/platform-node`, `fast-glob`, `acorn`, `acorn-typescript`, `periscopic`, `magic-string`, `zimmerframe`, `ts-deepmerge`
  - Remove soon: `@effect/platform-bun`, `chokidar`, `debug`, `fs-extra`, `prettier`, `valibot`, `@types/debug`, `@types/fs-extra`, `@effect/vitest`, `memfs`
  - Evaluate later: `@swc/core` as a deliberate parser/transform spike only if syntax coverage, perf, or maintenance pain justifies it
- `next` should be treated as peer-first, not a hard runtime dependency, since current rewrite only uses `NextConfig` as a type import.

SWC direction
- Near-term recommendation: keep the current transform stack working while planning an immediate bounded SWC spike as the next follow-up.
- Next-pass goal: evaluate SWC against the current transform fixtures and decide whether to replace the parser stack soon after the dependency cleanup.
- If SWC is adopted later, depend on `@swc/core` directly.
- Do not rely on Next-bundled SWC; that would couple the package to unstable Next internals/versioning and install layout.

SWC spike scope
- Compare the current Acorn stack with an `@swc/core`-based parser/walker path on the existing transform fixtures.
- Check whether SWC can cover:
  - module parsing for TS/JSX templates
  - reliable detection of free/global `context` references
  - import/export specifier rewriting
  - the current conservative static-folding targets
- If scope analysis becomes awkward, keep SWC limited to parsing/walking first and defer full migration until parity is proven.
- Keep Next-bundled SWC out of scope; only evaluate direct `@swc/core` usage.

Files likely to change for dependency audit
- `packages/next-virtual-routes/package.json`
- `packages/next-virtual-routes/DEPS.md`
- `packages/next-virtual-routes/README.md`
- maybe `packages/next-virtual-routes/ARCHITECTURE.md` if parser/dependency rationale is documented there
- `packages/next-virtual-routes/src/transform/**` for the SWC spike if parser migration starts immediately after the cleanup

`DEPS.md` contents
- Current dependency table: package, category, used in `src/**` or only in `old|wip`, recommendation
- Clear split between runtime deps, peer deps, and dev deps
- SWC section:
  - why it is attractive (Next alignment)
  - why Next-bundled SWC should not be relied on
  - what parity the spike must prove before migration
- Explicit note that `DEPS.md` is the review artifact before `package.json` cleanup

Verification for dependency audit
- Compare `package.json` against actual imports in `packages/next-virtual-routes/src/**`.
- Confirm removed packages are not referenced by build/test/runtime entrypoints that still matter.
- Run package typecheck, tests, and build.
- Inspect packaged/runtime dependency surface after cleanup.
- For the SWC spike, run the current transform/plugin test suite against both stacks or an equivalent parity fixture set.

Risks for dependency audit
- Hidden old/wip scripts or unpublished entrypoints may still rely on stale deps.
- Changing `next` dependency policy can affect consumer install UX.
- An SWC migration is not drop-in: AST shape, scope analysis, and rewrite behavior would all need revalidation.

Evaluation matrix from review questions

Do now
- Preserve top-of-file directives during context injection; current prepend strategy is correctness-breaking for `"use client"` / `"use server"`.
- Relax route/template path support to arbitrary file names; classify files before transform and skip the JS/TS pipeline for non-code assets.
- Add explicit context serializability validation at the boundary instead of accepting raw `unknown` and failing late in serialization.
- Move `withRoutes` to object-only config with `routes` as the only required field for autocomplete/discoverability.
- Keep the physical lockfile; Effect concurrency primitives help only in-process and do not replace cross-process locking.
- Make plugin/runtime configuration injectable internally, not as a normal public services API.
- Replace `log` config with `DEBUG`-driven logging: enable logs when `DEBUG` is truthy / includes `next-virtual-routes`.
- Simplify `banner` / `footer` from `string[]` to plain `string`.
- Add virtual-fs-backed generation tests at the runtime-program layer.

Do next, not blocking
- Add runtime/test injection seams, but keep them narrow and internal-first; default to `RuntimeLive`.
- Explore Effect `ConfigProvider` + logger integration for env/debug handling, but likely keep a small repo-owned `DEBUG` adapter rather than expose a `log` option.
- Keep `fast-glob` for now behind the current service boundary unless Node 22+ becomes the floor.
- Plan the bounded SWC spike next, but only after directive-safe injection and file-classification rules are stable.

Avoid / not worth it
- Do not rely on Next-bundled SWC.
- Do not try to replace the physical lock with Effect-only lock APIs.
- Do not overexpose raw internal services in the public plugin API.
- Do not switch to Node built-in glob unless the Node floor is intentionally raised and behavior differences are accepted.

Implementation notes from review
- If context injection moves, it should be directive-aware, not just aesthetically moved to the bottom; free variables are lexically scoped, so naive bottom injection can break references.
- Banner/footer should become plain `string` values; users can join multi-line content themselves.
- Arbitrary file support should split “accepted path” from “transformable code file”.
- Virtual-fs tests fit runtime programs better than current hardwired public plugin entrypoints.
- Public plugin/runtime injection should stay internal or test-only, not a stable user-facing services field.

Concrete follow-up plan from resolved review
- `withRoutes`
  - Make it object-only.
  - Keep `routes` the only required field.
  - Keep `generateRoutes` flexible only if that still buys value; otherwise align both on object config.
- Config boundary
  - Replace `banner?: string[]` / `footer?: string[]` with `banner?: string` / `footer?: string`.
  - Remove `log?: boolean` from public config.
  - Add early `Context` serializability validation in Schema/normalization.
  - Relax route/template path validation to accept arbitrary file names.
- File classification
  - Add a small internal classifier for transformable code files vs raw assets.
  - Run parse/rewrite/eval/injection only for code-like extensions.
  - For non-code assets, copy through unchanged while still generating to the configured output path.
- Logging
  - Derive logging enablement from `DEBUG` env instead of config.
  - Support the simple cases requested: truthy `DEBUG` or `DEBUG=next-virtual-routes` enables logs.
  - Keep namespace logic minimal; no need to emulate full `debug` semantics.
- Runtime injection
  - Refactor plugin/runtime composition so the concrete runtime layer is injectable internally for tests.
  - Keep `RuntimeLive` as the default.
- Transform
  - Preserve directive prologues before banner/context injection.
  - Ensure injected context lands after directives but before the rest of the body.
  - Re-check banner placement relative to directives so banners do not break them.
- Tests
  - Keep current real-fs plugin smoke tests.
  - Add runtime-program tests with injected virtual fs + fake glob service.
  - Reuse ideas from `packages/next-virtual-routes/wip/memfs.ts` only if helpful, but avoid reviving the whole WIP stack unchanged.

Files likely affected by this pass
- `packages/next-virtual-routes/src/plugin.ts`
- `packages/next-virtual-routes/src/domain/config.ts`
- `packages/next-virtual-routes/src/domain/errors.ts`
- `packages/next-virtual-routes/src/domain/plan.ts`
- `packages/next-virtual-routes/src/lib.ts`
- `packages/next-virtual-routes/src/runtime/layers.ts`
- `packages/next-virtual-routes/src/runtime/programs.ts`
- `packages/next-virtual-routes/src/runtime/services.ts`
- `packages/next-virtual-routes/src/transform/inject-context.ts`
- `packages/next-virtual-routes/src/transform/pipeline.ts`
- new internal helper for file classification / serializability if needed
- tests under `packages/next-virtual-routes/src/**/*.test.ts`
- maybe `packages/next-virtual-routes/ARCHITECTURE.md` and `packages/next-virtual-routes/README.md`

Verification for this pass
- Typecheck package.
- Run transform tests, including new directive cases.
- Run plugin smoke tests on real temp dirs.
- Run new runtime-program tests with virtual fs.
- Verify non-code asset generation bypasses the JS/TS transform pipeline.
- Verify `DEBUG` toggles logs without public config.
