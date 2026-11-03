// Clean-room specification and query tool for upstream eMush (PHP).
//
// Usage:
//   npm run emush -- check                   Check if reference/emush exists and show summary
//   npm run emush -- find <term>             Find matching files and method signatures (no bodies)
//   npm run emush -- outline <file or class> Extract constants, docblocks, and method signatures (bodies stripped)
//   npm run emush -- spec <file or query>    Distill pure behavioral specification using headless Gemini (agy)
//
// Invariants:
// - Never dumps raw PHP implementation bodies into stdout to keep agent context clean and avoid AGPL code leakage.
// - All extracted rules are behavioral specifications for clean-room implementation in mush2.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../");

export function resolveEmushDir(): string {
  if (process.env.EMUSH_DIR && existsSync(process.env.EMUSH_DIR)) {
    return resolve(process.env.EMUSH_DIR);
  }
  const defaultPath = resolve(REPO_ROOT, "reference/emush");
  return defaultPath;
}

export function listPhpFiles(dir: string, baseDir: string = dir): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip common large non-code directories
        if (entry.name === ".git" || entry.name === "vendor" || entry.name === "node_modules" || entry.name === "public") continue;
        results.push(...listPhpFiles(fullPath, baseDir));
      } else if (entry.isFile() && entry.name.endsWith(".php")) {
        results.push(relative(baseDir, fullPath));
      }
    }
  } catch {
    // Ignore read errors
  }
  return results;
}

/**
 * Strips method implementation bodies from PHP code, keeping only docblocks,
 * class declarations, constants, property declarations, and function signatures.
 */
export function outlinePhp(phpCode: string): string {
  const lines = phpCode.split("\n");
  const output: string[] = [];
  let inDocComment = false;
  let braceDepth = 0;
  let capturingSignature = false;
  let signatureBuffer = "";

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (trimmed.startsWith("/**")) inDocComment = true;
    if (inDocComment) {
      output.push(rawLine);
      if (trimmed.endsWith("*/")) inDocComment = false;
      continue;
    }

    // Top-level or class-level constants and definitions
    if (braceDepth <= 1) {
      if (
        trimmed.startsWith("namespace ") ||
        trimmed.startsWith("use ") ||
        trimmed.startsWith("class ") ||
        trimmed.startsWith("interface ") ||
        trimmed.startsWith("trait ") ||
        trimmed.startsWith("const ") ||
        trimmed.startsWith("public const ") ||
        trimmed.startsWith("protected const ") ||
        trimmed.startsWith("private const ") ||
        trimmed.startsWith("public ") ||
        trimmed.startsWith("protected ") ||
        trimmed.startsWith("private ") ||
        trimmed.startsWith("var ")
      ) {
        if (!trimmed.includes("function ")) {
          output.push(rawLine);
        }
      }
    }

    // Function or method signatures
    if (
      (trimmed.includes("function ") || capturingSignature) &&
      (trimmed.startsWith("public ") ||
        trimmed.startsWith("protected ") ||
        trimmed.startsWith("private ") ||
        trimmed.startsWith("static ") ||
        trimmed.startsWith("function ") ||
        capturingSignature)
    ) {
      if (!capturingSignature) {
        signatureBuffer = rawLine;
      } else {
        signatureBuffer += `\n${rawLine}`;
      }

      if (trimmed.includes("{") || trimmed.includes(";")) {
        capturingSignature = false;
        // Strip opening brace and replace with abstract semicolon
        const cleanSig = signatureBuffer.replace(/\{[\s\S]*$/, "").trimEnd();
        output.push(`${cleanSig};`);
        signatureBuffer = "";
      } else {
        capturingSignature = true;
      }
    }

    // Track braces
    for (let i = 0; i < rawLine.length; i++) {
      if (rawLine[i] === "{") braceDepth++;
      else if (rawLine[i] === "}") braceDepth = Math.max(0, braceDepth - 1);
    }
  }

  return output.join("\n");
}

export function searchEmush(emushDir: string, query: string, maxResults = 30): { file: string; line: number; text: string }[] {
  const files = listPhpFiles(emushDir);
  const regex = new RegExp(query, "i");
  const matches: { file: string; line: number; text: string }[] = [];

  for (const relFile of files) {
    const fullPath = join(emushDir, relFile);
    try {
      const content = readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (regex.test(line)) {
          // If match is inside a function body, try to provide context or method name
          matches.push({ file: relFile, line: i + 1, text: line.trim() });
          if (matches.length >= maxResults) return matches;
        }
      }
    } catch {
      // skip unreadable files
    }
  }
  return matches;
}

