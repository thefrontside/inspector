import { createQueue, each, resource, spawn, type Subscription, type Stream } from "effection";

export function truncate(): <T, TClose>(source: Stream<T, TClose>) => Stream<T, null> {
  return <T, TClose>(source: Stream<T, TClose>) =>
    resource<Subscription<T, null>>(function* (provide) {
      let queue = createQueue<T, null>();

      yield* spawn(function* () {
        for (let event of yield* each(source)) {
          queue.add(event);
          yield* each.next();
        }
      });

      try {
        yield* provide(queue);
      } finally {
        console.log("marking queue done");
        queue.close(null);
      }
    });
}
