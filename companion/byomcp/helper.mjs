import {createRequire} from 'node:module';
import {createCatalogSession} from './catalog-session.mjs';
const require = createRequire(import.meta.url);
export const contracts = require('../../teams-captions-saver/evidenceActionContracts.js');
const MAX_RECORDS = 50, MAX_BYTES = 8 * 1024 * 1024, CORE_RESERVE = 16 * 1024 * 1024;

export function createHelper({caller, allowedCallers = [], enrollmentId, profiles = [], adapters = {},
  verifyConsent = async () => false, authorizeOperation = async () => false, verifyWrite = async () => false,
  verifyResultProof = async () => null, requireResultProof = false,
  readPolicy = async () => ({disabled:true}),
  availableBytes = async () => null, now = () => Date.now()}) {
  if (!allowedCallers.includes(caller) || typeof enrollmentId !== 'string' || !enrollmentId) throw new Error('not-enrolled');
  const configured = new Map(profiles.map(profile => [profile.id, structuredClone(profile)]));
  const jobs = new Map();
  const verifiedProfiles = new Set();
  let disconnected = false;
  const catalog=createCatalogSession({contracts,verifyConsent,readPolicy,now,isDisconnected:()=>disconnected});
  let admission = Promise.resolve();
  const serial = action => {const result = admission.then(action); admission = result.catch(() => {}); return result;};
  const status = record => ({jobId:record.approval.payload.jobId, state:record.state, result:record.result || null,
    ...(record.proof ? {proof:record.proof} : {})});
  const usedBytes = () => [...jobs.values()].reduce((sum, record) => sum + contracts.bytes(record.approval) + (record.result ? contracts.bytes(record.result) : contracts.LIMITS.resultBytes), 0);
  async function close() {
    disconnected=true;catalog.disconnect();
    for(const record of jobs.values()) {record.controller.abort();if(!record.result) record.state='cancelled';}
    await Promise.allSettled(Object.values(adapters).map(adapter=>adapter.disconnect?.()));
    return {disconnected:true};
  }

  async function handle(message) {
    message = structuredClone(message);
    if (!message || message.version !== 1 || message.enrollmentId !== enrollmentId || typeof message.requestId !== 'string'
        || message.requestId.length > 64) throw new Error('invalid-message');
    if (contracts.bytes(message) > 98304 || Object.keys(message).some(key => !['version','requestId','enrollmentId','operation','profileId','approval','jobId','tool','arguments','proposalId','proposalDigest'].includes(key))) throw new Error('unexpected-fields');
    if (message.operation === 'status') return {helperVersion:'0.1.0', protocolVersion:1,mcpProtocolVersion:contracts.PROTOCOL_VERSION,enabled:false,
      enrollmentVerified:!disconnected, profiles:[...configured.values()].map(profile => ({id:profile.id,label:profile.label || profile.id,
        transport:profile.transport==='remote'?'streamable-http':'stdio',revision:profile.revision,profileDigest:profile.profileDigest,
        verified:!disconnected,enrolled:!disconnected,inventoryVerified:!disconnected && verifiedProfiles.has(profile.id),toolCount:profile.tools.length,
        ...(profile.toolAccess==='catalog'?{toolAccess:'catalog'}:{})}))};
    if (message.operation === 'disconnect') {
      return close();
    }
    if (disconnected) throw new Error('disconnected');
    const policy = await readPolicy();
    if (policy.disabled !== false) throw new Error('policy-denied');
    if (message.operation === 'capacity') {
      const remaining=await availableBytes();
      if (!Number.isSafeInteger(remaining) || remaining<0 || disconnected || (await readPolicy()).disabled!==false) throw new Error('capacity-unavailable');
      return {availableBytes:remaining};
    }
    const profile = configured.get(message.profileId);
    if (!profile || !adapters[profile.transport]) throw new Error('unsupported-profile');
    if (['tool-catalog','tool-prepare','tool-execute'].includes(message.operation)) {
      const extra=message.operation==='tool-prepare'?['tool','arguments']:message.operation==='tool-execute'?['proposalId','proposalDigest']:[];
      if(Object.keys(message).some(key=>!['version','requestId','enrollmentId','operation','profileId',...extra].includes(key))) throw Error('unexpected-fields');
      return catalog.handle(message,profile,adapters[profile.transport],enrollmentId);
    }
    if (message.operation === 'inventory') {
      const inventory = await adapters[profile.transport].inspect(structuredClone(profile));
      if (!Array.isArray(inventory) || inventory.length > 100 || contracts.bytes(inventory) > 65536) throw new Error('inventory-limit');
      // Inventory text/hints cannot elevate the OS-local reviewed allowlist.
      const tools = [];
      for (const tool of inventory) {
        const grant = profile.tools.find(value => (value.readOnly === true || value.reviewedWrite === true)
          && value.name === tool.name && value.schemaDigest === tool.schemaDigest);
        if (grant) tools.push({name:grant.name,schemaDigest:grant.schemaDigest,compatible:true,approved:true,
          profileGrantId:`grant_${await contracts.digest({profileId:profile.id,revision:profile.revision,name:grant.name,schemaDigest:grant.schemaDigest})}`,effect:grant.operation});
      }
      if (disconnected || (await readPolicy()).disabled !== false) throw new Error('policy-denied');
      if (tools.length) verifiedProfiles.add(profile.id);
      return {profileId:profile.id, revision:profile.revision, tools};
    }
    if (message.operation === 'cancel') {
      const record = jobs.get(message.jobId);
      if (!record || record.approval.payload.connection.id !== profile.id) throw new Error('unknown-job');
      record.state = 'cancelled'; record.controller.abort();
      return status(record);
    }
    if (message.operation !== 'invoke') throw new Error('unsupported-operation');
    // Pin caller data before policy/approval awaits; messages never supply process config.
    const supplied = structuredClone(message.approval);
    const sealed = await contracts.verifyApproval(supplied, profile, {...policy, now});
    if (!await verifyConsent(sealed.approvalDigest, enrollmentId)) throw new Error('consent-unverified');
    if (!await authorizeOperation(structuredClone(profile), sealed)) throw new Error('operation-unapproved');
    const record = await serial(async () => {
      const existing = jobs.get(sealed.payload.jobId);
      if (existing) {if (existing.approval.approvalDigest !== sealed.approvalDigest) throw new Error('job-conflict'); return existing;}
      const remaining = await availableBytes();
      if (!Number.isFinite(remaining) || remaining < CORE_RESERVE + usedBytes() + contracts.LIMITS.resultBytes
          || jobs.size >= MAX_RECORDS || usedBytes() + contracts.bytes(sealed) + contracts.LIMITS.resultBytes > MAX_BYTES) throw new Error('optional-capacity');
      if ([...jobs.values()].filter(item => item.state === 'running').length >= 4
          || [...jobs.values()].some(item => item.state === 'running' && item.approval.payload.connection.id === profile.id)) throw new Error('concurrency-limit');
      const created = {approval:sealed, state:'approved', controller:new AbortController()};
      jobs.set(sealed.payload.jobId, created); return created;
    });
    if (record.state !== 'approved') return status(record);
    record.state = 'running';
    try {
      const assertDispatch = async () => {
        const currentPolicy = await readPolicy();
        await contracts.verifyApproval(record.approval, profile, {...currentPolicy,now});
        if (!await verifyConsent(record.approval.approvalDigest,enrollmentId)
            || !await authorizeOperation(structuredClone(profile),record.approval)) throw new Error('operation-unapproved');
        // Consent/profile verification can suspend; policy must be read after it.
        const finalPolicy = await readPolicy();
        if (finalPolicy.disabled !== false || (finalPolicy.requireScrubbed !== false
            && record.approval.payload.privacyMode !== 'scrubbed')) throw new Error('policy-denied');
        if (disconnected || record.controller.signal.aborted) throw new Error('cancelled');
        if (now() >= Date.parse(record.approval.payload.expiresAt)) throw new Error('approval-expired');
      };
      await assertDispatch();
      const result = await adapters[profile.transport].invoke(structuredClone(profile), record.approval, record.controller.signal,{assertDispatch});
      if (record.controller.signal.aborted || disconnected) return status(record);
      if ((await readPolicy()).disabled !== false) throw new Error('policy-denied');
      const candidate = contracts.validateResult(record.approval, result);
      if (record.approval.payload.operation === 'write' && !await verifyWrite(record.approval, candidate)) throw new Error('write-unverified');
      const proof = await verifyResultProof(record.approval,candidate,structuredClone(profile));
      if (requireResultProof && !proof) throw new Error('result-unverified');
      if (proof && contracts.bytes(proof) > 16384) throw new Error('proof-limit');
      if ((await readPolicy()).disabled !== false) throw new Error('policy-denied');
      if (record.controller.signal.aborted || disconnected) return status(record);
      record.result = candidate;
      record.proof = proof ? structuredClone(proof) : null;
      record.state = 'verified';
    } catch {
      if (record.state !== 'cancelled') record.state = 'outcome-unknown';
      // No upstream free-form error (may contain tokens/content) leaves the helper.
    }
    return status(record);
  }
  return Object.freeze({handle,close});
}
