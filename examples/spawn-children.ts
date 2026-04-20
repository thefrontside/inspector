import { main, sleep, spawn, useAttributes, type Task } from "effection";

await main(function* () {
  let groupTasks: Task<string>[] = [];
  for (let group of ["alpha", "beta"]) {
    let groupTask = yield* spawn(function* () {
      yield* useAttributes({ name: "group", label: group });
      let childTasks: Task<string>[] = [];

      for (let i = 1; i <= 5; i++) {
        let childTask = yield* spawn(function* () {
          yield* useAttributes({ name: "child", group, number: i });

          let worker = yield* spawn(function* () {
            yield* useAttributes({ name: "worker", stage: "inner", number: i });
            yield* sleep(Math.random() * 300);
            return `worker ${group}-${i} done`;
          });

          yield* sleep(Math.random() * 120);
          yield* worker.halt();
          return `${group}-${i} done`;
        });

        childTasks.push(childTask);
      }

      for (let child of childTasks) {
        yield* sleep(Math.random() * 200);
        yield* child.halt();
      }

      return `${group} done`;
    });

    groupTasks.push(groupTask);
  }

  for (let task of groupTasks) {
    yield* task.halt();
  }

  console.log("done");
});
