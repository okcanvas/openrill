import { ConfigParseError, type ConfigIssue } from "./errors.js";

interface ParsedLine {
  readonly line: number;
  readonly indent: number;
  readonly text: string;
}

interface ParseResult {
  readonly value: unknown;
  readonly next: number;
}

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const PLAIN_STRING_PATTERN = /^[A-Za-z0-9_./:@+-]+$/;
const FORBIDDEN_DIRECTIVE_PATTERN = /^(?:---|\.\.\.|%|!|&|\*)/;

function fail(line: number, message: string, code = "YAML_SYNTAX"): never {
  const issue: ConfigIssue = { path: "<source>", code, message, line };
  throw new ConfigParseError(`OpenRill YAML parse failed at line ${line}: ${message}`, [issue]);
}

function stripComment(raw: string, line: number): string {
  let single = false;
  let double = false;
  let escaped = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]!;
    if (double && escaped) {
      escaped = false;
      continue;
    }
    if (double && char === "\\") {
      escaped = true;
      continue;
    }
    if (!double && char === "'") {
      if (single && raw[index + 1] === "'") {
        index += 1;
        continue;
      }
      single = !single;
      continue;
    }
    if (!single && char === '"') {
      double = !double;
      continue;
    }
    if (!single && !double && char === "#" && (index === 0 || /\s/.test(raw[index - 1]!))) {
      return raw.slice(0, index).trimEnd();
    }
  }
  if (single || double) fail(line, "unterminated quoted scalar");
  return raw.trimEnd();
}

function preprocess(raw: string): ParsedLine[] {
  const normalized = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines: ParsedLine[] = [];
  for (const [zeroBased, original] of normalized.split("\n").entries()) {
    const line = zeroBased + 1;
    if (original.includes("\t")) fail(line, "tabs are not allowed; use two-space indentation");
    const withoutComment = stripComment(original, line);
    if (!withoutComment.trim()) continue;
    const indent = withoutComment.length - withoutComment.trimStart().length;
    if (indent % 2 !== 0) fail(line, "indentation must use multiples of two spaces");
    const text = withoutComment.slice(indent);
    if (FORBIDDEN_DIRECTIVE_PATTERN.test(text)) {
      fail(line, "YAML directives, document markers, tags, anchors, and aliases are not supported", "YAML_UNSUPPORTED_FEATURE");
    }
    if (text.includes("\u0000")) fail(line, "NUL is not allowed");
    lines.push({ line, indent, text });
  }
  return lines;
}

function splitMappingEntry(text: string, line: number): [string, string] {
  let single = false;
  let double = false;
  let escaped = false;
  let square = 0;
  let curly = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (double && escaped) {
      escaped = false;
      continue;
    }
    if (double && char === "\\") {
      escaped = true;
      continue;
    }
    if (!double && char === "'") {
      if (single && text[index + 1] === "'") {
        index += 1;
        continue;
      }
      single = !single;
      continue;
    }
    if (!single && char === '"') {
      double = !double;
      continue;
    }
    if (single || double) continue;
    if (char === "[") square += 1;
    else if (char === "]") square -= 1;
    else if (char === "{") curly += 1;
    else if (char === "}") curly -= 1;
    else if (char === ":" && square === 0 && curly === 0) {
      const key = text.slice(0, index).trim();
      const rest = text.slice(index + 1).trim();
      if (!KEY_PATTERN.test(key)) fail(line, `invalid mapping key: ${key || "<empty>"}`);
      return [key, rest];
    }
  }
  fail(line, "mapping entry must contain ':'");
}

function parseSingleQuoted(value: string, line: number): string {
  if (!value.endsWith("'")) fail(line, "unterminated single-quoted scalar");
  return value.slice(1, -1).replace(/''/g, "'");
}

