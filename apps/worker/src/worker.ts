import type { LeasedJob } from "@e4s/database";

export interface JobPort {
  leaseNext(workerId: string, leaseSeconds: number): Promise<LeasedJob | null>;
  markSucceeded(id: string, workerId: string): Promise<boolean>;
  markFailed(id: string, workerId: string, error: string): Promise<"queued" | "dead" | null>;
}

export type JobHandler = (job: LeasedJob) => Promise<void>;

export async function processNextJob(input: {
  jobs: JobPort;
  workerId: string;
  leaseSeconds: number;
  handlers: Record<string, JobHandler>;
}): Promise<boolean> {
  const job = await input.jobs.leaseNext(input.workerId, input.leaseSeconds);
  if (!job) return false;

  try {
    const handler = input.handlers[job.kind];
    if (!handler) throw new Error(`No worker handler registered for ${job.kind}`);
    await handler(job);
    const acknowledged = await input.jobs.markSucceeded(job.id, input.workerId);
    if (!acknowledged) throw new Error("Job lease expired before acknowledgement");
  } catch (error) {
    await input.jobs.markFailed(job.id, input.workerId, errorMessage(error));
  }
  return true;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
