import http from "node:http";
import { Readable } from "node:stream";
import worker from "./dist/server/index.js";
import { readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
const staticRoot = resolve(import.meta.dirname, 'site');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.tar': 'application/octet-stream', '.json': 'application/json', '.png': 'image/png' };

const port = Number(process.env.PREVIEW_PORT || 4178);

const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (['GET', 'HEAD'].includes(req.method) && !pathname.startsWith('/api/')) {
      const path = resolve(staticRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!path.startsWith(staticRoot + sep)) { res.writeHead(403); return res.end(); }
      try {
        const bytes = await readFile(path);
        res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': /\.(tar|wasm)$/.test(path) ? 'public, max-age=86400' : 'no-cache', 'Content-Length': bytes.length });
        return res.end(req.method === 'HEAD' ? undefined : bytes);
      } catch { res.writeHead(404); return res.end('Asset not found'); }
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(`http://127.0.0.1:${port}${req.url}`, {
      method: req.method,
      headers: req.headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body
    });
    const response = await worker.fetch(request, process.env, {});
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (!response.body) return res.end();
    Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Local preview error");
    console.error(error);
  }
});

server.listen(port, "127.0.0.1", () => console.log(`Local: http://127.0.0.1:${port}`));
