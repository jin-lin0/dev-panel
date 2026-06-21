/**
 * MCP Protocol Layer - JSON-RPC 2.0 handling for MCP
 */
import { Runtime } from "../runtime/runtime.js";
import {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcError,
  ErrorCodes,
  InitializeParams,
  RequestId,
} from "./types.js";

export class MCPProtocol {
  private runtime: Runtime;
  private initialized = false;

  constructor(runtime: Runtime) {
    this.runtime = runtime;
  }

  /** Handle a JSON-RPC request and return a response (or null for notifications) */
  async handleRequest(
    request: JsonRpcRequest,
  ): Promise<JsonRpcResponse | null> {
    try {
      // Validate JSON-RPC envelope
      if (request.jsonrpc !== "2.0") {
        return this.errorResponse(
          request.id ?? null,
          ErrorCodes.InvalidRequest,
          'jsonrpc must be "2.0"',
        );
      }

      const method = request.method;
      const params = request.params as Record<string, unknown> | undefined;

      // Check initialization
      if (!this.initialized && method !== "initialize" && method !== "ping") {
        return this.errorResponse(
          request.id ?? null,
          ErrorCodes.ServerNotInitialized,
          "Server not initialized",
        );
      }

      switch (method) {
        case "initialize":
          return this.handleInitialize(request, params);
        case "notifications/initialized":
          this.initialized = true;
          return null; // Notification
        case "notifications/cancelled": {
          const sessionId = params?.session_id as string | undefined;
          if (sessionId) this.runtime.cancelSession(sessionId);
          return null;
        }
        case "ping":
          return this.successResponse(request.id ?? null, {});
        case "logging/setLevel":
          this.runtime.setLoggingLevel((params as any) ?? {});
          return this.successResponse(request.id ?? null, {});
        case "tools/list":
          return this.successResponse(request.id ?? null, {
            tools: this.runtime.listTools(),
          });
        case "tools/call":
          return await this.handleToolCall(request, params);
        default:
          return this.errorResponse(
            request.id ?? null,
            ErrorCodes.MethodNotFound,
            `Unknown method: ${method}`,
          );
      }
    } catch (e: unknown) {
      const err = e as Error;
      return this.errorResponse(
        request.id ?? null,
        ErrorCodes.InternalError,
        err.message || "Internal error",
      );
    }
  }

  private handleInitialize(
    request: JsonRpcRequest,
    params?: Record<string, unknown>,
  ): JsonRpcResponse {
    const initParams = params as InitializeParams | undefined;
    if (!initParams || !initParams.protocolVersion) {
      return this.errorResponse(
        request.id ?? null,
        ErrorCodes.InvalidParams,
        "protocolVersion is required",
      );
    }

    const result = this.runtime.initialize();
    this.initialized = true; // Auto-accept for usability
    return this.successResponse(request.id, result);
  }

  private async handleToolCall(
    request: JsonRpcRequest,
    params?: Record<string, unknown>,
  ): Promise<JsonRpcResponse> {
    if (!params || typeof params.name !== "string") {
      return this.errorResponse(
        request.id ?? null,
        ErrorCodes.InvalidParams,
        "tools/call requires a tool name",
      );
    }

    const name = params.name as string;
    const toolArgs = (params.arguments as Record<string, unknown>) ?? {};

    const result = await this.runtime.callTool(name, toolArgs);

    // Convert internal ToolResponse to MCP content format
    const content: Array<{
      type: string;
      text?: string;
      data?: string;
      mimeType?: string;
    }> = [];
    if (result.content) {
      content.push(...result.content);
    }
    if (result.error) {
      content.push({
        type: "text",
        text: `Error [${result.error.code}]: ${result.error.message}`,
      });
    }

    return this.successResponse(request.id, {
      content,
      isError: !result.ok,
      ...(result.diagnostics ? { diagnostics: result.diagnostics } : {}),
    });
  }

  private successResponse(id: unknown, result: unknown): JsonRpcResponse {
    return { jsonrpc: "2.0", id: id as RequestId, result };
  }

  private errorResponse(
    id: unknown,
    code: number,
    message: string,
    data?: unknown,
  ): JsonRpcResponse {
    const error: { code: number; message: string; data?: unknown } = {
      code,
      message,
    };
    if (data !== undefined) error.data = data;
    return { jsonrpc: "2.0", id: id as RequestId, error };
  }
}
