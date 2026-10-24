const surfaces = [...document.querySelectorAll('[data-surface]')];
const navButtons = [...document.querySelectorAll('[data-screen]')];
const screenCaption = document.querySelector('#screen-caption');
const browserPicker = document.querySelector('#browser-picker');
const browserLabel = document.querySelector('#browser-label');
const captureDialog = document.querySelector('#capture-dialog');
const modelDialog = document.querySelector('#model-dialog');
const modelDialogKicker = document.querySelector('#model-dialog-kicker');
const modelDialogTitle = document.querySelector('#model-dialog-title');
const modelDialogBody = document.querySelector('#model-dialog-body');
const modelDialogActions = document.querySelector('#model-dialog-actions');
const themeToggle = document.querySelector('#theme-toggle');
const themeLabel = themeToggle.querySelector('.theme-label');
const readinessPicker = document.querySelector('#readiness-picker');
const startCapture = document.querySelector('#start-capture');
const model = window.CaptionKeepWorkingModel;

let selectedCaptionIndex = 1;

const captions = {
  ready:'Ready — one clear decision before capture begins',
  live:'Live meeting — the source and capture health stay visible',
  receipt:'Meeting Receipt — source, interpretation, and review stay separate',
  settings:'Settings — powerful controls moved out of the meeting path'
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
  })[character]);
}

