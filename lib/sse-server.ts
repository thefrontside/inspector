import {
  type Operation,
  createQueue,
  createScope,
  ensure,
  race,
  resource,
  spawn,
  suspend,
  until,
  useAttributes,
  useScope,
  withResolvers,
  sleep,
} from "effection";
import type { Handle, Methods } from "./types.ts";
import { validateUnsafe } from "./validate.ts";

import {
  type EventStreamMessage,
  createEventStream,
  defineEventHandler,
  H3,
  serve,
  serveStatic,
} from "h3";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { type Maybe, Nothing } from "./maybe.ts";

export interface SSEServerOptions {
  port: number;
}

export function useSSEServer<M extends Methods>(
  handle: Handle<M>,
  options: SSEServerOptions,
): Operation<string> {
  let { port } = options;
  let { protocol } = handle;
  let methodNames = Object.keys(protocol.methods) as Array<keyof M>;

  return resource(function* (provide) {
    yield* useAttributes({ name: "SSEServer", port });
    let [scope, destroy] = createScope(yield* useScope());

    let app = new H3();

    for (let name of methodNames) {
      app.all(`/${String(name)}`, async (event) => {
        let { req } = event;
        // when this closes (default is autoclose), we will halt the `requestTask`
        // based on the event which cleans up the rest of the resource
        let stream = createEventStream(event, { autoclose: true });
        let queue = createQueue<EventStreamMessage, Maybe<never>>();

        function* drain() {
          let next = yield* queue.next();
          while (!next.done) {
            yield* until(stream.push(next.value));
            next = yield* queue.next();
          }
        }

        let requestTask = scope.run(function* () {
          yield* ensure(function* () {
            yield* until(stream.flush());
            yield* until(stream.close());
          });
          yield* useAttributes({
            name: "RequestHandler",
            method: req.method,
            pathname: event.url.pathname,
          });

          let post = req.method.toUpperCase() === "POST";
          let body: unknown = post ? yield* until(req.json()) : [];
          let args = validateUnsafe(protocol.methods[name].args, body);
          let { value: subscription, destroy: flush } = yield* useExplicitlyManagedResource(
            handle.invoke({ name, args }),
          );

          yield* spawn(function* () {
            try {
              yield* useAttributes({ name: "EventStream" });

              let next = yield* subscription.next();
              while (!next.done) {
                if (req.signal.aborted) {
                  break;
                }
                queue.add({
                  event: "yield",
                  data: JSON.stringify(next.value),
                });
                next = yield* subscription.next();
              }
              let value = validateUnsafe(protocol.methods[name].returns, next.value);
              let data = JSON.stringify(value);
              queue.add({
                event: "return",
                data,
              });
              // return sent, we can consider the stream finalized
              // and skip remaining steps in the finally block
            } catch (cause) {
              let error = cause instanceof Error ? cause : new Error("unknown", { cause });
              let { name, message } = error;
              queue.add({
                event: "throw",
                data: JSON.stringify({ name, message }),
              });
            }
          });

          try {
            yield* drain();
          } finally {
            yield* flush();
            console.log("request complete, closing stream", req._url);
            queue.close(Nothing());
            console.log("queue closed, waiting for drain to complete");
            yield* drain();
            console.log("drain complete");
          }
        });

        stream.onClosed(() => requestTask.halt());

        return stream.send();
      });
    }

    const UI_DIRNAME = "ui";
    const ROOT_DIR = join(import.meta.dirname, "..");
    const PUBLIC_DIR = join(
      ...(ROOT_DIR.endsWith("dist")
        ? [ROOT_DIR, "..", UI_DIRNAME, "dist"]
        : [ROOT_DIR, UI_DIRNAME, "dist"]),
    );

    const frontendRoutes = ["/live", "/recording", "/demo"];
    // handle static assets from the ui dist directory (js, css, etc.)
    app.use(
      defineEventHandler(async (event) => {
        return await serveStatic(event, {
          getContents: (id) => {
            const filename = frontendRoutes.includes(id) ? "index.html" : id;
            return readFile(join(PUBLIC_DIR, filename));
          },
          getMeta: async (id) => {
            const filename = frontendRoutes.includes(id) ? "index.html" : id;
            const stats = await stat(join(PUBLIC_DIR, filename)).catch(() => null);
            if (!stats || !stats.isFile()) return;
            return { size: stats.size, mtime: stats.mtime };
          },
          fallthrough: true,
        });
      }),
    );

    let server = serve(app, {
      port,
      silent: true,
    });

    yield* until(server.ready());

    try {
      yield* provide(`http://localhost:${port}`);
    } finally {
      yield* destroy();
      yield* until(server.close());
    }
  });
}

interface ExplicitlyManagedResource<T> {
  value: T;
  destroy: () => Operation<void>;
}

function* useExplicitlyManagedResource<T>(
  create: Operation<T>,
): Operation<ExplicitlyManagedResource<T>> {
  let handle = withResolvers<T>();

  let task = yield* spawn(function* () {
    let value = yield* create;
    handle.resolve(value);
    yield* suspend();
  });

  return {
    value: yield* handle.operation,
    destroy: task.halt,
  };
}
