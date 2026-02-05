// Checks relative imports for existence, correct casing, and git tracking.
// Intended for CI/preflight; exits non-zero on problems.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const repoRoot = process.cwd();
const targets = [
  path.join(repoRoot, "backend", "src"),
  path.join(repoRoot, "backend", "netlify", "functions"),
];
const exts = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"];

let tracked = null;
try {
  tracked = new Set(
    execFileSync("git", ["ls-files"], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
  );
} catch {
  tracked = null;
}

const toRepoRel = (absPath) =>
  path.relative(repoRoot, absPath).split(path.sep).join("/");

const readDirSafe = (dir) => {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
};

const hasExactCase = (absPath) => {
  const resolved = path.resolve(absPath);
  const { root } = path.parse(resolved);
  const parts = resolved.slice(root.length).split(path.sep).filter(Boolean);
  let cur = root;
  for (const part of parts) {
    const entries = readDirSafe(cur);
    if (!entries.includes(part)) return false;
    cur = path.join(cur, part);
  }
  return true;
};

const resolveImport = (fromFile, spec) => {
  const base = path.resolve(path.dirname(fromFile), spec);
  const ext = path.extname(base);
  if (ext) {
    if (exts.includes(ext)) {
      return fs.existsSync(base) ? base : null;
    }
    // Allow dotted filenames like "./routes/public.routes" -> ".ts"
    for (const candidateExt of exts) {
      const candidate = `${base}${candidateExt}`;
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }
  for (const ext of exts) {
    const candidate = `${base}${ext}`;
    if (fs.existsSync(candidate)) return candidate;
  }
  for (const ext of exts) {
    const candidate = path.join(base, `index${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
};

const isScannable = (filePath) =>
  exts.includes(path.extname(filePath)) &&
  !filePath.includes("node_modules") &&
  !filePath.includes(path.join("dist")) &&
  !filePath.includes(path.join("build"));

const walk = (dir, out = []) => {
  for (const entry of readDirSafe(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (stat.isFile() && isScannable(full)) out.push(full);
  }
  return out;
};

const importRegex =
  /\b(?:import|export)\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g;

const errors = [];

for (const target of targets) {
  const files = walk(target);
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const spec = match[1] || match[2] || match[3];
      if (!spec || !spec.startsWith(".")) continue;
      const resolved = resolveImport(file, spec);
      if (!resolved) {
        errors.push(`Missing import: ${spec} from ${toRepoRel(file)}`);
        continue;
      }
      if (!hasExactCase(resolved)) {
        errors.push(`Case mismatch: ${spec} -> ${toRepoRel(resolved)}`);
      }
      const rel = toRepoRel(resolved);
      if (tracked && !tracked.has(rel)) {
        errors.push(`Untracked file: ${rel} (imported by ${toRepoRel(file)})`);
      }
    }
  }
}

if (!tracked) {
  console.warn("[resolver-check] Warning: git ls-files unavailable; skipping tracked-file checks.");
}

if (errors.length) {
  console.error("[resolver-check] Found issues:");
  for (const err of errors) console.error(`- ${err}`);
  process.exit(1);
}

console.log("[resolver-check] OK");
