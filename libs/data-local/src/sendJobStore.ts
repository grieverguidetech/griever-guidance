import { openDb, type LocalSendJob } from "./db.js";

/** A local handoff log (DATA.md §1) — never synced, no server-side delivery state. */

export async function get(jobId: string): Promise<LocalSendJob | undefined> {
  const db = await openDb();
  return db.get("sendJobs", jobId);
}

/** For resuming after a crash/relaunch — find the in-progress job for this session's moment, if any. */
export async function listBySessionId(sessionId: string): Promise<LocalSendJob[]> {
  const db = await openDb();
  return db.getAllFromIndex("sendJobs", "bySessionId", sessionId);
}

export async function put(job: LocalSendJob): Promise<void> {
  const db = await openDb();
  await db.put("sendJobs", job);
}

export async function remove(jobId: string): Promise<void> {
  const db = await openDb();
  await db.delete("sendJobs", jobId);
}

export const sendJobStore = { get, listBySessionId, put, delete: remove };
