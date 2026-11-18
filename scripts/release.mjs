// Publishes a new version that installed copies pick up automatically:
// bump version → tests + lint → sign (unlisted) → GitHub release with the .xpi
// → add it to updates.json (the manifest's update_url) and push.
//
// Usage (PowerShell, with the AMO credentials set as for `npm run sign`):
//   npm run release -- <patch|minor|major|x.y.z>
import { execSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'KochFe/gta6-spoiler-shield';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'web-ext-artifacts');
const manifestPath = path.join(root, 'manifest.json');
const updatesPath = path.join(root, 'updates.json');

const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const gh = (...args) => execFileSync('gh', args, { cwd: root, stdio: 'inherit' });
const fail = (msg) => {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
};

function nextVersion(current, how) {
  const [major, minor, patch] = current.split('.').map(Number);
  if (how === 'major') return `${major + 1}.0.0`;
  if (how === 'minor') return `${major}.${minor + 1}.0`;
  if (how === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (/^\d+\.\d+\.\d+$/.test(how ?? '')) return how;
  fail('Usage: npm run release -- <patch|minor|major|x.y.z>');
}

const isNewer = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

// --- Preconditions -----------------------------------------------------------

if (!process.env.WEB_EXT_API_KEY || !process.env.WEB_EXT_API_SECRET) {
  fail('Set $env:WEB_EXT_API_KEY and $env:WEB_EXT_API_SECRET first (see README).');
}
if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') fail('Release from the main branch.');
if (git('status', '--porcelain')) fail('Commit or stash your changes first.');

const manifestText = readFileSync(manifestPath, 'utf8');
const current = JSON.parse(manifestText).version;
const version = nextVersion(current, process.argv[2]);
if (!isNewer(version, current)) fail(`${version} is not newer than ${current}.`);
const tag = `v${version}`;
const assetName = `gta6-spoiler-shield-${version}.xpi`;
console.log(`Releasing ${current} → ${version}\n`);

// --- Bump, verify, sign --------------------------------------------------------

writeFileSync(manifestPath, manifestText.replace(/"version": "[^"]+"/, `"version": "${version}"`));
run(`npm version ${version} --no-git-tag-version`); // package.json + package-lock.json

let assetPath;
try {
  run('npm run check');
  const started = Date.now();
  run('npx web-ext sign --channel=unlisted');
  // web-ext names the download after AMO's file name; take the one just written.
  const signed = readdirSync(artifacts)
    .filter((f) => f.endsWith('.xpi'))
    .map((f) => path.join(artifacts, f))
    .filter((f) => statSync(f).mtimeMs >= started - 1000)
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  if (!signed) throw new Error('web-ext sign finished but no new .xpi was found');
  assetPath = path.join(artifacts, assetName);
  if (signed !== assetPath) copyFileSync(signed, assetPath);
} catch (err) {
  git('checkout', '--', 'manifest.json', 'package.json', 'package-lock.json');
  fail(`${err.message}\nVersion bump reverted; nothing was pushed.`);
}

// --- Publish: release first, then point updates.json at it ---------------------

git('add', 'manifest.json', 'package.json', 'package-lock.json');
git('commit', '-m', `Release ${tag}`);
git('tag', tag);
git('push', 'origin', 'main', tag);
gh('release', 'create', tag, assetPath, '--repo', REPO, '--title', tag, '--notes', `Signed build of ${tag}.`);

const hash = createHash('sha256').update(readFileSync(assetPath)).digest('hex');
const updates = JSON.parse(readFileSync(updatesPath, 'utf8'));
const id = JSON.parse(readFileSync(manifestPath, 'utf8')).browser_specific_settings.gecko.id;
updates.addons[id].updates.push({
  version,
  update_link: `https://github.com/${REPO}/releases/download/${tag}/${assetName}`,
  update_hash: `sha256:${hash}`,
});
writeFileSync(updatesPath, JSON.stringify(updates, null, 2) + '\n');
git('add', 'updates.json');
git('commit', '-m', `Point updates.json at ${tag}`);
git('push', 'origin', 'main');

console.log(`\n✔ ${tag} released: https://github.com/${REPO}/releases/tag/${tag}`);
console.log(`  Installed copies (1.2.0 or newer) update within about a day.`);
console.log(`  New installs / first-time update: ${assetPath}`);