function parseScalar(text: string, line: number): unknown {
  if (/^[!&*]/.test(text)) {
    fail(line, "YAML tags, anchors, and aliases are not supported", "YAML_UNSUPPORTED_FEATURE");
  }
  if (text === "|" || text === ">" || text.startsWith("|-") || text.startsWith(">-")) {
    fail(line, "block scalars are not supported", "YAML_UNSUPPORTED_FEATURE");
  }
  if (text.startsWith('"')) {
    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      fail(line, `invalid double-quoted scalar: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (text.startsWith("'")) return parseSingleQuoted(text, line);
  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      fail(line, `flow collections must use JSON syntax: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (text === "null" || text === "~") return null;
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) {
    const value = Number(text);
    if (!Number.isFinite(value)) fail(line, "numeric scalar must be finite");
    return value;
  }
  if (/^(?:yes|no|on|off)$/i.test(text)) {
    fail(line, `ambiguous boolean '${text}' is not supported; use true or false`);
  }
  return text;
}

function parseMapping(lines: readonly ParsedLine[], start: number, indent: number): ParseResult {
  const output: Record<string, unknown> = {};
  let index = start;
  while (index < lines.length) {
    const current = lines[index]!;
    if (current.indent < indent) break;
    if (current.indent > indent) fail(current.line, `unexpected indentation; expected ${indent} spaces`);
    if (current.text.startsWith("-")) break;
    const [key, rest] = splitMappingEntry(current.text, current.line);
    if (Object.hasOwn(output, key)) fail(current.line, `duplicate key: ${key}`, "YAML_DUPLICATE_KEY");
    if (rest) {
      output[key] = parseScalar(rest, current.line);
      index += 1;
      if (index < lines.length && lines[index]!.indent > indent) {
        fail(lines[index]!.line, `scalar key '${key}' cannot also have an indented child`);
      }
      continue;
    }
    const next = lines[index + 1];
    if (!next || next.indent <= indent) {
      output[key] = null;
      index += 1;
      continue;
    }
    if (next.indent !== indent + 2) fail(next.line, `nested block must be indented exactly ${indent + 2} spaces`);
    const child = parseBlock(lines, index + 1, indent + 2);
    output[key] = child.value;
    index = child.next;
  }
  return { value: output, next: index };
}

function parseSequence(lines: readonly ParsedLine[], start: number, indent: number): ParseResult {
  const output: unknown[] = [];
  let index = start;
  while (index < lines.length) {
    const current = lines[index]!;
    if (current.indent < indent) break;
    if (current.indent > indent) fail(current.line, `unexpected indentation; expected ${indent} spaces`);
    if (!current.text.startsWith("-")) break;
    if (current.text !== "-" && !current.text.startsWith("- ")) fail(current.line, "sequence marker '-' must be followed by a space");
    const rest = current.text === "-" ? "" : current.text.slice(2).trim();
    if (!rest) {
      const next = lines[index + 1];
      if (!next || next.indent !== indent + 2) fail(current.line, "empty sequence item requires an indented child block");
      const child = parseBlock(lines, index + 1, indent + 2);
      output.push(child.value);
      index = child.next;
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_.-]*\s*:/.test(rest)) {
      const [key, valueText] = splitMappingEntry(rest, current.line);
      const item: Record<string, unknown> = {};
      item[key] = valueText ? parseScalar(valueText, current.line) : null;
      index += 1;
      if (index < lines.length && lines[index]!.indent > indent) {
        if (lines[index]!.indent !== indent + 2) fail(lines[index]!.line, `sequence mapping continuation must use ${indent + 2} spaces`);
        const continuation = parseMapping(lines, index, indent + 2);
        for (const [continuationKey, continuationValue] of Object.entries(continuation.value as Record<string, unknown>)) {
          if (Object.hasOwn(item, continuationKey)) fail(lines[index]!.line, `duplicate key in sequence item: ${continuationKey}`);
          item[continuationKey] = continuationValue;
        }
        index = continuation.next;
      }
      output.push(item);
      continue;
    }
    output.push(parseScalar(rest, current.line));
    index += 1;
    if (index < lines.length && lines[index]!.indent > indent) {
      fail(lines[index]!.line, "scalar sequence item cannot have an indented child");
    }
  }
  return { value: output, next: index };
}

function parseBlock(lines: readonly ParsedLine[], start: number, indent: number): ParseResult {
  const current = lines[start];
  if (!current) return { value: {}, next: start };
  if (current.indent !== indent) fail(current.line, `expected ${indent} spaces of indentation`);
  return current.text.startsWith("-")
    ? parseSequence(lines, start, indent)
    : parseMapping(lines, start, indent);
}

export function parseOpenRillYaml(raw: string): unknown {
  const lines = preprocess(raw);
  if (lines.length === 0) return {};
  if (lines[0]!.indent !== 0) fail(lines[0]!.line, "root document must start at indentation 0");
  const parsed = parseBlock(lines, 0, 0);
  if (parsed.next !== lines.length) fail(lines[parsed.next]!.line, "unexpected trailing content");
  return parsed.value;
}

function formatScalar(value: string | number | boolean | null): string {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (
    value.length > 0
    && PLAIN_STRING_PATTERN.test(value)
    && !/^(?:null|true|false|yes|no|on|off|~)$/i.test(value)
    && !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)
  ) {
    return value;
  }
  return JSON.stringify(value);
}

function stringifyNode(value: unknown, indent: number): string[] {
  const prefix = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${prefix}[]`];
    const lines: string[] = [];
    for (const item of value) {
      if (item === null || ["string", "number", "boolean"].includes(typeof item)) {
        lines.push(`${prefix}- ${formatScalar(item as string | number | boolean | null)}`);
      } else {
        lines.push(`${prefix}-`);
        lines.push(...stringifyNode(item, indent + 2));
      }
    }
    return lines;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, child]) => child !== undefined);
    if (entries.length === 0) return [`${prefix}{}`];
    const lines: string[] = [];
    for (const [key, child] of entries) {
      if (!KEY_PATTERN.test(key)) throw new Error(`cannot stringify unsupported YAML key: ${key}`);
      if (child === null || ["string", "number", "boolean"].includes(typeof child)) {
        lines.push(`${prefix}${key}: ${formatScalar(child as string | number | boolean | null)}`);
      } else if (Array.isArray(child) && child.length === 0) {
        lines.push(`${prefix}${key}: []`);
      } else if (typeof child === "object" && Object.keys(child as object).length === 0) {
        lines.push(`${prefix}${key}: {}`);
      } else {
        lines.push(`${prefix}${key}:`);
        lines.push(...stringifyNode(child, indent + 2));
      }
    }
    return lines;
  }
  throw new Error(`cannot stringify YAML value of type ${typeof value}`);
}

export function stringifyOpenRillYaml(value: unknown): string {
  return `${stringifyNode(value, 0).join("\n")}\n`;
}
