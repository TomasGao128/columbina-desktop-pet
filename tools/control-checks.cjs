const { BrowserWindow } = require("electron"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
async function run({ win, js, check, wait, isolated, temp }) {
  const { sanitize } = require("../app/settings-schema"),
    {
      DEFAULT_TUNING,
      validTuning,
      validFavorites,
    } = require("../app/core/control-settings");
  assert.ok(validTuning(DEFAULT_TUNING));
  assert.ok(!validTuning({ ...DEFAULT_TUNING, gazeSpeed: 99 }));
  assert.ok(!validFavorites([{}]));
  const input = {
    controlTuning: { ...DEFAULT_TUNING },
    controlFavorites: ["动作:颔首致意"],
  };
  const clean = sanitize(input);
  input.controlFavorites.push("bad");
  assert.equal(clean.controlFavorites.length, 1);
  await check(
    "control settings validate tuning limits and clone saved favorites",
    "true",
  );
  await js(
    "cancelAction();releaseEdgePeek();focusMode=sleeping=resting=dragging=pendingDrag=false;hideMenus();voiceDirector.stop();ipcRenderer.send('control-open');true",
  );
  let panel;
  for (let i = 0; i < 100; i++) {
    panel = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().endsWith("control.html"),
    );
    if (panel && !panel.webContents.isLoading()) break;
    await wait(50);
  }
  if (!panel) throw Error("No control center");
  const cjs = (s) => panel.webContents.executeJavaScript(s, true);
  const until = async (source) => {
    for (let i = 0; i < 100; i++) {
      if (await cjs(source)) return;
      await wait(50);
    }
    throw Error("Control state did not settle: " + source);
  };
  await until(
    "document.getElementById('status').textContent.includes('已同步')",
  );
  await check(
    "control center uses isolated preload without Node",
    JSON.stringify(
      await cjs(
        "typeof require==='undefined'&&document.querySelectorAll('[data-tab]').length===5",
      ),
    ),
  );
  await check(
    "pet renderer cannot use control-panel private IPC",
    "ipcRenderer.invoke('control-command',{type:'state'}).then(r=>!r.ok)",
  );
  await check(
    "control snapshot has catalog and omits chat data and API secrets",
    JSON.stringify(
      await cjs(
        "control.command({type:'state'}).then(r=>r.ok&&r.state.catalog.length>40&&!('history' in r.state)&&!('apiKey' in r.state))",
      ),
    ),
  );
  await cjs("document.querySelector('[data-tab=actions]').click();true");
  await until("document.querySelectorAll('.card').length>20");
  await cjs(
    "document.querySelector('.filter input').value='颔首';document.querySelector('.filter input').dispatchEvent(new Event('input'));true",
  );
  await check(
    "action search filters the existing catalog",
    JSON.stringify(
      await cjs(
        "document.querySelectorAll('.card').length===1&&document.querySelector('.card').textContent.includes('颔首')",
      ),
    ),
  );
  await cjs("document.querySelector('.star').click();true");
  await until("document.querySelector('.star').dataset.active==='true'");
  await cjs("document.querySelector('[data-tab=weather]').click();true");
  await check(
    "control center exposes all eight atmospheres",
    JSON.stringify(
      await cjs("document.querySelectorAll('.weather-grid .card').length===8"),
    ),
  );
  await cjs("document.querySelector('.weather-grid .star').click();true");
  await until(
    "document.querySelector('.weather-grid .star').dataset.active==='true'",
  );
  await cjs("document.querySelector('[data-tab=favorites]').click();true");
  await check(
    "favorites combine actions and atmosphere shortcuts",
    JSON.stringify(
      await cjs(
        "document.querySelectorAll('.card').length===2&&document.getElementById('content').textContent.includes('颔首')&&document.getElementById('content').textContent.includes('细雨')",
      ),
    ),
  );
  fs.writeFileSync(
    path.join(temp, "control-favorites-preview.png"),
    (await panel.webContents.capturePage()).toPNG(),
  );
  await check(
    "favorites persist without changing growth progress",
    "controlFavorites.includes('动作:颔首致意')&&controlFavorites.includes('weather:rain')",
  );
  const rpc = async (command) =>
    cjs(`control.command(${JSON.stringify(command)})`);
  const before = await js("affection");
  await rpc({ type: "set", key: "scale", value: 1.8 });
  await rpc({ type: "set", key: "gazeSpeed", value: 1.5 });
  await rpc({ type: "set", key: "dragAmount", value: 0 });
  await rpc({ type: "set", key: "peekAmount", value: 0.5 });
  await check(
    "control settings apply to actual pet globals immediately",
    "petScale===1.8&&controlTuning.gazeSpeed===1.5&&controlTuning.dragAmount===0&&controlTuning.peekAmount===.5",
  );
  await check(
    "invalid control parameter is rejected",
    JSON.stringify(
      !(await rpc({ type: "set", key: "gazeSpeed", value: 100 })).ok,
    ),
  );
  await rpc({ type: "reset", group: "appearance" });
  await check(
    "appearance reset preserves custom interaction tuning",
    "petScale===DEFAULT_SCALE&&petOpacity===1&&controlTuning.gazeSpeed===1.5&&controlTuning.dragAmount===0",
  );
  await rpc({ type: "reset", group: "tuning" });
  await check(
    "tuning reset preserves growth and favorites",
    `controlTuning.gazeSpeed===1&&controlTuning.dragAmount===1&&controlTuning.peekAmount===1&&affection===${before}&&controlFavorites.length===2`,
  );
  await rpc({ type: "set", key: "voiceVolume", value: 0.25 });
  await rpc({ type: "set", key: "sound", value: false });
  await check(
    "sound controls use existing voice and audio state",
    "voiceVolume===.25&&soundOn===false",
  );
  await rpc({ type: "reset", group: "sound" });
  await check(
    "sound reset restores only sound preferences",
    "voiceVolume===.75&&soundOn===true&&controlFavorites.length===2",
  );
  await rpc({ type: "weather", value: { theme: "snow", density: 80 } });
  await wait(200);
  await check(
    "weather from control center shares the existing saved configuration",
    JSON.stringify(
      JSON.parse(fs.readFileSync(path.join(isolated, "weather-config.json")))
        .theme === "snow",
    ),
  );
  await rpc({ type: "weather", value: { theme: "off" } });
  await rpc({ type: "action", id: "心情:期待" });
  await wait(150);
  await check(
    "control action starts the existing animation director",
    "actionPlayer.status.active?.id==='mood:expect'",
  );
  await rpc({ type: "stop" });
  await check(
    "control stop releases the body and voice",
    "!isPlayingAction&&!voiceDirector.status.active&&actionPlayer.status.active===null",
  );
  await cjs(
    "document.querySelector('[data-tab=settings]').click();document.getElementById('refresh').click();true",
  );
  await until("document.getElementById('control-gazeSpeed')!==null");
  fs.writeFileSync(
    path.join(temp, "control-settings-preview.png"),
    (await panel.webContents.capturePage()).toPNG(),
  );
  const saved = JSON.parse(
    fs.readFileSync(path.join(isolated, "settings.json")),
  );
  await check(
    "tuning and favorites survive the settings whitelist on disk",
    JSON.stringify(
      saved.controlTuning.gazeSpeed === 1 &&
        saved.controlFavorites.length === 2,
    ),
  );
  panel.close();
  await wait(100);
  await js("ipcRenderer.send('control-open');true");
  for (let i = 0; i < 100; i++) {
    panel = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().endsWith("control.html"),
    );
    if (panel && !panel.webContents.isLoading()) break;
    await wait(50);
  }
  await until("document.querySelectorAll('.card').length===2");
  await check(
    "reopening control center restores saved favorites",
    JSON.stringify(await cjs("document.querySelectorAll('.card').length===2")),
  );
  panel.setSize(720, 600);
  await wait(100);
  await check(
    "compact control center has no horizontal overflow",
    JSON.stringify(
      await cjs("document.documentElement.scrollWidth<=innerWidth"),
    ),
  );
  await cjs("document.querySelector('[data-tab=menu]').click();true");
  await until("document.querySelectorAll('.menu-order-row').length>2");
  const originalOrder = await js("MENU.filter(g=>!g.sep).map(g=>g.label)");
  const reversedOrder = [...originalOrder].reverse();
  await rpc({ type: "menuOrder", key: "root", value: reversedOrder });
  await check(
    "custom main menu order updates actual menu DOM",
    "JSON.stringify([...rightMenu.children].filter(el=>el.classList.contains('mi')).map(el=>MENU.find(g=>g.el===el).label))===" +
      JSON.stringify(JSON.stringify(reversedOrder)),
  );
  const invalidOrder = await cjs(
    "control.command({type:'menuOrder',key:'root',value:['退出','退出']})",
  );
  await check(
    "duplicate or incomplete menu orders are rejected",
    JSON.stringify(!invalidOrder.ok),
  );
  const sub = await js(
    "MENU.find(g=>g.label==='动作').items.map(it=>it.label).reverse()",
  );
  await rpc({ type: "menuOrder", key: "group:动作", value: sub });
  await check(
    "submenu order preserves original item actions",
    "renderSubItems(MENU.find(g=>g.label==='动作'));subMenu.firstElementChild.textContent.includes(" +
      JSON.stringify(sub[0]) +
      ")",
  );
  await wait(200);
  const orderSaved = JSON.parse(
    fs.readFileSync(path.join(isolated, "settings.json")),
  ).menuOrder;
  await check(
    "custom menu order persists through settings whitelist",
    JSON.stringify(
      JSON.stringify(orderSaved.root) === JSON.stringify(reversedOrder) &&
        JSON.stringify(orderSaved["group:动作"]) === JSON.stringify(sub),
    ),
  );
  await cjs("document.getElementById('refresh').click();true");
  await until(
    "document.querySelector('.menu-order-row .menu-order-label')?.textContent===" +
      JSON.stringify(reversedOrder[0]),
  );
  await cjs("document.querySelector('.menu-order-row button').click();true");
  await cjs(
    "document.querySelectorAll('.menu-order-row button')[1].click();true",
  );
  await until(
    "document.querySelector('.menu-order-row .menu-order-label')?.textContent===" +
      JSON.stringify(reversedOrder[1]),
  );
  await check(
    "menu reorder buttons apply and refresh immediately",
    "menuOrder.root[0]===" + JSON.stringify(reversedOrder[1]),
  );
  fs.writeFileSync(
    path.join(temp, "control-menu-preview.png"),
    (await panel.webContents.capturePage()).toPNG(),
  );
  await rpc({ type: "menuOrder", key: "reset" });
  await check(
    "restore menu defaults clears custom order without changing favorites",
    "Object.keys(menuOrder).length===0&&controlFavorites.length===2&&[...rightMenu.children].filter(el=>el.classList.contains('mi'))[0]===MENU.find(g=>!g.sep).el",
  );
  panel.close();
}
module.exports = { run };
