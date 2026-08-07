import type {
  RegisteredTool,
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolRegistry,
} from "@openrill/tool-runtime";

export const PACKAGE_NAME = "@openrill/tool-discovery" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "TOOL_DISCOVERY" as const;

export const TOOL_SEARCH_NAME = "tool.search" as const;
export const TOOL_DESCRIBE_NAME = "tool.describe" as const;
export const TOOL_CALL_NAME = "tool.call" as const;
export const TOOL_DISCOVERY_CONTROL_NAMES = [TOOL_SEARCH_NAME, TOOL_DESCRIBE_NAME, TOOL_CALL_NAME] as const;
const CONTROL_SET = new Set<string>(TOOL_DISCOVERY_CONTROL_NAMES);

export const DEFAULT_DIRECT_TOOL_NAMES = [
  "workspace.list",
  "workspace.stat",
  "workspace.read",
  "workspace.search",
  "memory.remember",
  "memory.search",
  "memory.get",
  "memory.forget",
  "goal.create",
  "goal.get",
  "plan.set",
  "plan.update",
  "goal.report_blocker",
  "goal.control",
  "goal.complete",
  "process.run",
] as const;

export const OPENRILL_CORE_PRODUCT_TOOL_NAMES = [
  "workspace.list", "workspace.stat", "workspace.read", "workspace.search", "workspace.write", "workspace.patch",
  "memory.remember", "memory.search", "memory.get", "memory.forget",
  "goal.create", "goal.get", "plan.set", "plan.update", "goal.report_blocker", "goal.control", "goal.complete",
  "process.run", "process.list", "process.tail", "process.cancel",
  "agent.spawn", "agent.wait",
  TOOL_SEARCH_NAME, TOOL_DESCRIBE_NAME, TOOL_CALL_NAME,
] as const;

export const OPENRILL_BROWSER_PRODUCT_TOOL_NAMES = [
  "browser.status", "browser.open", "browser.list", "browser.navigate", "browser.snapshot", "browser.close",
  "browser.click", "browser.type", "browser.press", "browser.select", "browser.fill", "browser.wait",
  "browser.screenshot", "browser.download", "browser.evidence",
] as const;

export const OPENRILL_PRODUCT_TOOL_NAMES = [
  ...OPENRILL_CORE_PRODUCT_TOOL_NAMES,
  ...OPENRILL_BROWSER_PRODUCT_TOOL_NAMES,
] as const;

export interface ConfiguredProductToolOptions {
  readonly browserEnabled: boolean;
}

export function resolveConfiguredProductToolNames(options: ConfiguredProductToolOptions): readonly string[] {
  return options.browserEnabled
    ? OPENRILL_PRODUCT_TOOL_NAMES
    : OPENRILL_CORE_PRODUCT_TOOL_NAMES;
}

export const TOOL_DISCOVERY_SYSTEM_INSTRUCTIONS = `

Tool discovery:
- A bounded core tool set is visible directly.
- Use tool.search with a short capability query when the needed tool is not visible.
- Use tool.describe before tool.call when the target schema is not already known.
- tool.call executes one exact registered tool and preserves the same workspace, approval, timeout, cancellation, and delegation policy.
- Never guess a hidden tool name or arguments.`;

export interface ToolDiscoveryOptions {
  readonly directToolNames?: readonly string[];
  readonly preferredToolNames?: readonly string[];
  readonly compactThreshold?: number;
  readonly maxSearchResults?: number;
}

export interface ToolDiscoveryView {
  readonly definitions: readonly ToolDefinition[];
  readonly compacted: boolean;
  readonly catalogSize: number;
  readonly visibleNames: readonly string[];
  readonly hiddenNames: readonly string[];
}

const QUERY_EXPANSIONS: ReadonlyArray<{ readonly terms: readonly string[]; readonly add: readonly string[] }> = [
  { terms: ["find", "lookup", "research", "web", "latest"], add: ["search", "fetch", "browser"] },
  { terms: ["file", "folder", "directory", "path"], add: ["workspace", "read", "write", "patch", "list"] },
  { terms: ["remember", "recall", "earlier", "decision", "preference"], add: ["memory", "search", "get"] },
  { terms: ["run", "execute", "command", "shell", "process"], add: ["process", "run", "tail"] },
  { terms: ["goal", "plan", "continue", "progress", "checkpoint", "resume"], add: ["goal", "plan", "update", "complete"] },
  { terms: ["delegate", "parallel", "subagent", "child"], add: ["agent", "spawn", "wait"] },
  { terms: ["click", "fill", "navigate", "page", "screenshot"], add: ["browser", "page"] },
  { terms: ["modify", "change", "edit"], add: ["write", "patch"] },
];

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function tokenize(input: string): string[] {
  const raw = input.toLowerCase().split(/[^\p{L}\p{N}_.-]+/u).filter(Boolean);
  const expanded = [...raw];
  const set = new Set(raw.flatMap((item) => item.split(/[._-]+/u).filter(Boolean)));
  for (const rule of QUERY_EXPANSIONS) {
    if (rule.terms.some((term) => set.has(term))) expanded.push(...rule.add);
  }
  return [...new Set(expanded.flatMap((item) => [item, ...item.split(/[._-]+/u)]).filter(Boolean))];
}

function score(query: readonly string[], definition: ToolDefinition): number {
  const name = definition.name.toLowerCase();
  const description = definition.description.toLowerCase();
  const nameParts = new Set(name.split(/[._-]+/u));
  let total = 0;
  for (const term of query) {
    if (name === term) total += 100;
    if (name.startsWith(`${term}.`) || name.endsWith(`.${term}`)) total += 45;
    if (nameParts.has(term)) total += 30;
    if (name.includes(term)) total += 16;
    if (description.includes(term)) total += 8;
  }
  return total;
}

