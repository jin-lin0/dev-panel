/**
 * Tools Index - Register all tools with the runtime
 */
import { Runtime } from "../runtime/runtime.js";
import { ToolHandler } from "./registry.js";
import { ToolDefinition } from "../mcp/types.js";
import { fileTools } from "./file-tools.js";
import { searchTool } from "./search-tool.js";
import { patchTool } from "./patch-tools.js";
import { commandTools } from "./command-tools.js";
import { gitTools } from "./git-tools.js";
import { infoTool } from "./info-tool.js";
import { imageTool } from "./image-tool.js";
import { getDefaultCwdTool, setDefaultCwdTool } from "./cwd-tools.js";

interface ToolRegistration {
  definition: ToolDefinition;
  handler: ToolHandler;
}

/** Tool profiles control which tools are exposed */
const READ_ONLY_TOOLS = new Set([
  "server_info",
  "read_file",
  "list_dir",
  "list_files",
  "search_text",
  "git_status",
  "git_diff",
  "git_log",
  "git_show",
  "git_blame",
  "get_default_cwd",
  "set_default_cwd",
  "view_image",
]);

const ALL_TOOLS: ToolRegistration[] = [
  infoTool,
  getDefaultCwdTool,
  setDefaultCwdTool,
  ...fileTools,
  searchTool,
  patchTool,
  ...commandTools,
  ...gitTools,
  imageTool,
];

export function registerAllTools(runtime: Runtime): void {
  const ctx = runtime.createContext();
  const profile = runtime.profile;

  for (const tool of ALL_TOOLS) {
    const name = tool.definition.name;

    // Filter by profile
    if (profile === "read-only" && !READ_ONLY_TOOLS.has(name)) {
      continue;
    }

    runtime.tools.register(name, tool.definition, tool.handler);
  }
}
