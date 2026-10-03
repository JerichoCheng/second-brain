import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { VaultEvent } from "../src/types.js";
import { makeVault, md, put, waitFor } from "./helpers.js";

async function watched(files: Record<string, string> = {}) {
  const ctx = await makeVault(files);
  const events: VaultEvent[] = [];
  ctx.vault.on("event", (e) => events.push(e));
  await ctx.vault.watch();
  return { ...ctx, events };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("文件监听", () => {
  it("外部新建、修改、删除都会同步到索引并发出事件", async () => {
    const { root, vault, events } = await watched();

    await put(root, "tasks/外部新建.md", md("status: next"));
    await waitFor(() => vault.get("外部新建") !== undefined);
    expect(events.at(-1)).toMatchObject({ type: "add", path: "tasks/外部新建.md" });

    await put(root, "tasks/外部新建.md", md("status: done"));
    await waitFor(() => vault.get("外部新建")?.data.status === "done");
    expect(events.at(-1)).toMatchObject({ type: "change" });

    await fs.rm(path.join(root, "tasks", "外部新建.md"));
    await waitFor(() => vault.get("外部新建") === undefined);
    expect(events.at(-1)).toEqual({ type: "unlink", path: "tasks/外部新建.md" });
  });

  it("自己写入的文件不会再发一次事件", async () => {
    const { vault, events } = await watched();
    await vault.create("tasks", "自己建的");
    await vault.update("自己建的", { status: "next" });
    await vault.rename("自己建的", "改了名");
    await sleep(500);
    expect(events).toEqual([]);
    expect(vault.get("改了名")!.data.status).toBe("next");
  });

  it("agent 写进 inbox 的提案会被发现", async () => {
    const { root, vault } = await watched();
    await put(root, "inbox/提案.md", md("proposal_action: create\nproposal_target: tasks/x.md"));
    await waitFor(() => vault.get("提案") !== undefined);
    expect(vault.get("提案")!.db).toBeNull();
  });

  it("修改 schema 会重新加载", async () => {
    const { root, vault, events } = await watched({ "tasks/t.md": md("status: next") });
    const file = path.join(root, ".brain", "schema", "tasks.yaml");
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, text.replace("name: 任务", "name: 待办"));
    await waitFor(() => vault.schemas.get("tasks")?.name === "待办");
    expect(events.some((e) => e.type === "schema")).toBe(true);
    expect(vault.get("t")!.db).toBe("tasks");
  });

  it("忽略临时文件和隐藏目录", async () => {
    const { root, events } = await watched();
    await put(root, "tasks/.a.md.1234.sb-tmp", "x");
    await put(root, ".git/x.md", "x");
    await put(root, "attachments/图.png", "x");
    await sleep(400);
    expect(events).toEqual([]);
  });
});
