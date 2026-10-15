const { BrowserWindow, nativeImage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
async function run({ win, js, check, wait, temp }) {
  await js(
    "cancelAction();releaseEdgePeek();sleeping=resting=focusMode=dragging=pendingDrag=false;hideMenus();true",
  );
  await js(
    "window.wardrobeOldAff=affection;window.wardrobeOldCount=interactionCount;window.wardrobeOldFavorites=[...controlFavorites];affection=0;interactionCount=0;refreshGrowthMenus();true",
  );
  await check(
    "wardrobe starts with six unlocked costumes",
    "availableContent('coser').length===6&&visibleMenuItems(MENU.find(g=>g.label==='换装秀')).length===6",
  );
  await check(
    "locked costume cannot be played directly",
    "playCoserPose('28')===false&&!isPlayingAction",
  );
  await check(
    "wardrobe progression follows relationship and interaction thresholds",
    "[availableContent('coser',20,9).length,availableContent('coser',20,10).length,availableContent('coser',60,29).length,availableContent('coser',60,30).length,availableContent('coser',140,0).length].join(',')==='6,12,12,20,28'",
  );
  await js("affection=20;interactionCount=10;true");
  await check(
    "level-up notice includes newly unlocked costumes",
    "relationNoticeData(TIERS[1]).newCosers.length===6&&relationNoticeData(TIERS[1]).cosers===12",
  );
  await js(
    "affection=140;interactionCount=100;refreshGrowthMenus();renderSubItems(MENU.find(g=>g.label==='换装秀'));subMenu.querySelectorAll('.pose-card .pose-favorite')[3].click();true",
  );
  await check(
    "wardrobe star favorites and prioritizes its costume",
    "controlFavorites.includes('换装秀:浅蓝和服')&&subMenu.querySelector('.pose-card').textContent.includes('浅蓝和服')&&subMenu.querySelector('.pose-favorite').classList.contains('selected')",
  );
  await check(
    "wardrobe favorite persists through the settings whitelist",
    "ipcRenderer.sendSync('get-pet-settings').controlFavorites.includes('换装秀:浅蓝和服')",
  );
  await js(
    "subMenu.querySelector('.pose-favorite').click();controlFavorites=[...wardrobeOldFavorites];saveSettings();true",
  );
  await check(
    "wardrobe unfavorite leaves existing pose favorites separate",
    "!controlFavorites.includes('换装秀:浅蓝和服')",
  );
  await js("moonEffects.play('pose:0');true");
  await check(
    "pose effects use reduced opacity and fewer particles",
    "Number(document.querySelector('.moon-effects').style.opacity)<=.42&&moonEffects.status.particles===16",
  );
  await js("moonEffects.play('coser:01');true");
  await check(
    "wardrobe effects share the softer portrait treatment",
    "Number(document.querySelector('.moon-effects').style.opacity)<=.42&&moonEffects.status.particles===16",
  );
  await js("moonEffects.play('touch-head');true");
  await check(
    "ordinary interaction effects keep their original opacity",
    "Math.abs(Number(document.querySelector('.moon-effects').style.opacity)-petOpacity)<.001",
  );
  await js("cancelAction();true");
  const until = async (source) => {
    for (let i = 0; i < 350; i++) {
      if (await js(source)) return;
      await wait(30);
    }
    throw Error("Desktop coser did not settle");
  };
  await check(
    "coser opens a submenu of 28 desktop poses",
    "MENU.find(g=>g.label==='换装秀').items.length===28&&!MENU.find(g=>g.label==='换装秀').act",
  );
  await js("renderSubItems(MENU.find(g=>g.label==='换装秀'));true");
  await check(
    "coser submenu uses full-image thumbnails like poses",
    "subMenu.classList.contains('pose-grid')&&subMenu.querySelectorAll('.pose-card img').length===28",
  );
  const windowCount = BrowserWindow.getAllWindows().length;
  await js("subMenu.querySelector('.pose-card').click();true");
  await until(
    "pet.complete&&pet.src.endsWith('coser-01.png')&&isPlayingAction",
  );
  await check(
    "coser menu selection shows the real desktop sprite without a panel",
    "actionPlayer.status.active?.id==='coser:01'&&pet.src.endsWith('coser-01.png')&&!voiceDirector.status.active",
  );
  await check(
    "coser does not create an additional window",
    JSON.stringify(BrowserWindow.getAllWindows().length === windowCount),
  );
  const poses = await js("COSER_POSES");
  let transparent = true,
    allPlayable = true;
  for (const pose of poses) {
    const file = path.join(
      path.dirname(require.resolve("../app/main.js")),
      "renderer",
      pose.frame,
    );
    const img = nativeImage.createFromPath(file),
      pixels = img.toBitmap();
    let clear = 0,
      solid = 0;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] === 0) clear++;
      if (pixels[i] > 240) solid++;
    }
    transparent =
      transparent &&
      !img.isEmpty() &&
      clear > pixels.length / 40 &&
      solid > pixels.length / 100;
    await js("playCoserPose(" + JSON.stringify(pose.id) + ");true");
    await until(
      "pet.complete&&pet.naturalWidth>0&&pet.src.endsWith(" +
        JSON.stringify(path.basename(pose.frame)) +
        ")",
    );
    allPlayable =
      allPlayable &&
      (await js(
        "actionPlayer.status.active?.id===" +
          JSON.stringify("coser:" + pose.id),
      ));
  }
  await check(
    "all 28 coser assets retain real transparent and opaque pixels",
    JSON.stringify(transparent),
  );
  await check(
    "all 28 outfits can actually replace the desktop body",
    JSON.stringify(allPlayable),
  );
  await check(
    "coser decoding stays within the existing cache budget",
    "preloadFrames.status.estimatedDecodedBytes<=96*1024*1024",
  );
  await js("playCoserPose('02');true");
  await until("pet.complete&&pet.src.endsWith('coser-02.png')");
  fs.writeFileSync(
    path.join(temp, "coser-desktop-preview.png"),
    (await win.webContents.capturePage()).toPNG(),
  );
  await wait(150);
  await check(
    "coser uses the current transparent body hit mask",
    "bodyHitController.hit(pet.getBoundingClientRect().left+pet.getBoundingClientRect().width*.5,pet.getBoundingClientRect().top+pet.getBoundingClientRect().height*.4)&&!bodyHitController.hit(pet.getBoundingClientRect().left+2,pet.getBoundingClientRect().top+2)",
  );
  await js(
    "window.coserCenter=pet.getBoundingClientRect().left+pet.getBoundingClientRect().width/2;playCoserPose('15');true",
  );
  await until("pet.complete&&pet.src.endsWith('coser-15.png')");
  await check(
    "tall costume fits the full-body area without cropping feet",
    "pet.getBoundingClientRect().height<=220*petScale+1&&Math.abs(pet.getBoundingClientRect().width/pet.getBoundingClientRect().height-2/3)<.01",
  );
  await check(
    "tall costume stays centered at the same desktop position",
    "Math.abs(pet.getBoundingClientRect().left+pet.getBoundingClientRect().width/2-coserCenter)<2",
  );
  await js("playCoserPose('01');playCoserPose('28');true");
  await until("pet.complete&&pet.src.endsWith('coser-28.png')");
  await check(
    "rapid outfit selection keeps the latest costume only",
    "actionPlayer.status.active?.id==='coser:28'",
  );
  await js("playMood('expect');true");
  await until(
    "actionPlayer.status.active?.id==='mood:expect'&&!pet.src.includes('coser-')",
  );
  await check(
    "ordinary mood still replaces coser through the director",
    "!pet.src.includes('coser-')&&actionPlayer.status.active?.id==='mood:expect'",
  );
  await js("cancelAction();playCoserPose('01');true");
  await until("pet.complete&&pet.src.endsWith('coser-01.png')");
  await js(
    "window.coserPoint=pet.getBoundingClientRect();window.coserSend=ipcRenderer.send;ipcRenderer.send=(...args)=>{if(!args[0].startsWith('drag-'))coserSend(...args)};petContainer.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:640,clientX:coserPoint.left+coserPoint.width*.5,clientY:coserPoint.top+coserPoint.height*.4,screenX:100,screenY:100}));petContainer.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,button:0,pointerId:640,screenX:150,screenY:100}));true",
  );
  await check(
    "dragging a costume releases its pose ownership",
    "dragging&&actionPlayer.status.active===null&&!isPlayingAction",
  );
  await js(
    "petContainer.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,button:0,pointerId:640}));ipcRenderer.send=coserSend;cancelAction();true",
  );
  await check(
    "cancel restores normal idle without a costume or stuck pointer",
    "!dragging&&!pendingDrag&&dragPointerId===undefined&&!pet.src.includes('/coser/')&&!isPlayingAction",
  );
  await js("playCoserPose('03');true");
  await until("pet.complete&&pet.src.endsWith('coser-03.png')");
  await until("!isPlayingAction&&actionPlayer.status.active===null");
  await check(
    "costume naturally finishes and returns to idle",
    "!pet.src.includes('/coser/')&&!voiceDirector.status.active",
  );
  await js(
    "affection=wardrobeOldAff;interactionCount=wardrobeOldCount;refreshGrowthMenus();true",
  );
}
module.exports = { run };
