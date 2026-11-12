import {
  type Operation,
  type Task,
  ensure,
  resource,
  spawn,
  until,
  withResolvers,
} from "effection";
import { exec, Stdio, type ExitStatus } from "@effectionx/process";
import { timebox } from "@effectionx/timebox";
import { writeFile } from "node:fs/promises";
import { createSSEClient } from "../../lib/sse-client.ts";
import { log } from "../logger.ts";
import { resolveRuntime, buildProcessOptions } from "./build-run-args.ts";
import type { Protocol } from "../../lib/types.ts";
import type { CommandType } from "configliere";
import type { Program } from "../config.ts";

// We need better helper types to destructure config
export type RunType = Extract<CommandType<ReturnType<Program>, "run">, { help?: false }>;

export function run(config: RunType["config"], passthroughArgs: string[]) {
  return resource<number | undefined>(function* (provide) {
    let runtime = resolveRuntime(config);
    let host = `http://localhost:${config.inspectPort}`;
    let autoPlayAfterRecordingReady = !!config.inspectRecord && !config.inspectPause;
    let processOptions = buildProcessOptions(
      runtime,
      autoPlayAfterRecordingReady ? { ...config, inspectPause: true } : config,
      passthroughArgs,
    );
    let ready = withResolvers<void>();
    let recordingReady = config.inspectRecord ? withResolvers<void>() : undefined;
    let stdout: string[] = [];
    let stderr: string[] = [];
    let recording: RecordingData | undefined;
    let status: ExitStatus | undefined;
    let recordingWritten = false;
    let inspectorReady = false;

    // Keep recording independent of process execution so it can receive the
    // normal stream completion emitted after Main's final destruction event.
    let recordTask: Task<RecordingData | undefined> = yield* spawn(function* () {
      yield* ready.operation;
      if (!config.inspectRecord) return;
      recording = yield* recordNodeMapToFile(
        host,
        config.protocol,
        () => recordingReady?.resolve(),
        (error) => recordingReady?.reject(error),
      );
      return recording;
    });

    yield* ensure(function* () {
      if (!config.inspectRecord || recordingWritten) return;
      if (!inspectorReady) {
        yield* recordTask.halt();
        return;
      }
      recording ??= yield* recordTask;
      if (recording) {
        yield* writeRecording(config.inspectRecord, status, stdout, stderr, recording);
        recordingWritten = true;
      }
    });

    let decoder = new TextDecoder();
    yield* Stdio.around({
      *stdout([bytes]) {
        let text = decoder.decode(bytes);
        stdout.push(text);
        yield* log.info(text);
      },
      *stderr([bytes]) {
        let text = decoder.decode(bytes);
        stderr.push(text);
        if (text.includes("effection inspector")) {
          inspectorReady = true;
          ready.resolve();
        }
        yield* log.error(text);
      },
    });

    let child = yield* exec(runtime, processOptions);
    let startup = yield* timebox(15000, () => ready.operation);
    if (startup.timeout) throw new Error("timeout waiting for program to start");

    if (recordingReady) yield* recordingReady.operation;
    if (autoPlayAfterRecordingReady) {
      let handle = createSSEClient(config.protocol, { url: host });
      let play = yield* handle.invoke({ name: "play" as any, args: [] });
      yield* play.next();
    }

    status = yield* child.join();
    recording ??= yield* recordTask;
    if (config.inspectRecord && recording) {
      yield* writeRecording(config.inspectRecord, status, stdout, stderr, recording);
      recordingWritten = true;
    }

    yield* provide(status?.code);
  });
}

function* writeRecording(
  path: string,
  status: ExitStatus | undefined,
  stdout: string[],
  stderr: string[],
  recording: RecordingData,
) {
  yield* until(
    writeFile(
      path,
      JSON.stringify(
        {
          frames: recording.frames,
          events: recording.events,
          diagnostics: {
            code: status?.code,
            signal: status?.signal,
            stdout: stdout.join(""),
            stderr: stderr.join(""),
          },
        },
        null,
        2,
      ),
    ),
  );
}

interface RecordingData {
  frames: unknown[];
  events: unknown[];
}

function* recordNodeMapToFile(
  host: string,
  protocol: Protocol<any>,
  onReady: () => void,
  onError: (error: Error) => void,
): Operation<RecordingData> {
  let handle = createSSEClient(protocol, { url: host });
  let frames: unknown[] = [];
  let events: unknown[] = [];
  try {
    let frameSubscription = yield* handle.invoke({ name: "recordNodeMap", args: [] });
    let eventSubscription = yield* handle.invoke({ name: "recordScopes", args: [] });
    onReady();

    let frameTask = yield* spawn(function* () {
      let next = yield* frameSubscription.next();
      while (!next.done) {
        frames.push(next.value);
        next = yield* frameSubscription.next();
      }
    });
    let eventTask = yield* spawn(function* () {
      let next = yield* eventSubscription.next();
      while (!next.done) {
        events.push(next.value);
        next = yield* eventSubscription.next();
      }
    });

    yield* frameTask;
    yield* eventTask;
  } catch (error) {
    let message = error instanceof Error ? error.message : String(error);
    yield* log.error(`record NodeMap interrupted: ${message}`);
    onError(error instanceof Error ? error : new Error(message));
    throw error;
  }

  return { frames, events };
}
