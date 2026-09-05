import { openDb, type LocalSendJob } from "./db.js";

/** Ephemeral per-send delivery progress (DATA.md §1) — never synced (§5: server-owned already). */

export async function get(jobId: string): Promise<LocalSendJob | undefined> {
  const db = await openDb();
  return db.get("sendJobs", jobId);
}

export async function put(job: LocalSendJob): Promise<void> {
  const db = await openDb();
  await db.put("sendJobs", job);
}

export async function remove(jobId: string): Promise<void> {
  const db = await openDb();
  await db.delete("sendJobs", jobId);
}

export const sendJobStore = { get, put, delete: remove };
