import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

/** Port `FileStorage` (ADR-0002, ADR-0004). Files are served only through authorized endpoints, never as static files. */
export interface FileStorage {
  put(key: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/** Local disk implementation. `root` defaults to `apps/api/data/uploads` (git-ignored); UPLOAD_DIR overrides it. */
export function createLocalFileStorage(root: string = process.env.UPLOAD_DIR ?? 'data/uploads'): FileStorage {
  const base = resolve(process.cwd(), root);
  const pathFor = (key: string): string => {
    const full = resolve(base, key);
    if (!full.startsWith(base + sep)) throw new Error('Invalid storage key'); // never leave the upload folder
    return full;
  };
  return {
    async put(key, bytes) {
      const path = pathFor(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
    },
    get: (key) => readFile(pathFor(key)),
    delete: (key) => rm(pathFor(key), { force: true }),
  };
}

let current: FileStorage | undefined;
export const getFileStorage = (): FileStorage => (current ??= createLocalFileStorage());
/** For tests. */
export const setFileStorage = (next: FileStorage | undefined): void => {
  current = next;
};
