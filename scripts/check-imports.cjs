#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];

  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__MACOSX') continue;

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.isFile() && full.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function resolveCandidates(baseDir, imp) {
  const candidates = [];
  const resolved = path.resolve(baseDir, imp);
  candidates.push(resolved);
  if (!path.extname(resolved)) {
    candidates.push(resolved + '.js');
    candidates.push(resolved + '.mjs');
    candidates.push(resolved + '.cjs');
    candidates.push(path.join(resolved, 'index.js'));
  }
  return candidates;
}

const files = walk('src').concat(walk('core'));
const problems = [];

const importRegex = /import\s+(?:[^'";]+?\s+from\s+)?["']([^"']+)["']/g;
const requireRegex = /require\(\s*["']([^"']+)["']\s*\)/g;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const dir = path.dirname(file);

  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const imp = match[1];
    if (!imp.startsWith('.')) continue;

    const candidates = resolveCandidates(dir, imp);
    const ok = candidates.some(fileExists);
    if (!ok) problems.push({ file, import: imp, candidates });
  }

  while ((match = requireRegex.exec(content)) !== null) {
    const imp = match[1];
    if (!imp.startsWith('.')) continue;

    const candidates = resolveCandidates(dir, imp);
    const ok = candidates.some(fileExists);
    if (!ok) problems.push({ file, import: imp, candidates });
  }
}

if (problems.length) {
  console.error('Missing import targets detected:');
  for (const problem of problems) {
    console.error(`- ${problem.file}: import '${problem.import}' -> tried:`);
    for (const candidate of problem.candidates) {
      console.error(`    ${candidate}`);
    }
  }
  process.exit(1);
}

console.log('All relative imports resolved.');
