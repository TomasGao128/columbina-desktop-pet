async function run({ js, check, wait }) {
  await js(
    `window.qaGazeAllowed=true;window.qaGazeImage=pet.cloneNode();qaGazeImage.removeAttribute('id');qaGazeImage.style.cssText='position:fixed;left:60px;top:80px;width:220px;height:308px;pointer-events:none;';document.body.append(qaGazeImage);window.qaGaze=require('./companion-interactions').installCompanion({image:qaGazeImage,container:document.body,loadFrames:preloadFrames,manifest:COMPANION_ACTIONS,state:()=>({canLook:qaGazeAllowed,dragging:false}),restore:()=>{},sound:()=>false,tracking:true});true`,
  );
  try {
    for (let i = 0; i < 100; i++) {
      if (await js("qaGaze.status.gazeReady")) break;
      await wait(50);
    }
    await check(
      "gaze pose resources prepare for response checks",
      "qaGaze.status.gazeReady",
    );
    const point = await js(
      "(()=>{const r=qaGazeImage.getBoundingClientRect();return{x:r.left+r.width*.5,y:r.top+r.height*.2}})()",
    );
    const look = async (dx, dy = 0) =>
      js(`qaGaze.updateLook({x:${point.x + dx},y:${point.y + dy}});true`);
    for (let i = 0; i < 12; i++) {
      await look(0);
      await wait(16);
    }
    for (let dx = 1; dx <= 32; dx++) {
      await look(dx);
      await wait(40);
    }
    await check(
      "slow one-pixel cursor travel activates right-facing gaze near the head",
      "[3,13].includes(qaGaze.status.lookIndex)",
    );
    for (let dx = 31; dx >= -32; dx--) {
      await look(dx);
      await wait(30);
    }
    await check(
      "slow cursor crossing center reaches left-facing gaze",
      "[7,17].includes(qaGaze.status.lookIndex)",
    );
    for (let i = 0; i < 22; i++) {
      await look(0, -90);
      await wait(16);
    }
    await check(
      "normal-speed direction change reaches upward gaze",
      "[1,11].includes(qaGaze.status.lookIndex)",
    );
    await js(
      "window.qaGazeBefore=qaGaze.status.lookIndex;qaGazeAllowed=false;true",
    );
    for (let i = 0; i < 10; i++) {
      await look(400);
      await wait(16);
    }
    await check(
      "protected actions still block gaze pose updates",
      "qaGaze.status.lookIndex===qaGazeBefore||qaGaze.status.lookIndex===0",
    );
    await js(
      "qaGazeAllowed=true;qaGaze.setTracking(false);window.qaGazeOff=qaGaze.status.lookIndex;true",
    );
    await look(400);
    await wait(100);
    await check(
      "tracking disabled prevents cursor-driven pose changes",
      "qaGaze.status.lookIndex===qaGazeOff&&!qaGaze.status.tracking",
    );
  } finally {
    await js(
      "qaGaze.dispose();qaGazeImage.remove();delete window.qaGaze;delete window.qaGazeImage;true",
    );
  }
}
module.exports = { run };
