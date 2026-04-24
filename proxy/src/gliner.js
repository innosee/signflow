import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const PYTHON_BIN = process.env.PYTHON_BIN ?? "python3";
const SCRIPT = process.env.GLINER_SCRIPT ?? "python/gliner_server.py";

let readyPromise = null;
let proc = null;
let rl = null;
let queue = [];
let inflight = null;

function start() {
  if (readyPromise) return readyPromise;

  proc = spawn(PYTHON_BIN, [SCRIPT], {
    stdio: ["pipe", "pipe", "inherit"],
    env: process.env,
  });

  rl = createInterface({ input: proc.stdout });
  rl.on("line", (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (inflight) {
      const { resolve, reject } = inflight;
      inflight = null;
      if (msg.error) reject(new Error(msg.error));
      else resolve(msg);
      drain();
    } else if (msg.ready) {
      readyResolve?.();
    }
  });

  proc.on("exit", (code) => {
    const err = new Error(`gliner_server exited with code ${code}`);
    if (inflight) inflight.reject(err);
    queue.forEach((q) => q.reject(err));
    queue = [];
    inflight = null;
    readyPromise = null;
  });

  let readyResolve;
  readyPromise = new Promise((resolve) => {
    readyResolve = resolve;
  });
  return readyPromise;
}

function drain() {
  if (inflight || queue.length === 0) return;
  const next = queue.shift();
  inflight = next;
  proc.stdin.write(JSON.stringify({ text: next.text }) + "\n");
}

export async function detectEntities(text) {
  await start();
  return new Promise((resolve, reject) => {
    queue.push({ text, resolve, reject });
    drain();
  });
}

export function isAvailable() {
  return readyPromise !== null && proc !== null && !proc.killed;
}
