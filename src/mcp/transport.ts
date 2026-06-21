/**
 * MCP Transport - HTTP transport for MCP protocol
 * Serves JSON-RPC at /mcp endpoint
 */
import express from "express";
import { MCPProtocol } from "./protocol.js";
import { JsonRpcRequest, JsonRpcResponse } from "./types.js";
import { Runtime } from "../runtime/runtime.js";

export function createMCPRouter(runtime: Runtime): express.Router {
  const router = express.Router();
  const protocol = new MCPProtocol(runtime);

  // MCP Streamable HTTP endpoint
  router.post("/mcp", async (req, res) => {
    try {
      const body = req.body;
      const requests: JsonRpcRequest[] = Array.isArray(body) ? body : [body];
      const responses: (JsonRpcResponse | null)[] = [];

      for (const request of requests) {
        const result = protocol.handleRequest(request);
        // Await if it's a promise (tools/call is async)
        responses.push(result instanceof Promise ? await result : result);
      }

      const validResponses = responses.filter(
        (r) => r !== null,
      ) as JsonRpcResponse[];
      if (validResponses.length === 0) {
        // Notification - no response
        return res.status(202).end();
      }

      res.json(Array.isArray(body) ? validResponses : validResponses[0]);
    } catch (e: unknown) {
      const err = e as Error;
      console.error("MCP handler error:", err);
      res.status(500).json({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: err.message || "Internal error" },
      });
    }
  });

  // GET /mcp for Session management / SSE-style (simplified)
  router.get("/mcp", (_req, res) => {
    res.json({
      jsonrpc: "2.0",
      id: null,
      result: { server: runtime.getServerInfo(), protocol: "2025-06-18" },
    });
  });

  return router;
}

/** Stdio dispatcher for MCP */
export function handleStdio(runtime: Runtime): void {
  const protocol = new MCPProtocol(runtime);
  const rl = (async function* () {
    const buffer = [];
    for await (const line of process.stdin) {
      const text = line.toString().trim();
      if (text) yield text;
    }
  })();

  (async () => {
    for await (const line of rl) {
      try {
        const request = JSON.parse(line) as JsonRpcRequest;
        const result = protocol.handleRequest(request);
        const response = result instanceof Promise ? await result : result;

        if (response) {
          process.stdout.write(JSON.stringify(response) + "\n");
        }
      } catch (e: unknown) {
        const err = e as Error;
        process.stdout.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: err.message || "Parse error" },
          }) + "\n",
        );
      }
    }
  })();
}
