import { main, suspend, spawn, sleep, useAttributes, type Task } from "effection";

await main(function* () {
  yield* useAttributes({ name: "Main" });

  try {
    let supervisor = yield* spawn(function* () {
      yield* useAttributes({ name: "supervisor", role: "watcher" });
      yield* sleep(1000);
      return "supervisor done";
    });

    let background = yield* spawn(function* () {
      yield* useAttributes({ name: "background", purpose: "heartbeat" });
      let beats = 0;
      while (true) {
        yield* sleep(200);
        beats++;
        yield* useAttributes({ name: "background", beats });
      }
    });

    let tasks: Task<string>[] = [];
    for (let i = 1; i <= 15; i++) {
      let task = yield* spawn(function* () {
        yield* useAttributes({ name: "child", number: i, category: i % 2 === 0 ? "even" : "odd" });

        let helper = yield* spawn(function* () {
          yield* useAttributes({ name: "helper", child: i });
          yield* sleep(40 * i);
          return `helper ${i} done`;
        });

        yield* sleep(50 * i);
        yield* helper.halt();
        console.log(`child ${i} done`);
        return `child ${i} done`;
      });

      tasks.push(task);
    }

    // let some tasks start up
    yield* sleep(150);

    yield* background.halt();

    console.log("some children halted, but we will never finish...");
    // never finish; keeps the loader running which keeps the UI server up during tests
    // but also simulates a long-running process that we can attach to
    // when this receives a SIGTERM, it will push every effect into the `finally` block
    // and start to shut all of the children down, we don't need to call `.halt()` on anything
    // but we have halted a few of the children simply to see some variable movement in our tree
    yield* suspend();
  } finally {
    console.log("shutting down, forever was a fallacy");
  }
});
