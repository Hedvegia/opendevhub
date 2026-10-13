const MAX_RUNS = 100;
const MAX_LINES = 500;
const MAX_AGE_MS = 60 * 60_000;

const runs = new Map<string, { createdAt: number; lines: string[] }>();

export const startOcrLog = (id: string): void => {
  for (const [key, run] of runs) {
    if (Date.now() - run.createdAt > MAX_AGE_MS) {
      runs.delete(key);
    }
  }
  if (runs.size >= MAX_RUNS) {
    runs.delete(runs.keys().next().value ?? "");
  }
  runs.set(id, { createdAt: Date.now(), lines: [] });
};

export const appendOcrLog = (id: string, line: string): void => {
  const run = runs.get(id);
  if (!run || !line.startsWith("[ocr]")) {
    return;
  }
  run.lines.push(line.slice(0, 2000));
  if (run.lines.length > MAX_LINES) {
    run.lines.shift();
  }
};

export const ocrLogLines = (id: string): string[] => runs.get(id)?.lines ?? [];
