# Design

## Context

`package.json` installs `loop`, its adapters and `loop-jail` into the same npm bin directory. `src/config.ts` already resolves bare commands through PATH, and `src/step.ts` passes that environment to workers. The missing piece is making the launch directory available when `loop` is invoked by path from a shell that lacks that directory on PATH.

A local Node probe confirmed that `process.argv[1]` keeps the invoked symlink path while `import.meta.url` names its package target. The former identifies the directory containing npm's sibling command links.

## Goals / Non-Goals

**Goal:** Make sibling installed commands available through normal executable lookup.

**Non-goals:** Finding arbitrary installations, repairing shell profiles, changing PATH precedence, bundling external tools or changing sandbox configuration.

## Decisions

In CLI startup, before command dispatch and role resolution, append the absolute directory containing `process.argv[1]` to `process.env.PATH`. Preserve existing PATH entries in their original order. If PATH is unset, use the launch directory alone. Derive the directory from the invoked path, without resolving its symlink to the JavaScript module. Use this process environment for the existing controller and workers.

Leave `src/config.ts`, `src/step.ts` and `src/jail.ts` unchanged. Bare nested adapter names still reach ai-jail, so its documented `[commands.loop-opencode]` tables keep matching. Its existing maps, credential sharing and reply relay remain in use. The directory is appended rather than prepended so existing PATH selections keep precedence.

Add a CLI regression using the existing repository fixture: put a `loop` symlink beside its stub worker and OpenSpec commands, launch it by path with that directory omitted from PATH, and verify successful worker execution from a linked worktree. Add an earlier-PATH command to verify that existing precedence remains. Keep the existing jail tests for unchanged wrapper behavior; do not create another package or sandbox test framework.

## Risks / Trade-offs

- Direct execution of a source file supplies its source directory rather than an npm bin directory. Developer invocations still need their intended external commands on PATH; do not search for an npm prefix.
- The caller must be able to launch Node and provide external prerequisites. This change only makes sibling installed commands discoverable.

## Cut Pass

Removed the package-command resolver, manifest lookup, bundled-name precedence rule, separate wrapper resolution, package-root mapping, configuration migration, relocated-package fixture and their tasks. They are unnecessary when the existing command links are available through PATH. No runtime options, state fields or persistent records are added.

| Kept item | Serves | Simpler alternative and failure |
| --- | --- | --- |
| Append launch directory to PATH | CLI launch directory requirement | Inheriting PATH alone leaves sibling commands unavailable in the reported case. |
| Use the invoked path | CLI launch directory requirement | Resolving its symlink selects `dist/src` instead of the directory containing installed command links. |
| Append after existing entries | CLI launch directory requirement | Prepending changes which existing custom commands run. |
| Existing role lookup and worker environment | CLI launch directory requirement | Reuse them directly; a separate resolver or environment layer adds no required behavior. |
| Missing-directory regression | CLI launch directory requirement | Existing fixtures put worker commands on PATH and do not reproduce the failure. |
| PATH precedence regression | CLI launch directory requirement | A success-only test could allow the new directory to displace existing commands. |
| Task 1.1: CLI edit and focused tests | CLI launch directory requirement | Omitting the edit leaves the failure; the focused tests establish lookup and precedence. |
| Task 1.2: README update | User's installation-operability request | Omitting it leaves the launch behavior and external prerequisites unexplained. |
| Task 2.1: repository and spec checks | Repository's required check; native OpenSpec workflow | Focused tests alone miss package integration and artifact errors. |
