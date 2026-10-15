const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const temp = fs.mkdtempSync(path.join(app.getPath("temp"), "columbina-r1-"));
const isolated = path.join(temp, "app");
fs.cpSync(path.join(root, "app"), isolated, { recursive: true });
fs.rmSync(path.join(isolated, "weather-config.json"), { force: true });
// Never use the user's credentials or conversation in mock QA.
for (const name of [
  "chat-config.json",
  "chat-history.json",
  "paper-history.json",
  "polish-history.json",
  "summary-history.json",
  "chat-memories.json",
])
  fs.rmSync(path.join(isolated, name), { force: true });
app.setName("Columbina R1 isolated QA");
app.setPath("userData", path.join(temp, "profile"));
fs.writeFileSync(
  path.join(isolated, "settings.json"),
  JSON.stringify({
    scale: 1.4,
    energy: 100,
    hunger: 100,
    energyAt: Date.now(),
    hungerAt: Date.now(),
    affection: 140,
    interactionCount: 100,
    sound: true,
    voiceOn: true,
    activity: 0,
  }),
);
fs.writeFileSync(
  path.join(isolated, "pet-position.json"),
  JSON.stringify({ x: 100, y: 120 }),
);
process.env.PET_QA_DISABLE_GAZE = "1";
require(path.join(isolated, "main.js"));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checks = [],
  errors = [];
