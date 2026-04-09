import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";
import { createServer } from "node:net";
import type { Method, Handle, Inspector } from "../lib/types.ts";
import { createProtocol } from "../lib/mod.ts";
import { attach } from "../lib/attach.ts";
import { createScope, call, suspend, useScope, withResolvers } from "effection";
import { scope as arktypeScope } from "arktype";
import { useSSEServer } from "../lib/sse-server.ts";

describe("useSSEServer()", () => {
  describe("generic echo protocol", () => {
    it("keeps an active SSE request alive long enough to flush during shutdown", function* () {
      const [serverScope, destroyServerScope] = createScope();
      const [clientScope, destroyClientScope] = createScope();

      const schema = arktypeScope({
        NoneArr: "never[]",
        None: "never",
        Str: "string",
      }).export();

      const protocol = createProtocol({
        echo: {
          args: schema.NoneArr,
          progress: schema.None,
          returns: schema.Str,
        },
      });

      const requestStarted = withResolvers<void>();
      const continueRequest = withResolvers<void>();

      const handle = {
        protocol,
        methods: {} as any,
        invoke() {
          return (function* () {
            return {
              *next() {
                requestStarted.resolve();
                yield* continueRequest.operation;
                return { done: true, value: "goodbye" };
              },
            };
          })();
        },
      } as unknown as Handle<{ echo: Method<never[], never, string> }>;

      const addressResolver = withResolvers<string>();
      serverScope.run(function* () {
        const address = yield* useSSEServer(handle, { port: yield* call(getAvailablePort) });
        addressResolver.resolve(address);
        yield* suspend();
      });

      const address = yield* addressResolver.operation;

      const requestTask = clientScope.run(function* () {
        const response = yield* call(() =>
          fetch(`${address}/echo`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "[]",
          }),
        );

        const text = yield* call(async () => {
          const decoder = new TextDecoder();
          const reader = response.body?.getReader();
          let result = "";

          if (!reader) {
            throw new Error("response body is missing");
          }

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            result += decoder.decode(value, { stream: true });
          }

          return result;
        });

        return { status: response.status, text };
      });

      yield* requestStarted.operation;
      continueRequest.resolve();
      yield* destroyServerScope();

      const result = yield* requestTask;
      yield* destroyClientScope();

      expect(result.status).toBe(200);
      expect(result.text).toContain("event: return");
      expect(result.text).toContain("goodbye");
    });
  });

  describe("loader path integration", () => {
    it("uses attach() and useSSEServer() together and keeps the SSE request alive on shutdown", function* () {
      const schema = arktypeScope({
        NoneArr: "never[]",
        None: "never",
        Str: "string",
      }).export();

      const protocol = createProtocol({
        echo: {
          args: schema.NoneArr,
          progress: schema.None,
          returns: schema.Str,
        },
      });

      const handle: Handle<{ echo: Method<never[], never, string> }> = {
        protocol,
        methods: {
          echo: function* () {
            return {
              *next() {
                return { done: true, value: "goodbye" };
              },
            };
          },
        } as any,
        invoke({ name, args }) {
          return this.methods[name](...args);
        },
      };

      const inspector: Inspector<{ echo: Method<never[], never, string> }> = {
        protocol,
        *attach(scope) {
          return handle;
        },
      };

      const scope = yield* useScope();
      const addressResolver = withResolvers<string>();
      const detach = yield* attach(scope, inspector, function* (handle) {
        const address = yield* useSSEServer(handle, { port: yield* call(getAvailablePort) });
        addressResolver.resolve(address);
      });

      const address = yield* addressResolver.operation;
      yield* detach();

      expect(address).toMatch(/^http:\/\/localhost:\d+$/);
    });
  });
});

function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", (error) => {
      reject(error);
    });

    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address === "object") {
        const port = address.port;
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve(port);
          }
        });
      } else {
        reject(new Error("unable to determine ephemeral port"));
      }
    });
  });
}
