import http from "node:http";
import { Readable } from "node:stream";
import worker from "./dist/server/index.js";

const env = {
  DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY || "",
  DASHSCOPE_BASE_URL: process.env.DASHSCOPE_BASE_URL || "",
  DASHSCOPE_MODEL: process.env.DASHSCOPE_MODEL || "qwen3-vl-flash"
};
const port = Number(process.env.PREVIEW_PORT || 4178);

const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(`http://127.0.0.1:${port}${req.url}`, {
      method: req.method,
      headers: req.headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body
    });
    const response = await worker.fetch(request, env, {});
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
