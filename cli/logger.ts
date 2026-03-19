import type { Operation } from "effection";
import { createApi } from "effection/experimental";

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
export const log = loggerApi.operations;
export { loggerApi }; // exported for use in tests
