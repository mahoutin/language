// Local verification server only; GitHub Pages serves out/ in production.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve("out");
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "/language";
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
};
createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    if (!path.startsWith(base + "/")) {
      res.writeHead(404).end();
      return;
    }
    let file = resolve(root, "." + path.slice(base.length));
    if (!file.startsWith(root + sep) && file !== root) {
      res.writeHead(403).end();
      return;
    }
    if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
    const content = await readFile(file);
    res
      .writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
      })
      .end(content);
  } catch {
    res.writeHead(404).end();
  }
}).listen(3200, "127.0.0.1");
