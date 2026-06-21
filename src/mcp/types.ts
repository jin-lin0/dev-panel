/**
 * MCP Protocol Types - Model Context Protocol
 * Protocol version: 2025-06-18
 */

/** JSON-RPC 2.0 Message IDs */
export type RequestId = string | number | null;

/** JSON-RPC 2.0 Error */
export class JsonRpcError extends Error {
  code: number;
  data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "JsonRpcError";
    this.code = code;
    this.data = data;
  }
}

/** Standard JSON-RPC 2.0 Error Codes */
export const ErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  ServerNotInitialized: -32002,
  RequestCancelled: -32800,
  ContentModified: -32801,
} as const;

/** JSON-RPC 2.0 Request */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: RequestId;
  method: string;
  params?: unknown;
}

/** JSON-RPC 2.0 Response */
export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: RequestId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/** MCP Initialize Request Params */
export interface InitializeParams {
  protocolVersion: string;
  capabilities: ClientCapabilities;
  clientInfo?: {
    name: string;
    version?: string;
  };
}

/** Client Capabilities */
export interface ClientCapabilities {
  roots?: { listChanged?: boolean };
  sampling?: Record<string, unknown>;
  experimental?: Record<string, unknown>;
}

/** Server Capabilities */
export interface ServerCapabilities {
  experimental?: Record<string, unknown>;
  logging?: {
    supportedLevels?: string[];
  };
  prompts?: { listChanged?: boolean };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  tools?: { listChanged?: boolean };
}

/** Initialize Result */
export interface InitializeResult {
  protocolVersion: string;
  capabilities: ServerCapabilities;
  serverInfo: {
    name: string;
    version: string;
  };
}

/** Tool Definition */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    openWorldHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    tier?: "P0" | "P1" | "P2";
  };
}

/** Tool Call Request */
export interface ToolCallRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

/** Content types for tool results */
export type ContentItem =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource"; resource: ResourceContent };

/** Resource content */
export interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

/** Tool Call Result */
export interface ToolCallResult {
  content: ContentItem[];
  isError?: boolean;
}

/** Structured success/error response used internally */
export interface ToolResponse {
  ok: boolean;
  content?: ContentItem[];
  error?: {
    code: string;
    message: string;
    category?: string;
    retryable?: boolean;
    details?: Record<string, unknown>;
  };
  diagnostics?: string[];
}

/** Logging level */
export type LoggingLevel =
  | "debug"
  | "info"
  | "notice"
  | "warning"
  | "error"
  | "critical"
  | "alert"
  | "emergency";
