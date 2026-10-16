export interface WorkerPoller {
  start(): void;
  runOnce(): Promise<void>;
  stop(): Promise<void>;
}

export function createPoller(tick: () => Promise<void>, pollMs: number): WorkerPoller {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;
  let stopping = false;
  let inFlight: Promise<void> | undefined;

  const runOnce = async (): Promise<void> => {
    if (stopping || running) return;
    running = true;
    inFlight = (async () => {
      try {
        await tick();
      } finally {
        running = false;
        inFlight = undefined;
      }
    })();
    await inFlight;
  };

  return {
    start() {
      if (timer !== undefined || stopping) return;
      void runOnce();
      timer = setInterval(() => void runOnce(), pollMs);
    },
    runOnce,
    async stop() {
      stopping = true;
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      await inFlight;
    }
  };
}