function initials(name) {
  return String(name || '?').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function showToast(message) {
  const toast = document.querySelector('#marker-toast');
  toast.textContent = message;
  toast.hidden = false;
  window.setTimeout(() => { toast.hidden = true; }, 2400);
}

function setReadiness(state) {
  const ready = state === 'ready';
  const orbit = document.querySelector('.status-orbit');
  const band = document.querySelector('#status-band');
  const providerStatus = document.querySelector('#provider-status');
  const providerDetail = document.querySelector('#provider-detail');

  orbit.classList.toggle('not-ready', !ready);
  providerStatus.classList.toggle('not-ready', !ready);
  band.textContent = ready ? 'Ready' : 'Not ready';
  providerStatus.textContent = ready ? 'Ready' : 'Not ready';
  providerDetail.textContent = ready ? 'Captions available' : 'Captions unavailable';
  document.querySelector('#ready-title').textContent = ready ? 'Keep this meeting?' : 'Captions aren’t ready';
  document.querySelector('#ready-copy').textContent = ready
    ? 'Preserve the captions you can see and create a local Meeting Receipt when you finish.'
    : 'Turn on captions in the meeting, then Better CaptionKeep can begin preserving them.';
  startCapture.disabled = !ready;
  startCapture.textContent = ready ? 'Keep this meeting' : 'Waiting for captions';
  if (document.querySelector('[data-surface="ready"]').classList.contains('is-visible')) {
    screenCaption.textContent = ready ? captions.ready : 'Not ready — captions must be available before capture begins';
  }
}

function setTheme(theme, persist = true) {
  const dark = theme === 'dark';
  document.documentElement.dataset.theme = theme;
  themeToggle.setAttribute('aria-pressed', String(dark));
  themeToggle.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  themeToggle.firstElementChild.textContent = dark ? '☀' : '☾';
  themeLabel.textContent = dark ? 'Light theme' : 'Dark theme';
  if (persist) window.localStorage.setItem('bck-v6-wireframe-theme', theme);
}

function showScreen(name) {
  surfaces.forEach((surface) => surface.classList.toggle('is-visible', surface.dataset.surface === name));
  navButtons.forEach((button) => button.classList.toggle('active', button.dataset.screen === name));
  screenCaption.textContent = captions[name];
  document.querySelector('#share-menu').hidden = true;
}

function renderLive() {
  const session = model.active;
  if (!session) return;
  const list = document.querySelector('#live-caption-list');
  const markedKeys = new Set(session.markers.map((marker) => marker.sourceKey));
  list.innerHTML = session.transcript.map((caption, index) => {
    const selected = index === selectedCaptionIndex;
    const marked = markedKeys.has(caption.key);
    return `<button class="caption-line ${selected ? 'selected' : ''}" data-caption-index="${index}" type="button">
      <span class="speaker-avatar ${index % 2 ? 'teal' : ''}">${escapeHtml(initials(caption.Name))}</span>
      <span><strong>${escapeHtml(caption.Name)}</strong><time>${escapeHtml(caption.Time)}</time><span class="caption-text">${escapeHtml(caption.Text)}</span>${marked ? '<span class="marker-chip">Marked</span>' : ''}</span>
    </button>`;
  }).join('');
  document.querySelector('#live-caption-count').textContent = `· ${session.transcript.length}`;
  document.querySelector('#add-demo-caption').disabled = session.transcript.length >= 6;
}

function sourceIndexForKey(session, key) {
  return session.transcript.findIndex((caption) => caption.key === key);
}

function renderReceipt() {
  const session = model.active || model.latest();
  if (!session) return;
  const date = new Date(session.completedAt || session.startedAt);
  document.querySelector('.receipt-title-row .eyebrow').textContent = session.title;
  document.querySelector('.receipt-title-row > div > p:last-child').textContent = `${date.toLocaleDateString(undefined, {month:'long', day:'numeric', year:'numeric'})} · ${session.transcript.length} captions · ${session.providerLabel}`;

  const markerCards = session.markers.map((marker) => {
    const sourceIndex = sourceIndexForKey(session, marker.sourceKey);
    return `<article class="review-card marker-card"><div class="review-icon">✓</div><div class="review-copy">
      <span class="item-type">${escapeHtml(marker.kind)} · marked during meeting</span><strong>${escapeHtml(marker.text)}</strong>
      <button class="source-link" data-source-index="${sourceIndex}">${escapeHtml(marker.speaker)} · ${escapeHtml(marker.time)} · View source ↘</button></div></article>`;
  });

  const proposalCards = model.proposals().map((proposal) => {
    const sourceIndex = sourceIndexForKey(session, proposal.sourceKeys[0]);
    const confirmed = proposal.status === 'confirmed';
    return `<article class="review-card ${confirmed ? 'accepted' : 'proposed'}" ${confirmed ? '' : 'data-review-card'} data-proposal-id="${escapeHtml(proposal.id)}">
      <div class="review-icon">${confirmed ? '✓' : '?'}</div><div class="review-copy"><span class="item-type">${confirmed ? 'Confirmed by you' : escapeHtml(proposal.type)}</span>
      <strong>${escapeHtml(proposal.text)}</strong><button class="source-link" data-source-index="${sourceIndex}">View source ↘</button></div>
      ${confirmed ? '' : '<div class="review-actions"><button class="confirm-item" type="button">Confirm</button><button class="reject-item" type="button" aria-label="Dismiss proposal">×</button></div>'}</article>`;
  });

  document.querySelector('#receipt-items').innerHTML = [...markerCards, ...proposalCards].join('') || '<div class="empty-state">No marked or proposed items.</div>';
  document.querySelector('#receipt-transcript').innerHTML = session.transcript.map((caption, index) => `<article class="receipt-transcript-line" id="receipt-source-${index}">
    <time>${escapeHtml(caption.Time)}</time><strong>${escapeHtml(caption.Name)}</strong><p>${escapeHtml(caption.Text)}</p>
    ${caption.Name === 'Unknown speaker' ? '<span class="uncertain-label">Speaker needs review</span>' : ''}</article>`).join('');
  updateReviewCount();
  const finishButton = document.querySelector('#review-finish');
  const finished = Boolean(session.review.finishedAt);
  finishButton.disabled = finished;
  finishButton.textContent = finished ? 'Finished' : 'Review & finish';
  document.querySelector('#finish-title').textContent = finished ? 'Meeting Receipt finished' : 'Review the proposed items';
  document.querySelector('#finish-note').textContent = finished
    ? 'Saved locally. Nothing was sent or shared.'
    : 'Nothing will be sent or shared automatically.';
}

function updateReviewCount() {
  const count = document.querySelectorAll('[data-review-card]').length;
  const label = document.querySelector('#review-count');
  label.textContent = count ? `${count} need review` : 'Review complete';
  label.style.color = count ? '' : 'var(--green)';
}

function openModelDialog({kicker = 'Working model', title, html, actions = []}) {
  modelDialogKicker.textContent = kicker;
  modelDialogTitle.textContent = title;
  modelDialogBody.innerHTML = html;
  modelDialogActions.replaceChildren();
  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = action.primary ? 'primary-button' : 'secondary-button';
    button.textContent = action.label;
    button.addEventListener('click', action.run);
    modelDialogActions.append(button);
  }
  modelDialog.showModal();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadProfile(format) {
  const profile = model.exportProfile(format);
  if (!profile) return;
  let blob;
  if (profile.contentEncoding === 'base64') {
    const bytes = Uint8Array.from(atob(profile.content), (character) => character.charCodeAt(0));
    blob = new Blob([bytes], {type:profile.mimeType});
  } else blob = new Blob([profile.content], {type:profile.mimeType});
  downloadBlob(blob, `product-planning.${profile.extension}`);
  showToast(`${format.toUpperCase()} export prepared locally.`);
}

readinessPicker.addEventListener('change', () => setReadiness(readinessPicker.value));
setReadiness(readinessPicker.value);
setTheme(window.localStorage.getItem('bck-v6-wireframe-theme') || 'dark', false);
themeToggle.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
browserPicker.addEventListener('change', () => { browserLabel.textContent = browserPicker.value; });

navButtons.forEach((button) => button.addEventListener('click', () => {
  const name = button.dataset.screen;
  if (name === 'live') {
    if (!model.active || model.active.status !== 'capturing') model.start();
    renderLive();
  }
  if (name === 'receipt') {
    if (!model.latest()) model.finish();
    else if (!model.active) model.openSession(model.latest().id);
    renderReceipt();
  }
  showScreen(name);
}));

startCapture.addEventListener('click', () => {
  model.start();
  selectedCaptionIndex = 1;
  renderLive();
  showScreen('live');
});

document.querySelector('#live-caption-list').addEventListener('click', (event) => {
  const row = event.target.closest('[data-caption-index]');
  if (!row) return;
  selectedCaptionIndex = Number(row.dataset.captionIndex);
  renderLive();
});

document.querySelector('#add-demo-caption').addEventListener('click', () => {
  const added = model.addNextCaption();
  if (added) {
    selectedCaptionIndex = model.active.transcript.length - 1;
    renderLive();
    showToast('A new provider caption was simulated.');
  } else showToast('All demonstration captions are already present.');
});

document.querySelector('#mark-moment').addEventListener('click', () => {
  try {
    model.mark(selectedCaptionIndex, document.querySelector('#marker-kind').value);
    renderLive();
    showToast('Moment marked and linked to its source.');
  } catch (error) { showToast(error.message); }
});

document.querySelectorAll('.finish-meeting').forEach((button) => button.addEventListener('click', () => {
  model.finish();
  renderReceipt();
  showScreen('receipt');
}));

document.querySelectorAll('.go-receipt').forEach((button) => button.addEventListener('click', () => {
  const latest = model.latest();
  if (latest) model.openSession(latest.id);
  else model.finish();
  renderReceipt();
  showScreen('receipt');
}));

document.querySelectorAll('.go-ready').forEach((button) => button.addEventListener('click', () => showScreen('ready')));
document.querySelectorAll('.open-settings').forEach((button) => button.addEventListener('click', () => showScreen('settings')));
document.querySelector('#show-health').addEventListener('click', (event) => {
  const details = document.querySelector('#health-details');
  details.hidden = !details.hidden;
  event.currentTarget.textContent = details.hidden ? 'Details' : 'Hide';
});
document.querySelector('#open-capture-details').addEventListener('click', () => captureDialog.showModal());

document.querySelector('#receipt-items').addEventListener('click', (event) => {
  const source = event.target.closest('[data-source-index]');
  if (source) {
    const line = document.querySelector(`#receipt-source-${source.dataset.sourceIndex}`);
    line?.scrollIntoView({behavior:'smooth', block:'center'});
    line?.classList.remove('highlight');
    window.requestAnimationFrame(() => line?.classList.add('highlight'));
    return;
  }
  const card = event.target.closest('[data-proposal-id]');
  if (!card) return;
  if (event.target.closest('.confirm-item')) model.reviewProposal(card.dataset.proposalId, 'confirm');
  if (event.target.closest('.reject-item')) model.reviewProposal(card.dataset.proposalId, 'dismiss');
  renderReceipt();
});

document.querySelector('#review-finish').addEventListener('click', (event) => {
  const remaining = document.querySelectorAll('[data-review-card]').length;
  if (remaining) {
    document.querySelector('#finish-title').textContent = `${remaining} proposed ${remaining === 1 ? 'item' : 'items'} still need review`;
    document.querySelector('#finish-note').textContent = 'Confirm or dismiss each proposal before finishing.';
    document.querySelector('[data-review-card]').scrollIntoView({behavior:'smooth', block:'center'});
    return;
  }
  model.completeReview();
  renderReceipt();
});

document.querySelector('#share-button').addEventListener('click', () => {
  const menu = document.querySelector('#share-menu');
  menu.hidden = !menu.hidden;
});

document.querySelector('#share-menu').addEventListener('click', async (event) => {
  const exportButton = event.target.closest('[data-export-format]');
  if (exportButton) downloadProfile(exportButton.dataset.exportFormat);
  if (event.target.closest('#copy-reviewed')) {
    const profile = model.exportProfile('md');
    try {
      await navigator.clipboard.writeText(profile.content);
      showToast('Reviewed Markdown copied to the clipboard.');
    } catch {
      showToast('Clipboard access is unavailable in this preview.');
    }
  }
});

document.querySelector('#correct-names').addEventListener('click', () => {
  const speakers = [...new Set(model.active.transcript.map((caption) => caption.Name))];
  openModelDialog({title:'Correct a speaker name', html:`
    <label class="model-field"><span>Current speaker</span><select id="correction-from">${speakers.map((speaker) => `<option>${escapeHtml(speaker)}</option>`).join('')}</select></label>
    <label class="model-field"><span>Corrected name</span><input id="correction-to" value="Avery Morgan"></label>
    <p class="working-boundary">The authoritative captured text is retained; this correction is stored as a reviewed derivative.</p>`, actions:[{label:'Apply correction', primary:true, run:() => {
      model.renameSpeaker(document.querySelector('#correction-from').value, document.querySelector('#correction-to').value);
      modelDialog.close(); renderReceipt(); showToast('Speaker correction applied locally.');
    }}]});
});

document.querySelector('#scrub-preview').addEventListener('click', () => {
  const result = model.scrub();
  const preview = result.transcript.map((caption) => `${caption.Name}: ${caption.Text}`).join('\n');
  openModelDialog({kicker:'Privacy Scrubber', title:'Masked review copy', html:`<div class="model-summary"><div><span>Replacements</span><strong>${result.replacements.length}</strong></div><div><span>Original</span><strong>Preserved</strong></div><div><span>Destination</span><strong>None</strong></div></div><pre class="model-output">${escapeHtml(preview)}</pre><p class="working-boundary">Masking reduces disclosure; it is not DLP, encryption, or certification.</p>`});
});

document.querySelector('#handoff-preview').addEventListener('click', () => {
  const handoff = model.handoff(true);
  openModelDialog({kicker:'Reviewed BYOAI handoff', title:'Complete cited evidence package', html:`<div class="model-summary"><div><span>Captions</span><strong>${handoff.coverage.included}</strong></div><div><span>Chunks</span><strong>${handoff.coverage.chunkCount}</strong></div><div><span>Privacy</span><strong>${escapeHtml(handoff.coverage.privacyMode)}</strong></div></div><pre class="model-output">${escapeHtml(`${handoff.prompt}\n\n${handoff.file}`)}</pre><p class="working-boundary">Nothing is sent automatically. The customer chooses and controls the AI destination.</p>`, actions:[{label:'Copy reviewed brief', primary:true, run:async() => {
    try {
      await navigator.clipboard.writeText(`${handoff.prompt}\n\n${handoff.file}`);
      modelDialog.close();
      showToast('Reviewed AI brief copied.');
    } catch {
      showToast('Clipboard access is unavailable in this preview.');
    }
  }}]});
});

document.querySelector('#provenance-preview').addEventListener('click', () => {
  openModelDialog({kicker:'Source and derivative boundary', title:'Provenance bundle', html:`<pre class="model-output">${escapeHtml(JSON.stringify(model.evidenceBundle(), null, 2))}</pre>`});
});

document.querySelector('#export-source').addEventListener('click', () => {
  downloadBlob(new Blob([JSON.stringify(model.evidenceBundle(), null, 2)], {type:'application/json'}), 'product-planning-provenance.json');
  showToast('Provenance JSON prepared locally.');
});

document.querySelector('#translate-preview').addEventListener('click', () => {
  openModelDialog({kicker:'Feature-detected tool', title:'Translation availability', html:'<p>Translation will use the browser’s supported on-device capability when available. This working model does not send text to a translation service.</p><p class="working-boundary">The production feature must continue to fail closed when the browser capability is unavailable.</p>'});
});

document.querySelector('#history-button').addEventListener('click', () => {
  const sessions = model.archive;
  openModelDialog({kicker:'Local archive', title:'Meeting history', html:sessions.length ? `<div class="history-list">${sessions.map((session) => `<div class="history-item"><div><strong>${escapeHtml(session.title)}</strong><span>${escapeHtml(session.providerLabel)} · ${session.transcript.length} captions · stored locally</span></div><button type="button" data-history-id="${escapeHtml(session.id)}">Open</button></div>`).join('')}</div>` : '<div class="empty-state">No completed meetings yet.</div>'});
});

modelDialogBody.addEventListener('click', (event) => {
  const open = event.target.closest('[data-history-id]');
  if (!open) return;
  model.openSession(open.dataset.historyId);
  modelDialog.close(); renderReceipt(); showScreen('receipt');
});

const savedSettings = JSON.parse(window.localStorage.getItem('bck-v6-wireframe-settings') || '{}');
document.querySelectorAll('.setting-card input[type="checkbox"]').forEach((input, index) => {
  input.dataset.setting = ['manualStart', 'captureHealth', 'autoFinish'][index];
  if (Object.hasOwn(savedSettings, input.dataset.setting)) input.checked = savedSettings[input.dataset.setting];
  input.addEventListener('change', () => {
    savedSettings[input.dataset.setting] = input.checked;
    window.localStorage.setItem('bck-v6-wireframe-settings', JSON.stringify(savedSettings));
  });
});

document.addEventListener('click', (event) => {
  const menu = document.querySelector('#share-menu');
  if (!menu.hidden && !menu.contains(event.target) && event.target.id !== 'share-button') menu.hidden = true;
});
