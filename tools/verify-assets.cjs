const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname,'..');
const manifest = require('../assets-manifest.json');
const errors = [];
for(const item of manifest.files) {
  const file = path.resolve(root,item.path);
  if(!file.startsWith(root+path.sep)) throw new Error('Invalid asset path');
  if(!fs.existsSync(file)) { errors.push('Missing: '+item.path);continue; }
  const data=fs.readFileSync(file);
  if(data.length!==item.bytes||crypto.createHash('sha256').update(data).digest('hex')!==item.sha256) errors.push('Changed: '+item.path);
}
console.log(`Assets: ${manifest.files.length}; errors: ${errors.length}`);
if(errors.length) {console.error(errors.join('\n'));process.exitCode=1;}
