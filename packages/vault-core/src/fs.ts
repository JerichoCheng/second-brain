import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

/** Windows 上文件被杀毒软件或编辑器短暂占用时，rename 会报这些错误，稍等重试即可。 */
const RETRY_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);

async function retry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (i >= attempts - 1 || !code || !RETRY_CODES.has(code)) throw e;
      await new Promise((r) => setTimeout(r, 20 * 2 ** i));
    }
  }
}

export const TMP_SUFFIX = ".sb-tmp";

/** 先写临时文件再重命名：进程中途崩溃也不会留下写了一半的文件。 */
export async function atomicWrite(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${randomBytes(4).toString("hex")}${TMP_SUFFIX}`);
  const handle = await fs.open(tmp, "w");
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await retry(() => fs.rename(tmp, file));
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
}

export async function moveFile(from: string, to: string): Promise<void> {
  await fs.mkdir(path.dirname(to), { recursive: true });
  await retry(() => fs.rename(from, to));
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
