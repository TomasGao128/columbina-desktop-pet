const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
async function run({ win, js, check, wait, temp }) {
  const {
    dragTilt,
    edgeProgress,
    createFeedbackPicker,
  } = require("../app/core/interaction-feel");
  assert.equal(dragTilt(0, 16), 0);
  assert.equal(dragTilt(10000, 16), -5);
  assert.equal(dragTilt(-10000, 16), 5);
  assert.equal(dragTilt(NaN, 16), 0);
  assert.equal(edgeProgress(-900, -1000, 1000), 1 / 3);
  assert.equal(edgeProgress(-500, -1000, 1000), 0);
  const pick = createFeedbackPicker(() => 0);
  assert.notEqual(pick("head", ["A", "B"]), pick("head", ["A", "B"]));
  await check(
    "gesture policy bounds tilt and avoids consecutive feedback",
    "true",
  );
  await js(
    "cancelAction();releaseEdgePeek();focusMode=sleeping=resting=dragging=pendingDrag=false;hideMenus();lifeUI.close();voiceDirector.stop();affection=70;lastAffectionAt=0;window.feelSend=ipcRenderer.send;ipcRenderer.send=(...a)=>{if(!a[0].startsWith('drag-'))feelSend(...a)};true",
  );
  await wait(150);
  const pointer = async (type, x, y = 100) =>
    js(
      `(()=>{const r=headZone.getBoundingClientRect();let p={x:r.left+r.width/2,y:r.top+r.height/2};for(let cy=r.top;cy<r.bottom;cy+=4){let found=false;for(let cx=r.left;cx<r.right;cx+=4){if(bodyHitController.hit(cx,cy)){p={x:cx,y:cy};found=true;break;}}if(found)break;}headZone.dispatchEvent(new PointerEvent(${JSON.stringify(type)},{bubbles:true,button:0,pointerId:405,screenX:${x},screenY:${y},clientX:p.x,clientY:p.y}));return true;})()`,
    );
  await pointer("pointerdown", 100);
  await wait(650);
  await check(
    "head hold acquires one body owner with subtle sparks and no voice",
    "interactionFeel.holding&&isPlayingAction&&actionPlayer.status.active?.id==='head-stroke'&&interactionFeel.status.sparks===5&&!voiceDirector.status.active",
  );
  await pointer("pointermove", 130);
  await pointer("pointermove", 90);
  fs.writeFileSync(
    path.join(temp, "head-stroke-preview.png"),
    (await win.webContents.capturePage()).toPNG(),
  );
  await pointer("pointerup", 90);
  await js("headZone.click();true");
  await wait(100);
  await check(
    "stroke release produces one unvoiced reaction without accidental click",
    "!interactionFeel.holding&&interactionFeel.status.sparks===0&&actionPlayer.status.active?.id==='touch-head'&&!voiceDirector.status.active&&affection===72",
  );
  await js("cancelAction();true");
  await pointer("pointerdown", 100);
  await wait(620);
  await pointer("pointercancel", 100);
  await check(
    "cancelled stroke removes effects and releases ownership without a reward",
    "!interactionFeel.holding&&!isPlayingAction&&actionPlayer.status.active===null&&affection===72",
  );
  await pointer("pointerdown", 100);
  await pointer("pointermove", 120);
  await wait(20);
  await pointer("pointermove", 350);
  await check(
    "quick movement still drags and speed tilt stays bounded",
    "dragging&&!interactionFeel.holding&&Math.abs(interactionFeel.status.tilt)<=5&&Math.abs(interactionFeel.status.tilt)>0",
  );
  win.webContents.send("pet-edge-preview", { side: "left", progress: 1 });
  await wait(230);
  await check(
    "edge approach uses supplied complete leaning pose without frame flicker",
    "interactionFeel.status.preview==='left'&&pet.src.endsWith('edge-peek-right.png')",
  );
  await pointer("pointerup", 350);
  await wait(310);
  await check(
    "drop restores neutral rotation and pointer state",
    "!dragging&&!pendingDrag&&dragPointerId===undefined&&pet.style.rotate===''&&interactionFeel.status.preview===null",
  );
  await js("cancelAction();true");
  await pointer("pointerdown", 100);
  await pointer("pointermove", 140);
  await js("window.beforeDropVoice=voiceDirector.status.clipId;true");
  await pointer("pointerup", 140);
  await check(
    "real drag release starts one whole-body landing without an extra voice",
    "!dragging&&companion.status.dropActive&&document.querySelectorAll('.drop-glow').length===1&&voiceDirector.status.clipId===beforeDropVoice",
  );
  await js(
    "window.landingAnimation=pet.getAnimations().find(a=>a.effect.getKeyframes().some(k=>k.translate==='0px 4px'));landingAnimation.pause();landingAnimation.currentTime=100;true",
  );
  await wait(50);
  await check(
    "landing gently lowers complete sprite without scaling or splitting it",
    "parseFloat(getComputedStyle(pet).translate.split(' ')[1])>0&&parseFloat(getComputedStyle(pet).translate.split(' ')[1])<=4&&landingAnimation.effect.getKeyframes().every(k=>!k.scale&&!k.transform)&&getComputedStyle(document.querySelector('.drop-glow')).pointerEvents==='none'",
  );
  fs.writeFileSync(
    path.join(temp, "landing-preview.png"),
    (await win.webContents.capturePage()).toPNG(),
  );
  await js("landingAnimation.finish();true");
  await wait(50);
  await check(
    "landing finishes without persistent glow or transform",
    "!companion.status.dropActive&&!document.querySelector('.drop-glow')&&getComputedStyle(pet).translate==='none'",
  );
  await js("companion.settleDrop();true");
  await pointer("pointerdown", 100);
  await check(
    "a fresh press immediately cancels landing",
    "!companion.status.dropActive&&!document.querySelector('.drop-glow')",
  );
  await pointer("pointermove", 140);
  await pointer("pointercancel", 140);
  await check(
    "cancelled drag does not play a landing",
    "!dragging&&!companion.status.dropActive&&!document.querySelector('.drop-glow')",
  );
  await js("companion.settleDrop();playMood('expect');true");
  await check(
    "starting another action clears the landing",
    "!companion.status.dropActive&&!document.querySelector('.drop-glow')&&actionPlayer.status.active?.id==='mood:expect'",
  );
  await js("cancelAction();showEdgePeek('left');companion.settleDrop();true");
  await check(
    "docked pet keeps its peek pose without a landing",
    "edgeSide==='left'&&!companion.status.dropActive&&!document.querySelector('.drop-glow')",
  );
  await js(
    "releaseEdgePeek();setReducedMotion(true);companion.settleDrop();true",
  );
  await check(
    "reduced motion skips landing bounce and glow",
    "!companion.status.dropActive&&!document.querySelector('.drop-glow')",
  );
  await js(
    "setReducedMotion(false);companion.settleDrop();setReducedMotion(true);true",
  );
  await wait(50);
  await check(
    "enabling reduced motion cancels an in-progress landing",
    "!companion.status.dropActive&&!document.querySelector('.drop-glow')",
  );
  await js("cancelAction();setReducedMotion(true);true");
  await pointer("pointerdown", 100);
  await wait(620);
  await check(
    "reduced motion keeps stroke feedback static",
    "interactionFeel.holding&&document.querySelector('.touch-feel-layer').classList.contains('reduced')",
  );
  await js("cancelAction();setReducedMotion(false);focusMode=true;true");
  await pointer("pointerdown", 100);
  await wait(620);
  await check(
    "focus blocks stroke effects and body ownership",
    "!interactionFeel.holding&&!isPlayingAction",
  );
  await pointer("pointerup", 100);
  await js(
    "focusMode=false;cancelAction();ipcRenderer.send=feelSend;showEdgePeek('left');true",
  );
  const point = await js(
    "(()=>{const r=pet.getBoundingClientRect();return{x:Math.max(0,r.right-r.width*.2),y:r.top+r.height*.23}})()",
  );
  win.webContents.send("companion-cursor", point);
  await wait(220);
  await check(
    "cursor near docked character gently reveals full sprite",
    "parseFloat(pet.style.translate)===16&&getComputedStyle(pet).clipPath==='none'",
  );
  win.webContents.send("companion-cursor", { x: 10000, y: 10000 });
  await wait(220);
  await check(
    "cursor leaving dock returns calibrated hidden pose",
    "parseFloat(pet.style.translate)===0&&edgeSide==='left'",
  );
  await js("cancelAction();releaseEdgePeek();true");
  await check(
    "interaction cancellation leaves no transform or sparkle residue",
    "pet.style.translate===''&&pet.style.rotate===''&&interactionFeel.status.sparks===0",
  );
}
module.exports = { run };
