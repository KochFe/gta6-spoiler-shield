// Checks that a signed .xpi contains exactly the add-on's source files, byte
// for byte, plus Mozilla's signature files in META-INF/. Guards against a
// compromised build tool slipping code into what Mozilla signs.
// Dependency-free on purpose: the point is not to trust node_modules.
//
// Usage: node scripts/verify-xpi.mjs <file.xpi>
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { inflateRawSync } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Everything web-ext packages (see webExt.ignoreFiles in package.json).
const SHIPPED = ['manifest.json', 'icons', 'src'];
const SIGNATURE_DIR = 'META-INF/';

function readZip(buf) {
  // End-of-central-directory record sits in the last 22 bytes (+ comment).
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('corrupt central directory');
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLength = buf.readUInt16LE(p + 28);
    const extraLength = buf.readUInt16LE(p + 30);
    const commentLength = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLength);
    p += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) continue;
    if (name.includes('\\') || name.startsWith('/') || name.split('/').includes('..')) {
      throw new Error(`suspicious path in archive: ${name}`);
    }
    if (files.has(name)) throw new Error(`duplicate entry: ${name}`);
    const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    const raw = buf.subarray(start, start + compressedSize);
    if (method === 0) files.set(name, raw);
    else if (method === 8) files.set(name, inflateRawSync(raw));
    else throw new Error(`unsupported compression method ${method} for ${name}`);
  }
  return files;
}

function sourceFiles() {
  const files = new Map();
  const walk = (rel) => {
    const abs = path.join(root, rel);
    if (!statSync(abs).isDirectory()) {
      files.set(rel.split(path.sep).join('/'), readFileSync(abs));
      return;
    }
    for (const entry of readdirSync(abs)) walk(path.join(rel, entry));
  };
  for (const entry of SHIPPED) walk(entry);
  return files;
}

// AMO re-serializes manifest.json when signing (formatting only), so it is
// compared by content; every other file must match byte for byte.
function sameFile(name, expected, actual) {
  if (name !== 'manifest.json') return expected.equals(actual);
  try {
    return isDeepStrictEqual(JSON.parse(expected), JSON.parse(actual));
  } catch {
    return false;
  }
}

// Returns a list of problems; empty means the package matches the source.
export function verifyXpi(xpiPath) {
  const packaged = readZip(readFileSync(xpiPath));
  const source = sourceFiles();
  const problems = [];
  let signed = false;
  for (const [name, data] of packaged) {
    if (name.startsWith(SIGNATURE_DIR)) {
      signed = true;
      continue;
    }
    const expected = source.get(name);
    if (!expected) problems.push(`unexpected file in package: ${name}`);
    else if (!sameFile(name, expected, data)) problems.push(`differs from source: ${name}`);
  }
  for (const name of source.keys()) if (!packaged.has(name)) problems.push(`missing from package: ${name}`);
  if (!signed) problems.push('no Mozilla signature (META-INF/) found');
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/verify-xpi.mjs <file.xpi>');
    process.exit(2);
  }
  let problems;
  try {
    problems = verifyXpi(file);
  } catch (err) {
    problems = [`unreadable package: ${err.message}`];
  }
  if (problems.length) {
    console.error(`✖ ${path.basename(file)} does NOT match the source:\n  ` + problems.join('\n  '));
    process.exit(1);
  }
  console.log(`✔ ${path.basename(file)}: signed, and every file matches the source`);
}
