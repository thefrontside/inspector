#!/usr/bin/env node
import { type Operation, each, main, sleep, spawn, suspend, until } from "effection";
import type { Program } from "configliere";
import { config, inspector, type ProtocolCommands } from "./config.ts";
import { exec } from "@effectionx/process";
import { writeFile } from "node:fs/promises";
import { createSSEClient } from "../lib/sse-client.ts";
import { useSSEServer } from "../lib/sse-server.ts";
import { log } from "./logger.ts";
import {
  type RunConfig,
  buildRuntimeArguments,
  buildRunEnvironment,
  resolveRuntime,
} from "./build-run-args.ts";

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
  let runtime = resolveRuntime(config);
  let args = buildRuntimeArguments(config, passthroughArgs);
  let host = config.inspectHost;

  let recordTask = config.inspectRecord
    ? yield* spawn(() => recordNodeMapToFile(host, config.inspectRecord!))
    : undefined;

  let commandArgs = args;
  let env = buildRunEnvironment(config);

  let child = yield* exec(runtime, { arguments: commandArgs, env });

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
