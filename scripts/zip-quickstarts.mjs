// Zips each quickstarts/<name>/result into public/downloads/<name>.zip (the folder inside is <name>/),
// and copies the one-file stack to public/downloads/quickstart.yaml. Runs before every build.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'public', 'downloads');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const name of readdirSync(join(root, 'quickstarts'))) {
  const result = join(root, 'quickstarts', name, 'result');
  if (!existsSync(result)) continue;
  const tmp = mkdtempSync(join(tmpdir(), 'qs-'));
  cpSync(result, join(tmp, name), { recursive: true });
  execFileSync('zip', ['-qr', join(out, `${name}.zip`), name], { cwd: tmp });
  rmSync(tmp, { recursive: true, force: true });
  console.log(`[zip-quickstarts] downloads/${name}.zip`);
}
cpSync(join(root, 'quickstarts', '_shared', 'quickstart.yaml'), join(out, 'quickstart.yaml'));