function controls(registry: ToolRegistry): ToolDefinition[] {
  const byName = new Map(registry.definitions().map((item) => [item.name, item]));
  return TOOL_DISCOVERY_CONTROL_NAMES.flatMap((name) => {
    const item = byName.get(name);
    return item ? [item] : [];
  });
}

export function resolveToolDiscoveryView(registry: ToolRegistry, options: ToolDiscoveryOptions = {}): ToolDiscoveryView {
  const all = registry.definitions();
  const catalog = all.filter((item) => !CONTROL_SET.has(item.name));
  const threshold = Math.max(1, Math.min(64, options.compactThreshold ?? 12));
  if (catalog.length <= threshold) {
    return {
      definitions: all,
      compacted: false,
      catalogSize: catalog.length,
      visibleNames: all.map((item) => item.name),
      hiddenNames: [],
    };
  }
  const visible = new Set<string>([
    ...(options.directToolNames ?? DEFAULT_DIRECT_TOOL_NAMES),
    ...(options.preferredToolNames ?? []),
    ...TOOL_DISCOVERY_CONTROL_NAMES,
  ]);
  const definitions = all.filter((item) => visible.has(item.name));
  const visibleNames = definitions.map((item) => item.name);
  const visibleSet = new Set(visibleNames);
  return {
    definitions,
    compacted: true,
    catalogSize: catalog.length,
    visibleNames,
    hiddenNames: catalog.filter((item) => !visibleSet.has(item.name)).map((item) => item.name),
  };
}

function searchTool(registry: ToolRegistry, maxSearchResults: number): RegisteredTool {
  return {
    name: TOOL_SEARCH_NAME,
    description: "Search the registered OpenRill tool catalog by capability without exposing full schemas.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, maxLength: 256 },
        limit: { type: "integer", minimum: 1, maximum: maxSearchResults },
      },
      required: ["query"],
      additionalProperties: false,
    },
    validateInput: (input): input is Readonly<Record<string, unknown>> => isRecord(input)
      && typeof input.query === "string"
      && input.query.trim().length > 0
      && input.query.length <= 256
      && (input.limit === undefined || (Number.isInteger(input.limit) && Number(input.limit) >= 1 && Number(input.limit) <= maxSearchResults)),
    execute: (input): ToolExecutionResult => {
      const query = tokenize(String(input.query));
      const limit = typeof input.limit === "number" ? input.limit : Math.min(8, maxSearchResults);
      const results = registry.definitions()
        .filter((item) => !CONTROL_SET.has(item.name))
        .map((item) => ({ item, score: score(query, item) }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score || left.item.name.localeCompare(right.item.name))
        .slice(0, limit)
        .map(({ item, score: relevance }) => ({
          name: item.name,
          description: item.description,
          relevance,
        }));
      return { output: { query: input.query, results, catalogSize: registry.definitions().filter((item) => !CONTROL_SET.has(item.name)).length }, isError: false };
    },
  };
}

function exactDefinition(registry: ToolRegistry, name: string): ToolDefinition | null {
  return registry.definitions().find((item) => item.name === name && !CONTROL_SET.has(item.name)) ?? null;
}

function describeTool(registry: ToolRegistry): RegisteredTool {
  return {
    name: TOOL_DESCRIBE_NAME,
    description: "Return the exact bounded input schema for one registered tool.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", minLength: 1, maxLength: 128 } },
      required: ["name"],
      additionalProperties: false,
    },
    validateInput: (input): input is Readonly<Record<string, unknown>> => isRecord(input) && typeof input.name === "string" && input.name.length >= 1 && input.name.length <= 128,
    execute: (input): ToolExecutionResult => {
      const definition = exactDefinition(registry, String(input.name));
      if (!definition) return { output: { error: { code: "TOOL_NOT_FOUND", message: `tool not found: ${String(input.name)}` } }, isError: true };
      return { output: definition, isError: false };
    },
  };
}

function callTool(registry: ToolRegistry): RegisteredTool {
  return {
    name: TOOL_CALL_NAME,
    description: "Execute one exact registered tool discovered through tool.search or tool.describe.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 128 },
        arguments: { type: "object" },
      },
      required: ["name", "arguments"],
      additionalProperties: false,
    },
    validateInput: (input): input is Readonly<Record<string, unknown>> => isRecord(input)
      && typeof input.name === "string"
      && input.name.length >= 1
      && input.name.length <= 128
      && isRecord(input.arguments),
    execute: async (input, context): Promise<ToolExecutionResult> => {
      const name = String(input.name);
      if (CONTROL_SET.has(name)) return { output: { error: { code: "TOOL_CALL_RECURSION_DENIED", message: `control tool cannot target itself: ${name}` } }, isError: true };
      if (context.allowedToolNames && !context.allowedToolNames.includes(name)) {
        return { output: { error: { code: "TOOL_NOT_ALLOWED", message: `tool is outside the durable Run scope: ${name}` } }, isError: true };
      }
      if (!exactDefinition(registry, name)) return { output: { error: { code: "TOOL_NOT_FOUND", message: `tool not found: ${name}` } }, isError: true };
      const result = await registry.execute(name, input.arguments, {
        ...context,
        toolCallId: context.toolCallId ? `${context.toolCallId}:${name}` : name,
      });
      return { output: { tool: name, result: result.output }, isError: result.isError };
    },
  };
}

export function registerToolDiscoveryTools(registry: ToolRegistry, options: ToolDiscoveryOptions = {}): void {
  const max = Math.max(1, Math.min(50, options.maxSearchResults ?? 20));
  registry.register(searchTool(registry, max));
  registry.register(describeTool(registry));
  registry.register(callTool(registry));
}

export function getPackageIdentity() {
  return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY } as const;
}
