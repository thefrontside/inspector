import { type Operation, each, resource, sleep, spawn, until, withResolvers } from "effection";
import { exec } from "@effectionx/process";
import { writeFile } from "node:fs/promises";
import { createSSEClient } from "../../lib/sse-client.ts";
import { log } from "../logger.ts";
import { resolveRuntime, buildProcessOptions } from "./build-run-args.ts";
import type { Protocol } from "../../lib/types.ts";
import type { CommandType } from "configliere";
import type { Program } from "../config.ts";

// We need better helper types to destructure config
export type RunType = Extract<CommandType<ReturnType<Program>, "run">, { help?: false }>;

export function run(config: RunType["config"], passthroughArgs: string[]) {
  return resource<number | undefined>(function* (provide) {
    try {
      let runtime = resolveRuntime(config);
      let host = `http://localhost:${config.inspectPort}`;

      let processOptions = buildProcessOptions(runtime, config, passthroughArgs);

      let ready = withResolvers<void>();
      let childSpawned = withResolvers<void>();

      yield* spawn(function* () {
        yield* childSpawned.operation;
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

      const recordTask = yield* spawn(function* () {
        yield* ready.operation;
        if (config.inspectRecord) {
          yield* recordNodeMapToFile(host, config.inspectRecord, config.protocol);
        }
      });
      let child = yield* exec(runtime, processOptions);
      childSpawned.resolve();

      yield* spawn(function* () {
        yield* sleep(15000);
        ready.reject(new Error("timeout waiting for program to start"));
      });

      let status = yield* child.join();
      yield* recordTask;

      yield* provide(status.code);
    } finally {
      // runProgram() exiting
    }
  });
}

function* recordNodeMapToFile(
  host: string,
  filePath: string,
  protocol: Protocol<any>,
): Operation<void> {
  let handle = createSSEClient(protocol, { url: host });
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
    yield* log.error(`record NodeMap interrupted: ${message}`);
  } finally {
    // always attempt to write whatever we have collected (possibly empty)
    yield* until(writeFile(filePath, JSON.stringify(values, null, 2)));
  }
}
