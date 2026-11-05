import { createServer, type Server } from "node:http";
import type IORedis from "ioredis";
import { logger } from "./common/logger";

export function startHealthServer(redis: IORedis, port: number): Server {
  const server = createServer((req, res) => {
    if (req.url === "/health" && req.method === "GET") {
      redis
        .ping()
        .then(() => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ status: "ok", service: "worker", timestamp: new Date().toISOString() }));
        })
        .catch(() => {
          res.writeHead(503, { "content-type": "application/json" });
          res.end(JSON.stringify({ status: "error", service: "worker" }));
        });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(port, () => {
    logger.info({ port }, "worker health server listening");
  });

  return server;
}
