(function initializeWorkingModel(root) {
  'use strict';

  const ARCHIVE_KEY = 'bck-v6-working-model-archive';
  const ACTIVE_KEY = 'bck-v6-working-model-active';

  const SAMPLE_CAPTIONS = Object.freeze([
    {Name:'David', Text:'The core needs to be understandable without setting anything up.', Time:'10:41'},
    {Name:'Avery', Text:'Let’s make the October 24 pilot our target.', Time:'10:42'},
    {Name:'David', Text:'I’ll own the browser test matrix and bring back the first results.', Time:'10:42'},
    {Name:'Unknown speaker', Text:'Let’s review those results at the next planning meeting.', Time:'10:43'},
    {Name:'Avery', Text:'Send the review copy to avery@example.com, but mask contact details before using AI.', Time:'10:44'},
    {Name:'David', Text:'The main risk is silent caption loss when a provider changes its page.', Time:'10:45'}
  ]);

  function identifier(prefix = 'item') {
    const value = root.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${value}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function load(key, fallback) {
    try {
      const value = JSON.parse(root.localStorage.getItem(key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function save(key, value) {
    root.localStorage.setItem(key, JSON.stringify(value));
  }

  function normalizeCaption(caption, index) {
    const capturedAt = new Date(Date.now() + index * 1000).toISOString();
    return {
      ...caption,
      key: caption.key || `caption-${index + 1}-${capturedAt}`,
      capturedAt,
      sourceType:'captured-dom'
    };
  }

  function createSession() {
    const now = new Date();
    return {
      id:identifier('session'),
      title:'Product planning',
      providerLabel:'Microsoft Teams',
      sourceType:'captured',
      status:'capturing',
      startedAt:now.toISOString(),
      completedAt:null,
      transcript:[],
      markers:[],
      captureHealth:{score:92, gaps:2, uncertainSpeakers:1},
      review:{confirmed:[], dismissed:[], finishedAt:null}
    };
  }

  let active = load(ACTIVE_KEY, null);
  let archive = load(ARCHIVE_KEY, []);

  function persistActive() {
    if (active) save(ACTIVE_KEY, active);
    else root.localStorage.removeItem(ACTIVE_KEY);
  }

  function persistArchive() {
    save(ARCHIVE_KEY, archive.slice(0, 25));
  }

  function context(session = active) {
    return {
      sessionId:session?.id,
      meetingTitle:session?.title,
      providerLabel:session?.providerLabel,
      transcriptArray:session?.transcript || []
    };
  }

  function start() {
    active = createSession();
    active.transcript = SAMPLE_CAPTIONS.slice(0, 3).map(normalizeCaption);
    active.sourceTranscript = clone(active.transcript);
    persistActive();
    return clone(active);
  }

  function addNextCaption() {
    if (!active) start();
    const index = active.transcript.length;
    if (index >= SAMPLE_CAPTIONS.length) return null;
    const caption = normalizeCaption(SAMPLE_CAPTIONS[index], index);
    active.transcript.push(caption);
    active.sourceTranscript = active.sourceTranscript || [];
    active.sourceTranscript.push(clone(caption));
    persistActive();
    return clone(caption);
  }

  function mark(captionIndex, kind, note = '') {
    if (!active) throw new Error('Start a meeting before marking a moment.');
    const marker = root.CaptionKeepEvidenceBoard.createMarker(context(), {
      captionIndex,
      kind,
      note,
      createId:() => identifier('marker')
    });
    active.markers.push(marker);
    persistActive();
    return clone(marker);
  }

  function proposals(session = active) {
    if (!session) return [];
    const results = [];
    const ownerCaption = session.transcript.find((item) => /I’ll own/i.test(item.Text));
    if (ownerCaption) results.push({
      id:'proposal-owner', type:'Proposed commitment',
      text:'David will own the browser test matrix.',
      sourceKeys:[ownerCaption.key], status:session.review.confirmed.includes('proposal-owner') ? 'confirmed' : 'proposed'
    });
    const followCaption = session.transcript.find((item) => /next planning meeting/i.test(item.Text));
    if (followCaption) results.push({
      id:'proposal-followup', type:'Proposed follow-up',
      text:'Review the first browser results at the next planning meeting.',
      sourceKeys:[followCaption.key], status:session.review.confirmed.includes('proposal-followup') ? 'confirmed' : 'proposed'
    });
    return results.filter((item) => !session.review.dismissed.includes(item.id));
  }

  function reviewProposal(id, decision) {
    if (!active) return;
    active.review.confirmed = active.review.confirmed.filter((item) => item !== id);
    active.review.dismissed = active.review.dismissed.filter((item) => item !== id);
    active.review[decision === 'confirm' ? 'confirmed' : 'dismissed'].push(id);
    persistActive();
    updateArchive(active);
  }

  function completeReview() {
    if (!active) return;
    active.review.finishedAt = new Date().toISOString();
    persistActive();
    updateArchive(active);
  }

  function updateArchive(session) {
    archive = [clone(session), ...archive.filter((item) => item.id !== session.id)];
    persistArchive();
  }

  function finish() {
    if (!active) start();
    while (active.transcript.length < SAMPLE_CAPTIONS.length) addNextCaption();
    active.status = 'complete';
    active.completedAt = new Date().toISOString();
    updateArchive(active);
    persistActive();
    return clone(active);
  }

  function openSession(id) {
    const found = archive.find((item) => item.id === id);
    if (!found) return null;
    active = clone(found);
    persistActive();
    return clone(active);
  }

  function latest() {
    return clone(archive[0] || active);
  }

  function renameSpeaker(from, to) {
    if (!active || !String(to || '').trim()) return;
    active.sourceTranscript = active.sourceTranscript || clone(active.transcript);
    active.transcript = active.transcript.map((caption) => caption.Name === from ? {...caption, Name:String(to).trim()} : caption);
    const sourceContext = context({...active, transcript:active.sourceTranscript});
    const reconciled = root.CaptionKeepEvidenceBoard.reconcileMarkers(active.markers, sourceContext);
    active.markers = [...reconciled.markers];
    persistActive();
    updateArchive(active);
  }

  function scrub() {
    if (!active) return null;
    return root.CaptionKeepPrivacyScrubber.scrubReleaseBundle(active.title, active.transcript, null);
  }

  function handoff(masked = true) {
    if (!active) return null;
    const cleaned = masked ? root.CaptionKeepPrivacyScrubber.scrubHandoff(active.transcript, {
      meetingTitle:active.title,
      providerLabel:active.providerLabel,
      warnings:['Two brief capture gaps were detected.', 'One speaker needs review.']
    }) : {transcript:active.transcript, metadata:{meetingTitle:active.title, providerLabel:active.providerLabel}, replacements:[]};
    return root.CaptionKeepHandoffPackage.buildPackage(cleaned.transcript, {
      meetingTitle:cleaned.metadata.meetingTitle,
      providerLabel:cleaned.metadata.providerLabel,
      sessionId:active.id,
      privacyMode:masked ? 'masked' : 'unmasked',
      warnings:cleaned.metadata.warnings || []
    });
  }

  function exportProfile(format) {
    if (!active) return null;
    return root.CaptionKeepExportProfiles.createProfile({
      meetingTitle:active.title,
      transcript:active.transcript,
      format,
      versionNotice:'Better CaptionKeep 6.0 working model — captured captions, review before relying.'
    });
  }

  function evidenceBundle() {
    if (!active) return null;
    const sourceTranscript = active.sourceTranscript || active.transcript;
    return {
      sourceTranscript:clone(sourceTranscript),
      reviewedTranscript:clone(active.transcript),
      markerBundle:root.CaptionKeepEvidenceBoard.createEvidenceBundle(
        active.markers,
        context({...active, transcript:sourceTranscript})
      )
    };
  }

  function reset() {
    active = null;
    archive = [];
    root.localStorage.removeItem(ACTIVE_KEY);
    root.localStorage.removeItem(ARCHIVE_KEY);
  }

  root.CaptionKeepWorkingModel = Object.freeze({
    start, addNextCaption, mark, finish, openSession, latest, renameSpeaker,
    scrub, handoff, exportProfile, evidenceBundle, reviewProposal, completeReview, proposals, reset,
    get active() { return clone(active); },
    get archive() { return clone(archive); }
  });
})(globalThis);
