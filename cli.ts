#!/usr/bin/env node
import { type Operation, each, main, sleep, spawn, suspend, until } from "effection";
import type { Program } from "configliere";
import { config, inspector, type ProtocolCommands } from "./config.ts";
import { createApi } from "@effectionx/context-api";
import { exec } from "@effectionx/process";
import { writeFile } from "node:fs/promises";
import { createSSEClient } from "./lib/sse-client.ts";
import { useSSEServer } from "./lib/sse-server.ts";

interface Logger {
  info(message: string | object): Operation<void>;
  error(message: string | object): Operation<void>;
  debug(message: string): Operation<void>;
}

const loggerApi = createApi<Logger>("inspector.logger", {
  *info(message) {
    console.log(message);
  },
  *error(message) {
    console.error(message);
  },
  *debug(message) {
    console.debug(message);
  },
} satisfies Logger);
const log = loggerApi.operations;

export { loggerApi }; // exported for use in tests

interface RunConfig {
  inspectPause: boolean;
  inspectRecord: string | undefined;
  host: string;
}

function hasInspectorImport(args: string[]): boolean {
  for (let index = 0; index < args.length; index++) {
    let arg = args[index];
    if (arg === "--import" && args[index + 1] === "@effectionx/inspector") {
      return true;
    }
    if (arg.startsWith("--import=") && arg.slice("--import=".length) === "@effectionx/inspector") {
      return true;
    }
  }
  return false;
}

export function buildNodeArguments(config: RunConfig, passthroughArgs: string[]): string[] {
  let normalizedArgs = passthroughArgs[0] === "--" ? passthroughArgs.slice(1) : passthroughArgs;

  let runtimeArgs = config.inspectPause ? ["--suspend"] : [];

  let importArgs = hasInspectorImport(normalizedArgs) ? [] : ["--import", "@effectionx/inspector"];

  return [...importArgs, ...normalizedArgs, ...runtimeArgs];
}

export function* invokeWithRetry(name: "watchScopes" | "recordNodeMap", host: string) {
  let handle = createSSEClient(inspector, { url: host });
  let cause: unknown;

  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      return yield* handle.invoke({ name, args: [] });
    } catch (error) {
      cause = error;
      yield* sleep(25);
    }
  }

  throw cause instanceof Error ? cause : new Error("failed to connect to inspector SSE server");
}

function* runProgram(config: RunConfig, passthroughArgs: string[]): Operation<number> {
  let args = buildNodeArguments(config, passthroughArgs);
  let host = config.host;

  let recordTask = config.inspectRecord
    ? yield* spawn(() => recordNodeMapToFile(host, config.inspectRecord!))
    : undefined;

  let child = yield* exec("node", { arguments: args });

  yield* spawn(function* () {
    for (let chunk of yield* each(child.stdout)) {
      yield* log.info(chunk.toString());
      yield* each.next();
    }
  });

  yield* spawn(function* () {
    for (let chunk of yield* each(child.stderr)) {
      yield* log.error(chunk.toString());
      yield* each.next();
    }
  });

  let status = yield* child.join();

  if (recordTask) {
    yield* recordTask;
  }

  return status.code ?? 1;
}

function* recordNodeMapToFile(host: string, filePath: string): Operation<void> {
  let values: unknown[] = [];
  try {
    let subscription = yield* invokeWithRetry("recordNodeMap", host);

    let next = yield* subscription.next();
    while (!next.done) {
      values.push(next.value);
      next = yield* subscription.next();
    }
  } catch (error) {
    let message = error instanceof Error ? error.message : String(error);
    yield* log.error(`failed to record NodeMap: ${message}`);
  } finally {
    // always attempt to write whatever we have collected (possibly empty)
    yield* until(writeFile(filePath, JSON.stringify(values, null, 2)));
  }
}

function* callMethod(config: Program<ProtocolCommands>) {
  const {
    name,
    // @ts-expect-error types presume config is boolean
    config: { out, host },
  } = config;
  const argsList = [] as never[];
  const handle = createSSEClient(inspector, { url: host });
  if (!(name in handle.protocol.methods)) {
    yield* log.error(`unknown command: ${name}`);
    return 1;
  }
  let results: unknown[] = [];
  let subscription = yield* handle.invoke({
    // @ts-expect-error TODO still not refined enough, only a string
    name,
    args: argsList,
  });
  let next = yield* subscription.next();
  // log progress values and collect everything, including final return
  while (!next.done) {
    results.push(next.value);
    yield* log.info(JSON.stringify(next.value));
    next = yield* subscription.next();
  }

  if (out) {
    try {
      yield* until(writeFile(out, JSON.stringify(results, null, 2)));
    } catch (e) {
      let msg = e instanceof Error ? e.message : String(e);
      yield* log.error(`failed to write ${out}: ${msg}`);
    }
  }
}

// return values represent process exit codes for use in testing
export function* cliOp(argv: string[]): Operation<number> {
  let parser = config.createParser({
    args: argv,
    envs: [{ name: "ENV", value: process.env as Record<string, string> }],
  });

  switch (parser.type) {
    case "help":
    case "version":
      yield* log.info(parser.print());
      return 0;
    case "main": {
      let result = parser.parse();
      if (result.ok) {
        let { value: command, remainder } = result;
        switch (command.name) {
          case "help":
            yield* log.info(command.config.text);
            return 0;
          case "ui": {
            let port = 41000;
            let address = yield* useSSEServer({ protocol: { methods: {} } } as any, { port });
            yield* log.info(`serving inspector UI at ${address}`);
            yield* suspend();
            return 0;
          }
          case "call":
            // @ts-expect-error TODO what type should this actually be?
            yield* callMethod(command.config);
            return 0;
          case "run":
            yield* runProgram(command.config, remainder.args ?? []);
            return 0;
        }
      } else {
        yield* log.error(result.error.message);
        return 1;
      }
    }
  }
}

// when executed as a script we delegate directly to Effection's `main`
// which allows the code above to be imported for testing
if (import.meta.url === `file://${process.argv[1]}`) {
  await main(function* (args) {
    yield* cliOp(args);
  });
}
