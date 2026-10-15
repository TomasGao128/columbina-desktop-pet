let voiceNoticeTimer = null;
function deferVoiceNotice(text) {
  clearTimeout(voiceNoticeTimer);
  const waitForSilence = () => {
    if (voiceDirector?.status.active) {
      voiceNoticeTimer = setTimeout(waitForSilence, 1000);
      return;
    }
    voiceNoticeTimer = setTimeout(() => {
      if (voiceDirector?.status.active) waitForSilence();
      else showBubble(text);
    }, 1600);
  };
  waitForSilence();
}
function speakMatched(context, options = {}) {
  return voiceDirector?.playContext(context, options) || false;
}
function greetingVoiceContext() {
  const hour = Number(
    new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(new Date()),
  );
  return hour < 11 ? 'greet:morning' : hour < 18 ? 'greet:afternoon' : 'greet:night';
}
function setVoiceOn(on) {
  voiceOn = !!on;
  if (!voiceOn) voiceDirector?.stop();
  saveSettingsSoon();
}
function setVoiceVolume(value) {
  voiceVolume = Math.max(0, Math.min(1, Number(value) || 0));
  voiceDirector?.setVolume();
  saveSettingsSoon();
}
function playStory(id) {
  hideMenus();
  stopWalking();
  cancelAction();
  if (!soundOn || !voiceOn || voiceVolume === 0) {
    showBubble('语音已静音…请在设置里开启音效和语音，并调高音量。');
    return false;
  }
  const started = voiceDirector?.playStory(id) || false;
  if (started) {
    recordCompanionship('other', id);
    addAffection(1);
  }
  return started;
}
function openStoryMenu() {
  subMenu.classList.remove('pose-grid');
  subMenu.replaceChildren();
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'unlock-note';
  back.textContent = '‹ 返回互动';
  back.onclick = (event) => {
    event.stopPropagation();
    renderSubItems(MENU.find((g) => g.label === '互动'));
    placeMenus();
  };
  subMenu.appendChild(back);
  for (const story of VOICE_CATALOG.stories)
    subMenu.appendChild(
      buildSubItem({ icon: '📖', label: story.title, act: () => playStory(story.id) }),
    );
  subMenu.style.display = 'block';
  placeMenus();
}
function initializeVoices() {
  const { createVoicePlayer } = require('./voice-player.js');
  const controls = document.createElement('div');
  controls.id = 'voiceControls';
  controls.hidden = true;
  const label = document.createElement('span');
  const stop = document.createElement('button');
  stop.type = 'button';
  stop.textContent = '■';
  stop.title = '停止语音';
  stop.setAttribute('aria-label', '停止语音');
  stop.onclick = (event) => {
    event.stopPropagation();
    voiceDirector.stop();
  };
  controls.append(label, stop);
  petContainer.appendChild(controls);
  controls.addEventListener('pointerdown', (event) => event.stopPropagation());
  controls.addEventListener('click', (event) => event.stopPropagation());
  voiceDirector = createVoicePlayer({
    catalog: VOICE_CATALOG,
    enabled: () => soundOn && voiceOn && voiceVolume > 0,
    volume: () => voiceVolume,
    caption: (text, duration) => showBubble(text, duration, true),
    clearCaption: () => {
      clearTimeout(bubbleTimer);
      bubble.style.display = 'none';
    },
    onError: (error) => {
      console.warn('Voice playback unavailable:', error.message);
      showBubble('这段语音暂时不能播放…');
    },
    onChange: (status) => {
      controls.hidden = !status.active || !status.story;
      label.textContent = status.story
        ? `${status.title} ${Math.floor(status.time)}/${Math.ceil(status.duration)}秒`
        : '';
    },
  });
  const timer = setInterval(() => {
    if (
      !focusMode &&
      !sleeping &&
      !resting &&
      !walking &&
      !walkPreparing &&
      !isPlayingAction &&
      !dragging &&
      !menuOpen &&
      !lifeUI?.active &&
      !document.hidden
    )
      speakMatched(hunger <= 30 ? 'hungry' : 'idle', { automatic: true });
  }, 60000);
  window.addEventListener(
    'beforeunload',
    () => {
      clearInterval(timer);
      clearTimeout(voiceNoticeTimer);
      voiceDirector.dispose();
      controls.remove();
    },
    { once: true },
  );
}
