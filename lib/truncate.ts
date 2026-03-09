import { createSignal, each, resource, spawn, Subscription, type Stream } from "effection";

export function truncate(): <T, TClose>(source: Stream<T, TClose>) => Stream<T, null> {
  return <T, TClose>(source: Stream<T, TClose>) =>
    resource<Subscription<T, null>>(function* (provide) {
      let target = createSignal<T, null>();

      yield* spawn(function* () {
        for (let event of yield* each(source)) {
          target.send(event);
          yield* each.next();
        }
      });

      try {
        yield* provide(yield* target);
      } finally {
        target.close(null);
      }
    });
}
