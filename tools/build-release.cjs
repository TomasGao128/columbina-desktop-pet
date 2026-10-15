/* Build portable and asset-only ZIPs without npm dependencies or personal data. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
const dist = path.join(root, 'dist');
const media = /\.(png|webp|jpe?g|gif|ico|mp3|wav|ogg)$/i;
function walk(dir) {
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => {
    const file = path.join(dir,e.name);
    if(e.isSymbolicLink()) throw new Error('Symlink not supported: '+file);
    return e.isDirectory() ? walk(file) : [file];
  });
}
function relative(file) {return path.relative(root,file).replaceAll('\\','/');}
function copy(file,stage) {
  const target = path.join(stage,relative(file));
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(file,target);
}
function zip(stage,name) {
  const target = path.join(dist,name);
  if(fs.existsSync(target)) throw new Error('Output exists; move it before rebuilding: '+target);
  const quote = s => "'"+s.replaceAll("'","''")+"'";
  cp.execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',
    'Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory('+quote(stage)+','+quote(target)+',[IO.Compression.CompressionLevel]::Optimal,$false)'],{windowsHide:true,stdio:'inherit'});
  return {file:name,sha256:crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'),bytes:fs.statSync(target).size};
}
fs.mkdirSync(dist,{recursive:true});
const portableStage = fs.mkdtempSync(path.join(dist,'.portable-'));
const assetStage = fs.mkdtempSync(path.join(dist,'.assets-'));
const tracked = cp.execFileSync('git',['ls-files','-z'],{cwd:root}).toString().split('\0').filter(Boolean);
const forbidden = /(?:^|\/)(?:settings|pet-position|chat-config|chat-history|paper-history|polish-history|summary-history|chat-memories|weather-config)\.json$|\.log$|\.lnk$/i;
for(const f of tracked) {
  if(forbidden.test(f)||f.startsWith('.git')||f.startsWith('.doc-work/')||f.startsWith('dist/')) continue;
  copy(path.join(root,f),portableStage);
}
const assets = walk(path.join(root,'app')).filter(f=>media.test(f));
for(const file of assets) {copy(file,portableStage);copy(file,assetStage);}
const manifest = assets.map(f=>({path:relative(f),bytes:fs.statSync(f).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')}));
fs.writeFileSync(path.join(root,'assets-manifest.json'),JSON.stringify({version,files:manifest},null,2)+'\n');
for(const stage of [portableStage,assetStage]) fs.copyFileSync(path.join(root,'assets-manifest.json'),path.join(stage,'assets-manifest.json'));
if(!fs.existsSync(path.join(root,'runtime/electron.exe'))) throw new Error('Missing runtime/electron.exe');
for(const file of walk(path.join(root,'runtime'))) copy(file,portableStage);
for(const file of walk(path.join(root,'docs')).filter(f=>/\.docx$/i.test(f))) copy(file,portableStage);
const previews = path.join(dist,'previews');
if(fs.existsSync(previews)) for(const file of walk(previews)) {
  const target=path.join(portableStage,'docs','previews',path.basename(file));
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target);
}
for(const f of walk(portableStage)) if(forbidden.test(relative(f))) throw new Error('Private file in package: '+f);
const result=[zip(portableStage,`columbina-desktop-pet-v${version}-windows-x64.zip`),zip(assetStage,`columbina-desktop-pet-v${version}-assets.zip`)];
fs.writeFileSync(path.join(dist,'SHA256SUMS.txt'),result.map(r=>`${r.sha256}  ${r.file}`).join('\n')+'\n');
fs.writeFileSync(path.join(dist,'build-report.json'),JSON.stringify({version,assets:assets.length,packages:result},null,2)+'\n');
// Only remove freshly created staging directories, verified to be within dist.
for(const stage of [portableStage,assetStage]) {
  if(path.dirname(stage)!==dist) throw new Error('Unsafe staging path');
  fs.rmSync(stage,{recursive:true});
}
console.log(JSON.stringify({version,assets:assets.length,packages:result},null,2));
