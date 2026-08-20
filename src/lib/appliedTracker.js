import { readFileSync, writeFileSync, existsSync } from "node:fs";

const DATA_PATH = new URL("../../data/applied-jobs.json", import.meta.url);

export function loadAppliedJobs() {
  if (!existsSync(DATA_PATH)) return {};
  return JSON.parse(readFileSync(DATA_PATH, "utf-8"));
}

export function saveAppliedJob(jobId, meta) {
  const applied = loadAppliedJobs();
  applied[jobId] = { ...meta, appliedAt: new Date().toISOString() };
  writeFileSync(DATA_PATH, JSON.stringify(applied, null, 2));
}

export function hasApplied(jobId) {
  const applied = loadAppliedJobs();
  return Boolean(applied[jobId]);
}
