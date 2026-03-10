import { main, suspend, spawn, sleep, useAttributes, type Task } from "effection";

await main(function* () {
  let tasks: Task<string>[] = [];
  for (let i = 1; i <= 5; i++) {
    let task = yield* spawn(function* () {
      yield* useAttributes({ name: "child", number: i });
      yield* sleep(50 * i);
      return `child ${i} done`;
    });
    tasks.push(task);
  }

  for (let t of tasks) {
    yield* t.halt();
  }

  // never finish; keeps the loader running which keeps the UI server up during tests
  // but also simulates a long-running process that we can attach to
  yield* suspend();
});
