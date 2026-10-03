import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach } from "vitest";
import { initVault } from "../src/init.js";
import { Vault } from "../src/vault.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

/** 在临时目录建一个带默认 schema 的 vault，写入 files 后打开。 */
export async function makeVault(files: Record<string, string> = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-"));
  await initVault(root);
  for (const [rel, content] of Object.entries(files)) await put(root, rel, content);
  const vault = await Vault.open(root);
  cleanups.push(async () => {
    await vault.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  return { root, vault };
}

export async function put(root: string, rel: string, content: string) {
  const p = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, "utf8");
}

export async function read(root: string, rel: string) {
  return fs.readFile(path.join(root, ...rel.split("/")), "utf8");
}

/** 一个最简单的条目文件。 */
export function md(fm: string, body = "") {
  return `---\n${fm.trim()}\n---\n${body ? "\n" + body + "\n" : ""}`;
}

export async function waitFor(fn: () => boolean, timeout = 3000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("waitFor 超时");
    await new Promise((r) => setTimeout(r, 25));
  }
}

export const names = (entries: { name: string }[]) => entries.map((e) => e.name);