export function extractBlock(lines: string[], targetLineIndex: number): string {
  // Look for the closest enclosing array `[` or function/method declaration
  let start = targetLineIndex;
  while (start > 0 && !lines[start]!.trim().startsWith("[") && !lines[start]!.trim().startsWith("public function ") && !lines[start]!.trim().startsWith("protected function ") && !lines[start]!.trim().startsWith("private function ")) {
    // If we've walked up 50 lines without finding an enclosing block start, stop
    if (targetLineIndex - start > 50) break;
    start--;
  }

  let depth = 0;
  let end = start;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]!) {
      if (ch === "[" || ch === "{") depth++;
      else if (ch === "]" || ch === "}") depth--;
    }
    if (depth <= 0) {
      end = i;
      break;
    }
    if (i - start > 100) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end + 1).join("\n");
}

export function runCleanRoomSpec(emushDir: string, target: string): string {
  const files = listPhpFiles(emushDir);
  const matchedFiles = files.filter((f) => f.toLowerCase().includes(target.toLowerCase()));

  let snippet = "";
  if (matchedFiles.length > 0) {
    const primaryFile = matchedFiles[0]!;
    const fullPath = join(emushDir, primaryFile);
    const content = readFileSync(fullPath, "utf-8");
    snippet = `--- File: ${primaryFile} ---\n${content.slice(0, 12000)}`;
  } else {
    // Search across files, prioritizing ConfigData, Action, Equipment, and Place files
    const hits = searchEmush(emushDir, target, 50);
    if (hits.length === 0) {
      return `No matches found for "${target}" in ${emushDir}.`;
    }

    // Prioritize hits in PlaceConfigData and files directly defining the target
    hits.sort((a, b) => {
      const aScore =
        (a.file.includes("PlaceConfigData") ? 20 : 0) +
        (a.file.includes("EquipmentConfigData") ? 15 : 0) +
        (a.file.includes("ConfigData") ? 10 : 0) +
        (a.file.includes("Action") ? 5 : 0);
      const bScore =
        (b.file.includes("PlaceConfigData") ? 20 : 0) +
        (b.file.includes("EquipmentConfigData") ? 15 : 0) +
        (b.file.includes("ConfigData") ? 10 : 0) +
        (b.file.includes("Action") ? 5 : 0);
      return bScore - aScore;
    });

    const fileSnippets: string[] = [];
    const visitedFiles = new Set<string>();

    for (const hit of hits) {
      if (visitedFiles.has(hit.file)) continue;
      visitedFiles.add(hit.file);

      const content = readFileSync(join(emushDir, hit.file), "utf-8").split("\n");
      const block = extractBlock(content, hit.line - 1);
      fileSnippets.push(`--- File: ${hit.file} ---\n${block.slice(0, 3000)}`);
      if (fileSnippets.length >= 5) break;
    }
    snippet = fileSnippets.join("\n\n").slice(0, 15000);
  }

  // Check if agy is available to synthesize a clean spec
  const agyPath = process.env.AGY_PATH || "/home/near/.local/bin/agy";
  if (existsSync(agyPath)) {
    const prompt = `You are a clean-room specification extractor.
Your job is to read the following PHP code from eMush and output ONLY a pure behavioral specification for mush2.
Do NOT output any PHP code, syntax, variable names, or structural code.
Express all rules, chances, costs, and state transitions in clear English and mathematical formulas.

Target topic: "${target}"

PHP Code excerpt:
${snippet}

Format your response as:
## Feature / Action Name
- **Preconditions**: (requirements, items, statuses, AP costs)
- **Probabilities & Formulas**: (exact success/failure % and formulas)
- **Effects**: (state mutations, inventory, morale/PV)
- **Visibility & Logs**: (public log text vs. private/secret log events)
- **Edge Cases & Failure Modes**:`;

    try {
      const res = execFileSync(agyPath, ["-p", prompt, "--mode", "plan", "--model", "gemini-3.8-flash-medium", "--print-timeout", "60s"], {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
        stdio: ["pipe", "pipe", "ignore"],
      });
      return res.trim();
    } catch {
      // Fall through to clean structural extraction
    }
  }

  // Pure clean-room structural distillation fallback
  const output: string[] = [`## Clean-Room Behavioral Spec: ${target}\n`];

  // Extract placeName / room info if present
  const placeMatch = snippet.match(/'placeName'\s*=>\s*['"]([^'"]+)['"]/);
  if (placeMatch) {
    output.push(`**Room / Place**: \`${placeMatch[1]}\`\n`);
  }

  // If this snippet contains array item definitions, aggregate counts
  const itemMatches = snippet.match(/'items'\s*=>\s*\[([^\]]+)\]/g);
  if (itemMatches) {
    output.push("### Items / Stock Quantities:");
    for (const match of itemMatches) {
      const inner = match.replace(/'items'\s*=>\s*\[/, "").replace(/\]$/, "");
      const items = inner
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
      const counts = new Map<string, number>();
      for (const item of items) {
        counts.set(item, (counts.get(item) ?? 0) + 1);
      }
      for (const [item, count] of counts.entries()) {
        output.push(`- **${item}**: ${count}`);
      }
    }
    output.push("");
  }

  // Equipment matches
  const equipMatches = snippet.match(/'equipments'\s*=>\s*\[([^\]]+)\]/g);
  if (equipMatches) {
    output.push("### Fixed Equipment:");
    for (const match of equipMatches) {
      const inner = match.replace(/'equipments'\s*=>\s*\[/, "").replace(/\]$/, "");
      const equips = inner
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
      for (const eq of equips) {
        output.push(`- **${eq}**`);
      }
    }
    output.push("");
  }

  // Doors matches
  const doorMatches = snippet.match(/'doors'\s*=>\s*\[([^\]]+)\]/g);
  if (doorMatches) {
    output.push("### Connected Doors:");
    for (const match of doorMatches) {
      const inner = match.replace(/'doors'\s*=>\s*\[/, "").replace(/\]$/, "");
      const doors = inner
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
      for (const d of doors) {
        output.push(`- **${d}**`);
      }
    }
    output.push("");
  }

  output.push("### Declarations (Implementation bodies stripped):");
  output.push(outlinePhp(snippet));

  return output.join("\n");
}

