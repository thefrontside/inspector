import process from "node:process";
import { scoped, spawn, type Operation, type Scope, suspend, withResolvers } from "effection";
import type { Methods, Inspector, Handle } from "./types.ts";
import { useAttributes } from "./labels.ts";
import { useSSEServer } from "./sse-server.ts";
import { pause } from "./implementations/player.ts";

export interface WithInspectorOptions<M extends Methods> {
  global: Scope;
  inspector: Inspector<M>;
  config: {
    value: {
      inspectPort: number;
      inspectPause: boolean;
    };
  };
  version: string;
  args?: string[];
}

export function* attach<M extends Methods>(
  scope: Scope,
  inspector: Inspector<M>,
  init: (handle: Handle<M>) => Operation<void>,
): Operation<() => Operation<void>> {
  let attached = withResolvers<void>();

  let task = scope.run(function* () {
    yield* useAttributes({ name: "Inspector" });
    try {
      let handle = yield* inspector.attach(scope);
      yield* init(handle);
      attached.resolve();
      yield* suspend();
    } catch (error) {
      attached.reject(error as Error);
    }
  });

  yield* attached.operation;

  return task.halt;
}

export function* withInspector<M extends Methods, T>(
  { global, inspector, config, version, args = [] }: WithInspectorOptions<M>,
  body: () => Operation<T>,
): Operation<T> {
  let ready = withResolvers<Handle<M>>();
  let inspectorTask = yield* spawn(function* () {
    yield* useAttributes({ name: "Inspector" });
    try {
      let handle = yield* inspector.attach(global);
      ready.resolve(handle);
      yield* suspend();
    } catch (error) {
      ready.reject(error as Error);
      throw error;
    }
  });

  try {
    let handle = yield* ready.operation;
    let address = yield* useSSEServer(handle, { port: config.value.inspectPort });
    process.stderr.write(
      `effection inspector@${version} running at ${address}/live\n` +
        `inspect the running program using \`npx @effectionx/inspector call *\` or other CLI commands`,
    );

    return yield* scoped(function* () {
      yield* useAttributes({ name: "Main", args: args.join(" ") });

      if (config.value.inspectPause) {
        process.stderr.write(
          "inspector attached and main() waiting to start; use 'play' button at /live to start execution",
        );
        yield* pause();
      }

      return yield* body();
    });
  } finally {
    yield* inspectorTask.halt();
  }
}
