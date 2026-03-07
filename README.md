# inspector

Helpers to inspect an effection tree. These utilities can be used through `npx` or similar or installed as a dev dependency.

## Running

When the package is installed as a dev dependency the binary is available in
`node_modules/.bin/inspector`; you can also invoke it directly with npx:

```bash
npx @effectionx/inspector [options] <command> [args]
# or when installed as a dev dependency
inspector [options] <command> [args]
```

Use `npx @effectionx/inspector help` to explore available commands. Typically you will run to inspector in "live" mode or "record" more.

These raw `call` commands mirror the behaviour of the HTTP routes produced by the same code that powers the SSE server (see `lib/sse-server.ts`).

### Live

Start your application with the inspector loader so it runs alongside your app.

```shell
# generate a recording, but also pause
inspector --inspect-pause --experimental-strip-types program.ts
```

When started directly with the loader, the inspector will launch a small SSE server (default port: 41000) and serve the UI at `http://localhost:41000`. You will need to "play" or continue execution of your program when you use `--inspect-pause`. This gives you time to load the UI, and press the play button or issue the "play" call, e.g. `npx @effectionx/inspector call play`.

Under the hood, it is running your program with the following.

Node:

```bash
node --import @effectionx/inspector ./your-app.js --suspend
```

Deno:

```bash
deno run --preload npm:@effectionx/inspector ./your-app.ts --suspend
```

### Recording ✅

The UI supports loading saved recordings useful for review and sharing. From the Home screen click `Load Recording` > `Browse files` and choose the `.json` or `.effection` file. A recording is a JSON array of NodeMap snapshots. The inspector accepts `.json` and `.effection` files.

#### Creating a recording from a live session:

You can capture the SSE stream from a running inspector and save the emitted data. It is run similarly with an additional `--inspect-record` argument.

```shell
# generate a recording, but also pause
inspector --inspect-record=output.json --experimental-strip-types program.ts
```

If you started the inspected process with `--inspect-pause`, click the play button or issue the "play" call, e.g. `npx @effectionx/inspector call play`.

## CLI Examples

```bash
# query the default server
inspector call getScopes

# record output
inspector call watchScopes --out=events.json

# use the alias
inspector c recordNodeMap

# inspect and run a node script (default command)
inspector program.js

# pass through node flags
inspector --experimental-strip-types program.ts
inspector --import=tsx program.ts

# generate a recording, but also pause
inspector --inspect-pause --inspect-record=recording.inspector.json --import=tsx program.ts
# generate a recording, but begin execution immediately
inspector --inspect-record=recording.inspector.json --import=tsx program.ts
```

## Contributing

See [the Contributing Guide](CONTRIBUTING.md).
