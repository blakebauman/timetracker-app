#!/usr/bin/env node
// Validates the project's Claude Code toolkit: skills against the Agent Skills
// spec (agentskills.io/specification) plus the Claude Code extensions we use,
// subagents against the frontmatter Claude Code reads, and every hook command
// in settings.json against a script that exists and is executable.
//
//   node .claude/scripts/validate-toolkit.mjs            # whole toolkit
//   node .claude/scripts/validate-toolkit.mjs <file>...  # just these (hook path)
//
// Claude Code silently ignores an unknown or misspelled frontmatter key, so a
// typo like `allowed_tools` or `disable-model-invocaton` does nothing and
// nothing says so. This is the check that says so. No dependencies: it runs
// in CI before `pnpm install` would matter and inside a hook in milliseconds.

import { existsSync, readFileSync, readdirSync, statSync, accessSync, constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const claudeDir = path.join(root, ".claude");

// Vendored third-party skills: checked against the spec, but their extra keys
// and local paths are upstream's business, not ours.
const VENDORED = new Set(["impeccable"]);

// The Agent Skills spec's own fields.
const SPEC_SKILL_KEYS = new Set(["name", "description", "license", "compatibility", "metadata", "allowed-tools"]);
// Claude Code extensions (code.claude.com/docs/en/skills). Valid here; a skill
// that uses them won't load in a strict spec client, which is the trade we make
// for side-effect gating (`disable-model-invocation`) and forked context.
const CLAUDE_SKILL_KEYS = new Set([
  "when_to_use", "argument-hint", "arguments", "disable-model-invocation", "user-invocable",
  "disallowed-tools", "model", "effort", "context", "agent", "background", "hooks", "paths", "shell",
]);
const AGENT_KEYS = new Set([
  "name", "description", "tools", "disallowedTools", "model", "permissionMode", "maxTurns",
  "autoCompactWindow", "skills", "mcpServers", "hooks", "memory", "background", "omitClaudeMd",
  "effort", "isolation", "color", "initialPrompt", "experimental",
]);
const AGENT_MODELS = /^(sonnet|opus|haiku|fable|inherit|claude-[a-z0-9-]+)$/;
const COLORS = new Set(["red", "blue", "green", "yellow", "purple", "orange", "pink", "cyan"]);
const BUILTIN_TOOLS = new Set([
  "Read", "Write", "Edit", "MultiEdit", "Glob", "Grep", "Bash", "WebFetch", "WebSearch",
  "NotebookEdit", "Agent", "Skill", "TodoWrite", "LSP", "Monitor", "ToolSearch",
]);

const errors = [];
const warnings = [];
const err = (file, msg) => errors.push(`${path.relative(root, file)}: ${msg}`);
const warn = (file, msg) => warnings.push(`${path.relative(root, file)}: ${msg}`);

/** Minimal frontmatter reader: top-level `key: value` and `key:` + `- item` lists. */
function frontmatter(file) {
  const text = readFileSync(file, "utf8");
  if (!text.startsWith("---\n")) return { data: null, body: text };
  const end = text.indexOf("\n---", 4);
  if (end < 0) return { data: null, body: text };
  const data = {};
  let current = null;
  for (const line of text.slice(4, end).split("\n")) {
    const top = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (top) {
      current = top[1];
      const value = top[2].trim().replace(/^["']|["']$/g, "");
      data[current] = value === "" ? [] : value;
    } else if (current && /^\s+-\s+/.test(line) && Array.isArray(data[current])) {
      data[current].push(line.replace(/^\s+-\s+/, "").trim());
    } else if (current && /^\s+\S/.test(line) && Array.isArray(data[current]) && data[current].length === 0) {
      data[current] = "[map]"; // nested map (metadata, hooks, mcpServers)
    }
  }
  return { data, body: text.slice(end + 4) };
}

function checkSkill(dir) {
  const name = path.basename(dir);
  const file = path.join(dir, "SKILL.md");
  if (!existsSync(file)) return err(dir, "skill directory has no SKILL.md");
  const vendored = VENDORED.has(name);
  const { data, body } = frontmatter(file);
  if (!data) return err(file, "missing YAML frontmatter (the opening --- must be line 1)");

  // Spec: name is required, 1-64 chars, lowercase/digits/hyphens, matches the directory.
  if (!data.name) err(file, "`name` is required by the Agent Skills spec");
  else {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(data.name) || data.name.length > 64)
      err(file, `name "${data.name}" must be 1-64 lowercase letters, digits and single hyphens`);
    if (data.name !== name) err(file, `name "${data.name}" must match its directory "${name}"`);
  }
  const description = typeof data.description === "string" ? data.description : "";
  if (!description) err(file, "`description` is required and must say what the skill does and when to use it");
  else if (description.length > 1024) err(file, `description is ${description.length} chars; the spec caps it at 1024`);
  else if (description.length < 60) warn(file, "description is very short — say when to use it, with trigger keywords");

  for (const key of Object.keys(data)) {
    if (!SPEC_SKILL_KEYS.has(key) && !CLAUDE_SKILL_KEYS.has(key)) {
      (vendored ? warn : err)(file, `unknown frontmatter key "${key}" — Claude Code ignores it silently`);
    }
  }
  if (data.context && data.context !== "fork") err(file, `context must be "fork" (got "${data.context}")`);
  if (data.agent && data.context !== "fork") warn(file, "`agent` only applies with `context: fork`");

  const lines = body.split("\n").length;
  if (lines > 500) err(file, `SKILL.md body is ${lines} lines; keep it under 500 and move detail into references/`);

  if (!vendored) {
    if (/\/Users\/[a-z]+\//.test(body + JSON.stringify(data)))
      err(file, "hard-coded home-directory path — use ${CLAUDE_PROJECT_DIR} or ${CLAUDE_SKILL_DIR}");
    // Relative links one level deep must resolve (spec: file references).
    for (const [, target] of body.matchAll(/\]\(((?:references|scripts|assets)\/[^)#\s]+)\)/g)) {
      if (!existsSync(path.join(dir, target))) err(file, `links to ${target}, which does not exist`);
    }
    for (const [, target] of body.matchAll(/\$\{CLAUDE_SKILL_DIR\}\/([\w./-]+)/g)) {
      if (!existsSync(path.join(dir, target))) err(file, `runs \${CLAUDE_SKILL_DIR}/${target}, which does not exist`);
    }
  }
}

function checkAgent(file) {
  const { data, body } = frontmatter(file);
  if (!data) return err(file, "missing YAML frontmatter — Claude Code treats the file as documentation and skips it");
  if (!data.name) err(file, "`name` is required — without it the agent is silently skipped");
  else if (data.name.includes(":") || data.name.startsWith("-")) err(file, `name "${data.name}" may not contain ':' or start with '-'`);
  if (!data.description) err(file, "`description` is required — it is how Claude decides to delegate");
  for (const key of Object.keys(data)) {
    if (!AGENT_KEYS.has(key)) err(file, `unknown frontmatter key "${key}" — Claude Code ignores it silently`);
  }
  if (data.model && !AGENT_MODELS.test(data.model)) err(file, `model "${data.model}" is not a model alias or id`);
  if (data.color && !COLORS.has(data.color)) err(file, `color "${data.color}" is not one of ${[...COLORS].join(", ")}`);
  if (data.memory && !["user", "project", "local"].includes(data.memory)) err(file, "memory must be user, project or local");
  const tools = Array.isArray(data.tools) ? data.tools : String(data.tools ?? "").split(",");
  for (const raw of tools) {
    const tool = raw.trim().replace(/\(.*\)$/, "");
    if (tool && !BUILTIN_TOOLS.has(tool) && !tool.startsWith("mcp__")) err(file, `unknown tool "${tool}"`);
  }
  if (body.trim().length < 200) warn(file, "system prompt is very short — a subagent knows only what this body tells it");
  if (/\/Users\/[a-z]+\//.test(body)) err(file, "hard-coded home-directory path");
}

function checkSettings(file) {
  let settings;
  try {
    settings = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    return err(file, `not valid JSON: ${e.message}`);
  }
  for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
    for (const group of groups) {
      for (const hook of group.hooks ?? []) {
        if (hook.type !== "command") continue;
        const script = hook.command.match(/\.claude\/hooks\/[\w.-]+/)?.[0];
        if (!script) continue;
        const abs = path.join(root, script);
        if (!existsSync(abs)) err(file, `${event} hook runs ${script}, which does not exist`);
        else {
          try {
            accessSync(abs, constants.X_OK);
          } catch {
            err(file, `${event} hook ${script} is not executable (chmod +x)`);
          }
        }
        if (!hook.command.includes("CLAUDE_PROJECT_DIR"))
          warn(file, `${event} hook "${hook.command}" should be anchored on $CLAUDE_PROJECT_DIR — a relative path breaks once Claude cds`);
      }
    }
  }
}

const listDirs = (dir) =>
  existsSync(dir) ? readdirSync(dir).map((d) => path.join(dir, d)).filter((d) => statSync(d).isDirectory()) : [];
const listMd = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true }).filter((f) => f.endsWith(".md")).map((f) => path.join(dir, f))
    : [];

const targets = process.argv.slice(2).map((f) => path.resolve(f));
const only = (p) => targets.length === 0 || targets.some((t) => t === p || t.startsWith(p + path.sep) || p.startsWith(t));

for (const dir of listDirs(path.join(claudeDir, "skills"))) if (only(dir)) checkSkill(dir);
for (const file of listMd(path.join(claudeDir, "agents"))) if (only(file)) checkAgent(file);
const settingsFile = path.join(claudeDir, "settings.json");
if (existsSync(settingsFile) && (targets.length === 0 || targets.some((t) => t.startsWith(path.join(claudeDir, "hooks")) || t === settingsFile)))
  checkSettings(settingsFile);

for (const w of warnings) console.log(`warn   ${w}`);
for (const e of errors) console.log(`error  ${e}`);
if (targets.length === 0) console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
