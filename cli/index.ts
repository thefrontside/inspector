#!/usr/bin/env node
import {
  type Operation,
  each,
  main,
  resource,
  sleep,
  spawn,
  suspend,
  until,
  withResolvers,
} from "effection";
import { inspector, type ProtocolCommandConfig, config, type RunConfig } from "./config.ts";
import { exec, type Process } from "@effectionx/process";
import process from "node:process";
import { writeFile } from "node:fs/promises";
import { createSSEClient } from "../lib/sse-client.ts";
import { useSSEServer } from "../lib/sse-server.ts";
import { log } from "./logger.ts";
import { resolveRuntime, buildProcessOptions } from "./build-run-args.ts";

function runProgram(config: RunConfig, passthroughArgs: string[]) {
  return resource<number | undefined>(function* (provide) {
    let child: Process;
    try {
      let runtime = resolveRuntime(config);
      let host = `http://localhost:${config.inspectPort}`;

      let processOptions = buildProcessOptions(runtime, config, passthroughArgs);

      let ready = withResolvers<void>();
      let childSpawned = withResolvers<void>();
      yield* spawn(function* () {
        yield* ready.operation;
        if (config.inspectRecord) {
          yield* recordNodeMapToFile(host, config.inspectRecord);
        }
      });

      yield* spawn(function* () {
        yield* childSpawned.operation;
        console.log(`started program with PID ${child.pid}, waiting for inspector to be ready...`);
        for (let chunk of yield* each(child.stdout)) {
          yield* log.info(chunk.toString());
          yield* each.next();
        }
      });

      yield* spawn(function* () {
        yield* childSpawned.operation;
        for (let chunk of yield* each(child.stderr)) {
          if (chunk.toString().includes("effection inspector")) {
            ready.resolve();
          }
          yield* log.error(chunk.toString());
          yield* each.next();
        }
      });

      child = yield* exec(runtime, processOptions);
      childSpawned.resolve();

      yield* spawn(function* () {
        yield* sleep(15000);
        ready.reject(new Error("timeout waiting for program to start"));
      });

      let status = yield* child.join();

      yield* provide(status.code);
    } finally {
      // runProgram() exiting
    }
  });
}

function* recordNodeMapToFile(host: string, filePath: string): Operation<void> {
  let handle = createSSEClient(inspector, { url: host });
  let values: unknown[] = [];
  try {
    let subscription = yield* handle.invoke({ name: "recordNodeMap", args: [] });

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

function* callMethod(config: ProtocolCommandConfig) {
  const {
    name,
    config: { out, host },
  } = config;
  const argsList = [] as never[];
  const handle = createSSEClient(inspector, { url: host });
  if (!(name in handle.protocol.methods)) {
    yield* log.error(`unknown command: ${name}`);
  }
  let results: unknown[] = [];
  let subscription = yield* handle.invoke({
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

await main(function* () {
  try {
    const parser = config.createParser({
      args: process.argv.slice(2).filter((arg) => arg !== "--"),
      envs: [{ name: "ENV", value: process.env as Record<string, string> }],
    });

    switch (parser.type) {
      case "help":
      case "version":
        yield* log.info(parser.print());
        break;
      case "main": {
        const result = parser.parse();
        if (result.ok) {
          let { value: command, remainder } = result;
          switch (command.name) {
            case "help":
              yield* log.info(command.config.text);
              break;
            case "ui": {
              let port = 41000;
              let address = yield* useSSEServer({ protocol: { methods: {} } } as any, { port });
              yield* log.info(`serving inspector UI at ${address}`);
              yield* suspend();
              break;
            }
            case "call":
              yield* callMethod(command.config);
              break;
            case "run":
              yield* runProgram(command.config, remainder.args ?? []);
              break;
            default:
              // An exhaustiveness check using 'never' can be added here
              const _exhaustiveCheck: never = command;
              break;
          }
        } else {
          yield* log.error(result.error.message);
        }
        break;
      }
      default:
        // An exhaustiveness check using 'never' can be added here
        const _exhaustiveCheck: never = parser;
        break;
    }
  } finally {
    // "inspector exiting"
  }
});
