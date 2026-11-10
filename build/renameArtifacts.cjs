// Release artifacts use "x86_64" for Intel builds (…-mac-x86_64.dmg, …-win-x86_64.exe,
// …-linux-x86_64.AppImage), matching earlier releases. electron-builder's ${arch}
// yields "x64", so rename after packaging. Safe to run repeatedly.
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'release');
if (!fs.existsSync(dir)) process.exit(0);
for (const name of fs.readdirSync(dir)) {
  const m = /^(Trace-.+-(?:mac|win|linux))-x64(\..+)$/.exec(name);
  if (!m) continue;
  const next = `${m[1]}-x86_64${m[2]}`;
  fs.renameSync(path.join(dir, name), path.join(dir, next));
  console.log(`[rename] ${name} -> ${next}`);
}
