import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require = createRequire(import.meta.url);
const sources = {};
for (const file of ['rollingNotes.js','evidenceBoard.js']) {
  const source = await readFile(path.join(project,'teams-captions-saver',file),'utf8');
  sources[file] = createHash('sha256').update(source).digest('hex');
}
// Execute the unchanged modules in Node's ordinary context. A VM sandbox's
// property-lookup overhead distorts these CPU measurements.
const rolling = require(path.join(project,'teams-captions-saver/rollingNotes.js'));
require(path.join(project,'teams-captions-saver/evidenceBoard.js'));
const evidence = globalThis.CaptionKeepEvidenceBoard;
const samples = 20;
function measure(operation) {
  for (let index = 0; index < 3; index++) operation();
  const timings = [];
  let result;
  for (let index = 0; index < samples; index++) {
    const started = performance.now();
    result = operation();
    timings.push(performance.now()-started);
  }
  timings.sort((left,right) => left-right);
  return {samples,medianMs:timings[Math.floor(samples/2)],p95Ms:timings[Math.ceil(samples*.95)-1],
    maxMs:timings.at(-1),changed:result.changed,reason:result.reason || null};
}
const workloads = [];
for (const count of [1000,10000]) {
  const transcript = Array.from({length:count},(_,index) => ({key:`synthetic-${index}`,Name:`Speaker ${index%8}`,
    Time:'10:00',capturedAt:'2026-10-13T10:00:00.000Z',Text:`Synthetic caption ${index}: review the next milestone and record the agreed action.`}));
  let state = {...rolling.emptyState('synthetic-performance'),enabled:true};
  const preparationStarted = performance.now();
  let batches = 0;
  while (state.processedCaptionCount < transcript.length && batches <= count) {
    const next = rolling.update(transcript,state,{force:true,now:'2026-10-13T10:00:00.000Z'});
    if (next.state.processedCaptionCount <= state.processedCaptionCount) throw new Error('Rolling notes did not advance during workload preparation.');
    state = next.state;
    batches++;
  }
  const preparationMs = performance.now()-preparationStarted;
  const snapshotStarted = performance.now();
  const preparedSource = rolling.prepareSource(transcript);
  const snapshotMs = performance.now()-snapshotStarted;
  let preparedState = {...rolling.emptyState('synthetic-performance'),enabled:true};
  const preparedStarted = performance.now();
  let preparedBatches = 0;
  while (preparedState.processedCaptionCount < preparedSource.length && preparedBatches <= count) {
    const next = rolling.update(preparedSource,preparedState,{force:true,now:'2026-10-13T10:00:00.000Z'});
    if (next.state.processedCaptionCount <= preparedState.processedCaptionCount) throw new Error('Prepared rolling source did not advance.');
    preparedState = next.state;
    preparedBatches++;
  }
  const preparedPreparationMs = performance.now()-preparedStarted;
  if (JSON.stringify(preparedState) !== JSON.stringify(state)) throw new Error('Prepared-source optimization changed resulting notes or provenance.');
  const boardContext = {sessionId:'synthetic-performance',meetingTitle:'Synthetic benchmark',transcriptArray:transcript};
  const markerCount = Math.min(500,count);
  const markers = Array.from({length:markerCount},(_,index) => evidence.createMarker(boardContext, {
    captionIndex:Math.floor(index*count/markerCount),createId:()=>`marker-${index}`,now:()=>new Date('2026-10-13T10:00:00.000Z')
  }));
  const changedTranscript = transcript.map((caption,index) => index === 0 ? {...caption,Text:caption.Text+' Corrected.'} : caption);
  const preparedChangedSource = rolling.prepareSource(changedTranscript);
  workloads.push({captionCount:count,markerCount,preparation:{batches,durationMs:preparationMs},
    preparedPreparation:{batches:preparedBatches,snapshotMs,durationMs:preparedPreparationMs,totalMs:snapshotMs+preparedPreparationMs},
    rollingIdle:measure(()=>rolling.update(transcript,state,{force:true,now:'2026-10-13T10:01:00.000Z'})),
    rollingEarlyRevision:measure(()=>rolling.update(changedTranscript,state,{force:true,now:'2026-10-13T10:01:00.000Z'})),
    preparedRollingIdle:measure(()=>rolling.update(preparedSource,state,{force:true,now:'2026-10-13T10:01:00.000Z'})),
    preparedRollingEarlyRevision:measure(()=>rolling.update(preparedChangedSource,state,{force:true,now:'2026-10-13T10:01:00.000Z'})),
    markerReconciliation:measure(()=>evidence.reconcileMarkers(markers,{...boardContext,transcriptArray:changedTranscript}))});
}
const report = {generatedAt:new Date().toISOString(),runtime:process.version,platform:process.platform,
  cpu:os.cpus()[0]?.model,sources,
  scope:'Synthetic pure-module CPU timing only; excludes browser DOM, IPC, storage latency, live providers, browser memory, and certification. No performance pass/fail threshold is claimed.',
  workloads};
const output = path.resolve(project,process.argv[2] || 'dist/prod/meeting-workload-baseline.json');
await mkdir(path.dirname(output),{recursive:true});
await writeFile(output,JSON.stringify(report,null,2)+'\n','utf8');
console.log(JSON.stringify(report,null,2));
console.log(`Saved synthetic workload baseline: ${output}`);
