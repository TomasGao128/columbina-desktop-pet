const { nativeImage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
async function run({ win, js, check, wait, temp }) {
  await js(
    "cancelAction();releaseEdgePeek();hideMenus();focusMode=sleeping=resting=dragging=pendingDrag=false;affection=140;interactionCount=100;window.poseFavoriteBefore=favoritePose;true",
  );
  const poses = await js("USER_POSES.filter(p=>p.id>=22)");
  const until = async (condition) => {
    for (let i = 0; i < 100; i++) {
      if (await js(condition)) return;
      await wait(40);
    }
    throw Error("New pose did not settle");
  };
  await check(
    "eleven new poses are appended without changing old pose IDs",
    "USER_POSES.length===28&&USER_POSES.filter(p=>p.id>=22).length===11&&USER_POSES.find(p=>p.id===16).frame==='./user-pose-16.webp'",
  );
  let transparent = true,
    playable = true,
    fit = true;
  for (const pose of poses) {
    const img = nativeImage.createFromPath(
      path.join(
        path.dirname(require.resolve("../app/main.js")),
        "renderer",
        pose.frame,
      ),
    );
    const pixels = img.toBitmap();
    let empty = 0,
      solid = 0;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] === 0) empty++;
      if (pixels[i] > 240) solid++;
    }
    transparent =
      transparent &&
      !img.isEmpty() &&
      empty > pixels.length / 40 &&
      solid > pixels.length / 100;
    await js("playUserPose(" + pose.id + ");true");
    await until(
      "pet.complete&&pet.src.endsWith(" +
        JSON.stringify(path.basename(pose.frame)) +
        ")",
    );
    playable =
      playable &&
      (await js(
        "activeUserPose===" +
          pose.id +
          "&&actionPlayer.status.active?.id==='pose:" +
          pose.id +
          "'",
      ));
    fit =
      fit &&
      (await js(
        "pet.getBoundingClientRect().height<=220*petScale+1&&pet.getBoundingClientRect().width<=220*petScale+1",
      ));
  }
  await check(
    "all eleven new pose assets have a genuine transparent background",
    JSON.stringify(transparent),
  );
  await check(
    "all eleven poses actually display on the desktop",
    JSON.stringify(playable),
  );
  await check(
    "new seated and standing poses fit without clipping the full figure",
    JSON.stringify(fit),
  );
  await js(
    "cancelAction();renderSubItems(MENU.find(g=>g.label==='姿势'));true",
  );
  await check(
    "pose submenu includes all new thumbnails at the final relationship stage",
    "subMenu.querySelectorAll('.pose-card').length===28",
  );
  await js(
    "[...subMenu.querySelectorAll('.pose-card')].find(el=>el.textContent.includes(USER_POSES.find(p=>p.id===22).label)).querySelector('.pose-favorite').click();true",
  );
  await until("ipcRenderer.sendSync('get-pet-settings').favoritePose===22");
  await check(
    "new poses use the existing persistent pose favorite",
    "favoritePose===22&&ipcRenderer.sendSync('get-pet-settings').favoritePose===22",
  );
  await js("cancelAction();affection=0;interactionCount=0;true");
  await check(
    "new pose direct playback respects existing growth locks",
    "playUserPose(32)===false&&availableContent('pose').length===6&&!isPlayingAction",
  );
  await js(
    "affection=140;interactionCount=100;favoritePose=poseFavoriteBefore;saveSettings();playUserPose(23);true",
  );
  await until("pet.complete&&pet.src.endsWith('pose-23.png')");
  await wait(150);
  fs.writeFileSync(
    path.join(temp, "new-seated-pose-preview.png"),
    (await win.webContents.capturePage()).toPNG(),
  );
  await check(
    "new poses retain the softened portrait effects",
    "Number(document.querySelector('.moon-effects').style.opacity)<=.42&&moonEffects.status.particles===16",
  );
  await js("cancelAction();true");
  await check(
    "canceling a new pose clears portrait layout and restores idle",
    "activeUserPose===null&&!petContainer.classList.contains('portrait-showcase')&&!pet.style.getPropertyValue('--portrait-ratio')&&!isPlayingAction",
  );
}
module.exports = { run };
