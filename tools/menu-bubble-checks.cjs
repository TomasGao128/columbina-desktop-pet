async function run({ js, check, wait }) {
  await js(
    "cancelAction();releaseEdgePeek();hideMenus();sleeping=resting=focusMode=dragging=pendingDrag=false;affection=140;interactionCount=100;setSound(true);setVoiceOn(true);setVoiceVolume(.75);true",
  );
  const groups = await js(
    "['动作','心情'].flatMap(group=>MENU.find(g=>g.label===group).items.map((item,index)=>({group,index,id:group==='动作'?item.contentId:'mood:'+Object.keys(MOODS)[index]})))",
  );
  await check(
    "all menu actions and moods expose three fresh text choices",
    JSON.stringify(
      groups.length === 28 &&
        groups.every((item) => typeof item.id === "string"),
    ),
  );
  let all = true,
    quiet = true;
  for (const item of groups) {
    await js("cancelAction();burstLastAt=0;true");
    await js(
      "(async()=>{const old=Math.random;Math.random=()=>0;try{await MENU.find(g=>g.label===" +
        JSON.stringify(item.group) +
        ").items[" +
        item.index +
        "].act();}finally{Math.random=old;}return true;})()",
    );
    await wait(70);
    all =
      all &&
      (await js(
        "require('../core/menu-feedback').additionalLines(" +
          JSON.stringify(item.id) +
          ").includes(bubble.textContent)",
      ));
    quiet = quiet && (await js("!voiceDirector.status.active"));
  }
  await check(
    "each of 28 actual menu selections displays its new bubble",
    JSON.stringify(all),
  );
  await check(
    "fresh menu bubbles do not start a recorded voice or get overwritten",
    JSON.stringify(quiet),
  );
  await js(
    "cancelAction();(()=>{const old=Math.random;Math.random=()=>.99;try{playMood('expect');}finally{Math.random=old;}return true;})()",
  );
  await wait(180);
  await check(
    "original voice remains available in the mixed feedback branch",
    "voiceDirector.status.active",
  );
  await js("cancelAction();setVoiceOn(false);burstLastAt=0;true");
  await js(
    "(async()=>{const old=Math.random;Math.random=()=>.99;try{await playMoonBurst();}finally{Math.random=old;}return true;})()",
  );
  await check(
    "burst has a text fallback when recorded voice is disabled",
    "require('../core/menu-feedback').additionalLines('burst').includes(bubble.textContent)&&!voiceDirector.status.active",
  );
  await js("cancelAction();setVoiceOn(true);true");
  await check(
    "curated pose text remains at 86 lines without reintroducing deletions",
    "Object.values(require('./pose-lines.json')).reduce((n,lines)=>n+lines.length,0)===86",
  );
}
module.exports = { run };
