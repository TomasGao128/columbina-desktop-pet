const fs = require("node:fs"),
  path = require("node:path");
async function run({
  cjs,
  ccheck,
  js,
  check,
  wait,
  until,
  send,
  calls,
  isolated,
  temp,
  chat,
  win,
}) {
  const switchMode = async (mode) => {
    await cjs(`document.querySelector('[data-mode="${mode}"]').click();true`);
    await until("!document.getElementById('send').disabled");
  };
  await cjs(
    "document.getElementById('messageInput').value='PAPER_DRAFT_ONLY';true",
  );
  await switchMode("chat");
  await ccheck(
    "mode switch keeps academic draft out of companion composer",
    "!document.getElementById('messageInput').value.includes('PAPER_DRAFT_ONLY')",
  );
  await switchMode("paper");
  await ccheck(
    "switching back restores the paper draft",
    "document.getElementById('messageInput').value==='PAPER_DRAFT_ONLY'",
  );
  await ccheck(
    "paper state never exposes personal memories or companion records",
    "petChat.state('paper').then(s=>s.memories.length===0&&s.history.every(m=>m.mode==='paper'))",
  );
  await switchMode("chat");
  const before = calls.length;
  await send("帮我修改论文：PRIVATE_ACADEMIC_TEXT");
  await until(
    "document.getElementById('status').textContent.includes('论文相关内容请切换')",
  );
  await check(
    "academic content in companion mode is redirected before any API call",
    JSON.stringify(calls.length === before),
  );
  await cjs(
    "document.getElementById('memoryToggle').click();document.getElementById('memoryKind').value='nickname';document.getElementById('memoryText').value='QA小高';document.getElementById('saveMemory').click();true",
  );
  await until(
    "document.getElementById('memoryStatus').textContent==='已记住。'",
  );
  await ccheck(
    "memory form saves a visible persistent nickname",
    "petChat.state('chat').then(s=>s.memories.some(m=>m.text==='QA小高')&&document.getElementById('memoryList').textContent.includes('QA小高'))",
  );
  await cjs(
    "document.querySelector('#memoryList button').click();document.getElementById('memoryText').value='QA阿高';document.getElementById('saveMemory').click();true",
  );
  await until(
    "document.getElementById('memoryList').textContent.includes('QA阿高')",
  );
  await ccheck(
    "memory editing replaces rather than duplicates the nickname",
    "petChat.state('chat').then(s=>s.memories.length===1&&s.memories[0].text==='QA阿高')",
  );
  await cjs(
    "document.getElementById('memoryKind').value='topic';document.getElementById('memoryText').value='我的论文开题';document.getElementById('saveMemory').click();true",
  );
  await until(
    "document.getElementById('memoryStatus').textContent.includes('不加入陪伴记忆')",
  );
  await ccheck(
    "academic memory is rejected without changing saved memories",
    "petChat.state().then(s=>s.memories.length===1)",
  );
  fs.writeFileSync(
    path.join(temp, "chat-memory-preview.png"),
    (await chat.webContents.capturePage()).toPNG(),
  );
  await cjs("document.getElementById('closeMemory').click();true");
  await js(
    "cancelAction();stopWalking();releaseEdgePeek();focusMode=sleeping=resting=dragging=pendingDrag=false;hideMenus();lifeUI.close();voiceDirector.stop();window.chatAffectionBefore=affection;true",
  );
  await send("你真可爱");
  await until("document.getElementById('status').textContent==='回复完成。'");
  await wait(250);
  await check(
    "chat praise starts shy animation and reply bubble without voice or rewards",
    "isPlayingAction&&actionPlayer.status.active?.id==='mood:shy'&&!voiceDirector.status.active&&affection===window.chatAffectionBefore&&bubble.style.display==='block'",
  );
  await check(
    "companion request includes confirmed memory and excludes paper draft",
    JSON.stringify(
      calls.at(-1).body.messages[0].content.includes("QA阿高") &&
        !JSON.stringify(calls.at(-1).body.messages).includes(
          "PAPER_DRAFT_ONLY",
        ),
    ),
  );
  await js(
    "cancelAction();focusMode=true;window.chatBubbleBefore=bubble.textContent;true",
  );
  win.webContents.send("chat-pet-reply", {
    text: "不得打断专注",
    emotion: "happy",
  });
  await wait(100);
  await check(
    "chat reactions do not interrupt focus",
    "!isPlayingAction&&bubble.textContent===window.chatBubbleBefore",
  );
  await js("focusMode=false;cancelAction();true");
  await send("记住：喜欢安静的雨天");
  await until(
    "document.getElementById('status').textContent.includes('已记住')",
  );
  await ccheck(
    "explicit remember request adds a persistent companion memory",
    "petChat.state().then(s=>s.memories.some(m=>m.text==='喜欢安静的雨天'))",
  );
  await cjs(
    "window.confirm=()=>true;document.getElementById('clearHistory').click();true",
  );
  await until(
    "document.getElementById('status').textContent==='陪伴聊天记录已清空。'",
  );
  await ccheck(
    "clearing companion records preserves paper records and confirmed memories",
    "Promise.all([petChat.state('chat'),petChat.state('paper')]).then(([c,p])=>c.history.length===0&&c.memories.length===2&&p.history.length>0&&p.memories.length===0)",
  );
  await check(
    "paper history is physically separate on disk",
    JSON.stringify(
      fs.existsSync(path.join(isolated, "paper-history.json")) &&
        !fs.existsSync(path.join(isolated, "chat-history.json")),
    ),
  );
  await cjs(
    "document.getElementById('memoryToggle').click();document.getElementById('forgetAllMemory').click();true",
  );
  await until(
    "document.getElementById('memoryStatus').textContent==='已忘记。'",
  );
  await ccheck(
    "forget all memories clears the UI and store",
    "petChat.state().then(s=>s.memories.length===0&&document.querySelectorAll('.memory-row').length===0)",
  );
  await check(
    "forget all removes the memory file",
    JSON.stringify(!fs.existsSync(path.join(isolated, "chat-memories.json"))),
  );
  await ccheck(
    "proactive sharing has no setting and old preferences stay disabled",
    "!document.getElementById('proactive')&&petChat.state().then(s=>s.config.proactive===false)",
  );
  await cjs("document.getElementById('closeMemory').click();true");
}
module.exports = { run };
