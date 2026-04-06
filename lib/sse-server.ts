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

function isExpectedShutdownError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || error.message === "halted";
}

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
        // The SSE stream is bound to the HTTP request lifecycle. `autoclose`
        // means the stream will automatically finish when the response ends.
        // If the client disconnects, `stream.onClosed()` will halt the request task.
        let stream = createEventStream(event, { autoclose: true });
        // The queue buffers outgoing EventStream messages. The producer writes
        // to the queue and the `drain()` consumer flushes them into the stream.
        // This way the producer can start shutdown and stop sending messages,
        // and out of band from that action, we can finalize and send anything
        // remaining in the queue before closing the stream.
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

          // The middleware producer reads from the protocol subscription and enqueues events
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

              // If the request was aborted it means that the client has disconnected
              // while we were sending progress events. It will trigger the `break` above,
              // drop out of the loop and we won't be able to emit the final event.
              if (!req.signal.aborted) {
                let value = validateUnsafe(protocol.methods[name].returns, next.value);
                let data = JSON.stringify(value);
                queue.add({
                  event: "return",
                  data,
                });
              }
            } catch (cause) {
              let error = cause instanceof Error ? cause : new Error("unknown", { cause });
              let { name, message } = error;
              queue.add({
                event: "throw",
                data: JSON.stringify({ name, message }),
              });
            } finally {
              queue.close(Nothing());
            }
          });

          try {
            yield* drain();
          } finally {
            // `drain()` has finished either because the queue closed normally or
            // because the request was interrupted. Clean up the underlying
            // protocol subscription and ensure the stream is flushed/closed.
            yield* flush();
            queue.close(Nothing());
            try {
              yield* race([sleep(1000), drain()]);
            } catch {
              // ignore shutdown race failures in the last effort to drain
              // as H3 seems to abort the promise as some point and with
              // the sleep it can end up just getting killed
            }
          }
        });

        requestTask.catch((error) => {
          if (isExpectedShutdownError(error)) return;
          console.error("requestTask failed unexpectedly:", error);
        });

        // The transport has closed the SSE response, either because the client
        // disconnected or because the stream finished normally. Halt the request
        // task so any leftover work stops immediately.
        stream.onClosed(() =>
          requestTask.halt().catch((error) => {
            if (isExpectedShutdownError(error)) return;
            console.error("requestTask.halt() failed unexpectedly:", error);
          }),
        );

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
