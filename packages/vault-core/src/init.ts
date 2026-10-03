import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exists } from "./fs.js";
import { loadSchemas } from "./schema.js";

export const DEFAULT_SCHEMA_DIR = ".brain/schema";

/** 不属于任何数据库、但 vault 需要的文件夹。 */
export const VAULT_FOLDERS = ["inbox", "mail", "templates", "attachments"];

/** 包内自带的默认 schema 目录。打包进 Electron 后路径会变，可以通过 schemaSource 传入。 */
export function bundledSchemaDir(): string {
  return fileURLToPath(new URL("../schemas/", import.meta.url));
}

export interface InitResult {
  createdFolders: string[];
  copiedSchemas: string[];
}

/**
 * 初始化 vault：建好标准目录，把缺少的 schema 复制进 .brain/schema/。
 * 可以重复执行；已有的 schema 文件不会被覆盖（你可能改过它）。
 */
export async function initVault(root: string, opts: { schemaSource?: string } = {}): Promise<InitResult> {
  const source = opts.schemaSource ?? bundledSchemaDir();
  const target = path.join(root, ...DEFAULT_SCHEMA_DIR.split("/"));
  await fs.mkdir(target, { recursive: true });
  const copiedSchemas: string[] = [];
  for (const f of await fs.readdir(source)) {
    if (!/\.ya?ml$/.test(f) || (await exists(path.join(target, f)))) continue;
    await fs.copyFile(path.join(source, f), path.join(target, f));
    copiedSchemas.push(f);
  }
  const schemas = await loadSchemas(target);
  const folders = [...VAULT_FOLDERS, ...[...schemas.values()].map((s) => s.folder)];
  const createdFolders: string[] = [];
  for (const f of folders) {
    const p = path.join(root, ...f.split("/"));
    if (!(await exists(p))) {
      await fs.mkdir(p, { recursive: true });
      createdFolders.push(f);
    }
  }
  return { createdFolders, copiedSchemas };
}
