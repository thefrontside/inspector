import { ensure, main, sleep, spawn } from "effection";
import { useAttributes } from "../lib/labels.ts";

await main(function* () {
  yield* useAttributes({ name: "Main" });

  yield* spawn(function* () {
    yield* useAttributes({ name: "failure-child" });
    yield* ensure(() => {
      throw new Error("cleanup failed");
    });
    yield* sleep(1000);
  });

  yield* sleep(50);
  throw new Error("example failed");
});
