#!/usr/bin/env node
import { main } from "effection";
import { config, inspector } from "./config.ts";

import { type Operation, suspend, until } from "effection";
import { writeFile } from "node:fs/promises";
import { createApi } from "@effectionx/context-api";
import { createSSEClient } from "./lib/sse-client.ts";
import { useSSEServer } from "./lib/sse-server.ts";

interface Logger {
  info(message: string | object): Operation<void>;
  error(message: string): Operation<void>;
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

type InspectorMethods = typeof inspector.methods;
function* callMethod<Method extends keyof InspectorMethods>(config: {
  name: Method;
  // config type is wrong here?
  config: boolean; // { out: string | undefined };
  // argsList: InspectorMethods[Method]["args"],
}) {
  const {
    name,
    // @ts-expect-error
    config: { out },
  } = config;
  const argsList = [] as never[];
  const handle = createSSEClient(inspector, { url: "http://localhost:41000" });
  if (!(name in handle.protocol.methods)) {
    yield* log.error(`unknown command: ${name}`);
    return 1;
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
  // final return value
  results.push(next.value);
  yield* log.info(JSON.stringify(next.value));

  if (out) {
    try {
      yield* until(writeFile(out, JSON.stringify(results, null, 2)));
    } catch (e) {
      let msg = e instanceof Error ? e.message : String(e);
      yield* log.error(`failed to write ${out}: ${msg}`);
    }
  }
}

// when executed as a script we delegate directly to Effection's `main`
// which allows for importing functions here for testing
if (import.meta.url === `file://${process.argv[1]}`) {
  await main(function* (args) {
    let parser = config.createParser({
      args,
      envs: [{ name: "ENV", value: process.env as Record<string, string> }],
    });

    switch (parser.type) {
      case "help":
      case "version":
        yield* log.info(parser.print());
        break;
      case "main":
        let result = parser.parse();
        if (result.ok) {
          let { value: command } = result;
          switch (command.name) {
            case "help":
              yield* log.info(command.config.text);
              break;
            case "ui":
              let port = 41000;
              let address = yield* useSSEServer(
                { protocol: { methods: {} } } as any,
                { port },
              );
              yield* log.info(`serving inspector UI at ${address}`);
              yield* suspend();
              break;
            case "call":
              yield* callMethod(command.config);
              break;
            case "run":
              yield* log.info(command.config);
              break;
          }
        } else {
          yield* log.error(result.error.message);
        }
    }
  });
}
