# inspector

Helpers to inspect an effection tree.

## Running

### Live

Start your application with the inspector loader so it runs alongside your app.

Node:

```bash
node --import @effectionx/inspector ./your-app.js --suspend
```

Deno:

```bash
deno run --preload npm:@effectionx/inspector ./your-app.ts --suspend
```

When started this way the inspector will launch a small SSE server (default port: 41000) and serve the UI at `http://localhost:41000`.

### Recording ✅

The UI supports loading saved recordings useful for review and sharing. From the Home screen click `Load Recording` > `Browse files` and choose a `.json` or `.effection` file. A recording is a JSON array of NodeMap snapshots. The inspector accepts `.json` and `.effection` files.

#### Creating a recording from a live session:

You can capture the SSE stream from a running inspector and save the emitted data. Start by using [the instructions for running the process live](#live).

```bash
# Start capturing and it will close once your effection process closes
curl -sN -X POST http://localhost:41000/recordNodeMap \
  -H "Accept: text/event-stream" -d '[]' \
  | jq -R -s 'split("\n") | map(select(startswith("data: "))) | map(.[6:] | fromjson)' \
  > recording.json
```

If you started the inspected process with `--suspend`, click the red Play button in the inspector header (next to the `live` badge) to resume execution — the UI issues the appropriate POST for you.

If you prefer the command line, the same request can be made manually:

```bash
curl -s -X POST http://localhost:41000/play -H 'Content-Type: application/json' -d '[]'
```

You can also monitor player state with `/watchPlayerState`.

## CLI client

A companion executable (`inspector`) is included in the package.

When the package is installed as a dev dependency the binary is available in
`node_modules/.bin/inspector`; you can also invoke it directly with npx:

```bash
npx @effectionx/inspector [options] <command> [args]
# or when installed as a dev dependency
inspector [options] <command> [args]
```

Top level commands:

- `ui`: start the inspector UI on a local port (default 41000)
- `call`: invoke a protocol method directly. Every protocol method
  is available as a subcommand under `call`. The shorthand `c` is aliased to `call`.
  Additional options may be supplied after the method name, for instance `--out events.json`.
- `run`: a helper for inspecting arbitrary CLI programs (unchanged from previous versions)
- `help`: show this message

Examples:

```bash
# query the default server
inspector call getScopes

# record output
inspector call watchScopes --out=events.json

# use the alias
inspector c recordNodeMap
```

These raw `call` commands mirror the behaviour of the HTTP routes produced by the same code that powers the SSE server (see `lib/sse-server.ts`).

## Contributing

See [the Contributing Guide](CONTRIBUTING.md).
