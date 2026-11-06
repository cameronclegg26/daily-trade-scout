// Local research desk. Binds to 127.0.0.1 only.
// Reads public charts and the alert files on this PC. Does not place orders.

import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDesk, projectRoot } from "./board.js";
import { DEFAULT_DESK_PORT, DESK_HOST } from "./host.js";

const root = projectRoot();
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");

const FILES: Record<string, string> = {
  "/": "index.html",
  "/index.html": "index.html",
  "/desk.css": "desk.css",
  "/desk.js": "desk.js",
};

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function deskPort(): number {
  const raw = process.env.DESK_PORT;
  if (!raw) return DEFAULT_DESK_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`DESK_PORT must be a port number. Using ${DEFAULT_DESK_PORT}.`);
    return DEFAULT_DESK_PORT;
  }
  return port;
}

function localHostHeader(header: string | undefined): boolean {
  if (!header) return false;
  const name = header.replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase();
  return name === "127.0.0.1" || name === "localhost";
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(data),
    "x-content-type-options": "nosniff",
  });
  res.end(data);
}

function publicPath(urlPath: string): string | null {
  const name = FILES[urlPath];
  if (!name) return null;
  const full = path.join(publicDir, name);
  const relative = path.relative(publicDir, full);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return full;
}

const port = deskPort();
const server = http.createServer(async (req, res) => {
  if (!localHostHeader(req.headers.host)) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("Scout Desk listens on this computer only.");
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "content-type": "text/plain; charset=utf-8", allow: "GET, HEAD" });
    res.end("This desk is read only.");
    return;
  }
  const url = new URL(req.url ?? "/", `http://${DESK_HOST}`);
  if (url.pathname === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (url.pathname === "/api/desk") {
    try {
      const force = url.searchParams.get("refresh") === "1";
      const payload = await getDesk({ force, root });
      sendJson(res, 200, payload);
    } catch (err) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : "desk failed" });
    }
    return;
  }
  const file = publicPath(url.pathname);
  if (!file) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  if (req.method === "HEAD") {
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end();
    return;
  }
  res.writeHead(200, {
    "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  const stream = createReadStream(file);
  stream.on("error", () => {
    if (!res.headersSent) res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end();
  });
  stream.pipe(res);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Set DESK_PORT to another port and run npm run desk again.`);
  } else {
    console.error(err.message);
  }
  process.exit(1);
});

await readFile(path.join(publicDir, "index.html"), "utf8");

server.listen(port, DESK_HOST, () => {
  const page = `http://${DESK_HOST}:${port}`;
  console.log("Scout Desk");
  console.log("Research and alerts only. Nothing is sent.");
  console.log(`Open ${page}`);
  openBrowser(page);
});

function openBrowser(page: string): void {
  if (process.env.DESK_NO_OPEN === "1") return;
  const child =
    process.platform === "win32"
      ? spawn("cmd", ["/c", "start", "", page], { detached: true, stdio: "ignore", windowsHide: true })
      : spawn(process.platform === "darwin" ? "open" : "xdg-open", [page], { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}
