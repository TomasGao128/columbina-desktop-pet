const fs = require("node:fs"),
  path = require("node:path");
async function run({ win, js, check, wait, temp }) {
  await js(
    "cancelAction();releaseEdgePeek();hideMenus();focusMode=sleeping=resting=dragging=pendingDrag=false;affection=140;interactionCount=100;true",
  );
  const poses = await js("USER_POSES.map(p=>p.id)");
  let all = true,
    quiet = true;
  for (const id of poses) {
    await js("playUserPose(" + id + ");true");
    await wait(35);
    all =
      all &&
      (await js(
        "CompanionPolicy.poseLines(USER_POSES.find(p=>p.id===" +
          id +
          ")).includes(bubble.textContent)",
      ));
    quiet = quiet && (await js("!voiceDirector.status.active"));
  }
  await check(
    "every actual pose bubble uses its own movement-specific text",
    JSON.stringify(all),
  );
  await check(
    "generic recorded captions no longer override pose bubbles",
    JSON.stringify(quiet),
  );
  await js(
    "playUserPose(23);window.previousPoseText=bubble.textContent;playUserPose(23);true",
  );
  await check(
    "reselecting a curated pose supports its remaining text choices",
    "CompanionPolicy.poseLines(USER_POSES.find(p=>p.id===23)).includes(bubble.textContent)&&(CompanionPolicy.poseLines(USER_POSES.find(p=>p.id===23)).length===1||bubble.textContent!==previousPoseText)",
  );
  await wait(120);
  fs.writeFileSync(
    path.join(temp, "pose-text-preview.png"),
    (await win.webContents.capturePage()).toPNG(),
  );
  await js("playUserPose(28);true");
  await check(
    "palm-light pose has dedicated text rather than generic companionship",
    "require('./pose-lines.json')['28'].includes(bubble.textContent)",
  );
  await js("cancelAction();true");
}
module.exports = { run };
