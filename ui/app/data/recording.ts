import { type Stream, type Operation, createSignal } from "effection";
import type { NodeMap } from "../../../lib/update-node-map.ts";
import { createSubject } from "@effectionx/stream-helpers";
import { pipe } from "remeda";

export interface Recording {
  length: number;
  replayStream(): Stream<NodeMap, never>;
  setOffset(offset: number): void;
}

export interface Cassette {
  length: number;
  loadOffset(offset: number): Operation<Tick>;
}

export interface Tick {
  nodemap: NodeMap;
}

export interface RecordingFile {
  frames: NodeMap[];
  events?: unknown[];
  diagnostics?: {
    code?: number | null;
    signal?: string | null;
    stdout?: string;
    stderr?: string;
  };
}

export function parseRecording(value: unknown): NodeMap[] {
  if (Array.isArray(value)) {
    return value as NodeMap[];
  }

  if (value && typeof value === "object" && Array.isArray((value as RecordingFile).frames)) {
    return (value as RecordingFile).frames;
  }

  throw new TypeError("recording must contain a frames array");
}

export function* useRecording(load: () => Operation<Cassette>): Operation<Recording> {
  let { length, loadOffset } = yield* load();
  let stream = createSignal<number, never>();

  const offsets = pipe(stream, createSubject<number>(0));

  return {
    length,
    setOffset: stream.send,
    *replayStream() {
      let subscription = yield* offsets;

      return {
        *next() {
          let next = yield* subscription.next();
          let tick = yield* loadOffset(next.value);
          return {
            done: false,
            value: tick.nodemap,
          };
        },
      };
    },
  };
}

export function arrayLoader(array: NodeMap[]): () => Operation<Cassette> {
  return function* () {
    return {
      length: array.length,
      *loadOffset(offset) {
        return {
          nodemap: array[offset],
        };
      },
    };
  };
}
