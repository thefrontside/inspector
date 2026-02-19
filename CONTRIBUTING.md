# Contributing To The Inspector 🎯

Welcome! This document explains how to get started working on the Inspector.

## Quick start 🚀

### Install deps (from repo root):

```shell
pnpm install
```

### Run the inspector locally:

To just run the UI:

```shell
cd inspector
pnpm start
```

This runs Vite and serves the Crank-based inspector UI. Open http://localhost:5173 (or whatever Vite prints).

To run server with the example file, use"

```shell
node --import tsx --import ./loader.ts examples/example.ts --suspend
```

This will run the loader with an example effection program. It serves both a live stream of data, and also the built files for the UI. If you are working on the UI on the `/live` integration, you may need to use both of these dev servers, and `localhost:5173` appropriately proxies to port `:41000`. If you have run a `pnpm run build`, then you can directly visit http://localhost:41000.

### Checks

- Run tests & checks (from repo root):
  - Run tests: `pnpm test`
  - Run type checks: `pnpm run check`
  - Run linter: `pnpm run lint`
  - Format: `pnpm run fmt`

Note: Some checks (lint/format/test) are run at the monorepo root and cover all workspaces.

## Notes And What Is Where 👀

- Crank generator components are the UI building blocks. Many components are written as generators for render loops. They can own Effection scopes.
- Use shoelace web-components for pre-built "blocks".
- Use CSS Modules per component (`*.module.css`). Avoid placing `class` attributes directly on Shoelace (`sl-*`) elements.
- D3 owns its SVG subtree: components render an `<svg>` that D3 manages directly — avoid mixing Crank DOM updates inside D3-managed nodes.
- If working purely on the UI, the `/demo` page pulls in a static file which is useful for components feature and functionality testing. It shares components with the `/live` and `/recording` pages.