app.whenReady().then(async () => {
  try {
    const deadline = Date.now() + 10000;
    let win;
    do {
      win = BrowserWindow.getAllWindows().find(
        (w) =>
          w.webContents.getURL().includes("index.html") &&
          !w.webContents.isLoading(),
      );
      if (win) break;
      await wait(100);
    } while (Date.now() < deadline);
    await wait(500);
    if (!win) throw Error("No pet window");
    win.webContents.setAudioMuted(true);
    win.webContents.setBackgroundThrottling(false);
    win.webContents.on("console-message", (_e, level, message) => {
      if (level >= 2 && !/Insecure Content-Security-Policy/.test(message))
        errors.push(message);
    });
    const js = (source) => win.webContents.executeJavaScript(source, true);
    const check = async (name, source) => {
      const pass = !!(await js(source));
      checks.push({ name, pass });
      console.log((pass ? "PASS " : "FAIL ") + name);
    };
    const reset = () =>
      js(
        "cancelAction();stopWalking();sleeping=resting=dragging=pendingDrag=false;focusMode=false;debugNoWalk=true;energy=hunger=100;energyAt=hungerAt=Date.now();affection=140;interactionCount=100;hideMenus();lifeUI.close();voiceDirector.stop();true",
      );
    await reset();
    await check(
      "catalog registers all existing sequence actions",
      "actionCatalog.size===43+USER_POSES.length+COSER_POSES.length",
    );
    const definitions = await js("actionCatalog.list()");
    const files = [...new Set(definitions.flatMap((d) => d.frames))];
    checks.push({
      name: "catalog resources exist in standalone project",
      pass: files.every((f) =>
        fs.existsSync(path.join(isolated, "renderer", f)),
      ),
    });
    for (const [zone, key] of [
      ["headZone", "touch-head"],
      ["bellyZone", "touch-chest"],
      ["footZone", "touch-foot"],
    ]) {
      await reset();
      await js(zone + ".click();true");
      await wait(220);
      await check(
        key + " uses text and animation without voice",
        'isPlayingAction&&!voiceDirector.status.active&&bubble.style.display==="block"&&actionPlayer.status.active.id===' +
          JSON.stringify(key) +
          '&&pet.src.includes("drawn-action-' +
          key +
          '-")',
      );
      await js("cancelAction();true");
    }
    await reset();
    await js('playCompanion("sing");true');
    await wait(350);
    await check(
      "singing still has voice",
      'voiceDirector.status.active&&actionPlayer.status.active.id==="game:sing"',
    );
    await js('playSmooth("bow",["致意"]);true');
    await wait(180);
    await check(
      "explicit menu action replaces current sequence",
      'actionPlayer.status.active.id==="bow"&&pet.src.includes("drawn-action-bow-")',
    );
    await js("playUserPose(5);true");
    await wait(180);
    await check(
      "pose can replace another menu action",
      'activeUserPose===5&&actionPlayer.status.active.id==="pose:5"&&pet.src.endsWith("user-pose-05.webp")',
    );
    await js("playUserPose(16);true");
    await wait(180);
    await check(
      "rapid pose replacement owns the latest pose",
      'activeUserPose===16&&actionPlayer.status.active.id==="pose:16"',
    );
    await js("cancelAction();true");
    await wait(120);
    await check(
      "cancel clears body effects and owner",
      "!isPlayingAction&&!actionPlayer.status.active&&!moonEffects.status.key&&companion.status.effects===0",
    );
    await reset();
    await js('takeShortRest("idle",250);true');
    await wait(400);
    await check(
      "short rest naturally releases owner",
      "!resting&&!isPlayingAction&&!actionPlayer.status.active",
    );
    await reset();
    for (const definition of definitions.filter(
      (d) => d.kind !== "rest" && !d.id.startsWith("activity:"),
    )) {
      await js("preloadFrames(" + JSON.stringify(definition.frames) + ")");
      await js(
        "cancelAction();playFrames(" +
          JSON.stringify(definition.frames) +
          ',["检查"],{memoryKind:' +
          JSON.stringify(definition.kind) +
          ",memoryId:" +
          JSON.stringify(
            definition.kind === "pose"
              ? Number(definition.id.slice(5))
              : ["game", "mood", "coser"].includes(definition.kind)
                ? definition.id.split(":")[1]
                : definition.id,
          ) +
          ",frameMs:25,holdMs:800});true",
      );
      await wait(90);
      await check(
        "resource decodes " + definition.id,
        "pet.naturalWidth>0&&pet.complete&&" +
          JSON.stringify(definition.frames) +
          ".some(f=>pet.src.endsWith(f.slice(2)))",
      );
    }
    await reset();
    await js(
      'playSmooth("bow",["检查"],{frameMs:25,frameDurations:Array(SMOOTH_ACTIONS.bow.frames.length).fill(25),holdMs:50});true',
    );
    await wait(500);
    await check(
      "natural action completion restores idle",
      "!isPlayingAction&&!actionPlayer.status.active",
    );
    await check(
      "image cache stays below 96 MiB",
      "preloadFrames.status.estimatedDecodedBytes<=96*1024*1024",
    );
    await check(
      "diagnostic event list stays bounded",
      "actionPlayer.status.events.length<=64",
    );
    await reset();
    await js("startWalking({leftRoom:600,rightRoom:600});true");
    await wait(180);
    await check(
      "walking owns director",
      "walking&&actionPlayer.status.active?.id.startsWith('walk-')",
    );
    await js("setFocusMode(true,0);true");
    await check(
      "focus cancels walk owner and timers",
      "!walking&&!walkTimer&&!walkFrameTimer&&!actionPlayer.status.active",
    );
    await reset();
    await js("petReactions.dizzy();true");
    await check(
      "dizzy owns director",
      "petReactions.active&&actionPlayer.status.active?.id==='dizzy'",
    );
    await js("fallAsleep();true");
    await check(
      "sleep cancels dizzy and owner",
      "sleeping&&!petReactions.active&&!actionPlayer.status.active&&!isPlayingAction",
    );
    await reset();
    await js("playMoonBurst();true");
    await wait(600);
    await check(
      "burst owns director",
      "burstActive&&actionPlayer.status.active?.id==='burst'",
    );
    await js(`(() => {
      const r=pet.getBoundingClientRect();
      for(let y=r.top;y<r.bottom;y+=4) for(let x=r.left;x<r.right;x+=4) {
        if(!bodyHitController.hit(x,y))continue;
        pet.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:99,clientX:x,clientY:y,screenX:window.screenX+x,screenY:window.screenY+y}));
        endDrag({pointerId:99,type:'pointercancel'});return true;
      }return false;
    })()`);
    await wait(200);
    await check(
      "body press cancels burst and releases external window",
      "!burstActive&&!isPlayingAction&&!actionPlayer.status.active&&!pet.classList.contains('burst-hidden')",
    );
    checks.push({
      name: "burst window is closed",
      pass: BrowserWindow.getAllWindows().length === 1,
    });
    await reset();
    await wait(180);
    await check(
      "decoded sprite has opaque and transparent hit pixels",
      `(() => {
      const c=document.createElement('canvas');c.width=128;c.height=128;
      const ctx=c.getContext('2d');ctx.drawImage(pet,0,0,128,128);
      const d=ctx.getImageData(0,0,128,128).data,r=pet.getBoundingClientRect();
      let opaque=false,transparent=false;
      for(let i=0;i<16384;i++) {const x=r.x+(i%128+.5)/128*r.width,y=r.y+(Math.floor(i/128)+.5)/128*r.height;
        if(d[i*4+3]===0&&!bodyHitController.hit(x,y))transparent=true;
        if(d[i*4+3]>250&&bodyHitController.hit(x,y))opaque=true;
        if(opaque&&transparent)return true;
      }return false;
    })()`,
    );
    await reset();
    await js("affection=19;lastAffectionAt=0;addAffection(1);true");
    await wait(650);
    await check(
      "real intimacy threshold starts character ceremony",
      "affection===20&&document.querySelector('.pet-upgrade .pet-upgrade-star')&&document.querySelector('#relationNotice').hidden",
    );
    await check(
      "upgrade speech contains reached tier and character text",
      "document.querySelector('.pet-upgrade-speech').textContent.includes('熟悉')&&document.querySelector('.pet-upgrade-speech span').textContent.length>0",
    );
    await check(
      "upgrade particles are strong and do not own input",
      "document.querySelectorAll('.pet-upgrade-star').length===84&&document.querySelectorAll('.pet-upgrade-ring').length===3&&getComputedStyle(document.querySelector('.pet-upgrade')).pointerEvents==='none'&&lifeUI.active&&!lifeUI.modalActive",
    );
    fs.writeFileSync(
      path.join(temp, "upgrade-preview.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await wait(5100);
    await check(
      "ceremony finishes before unlock card appears",
      "!document.querySelector('.pet-upgrade')&&!document.querySelector('#relationNotice').hidden&&document.querySelector('#relationNoticeTitle').textContent.includes('熟悉')",
    );
    await js("document.querySelector('.relation-accept').click();true");
    await check(
      "dismiss unlock card cleans effects and modal",
      "!lifeUI.active&&!document.querySelector('.relation-celebration')",
    );
    await js("setReducedMotion(true);previewRelationCeremony();true");
    await check(
      "reduced motion keeps speech with quiet visual",
      "document.querySelector('.pet-upgrade').dataset.reduced==='true'&&document.querySelectorAll('.pet-upgrade-star').length===12&&!document.querySelector('.pet-upgrade-beam')&&document.querySelector('.pet-upgrade-speech')",
    );
    await js(
      "window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));setReducedMotion(false);true",
    );
    await check(
      "Escape cancels ceremony and pending card",
      "!lifeUI.active&&!document.querySelector('.pet-upgrade')",
    );
    await js("lifeUI.open('growth');true");
    await check(
      "growth menu opens normally",
      "lifeUI.active&&lifeUI.modalActive&&!document.querySelector('#companionPanel').hidden",
    );
    await js(
      "lifeUI.close();setSound(false);setClickThrough(false);setActivity(0);saveSettings();true",
    );
    await wait(180);
    const savedSettings = JSON.parse(
      fs.readFileSync(path.join(isolated, "settings.json"), "utf8"),
    );
    checks.push({
      name: "settings and reached tier persist in isolated save",
      pass:
        savedSettings.affection === 20 &&
        savedSettings.sound === false &&
        savedSettings.clickThrough === false &&
        savedSettings.activity === 0,
    });
    await js("setSound(true);setClickThrough(true);true");
    await reset();
    await js("playStory(VOICE_CATALOG.stories[0].id);true");
    await wait(180);
    await check(
      "local story playback still starts",
      "voiceDirector.status.active&&voiceDirector.status.story",
    );
    await reset();
    await js("affection=19;announceRelationChange(TIERS[0],TIERS[3]);true");
    await wait(200);
    await check(
      "multi-tier rewards queue rather than duplicate overlays",
      "document.querySelectorAll('.pet-upgrade').length===1&&document.querySelector('.pet-upgrade-speech').textContent.includes('熟悉')",
    );
    for (let i = 0; i < 3; i++)
      await js(
        "window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));true",
      );
    await wait(200);
    await check(
      "queued ceremonies clear without lingering effect",
      "!lifeUI.active&&!document.querySelector('.pet-upgrade')",
    );
    await reset();
    const { screen } = require("electron");
    const area = screen.getPrimaryDisplay().workArea;
    for (const side of ["left", "right"]) {
      const offset = await js("petCenterInWindow().x");
      win.setPosition(
        Math.round(
          (side === "left" ? area.x + 10 : area.x + area.width - 10) - offset,
        ),
        area.y + 120,
      );
      await js("ipcRenderer.send('drag-end');true");
      await wait(350);
      await check(
        side + " edge uses opposite-facing supplied image",
        `edgeSide==='${side}'&&pet.complete&&pet.naturalWidth===2048&&pet.src.endsWith('edge-peek-${side === "left" ? "right" : "left"}.png')`,
      );
      await check(
        side + " peek preserves full sprite and visible feet input",
        "getComputedStyle(pet).clipPath==='none'&&getComputedStyle(footZone).display!=='none'&&(()=>{const r=pet.getBoundingClientRect();for(let y=.76;y<.99;y+=.03)for(let x=.2;x<.8;x+=.03)if(bodyHitController.hit(r.x+r.width*x,r.y+r.height*y))return true;return false})()",
      );
      await check(
        side + " dock pose stays stable without idle takeover",
        "!playIdleExpression()&&!takeShortRest()&&edgeSide!==null",
      );
      const shape = await js(
        "(()=>{const r=pet.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()",
      );
      const position = win.getPosition();
      const headSpan = side === "left" ? [0.44, 0.68] : [0.17, 0.44];
      checks.push({
        name: side + " head and chest remain on screen",
        pass:
          position[0] + shape.x + shape.width * headSpan[0] >= area.x - 2 &&
          position[0] + shape.x + shape.width * headSpan[1] <=
            area.x + area.width + 2,
      });
      fs.writeFileSync(
        path.join(temp, "edge-" + side + "-preview.png"),
        (
          await win.webContents.capturePage({
            x: Math.max(0, area.x - position[0]),
            y: 0,
            width:
              Math.min(win.getSize()[0], area.x + area.width - position[0]) -
              Math.max(0, area.x - position[0]),
            height: win.getSize()[1],
          })
        ).toPNG(),
      );
      await js("setScale(1.8);true");
      await wait(160);
      await check(
        side + " docking survives scale change",
        `edgeSide==='${side}'&&petContainer.dataset.edge==='${side}'`,
      );
      await js("saveSettings();true");
      await js("ipcRenderer.send('save-pos');true");
      await wait(120);
      checks.push({
        name: side + " docking persists to position save",
        pass:
          JSON.parse(
            fs.readFileSync(path.join(isolated, "pet-position.json"), "utf8"),
          ).edge === side,
      });
      await js("headZone.click();true");
      await wait(160);
      await check(
        side + " touch unfolds into unvoiced animation",
        "edgeSide===null&&!petContainer.dataset.edge&&isPlayingAction&&!voiceDirector.status.active&&getComputedStyle(footZone).display!=='none'",
      );
      await js("cancelAction();setScale(1.4);true");
      await js(`showEdgePeek('${side}');true`);
      await wait(150);
      await js(`(() => {
        const r=pet.getBoundingClientRect();
        for(let y=r.top;y<r.top+r.height*.5;y+=4)for(let x=r.left;x<r.right;x+=4){
          if(!bodyHitController.hit(x,y))continue;
          pet.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:98,clientX:x,clientY:y,screenX:500,screenY:500}));
          petContainer.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:98,clientX:x+12,clientY:y,screenX:512,screenY:500}));
          return true;
        }return false;
      })()`);
      await check(
        side + " drag unfolds without leaving crop or dock state",
        "dragging&&edgeSide===null&&!petContainer.dataset.edge",
      );
      await js("endDrag({pointerId:98,type:'pointercancel'});true");
      await wait(100);
      await check(
        side + " drag release clears pointer ownership",
        "!dragging&&!pendingDrag&&dragPointerId===undefined",
      );
      await js(`showEdgePeek('${side}');showMainMenu();true`);
      await check(
        side + " right-click menu unfolds and remains available",
        "menuOpen&&edgeSide===null&&!petContainer.dataset.edge&&rightMenu.style.display==='block'",
      );
      await js("hideMenus();true");
    }
    await js("showEdgePeek('left');setFocusMode(true,0);true");
    await check(
      "focus leaves edge pose and clears crop",
      "edgeSide===null&&!petContainer.dataset.edge&&focusMode",
    );
    await reset();
    await reset();
    const { nativeImage } = require("electron");
    const activityManifest = require(
      path.join(isolated, "renderer", "playroom-assets.json"),
    );
    checks.push({
      name: "chair animation uses three sets of six complete sprites without split legs",
      pass:
        !activityManifest.scenery.rig &&
        Object.values(activityManifest.scenery.clips).every(
          (clip) =>
            clip.length === 6 &&
            clip.every((file) => file.includes("scene-chair-full-")),
        ) &&
        !Object.keys(activityManifest.scenery.props).some((key) =>
          /left|right/.test(key),
        ),
    });
    for (const [pose, clip] of Object.entries(activityManifest.scenery.clips)) {
      const sheet = await js(`(async()=>{
        const files=${JSON.stringify(clip)},c=document.createElement('canvas');c.width=1200;c.height=660;
        const ctx=c.getContext('2d');ctx.fillStyle='#f8f4fc';ctx.fillRect(0,0,c.width,c.height);
        for(let i=0;i<files.length;i++){const img=new Image();img.src=files[i];await img.decode();
          const x=i%4*300,y=Math.floor(i/4)*330;ctx.drawImage(img,x+12,y+8,276,276);
          ctx.fillStyle='#604775';ctx.font='16px sans-serif';ctx.fillText('${pose}  '+(i+1),x+90,y+311);}
        return c.toDataURL('image/png');})()`);
      fs.writeFileSync(
        path.join(temp, "chair-frames-" + pose + ".png"),
        require("electron").nativeImage.createFromDataURL(sheet).toPNG(),
      );
    }
    for (const id of [
      ...new Set(
        Object.values(activityManifest)
          .flatMap((a) => [...a.frames, ...Object.values(a.props || {})])
          .map((f) => f.slice("./activity-".length, -4)),
      ),
    ]) {
      const sprite = nativeImage.createFromPath(
        path.join(isolated, "renderer", "activity-" + id + ".png"),
      );
      const data = sprite.toBitmap();
      let transparent = 0,
        opaque = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] === 0) transparent++;
        if (data[i] > 250) opaque++;
      }
      checks.push({
        name: id + " sprite has real transparent alpha and visible body",
        pass:
          !sprite.isEmpty() &&
          transparent >
            (data.length / 4) * (id.includes("landscape") ? 0.07 : 0.25) &&
          opaque > (data.length / 4) * (id.includes("leg-") ? 0.01 : 0.1),
      });
    }
    await js("playroom.start('study')");
    await wait(180);
    await check(
      "study starts with its own pose, question and owner",
      "playroom.status?.kind==='study'&&playroom.status.phase==='ready'&&actionPlayer.status.active?.id==='activity:study'&&pet.src.endsWith('activity-study.png')&&!document.querySelector('#playroomControls').hidden",
    );
    await check(
      "activity controls do not cover character feet",
      "document.querySelector('#playroomControls').getBoundingClientRect().top>=pet.getBoundingClientRect().bottom+4",
    );
    fs.writeFileSync(
      path.join(temp, "study-preview.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await js(
      "playroom.answer(playroom.status.question.choices.indexOf(playroom.status.question.answer));true",
    );
    await check(
      "correct quiz answer changes expression and text",
      "playroom.status.correct===true&&playroom.status.phase==='feedback'&&bubble.textContent.includes('解出来')",
    );
    await check(
      "same quiz cannot grant repeated answer rewards",
      "playroom.answer(0)===false",
    );
    await js("document.querySelector('.playroom-buttons button').click();true");
    await js(
      "playroom.answer(playroom.status.question.choices.findIndex(v=>v!==playroom.status.question.answer));true",
    );
    await check(
      "wrong quiz answer has gentle feedback and correct solution",
      "playroom.status.correct===false&&document.querySelector('.playroom-message').textContent.includes(String(playroom.status.question.answer))&&bubble.textContent.includes('再慢慢')",
    );
    await js("playroom.start('gaming')");
    await wait(150);
    await check(
      "gaming replaces study without leftover owner",
      "playroom.status.kind==='gaming'&&actionPlayer.status.active.id==='activity:gaming'&&pet.src.endsWith('activity-gaming.png')",
    );
    fs.writeFileSync(
      path.join(temp, "gaming-preview.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await js(
      `(async()=>{for(let i=0;i<3;i++){while(!require('../core/playroom-policy').timingHit(require('../core/playroom-policy').beatPosition(performance.now()-playroom.status.started)))await new Promise(r=>setTimeout(r,20));playroom.tap();await new Promise(r=>setTimeout(r,450));}return true})()`,
    );
    await check("timed game taps can win", "playroom.status.score>=3");
    const gameElapsed = await js("performance.now()-playroom.status.started");
    await wait(Math.max(100, 10200 - gameElapsed));
    await check(
      "game naturally shows a winning result",
      "playroom.status.phase==='result'&&document.querySelector('.playroom-message').textContent.includes('胜利')",
    );
    await js("playroom.start('basketball')");
    await wait(1350);
    await check(
      "basketball dribbles with independent decorative canvas",
      "playroom.status.kind==='basketball'&&playroom.status.phase==='ready'&&['dribble','dribble-mid','dribble-up'].includes(pet.dataset.activityPose)&&getComputedStyle(document.querySelector('.playroom-effects')).pointerEvents==='none'",
    );
    fs.writeFileSync(
      path.join(temp, "basketball-preview.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await check(
      "basketball court reserves width and keeps controls below feet",
      "window.innerWidth>=PET_MARGIN_L+pet.offsetWidth*1.6&&document.querySelector('#playroomControls').getBoundingClientRect().top>=pet.getBoundingClientRect().bottom+4",
    );
    await js("playroom.crossover();true");
    await wait(150);
    await check(
      "crossover uses its own pose and changes hand",
      "pet.dataset.activityPose==='cross'&&playroom.status.hand==='left'",
    );
    await js(
      "playroom.beginCharge();window.dispatchEvent(new Event('blur'));true",
    );
    await check(
      "losing focus safely cancels held charge",
      "playroom.status.phase==='ready'",
    );
    await js(
      "window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space'}));true",
    );
    await check(
      "Space starts charge without immediately firing",
      "playroom.status.phase==='charging'",
    );
    await wait(150);
    await check(
      "charging switches to barefoot crouch pose",
      "pet.dataset.activityPose==='crouch'",
    );
    fs.writeFileSync(
      path.join(temp, "basketball-charge.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await js("window.dispatchEvent(new Event('blur'));true");
    await js("playroom.beginCharge();true");
    const hold = await js("playroom.status.ideal*1150");
    await wait(hold);
    await js(
      "window.dispatchEvent(new KeyboardEvent('keyup',{code:'Space'}));true",
    );
    await check(
      "Space release fires one shot and rejects duplicate release",
      "playroom.status.phase==='shot'&&playroom.shoot()===false",
    );
    await wait(530);
    await check(
      "throw pose points toward right side basket",
      "pet.dataset.activityPose==='shoot'",
    );
    fs.writeFileSync(
      path.join(temp, "basketball-release.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await wait(460);
    fs.writeFileSync(
      path.join(temp, "basketball-flight.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await wait(2900);
    await check(
      "basketball hits hoop and shows victory pose",
      "playroom.status.phase==='result'&&playroom.status.made===true&&pet.src.endsWith('activity-basket-win.png')&&playroom.status.makes===1",
    );
    fs.writeFileSync(
      path.join(temp, "basketball-result.png"),
      (await win.webContents.capturePage()).toPNG(),
    );

    await check(
      "new best scores are recorded and visible",
      "playRecords.practice>=3&&playRecords.combo>=1&&playRecords.rhythm>=3&&document.querySelector('.playroom-stats').textContent.includes('最高')",
    );
    await js(
      "window.qaReplayBefore={score:playroom.status.score,makes:playroom.status.makes,interactions:interactionCount};playroom.replay();true",
    );
    await check(
      "replay starts without resetting match",
      "playroom.status.replaying&&playroom.status.phase==='shot'",
    );
    await wait(3900);
    await check(
      "replay grants no duplicate score or reward",
      "playroom.status.phase==='result'&&playroom.status.score===qaReplayBefore.score&&playroom.status.makes===qaReplayBefore.makes&&interactionCount===qaReplayBefore.interactions",
    );
    await js("playroom.start('basketball')");
    await js("playroom.shoot(.08);true");
    await wait(3800);
    await check(
      "underpowered basketball shot produces a miss",
      "playroom.status.phase==='result'&&playroom.status.made===false&&pet.src.endsWith('activity-basket-miss.png')&&document.querySelector('.playroom-message').textContent.includes('偏了')",
    );
    await js(
      "playroom.setBasketMode('streak');playroom.setDistance('near');playroom.setShotStyle('layup');playroom.shoot(playroom.status.ideal);true",
    );
    await wait(530);
    await check(
      "layup uses forward moving reach pose",
      "pet.dataset.activityPose==='layup'&&parseFloat(pet.style.translate)>0&&playroom.status.mode==='streak'",
    );
    fs.writeFileSync(
      path.join(temp, "basketball-layup.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await wait(3800);
    await check(
      "streak mode counts score and combo",
      "playroom.status.makes===1&&playroom.status.combo===1&&playroom.status.lives===3",
    );
    await js("playroom.setBasketMode('practice');true");
    await wait(180);
    const chargeButton = await js(
      "(()=>{const r=document.querySelector('.playroom-charge').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()",
    );
    win.webContents.sendInputEvent({ type: "mouseMove", ...chargeButton });
    win.webContents.sendInputEvent({
      type: "mouseDown",
      button: "left",
      clickCount: 1,
      ...chargeButton,
    });
    await wait(130);
    await check(
      "native mouse press retains captured charge button",
      "playroom.status.phase==='charging'&&!!document.querySelector('.playroom-charge')",
    );
    win.webContents.sendInputEvent({ type: "mouseMove", x: 2, y: 2 });
    win.webContents.sendInputEvent({
      type: "mouseUp",
      button: "left",
      clickCount: 1,
      x: 2,
      y: 2,
    });
    await wait(80);
    await check(
      "native mouse release launches shot",
      "playroom.status.phase==='shot'",
    );
    await js("playroom.setBasketMode('timed');true");
    await check(
      "timed challenge resets round and starts countdown",
      "playroom.status.mode==='timed'&&playroom.status.shots===0&&playroom.status.secondsLeft>44",
    );
    await js("setScale(.7);true");
    await wait(100);
    await check(
      "small scale keeps full court and feet clear of HUD",
      "document.querySelector('#playroomControls').getBoundingClientRect().top>=pet.getBoundingClientRect().bottom+4&&window.innerWidth>=PET_MARGIN_L+pet.offsetWidth*1.6",
    );
    await js("setScale(1.4);true");
    await js("cancelAction();playroom.start('basketball')");
    await js(
      "affection=19;lastAffectionAt=0;playroom.shoot(playroom.status.ideal);true",
    );
    await wait(2650);
    await check(
      "basketball reward hands body to intimacy celebration safely",
      "affection===20&&playroom.status===null&&document.querySelector('.pet-upgrade')&&document.querySelector('#playroomControls').hidden",
    );
    await js(
      "window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));lifeUI.close();affection=140;true",
    );
    await js("setFocusMode(true,0);true");
    await check(
      "focus cancels activity, controls and sprite effects",
      "playroom.status===null&&document.querySelector('#playroomControls').hidden&&!actionPlayer.status.active&&!pet.classList.contains('playroom-pose')",
    );
    await reset();
    await js("playroom.start('study');cancelAction();true");
    await wait(200);
    await check(
      "cancel during preload prevents stale activity revival",
      "playroom.status===null&&!actionPlayer.status.active&&!isPlayingAction&&document.querySelector('#playroomControls').hidden",
    );
    await js("playroom.start('study')");
    await js(
      "window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));true",
    );
    await check(
      "Escape releases activity owner and HUD",
      "playroom.status===null&&!actionPlayer.status.active&&!isPlayingAction",
    );
    await wait(180);
    await check(
      "closing activity restores normal window height",
      "window.innerHeight===Math.round(Math.max(PET_WIN_MIN_H,PET_MARGIN_T+pet.offsetHeight+PET_MARGIN_B)/2)*2",
    );
    await js("setReducedMotion(true);playroom.start('basketball')");
    await check(
      "reduced motion allows activity without body breathing",
      "playroom.status.kind==='basketball'&&getComputedStyle(pet).animationName==='none'",
    );
    await js("cancelAction();setReducedMotion(false);true");
    await check(
      "new play menu contains all three activities",
      "MENU.find(g=>g.label==='玩法').items.length===5",
    );

    await js(
      "window.qaSend=ipcRenderer.send.bind(ipcRenderer);window.qaCatMask=null;ipcRenderer.send=(channel,...args)=>{if(channel==='pet-scene-mask')qaCatMask=args[0];return qaSend(channel,...args)};playroom.start('cat')",
    );
    await wait(180);
    await check(
      "Luo Xiaohei scene owns the same director and shows independent cat",
      "playroom.status.scene?.kind==='cat'&&actionPlayer.status.active.id==='activity:cat'&&!document.querySelector('#sceneKitten').hidden&&document.querySelector('#sceneKittenImage').src.endsWith('activity-scene-kitten-idle.png')",
    );
    await check(
      "cat pixels have their own alpha hit mask",
      "(()=>{const hit=require('../core/body-hit').bodyHit;return qaCatMask&&hit(qaCatMask,qaCatMask.cx,qaCatMask.cy)&&!hit(qaCatMask,qaCatMask.cx-qaCatMask.width*.49,qaCatMask.cy-qaCatMask.height*.49)})()",
    );
    fs.writeFileSync(
      path.join(temp, "scene-cat-preview.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await js("document.querySelector('#sceneKitten').click();true");
    await wait(130);
    await check(
      "clicking cat produces stroke pose and round-eye purr sprite",
      "playroom.status.scene.joy===1&&pet.src.endsWith('activity-scene-cat-stroke.png')&&document.querySelector('#sceneKittenImage').src.endsWith('activity-scene-kitten-purr.png')&&bubble.textContent.includes('蹭')",
    );
    await check(
      "cat click spam cannot farm affection",
      "playroom.interactScene('pet')===false&&playroom.status.scene.joy===1",
    );
    await wait(850);
    await js("playroom.interactScene('lure');true");
    await wait(130);
    await check(
      "feather play changes cat and character poses",
      "pet.src.endsWith('activity-scene-cat-look.png')&&document.querySelector('#sceneKittenImage').src.endsWith('activity-scene-kitten-play.png')",
    );
    fs.writeFileSync(
      path.join(temp, "scene-cat-play.png"),
      (await win.webContents.capturePage()).toPNG(),
    );

    await wait(850);
    await js("playroom.interactScene('hug');true");
    await wait(800);
    await check(
      "hug uses composite cat and removes the old ground hit target",
      "pet.src.endsWith('activity-scene-cat-hug.png')&&document.querySelector('#sceneKitten').hidden&&qaCatMask===null&&playroom.status.scene.holding",
    );
    fs.writeFileSync(
      path.join(temp, "scene-cat-hug.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await js("playroom.interactScene('cuddle');true");
    await wait(180);
    await check(
      "cheek nuzzle has its own actual pose",
      "pet.src.endsWith('activity-scene-cat-nuzzle.png')&&document.querySelector('#sceneKitten').hidden",
    );
    fs.writeFileSync(
      path.join(temp, "scene-cat-nuzzle.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await wait(850);
    await js("playroom.interactScene('lap');true");
    await wait(150);
    await check(
      "lap company remains held with its own seated pose",
      "pet.src.endsWith('activity-scene-cat-lap.png')&&playroom.status.scene.lap",
    );
    fs.writeFileSync(
      path.join(temp, "scene-cat-lap.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await wait(850);
    await js("playroom.interactScene('release');true");
    await wait(180);
    await check(
      "put-down starts with a supported-cat transition",
      "pet.src.endsWith('activity-scene-cat-lower.png')&&document.querySelector('#sceneKitten').hidden",
    );
    await wait(700);
    await check(
      "cat returns to its alpha-tested ground target after release",
      "!document.querySelector('#sceneKitten').hidden&&qaCatMask&&!playroom.status.scene.holding",
    );
    await js("playroom.interactScene('chase');true");
    await wait(500);
    await check(
      "running cat actually moves across the scene",
      "document.querySelector('#sceneKittenImage').src.endsWith('activity-scene-kitten-run-right.png')&&parseFloat(document.querySelector('#sceneKitten').style.left)>pet.getBoundingClientRect().left+pet.offsetWidth*.85",
    );
    for (const [action, pose] of [
      ["roll", "roll"],
      ["stretch", "stretch"],
      ["nap", "curled"],
    ]) {
      await wait(850);
      await js("playroom.interactScene(" + JSON.stringify(action) + ");true");
      await wait(120);
      await check(
        action + " selects its actual independent Luo sprite",
        "document.querySelector('#sceneKittenImage').src.endsWith('activity-scene-kitten-" +
          pose +
          ".png')&&!document.querySelector('#sceneKitten').hidden",
      );
    }
    await js("cancelAction();true");
    await wait(80);
    await check(
      "scene cancel removes cat hit mask and effects",
      "playroom.status===null&&qaCatMask===null&&document.querySelector('#sceneKitten').hidden&&!petContainer.classList.contains('scene-active')",
    );
    await js("ipcRenderer.send=qaSend;playroom.start('scenery')");
    await wait(1050);
    await check(
      "chair scene swings feet and keeps controls below them",
      "playroom.status.scene.kind==='scenery'&&!!playroom.bodySource&&!document.querySelector('#sceneBodyCanvas').hidden&&pet.style.visibility==='hidden'&&document.querySelector('#playroomControls').getBoundingClientRect().top>=pet.getBoundingClientRect().bottom+4",
    );
    fs.writeFileSync(
      path.join(temp, "scene-chair-night.png"),
      (await win.webContents.capturePage()).toPNG(),
    );

    await js(
      "window.qaLegA=playroom.bodySource.node.getContext('2d').getImageData(0,Math.round(playroom.bodySource.node.height*.66),playroom.bodySource.node.width,Math.round(playroom.bodySource.node.height*.30)).data.slice();true",
    );
    await wait(300);
    await check(
      "complete seated animation advances actual PNG frames",
      "(()=>{const c=playroom.bodySource.node,b=c.getContext('2d').getImageData(0,Math.round(c.height*.66),c.width,Math.round(c.height*.30)).data;return b.some((v,i)=>v!==qaLegA[i])})()",
    );
    await check(
      "moving feet are included in the current body alpha mask",
      "(()=>{const c=playroom.bodySource.node,ctx=c.getContext('2d'),r=pet.getBoundingClientRect(),d=ctx.getImageData(0,0,c.width,c.height).data;for(let y=Math.round(c.height*.75);y<c.height;y+=3)for(let x=Math.round(c.width*.35);x<c.width*.65;x+=3)if(d[(y*c.width+x)*4+3]>250&&bodyHitController.hit(r.x+x/c.width*r.width,r.y+y/c.height*r.height))return true;return false})()",
    );
    await js("playroom.selectSceneTheme('lake');true");
    await wait(180);
    fs.writeFileSync(
      path.join(temp, "scene-chair-lake.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await check(
      "lake theme sets distant gaze state",
      "playroom.status.scene.theme==='lake'&&pet.src.includes('activity-scene-chair-full-idle')",
    );
    await js("playroom.selectSceneTheme('garden');true");
    await wait(180);
    fs.writeFileSync(
      path.join(temp, "scene-chair-garden.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await check(
      "garden theme sets breeze state and daylight",
      "playroom.status.scene.theme==='garden'&&playroom.status.scene.time==='day'&&pet.src.includes('activity-scene-chair-full-breeze')",
    );
    await js("playroom.selectSceneTheme('stars');true");
    await js("playroom.interactScene('time');true");
    await wait(120);
    await check(
      "scenery supports sunset and updates controls",
      "playroom.status.scene.time==='dusk'&&document.querySelector('.playroom-message').textContent.includes('夕阳')",
    );
    fs.writeFileSync(
      path.join(temp, "scene-chair-dusk.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    await wait(850);
    await js("headZone.click();true");
    await check(
      "scene head touch responds without voice",
      "playroom.status.scene.action==='headpat'&&!voiceDirector.status.active&&bubble.textContent.includes('温暖')",
    );
    await wait(850);
    await js("playroom.interactScene('comfort');true");
    await check(
      "comfort changes local mood and speech",
      "emotionDirector.status.mood==='comforted'&&bubble.textContent.includes('慢慢')",
    );
    await js("setReducedMotion(true);true");
    await wait(160);
    await check(
      "reduced motion stops chair pose cycling",
      "!!playroom.bodySource&&getComputedStyle(pet).animationName==='none'",
    );
    await js("window.qaStill=playroom.bodySource.node.toDataURL();true");
    await wait(120);
    await check(
      "reduced motion also holds the complete seated frame",
      "playroom.bodySource.node.toDataURL()===qaStill",
    );
    await check(
      "scenery suppresses unrelated idle motes",
      "getComputedStyle(document.querySelector('#motes')).opacity==='0'",
    );
    await js("cancelAction();setReducedMotion(false);saveSettings();true");
    await check(
      "scene exit removes full-frame canvas and restores ordinary sprite input",
      "playroom.bodySource===null&&document.querySelector('#sceneBodyCanvas').hidden&&pet.style.visibility===''&&pet.src.length>0",
    );
    await wait(160);
    const savedNew = JSON.parse(
      fs.readFileSync(path.join(isolated, "settings.json"), "utf8"),
    );
    checks.push({
      name: "new records and emotion persist through validated settings",
      pass:
        savedNew.playRecords.practice >= 3 &&
        savedNew.emotionMemory.mood === "comforted" &&
        typeof savedNew.basketSlowMotion === "boolean",
    });
    await reset();
    const restoreOffset = await js("petCenterInWindow().x");
    win.setPosition(
      Math.round(area.x + area.width - 10 - restoreOffset),
      area.y + 120,
    );
    await js("ipcRenderer.send('drag-end');saveSettings();true");
    await wait(200);
    win.webContents.reload();
    await wait(1800);
    await check(
      "renderer reload restores saved right-edge peek",
      "edgeSide==='right'&&petContainer.dataset.edge==='right'&&pet.complete&&pet.src.endsWith('edge-peek-left.png')&&getComputedStyle(pet).clipPath==='none'",
    );
    await require("./interaction-feel-checks.cjs").run({
      win,
      js,
      check,
      wait,
      temp,
    });
    await check(
      "public menu excludes API and academic assistants",
      "!MENU.some(item=>item.label==='助手')&&!MENU.flatMap(item=>item.items||[]).some(item=>/陪伴聊天|论文修改|文字润色|提炼摘要/.test(item.label||''))",
    );
    await check(
      "public renderer has no chat integration or reply listener",
      "!document.querySelector('script[src*=chat]')&&ipcRenderer.listenerCount('chat-pet-reply')===0",
    );
    checks.push({
      name: "public app excludes API service and chat UI files",
      pass: !fs.existsSync(path.join(isolated,"chat-service.js")) &&
        !fs.existsSync(path.join(isolated,"renderer/chat.html")),
    });
    await require("./weather-checks.cjs").run({
      win,
      js,
      check,
      wait,
      isolated,
      temp,
    });
    await require("./gaze-checks.cjs").run({ js, check, wait });
    await require("./menu-bubble-checks.cjs").run({ js, check, wait });
    await require("./pose-text-checks.cjs").run({ win, js, check, wait, temp });
    await require("./new-pose-checks.cjs").run({ win, js, check, wait, temp });
    await require("./coser-checks.cjs").run({ win, js, check, wait, temp });
    await require("./control-checks.cjs").run({
      win,
      js,
      check,
      wait,
      isolated,
      temp,
    });
    checks.push({
      name: "no renderer errors",
      pass: errors.length === 0,
      detail: errors,
    });
  } catch (error) {
    checks.push({
      name: "runtime QA completes",
      pass: false,
      detail: error.stack,
    });
  } finally {
    fs.writeFileSync(
      path.join(temp, "qa-results.json"),
      JSON.stringify({ checks }, null, 2),
    );
    console.log(
      "RUNTIME_RESULT " +
        JSON.stringify({
          checks: checks.length,
          failed: checks.filter((c) => !c.pass),
          artifacts: temp,
        }),
    );
    app.exit(checks.some((c) => !c.pass) ? 1 : 0);
  }
});
