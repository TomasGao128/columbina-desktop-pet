const { BrowserWindow } = require("electron");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
async function run({ win, js, check, wait, isolated, temp }) {
  const { normalize, layout } = require("../app/core/weather-policy");
  assert.deepEqual(normalize(null), normalize());
  assert.equal(normalize({ density: 1000 }).density, 100);
  assert.equal(normalize({ theme: "evil" }).theme, "off");
  assert.deepEqual(
    normalize({ theme: "aurora", range: 900, density: 70, brightness: 80 }),
    { theme: "butterflies", range: 900, density: 70, brightness: 80 },
  );
  const rect = layout(
    { x: -1200, y: 0, width: 1200, height: 800 },
    { x: -1200, y: 700, width: 300, height: 400 },
    1200,
  );
  assert.equal(rect.x, -1200);
  assert.equal(rect.y, 0);
  assert.equal(rect.width, 1200);
  await check(
    "weather policy validates settings and negative-coordinate displays",
    "true",
  );
  await js(
    "cancelAction();focusMode=sleeping=resting=dragging=false;ipcRenderer.send('weather-pet-state',{paused:false,reduced:false});ipcRenderer.send('weather-open');true",
  );
  let panel;
  for (let i = 0; i < 80; i++) {
    panel = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().endsWith("weather.html"),
    );
    if (panel && !panel.webContents.isLoading()) break;
    await wait(50);
  }
  if (!panel) throw Error("No weather panel");
  const pjs = (s) => panel.webContents.executeJavaScript(s, true);
  await wait(150);
  await check(
    "weather panel has isolated preload and no Node access",
    JSON.stringify(
      await pjs(
        "typeof require==='undefined'&&document.querySelectorAll('[data-theme]').length===8",
      ),
    ),
  );
  await check(
    "pet renderer cannot change private weather preferences",
    "ipcRenderer.invoke('weather-save',{theme:'rain'}).then(r=>!r.ok)",
  );
  for (const theme of [
    "rain",
    "wind",
    "night",
    "snow",
    "fireflies",
    "maple",
    "blossom",
    "butterflies",
  ]) {
    await pjs(`document.querySelector('[data-theme="${theme}"]').click();true`);
    let effect;
    for (let i = 0; i < 80; i++) {
      effect = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes("view=effect"),
      );
      if (effect && !effect.webContents.isLoading()) break;
      await wait(50);
    }
    if (!effect) throw Error("No weather effect window");
    await wait(250);
    const ejs = (s) => effect.webContents.executeJavaScript(s, true);
    const pixels = await ejs(
      "(()=>{const c=document.querySelector('canvas');const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<data.length;i+=4)if(data[i]>0)n++;return n>100})()",
    );
    await check(
      theme + " atmosphere draws transparent canvas particles",
      JSON.stringify(pixels),
    );
    await check(
      theme + " atmosphere is non-focusable and does not block pet input",
      JSON.stringify(!effect.isFocusable() && effect.isVisible()),
    );
    fs.writeFileSync(
      path.join(temp, "weather-" + theme + "-preview.png"),
      (await effect.webContents.capturePage()).toPNG(),
    );
  }
  fs.writeFileSync(
    path.join(temp, "weather-panel-preview.png"),
    (await panel.webContents.capturePage()).toPNG(),
  );
  await pjs(
    "document.getElementById('range').value=1000;document.getElementById('range').dispatchEvent(new Event('input'));document.getElementById('density').value=90;document.getElementById('density').dispatchEvent(new Event('input'));true",
  );
  for (let attempt = 0; attempt < 60; attempt++) {
    const saved = JSON.parse(
      fs.readFileSync(path.join(isolated, "weather-config.json")),
    );
    if (saved.range === 1000 && saved.density === 90) break;
    await wait(100);
  }
  await check(
    "weather controls save validated range and density",
    JSON.stringify(
      JSON.parse(fs.readFileSync(path.join(isolated, "weather-config.json")))
        .range === 1000,
    ),
  );
  await js(
    "cancelAction();voiceDirector.stop();energy=hunger=100;takeShortRest('idle',2500);true",
  );
  await wait(450);
  let restingEffect = BrowserWindow.getAllWindows().find((w) =>
    w.webContents.getURL().includes("view=effect"),
  );
  await check(
    "lying idle rest retains weather while the actual rest pose plays",
    "resting&&isPlayingAction",
  );
  await check(
    "weather remains visible during lying rest",
    JSON.stringify(restingEffect.isVisible()),
  );
  await js("cancelAction();fallAsleep();voiceDirector.stop();true");
  await wait(450);
  await check(
    "sleep pose retains the selected atmosphere",
    "sleeping&&pet.src.includes('pose-lie-')",
  );
  await check(
    "weather remains visible while sleeping",
    JSON.stringify(restingEffect.isVisible()),
  );
  await js("wakeUp();voiceDirector.stop();focusMode=true;true");
  await wait(450);
  let effect = BrowserWindow.getAllWindows().find((w) =>
    w.webContents.getURL().includes("view=effect"),
  );
  await check(
    "focus pauses and hides weather without cancelling pet actions",
    JSON.stringify(!effect.isVisible()),
  );
  await js("focusMode=false;setReducedMotion(true);true");
  await wait(400);
  await check(
    "reduced motion keeps a visible static weather layer",
    JSON.stringify(effect.isVisible()),
  );
  await pjs("document.getElementById('off').click();true");
  await wait(200);
  await check(
    "one-click weather off destroys the decorative window",
    JSON.stringify(
      !BrowserWindow.getAllWindows().some((w) =>
        w.webContents.getURL().includes("view=effect"),
      ),
    ),
  );
  panel.close();
  await wait(50);
  await js("setReducedMotion(false);true");
}
module.exports = { run };
