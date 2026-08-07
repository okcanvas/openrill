import { realpath } from "node:fs/promises";
import { resolve } from "node:path";

const mutationTails = new Map<string, Promise<void>>();

async function mutationKey(pathname: string): Promise<string> {
  const absolute = resolve(pathname);
  try {
    return await realpath(absolute);
  } catch {
    return absolute;
  }
}

export async function withWorkspaceFileMutation<T>(pathname: string, action: () => Promise<T>): Promise<T> {
  const key = await mutationKey(pathname);
  const previous = mutationTails.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(action);
  const tail = current.then(() => undefined, () => undefined);
  mutationTails.set(key, tail);
  try {
    return await current;
  } finally {
    if (mutationTails.get(key) === tail) mutationTails.delete(key);
  }
}
