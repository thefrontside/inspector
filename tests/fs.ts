import * as fsp from "node:fs/promises";
import type { Dirent, Stats } from "node:fs";
import { createApi } from "effection/experimental";
import type { Operation } from "effection";
import { ensure, until } from "effection";

export interface Fs {
  stat(path: string): Operation<Stats>;
  lstat(path: string): Operation<Stats>;
  readdir(path: string): Operation<string[]>;
  readdirDirents(path: string): Operation<Dirent[]>;
  rm(path: string, options?: { recursive?: boolean; force?: boolean }): Operation<void>;
  copyFile(src: string, dest: string): Operation<void>;
  readTextFile(path: string): Operation<string>;
  writeTextFile(path: string, content: string): Operation<void>;
}

const fsApi = createApi<Fs>("fs", {
  stat(path: string) {
    return until(fsp.stat(path));
  },

  lstat(path: string) {
    return until(fsp.lstat(path));
  },

  readdir(path: string) {
    return until(fsp.readdir(path));
  },

  readdirDirents(path: string) {
    return until(fsp.readdir(path, { withFileTypes: true }));
  },

  rm(path: string, options?: { recursive?: boolean; force?: boolean }) {
    return until(fsp.rm(path, options));
  },

  copyFile(src: string, dest: string) {
    return until(fsp.copyFile(src, dest));
  },

  *readTextFile(path: string) {
    yield* ensure(function* () {
      yield* until(fsp.rm(path, { force: true }));
    });

    return yield* until(fsp.readFile(path, "utf-8"));
  },

  writeTextFile(path: string, content: string) {
    return until(fsp.writeFile(path, content));
  },
} satisfies Fs);

export const fs = fsApi.operations;
export { fsApi };
