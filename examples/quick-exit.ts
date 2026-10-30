import { main } from "effection";
import { useAttributes } from "../lib/labels.ts";

await main(function* () {
  yield* useAttributes({ name: "Main" });
  console.log("quick program done");
});
