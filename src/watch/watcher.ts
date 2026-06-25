import chokidar from "chokidar";
import { getAvailableAdapters } from "../adapters/registry.js";
import { syncSessions } from "../core/sync.js";

export interface WatchOptions {
  intervalMs?: number;
  onSync?: (summary: string) => void;
}

let debounceTimer: NodeJS.Timeout | undefined;
let syncing = false;

export async function startWatcher(options: WatchOptions = {}): Promise<() => void> {
  const adapters = getAvailableAdapters();
  const paths = adapters.flatMap((adapter) => adapter.watchPaths());

  const runSync = async () => {
    if (syncing) return;
    syncing = true;
    try {
      const result = await syncSessions();
      const summary = `Indexed ${result.indexed} sessions (${result.updated} updated)`;
      options.onSync?.(summary);
      console.log(`[aiss] ${summary}`);
    } catch (error) {
      console.error("[aiss] sync failed:", error);
    } finally {
      syncing = false;
    }
  };

  await runSync();

  const watcher = chokidar.watch(paths, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
  });

  const schedule = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void runSync();
    }, options.intervalMs ?? 1500);
  };

  watcher.on("add", schedule);
  watcher.on("change", schedule);
  watcher.on("unlink", schedule);

  return () => {
    clearTimeout(debounceTimer);
    void watcher.close();
  };
}