// CLI handler
if (process.argv[1] && process.argv[1].endsWith("emush.ts")) {
  const args = process.argv.slice(2);
  const command = args[0];
  const emushDir = resolveEmushDir();

  if (!existsSync(emushDir) && command !== "check") {
    console.error(`eMush directory not found at: ${emushDir}`);
    console.error("Please place the eMush repository in reference/emush/ or set EMUSH_DIR.");
    process.exit(1);
  }

  switch (command) {
    case "check": {
      if (!existsSync(emushDir)) {
        console.log(`Status: Not found at ${emushDir}`);
        console.log("Clone or copy eMush to reference/emush/ to use this tool.");
      } else {
        const files = listPhpFiles(emushDir);
        console.log(`Status: Ready (${files.length} PHP/JSON files found in ${emushDir})`);
      }
      break;
    }

    case "find": {
      const query = args[1];
      if (!query) {
        console.error("Usage: npm run emush -- find <query>");
        process.exit(1);
      }
      const matches = searchEmush(emushDir, query);
      if (matches.length === 0) {
        console.log(`No matches for "${query}".`);
      } else {
        console.log(`Found ${matches.length} matches for "${query}":`);
        for (const m of matches) {
          console.log(`  ${m.file}:${m.line}  ${m.text.slice(0, 90)}`);
        }
      }
      break;
    }

    case "outline": {
      const target = args[1];
      if (!target) {
        console.error("Usage: npm run emush -- outline <file or class>");
        process.exit(1);
      }
      const files = listPhpFiles(emushDir);
      const match = files.find((f) => f.toLowerCase().includes(target.toLowerCase()));
      if (!match) {
        console.error(`No file matching "${target}".`);
        process.exit(1);
      }
      const fullPath = join(emushDir, match);
      const code = readFileSync(fullPath, "utf-8");
      console.log(`// Clean-room outline for ${match} (function bodies stripped):\n`);
      console.log(outlinePhp(code));
      break;
    }

    case "spec": {
      const target = args[1];
      if (!target) {
        console.error("Usage: npm run emush -- spec <file or topic>");
        process.exit(1);
      }
      console.log(runCleanRoomSpec(emushDir, target));
      break;
    }

    default: {
      console.log(`Usage:
  npm run emush -- check                   Check if reference/emush is present
  npm run emush -- find <query>            Find occurrences in eMush PHP files
  npm run emush -- outline <file>          Extract signatures & constants (bodies stripped)
  npm run emush -- spec <topic or file>    Generate clean-room behavioral specification via AI`);
      break;
    }
  }
}
