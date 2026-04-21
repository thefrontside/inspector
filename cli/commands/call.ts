import { until } from "effection";
import { writeFile } from "node:fs/promises";
import { createSSEClient } from "../../lib/sse-client.ts";
import { log } from "../logger.ts";
import type { Program } from "../config.ts";
import type { CommandType } from "configliere";

// We need better helper types to destructure config
export type CallType = Extract<
  Extract<CommandType<ReturnType<Program>, "call">, { help?: false }>["config"],
  { help?: false }
>["config"];

export function* call(config: CallType) {
  const { name, out, host, protocol } = config;

  const argsList = [] as never[];
  const handle = createSSEClient(protocol, { url: host });
  if (!(name in handle.protocol.methods)) {
    yield* log.error(`unknown command: ${name}`);
  }
  let results: unknown[] = [];
  let subscription = yield* handle.invoke({
    name: name as any,
    args: argsList,
  });
  try {
    let next = yield* subscription.next();
    // log progress values and collect everything, including final return
    while (!next.done) {
      results.push(next.value);
      yield* log.info(JSON.stringify(next.value));
      next = yield* subscription.next();
    }
  } finally {
    if (out) {
      try {
        yield* until(writeFile(out, JSON.stringify(results, null, 2)));
      } catch (e) {
        let msg = e instanceof Error ? e.message : String(e);
        yield* log.error(`failed to write ${out}: ${msg}`);
      }
    }
  }
}
