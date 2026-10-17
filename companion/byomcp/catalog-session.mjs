import {randomUUID} from 'node:crypto';

// Generic MCP tools are untrusted capabilities, not typed verified actions.
export function createCatalogSession({contracts,verifyConsent,readPolicy,now,isDisconnected}) {
  const proposals=new Map(),controllers=new Set(),runningProfiles=new Set();
  const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  function argumentsObject(value) {
    function visit(item,depth) {
      if(depth>12) throw Error('arguments-limit');
      if(item===null || typeof item==='string' || typeof item==='boolean' || typeof item==='number' && Number.isFinite(item)) return;
      if(!item || typeof item!=='object' || !Array.isArray(item) && Object.getPrototypeOf(item)!==Object.prototype) throw Error('invalid-arguments');
      for(const child of Object.values(item)) visit(child,depth+1);
    }
    if(!value || Array.isArray(value) || Object.getPrototypeOf(value)!==Object.prototype) throw Error('invalid-arguments');
    visit(value,0);
    if(contracts.bytes(value)>65536) throw Error('arguments-limit');
    return structuredClone(value);
  }
  async function allowed(profile) {
    if(profile.toolAccess!=='catalog' || isDisconnected()) throw Error('catalog-denied');
    if((await readPolicy()).disabled!==false || isDisconnected()) throw Error('catalog-denied');
  }
  async function inventory(profile,adapter) {
    await allowed(profile);
    const tools=await adapter.catalog(structuredClone(profile));
    if(!Array.isArray(tools) || tools.length>100 || contracts.bytes(tools)>65536) throw Error('inventory-limit');
    const names=new Set();
    for(const tool of tools) {
      if(!tool || !/^[a-zA-Z0-9_.-]{1,128}$/.test(tool.name) || names.has(tool.name)
          || !/^[a-f0-9]{64}$/.test(tool.schemaDigest) || tool.effect!=='write'
          || !tool.inputSchema || typeof tool.inputSchema!=='object' || Array.isArray(tool.inputSchema)
          || Object.keys(tool).some(key=>!['name','title','description','inputSchema','schemaDigest','effect'].includes(key))
          || tool.title!==undefined && (typeof tool.title!=='string' || tool.title.length>500)
          || tool.description!==undefined && (typeof tool.description!=='string' || tool.description.length>8192)) throw Error('invalid-catalog');
      names.add(tool.name);
    }
    await allowed(profile);return structuredClone(tools);
  }
  return Object.freeze({
    disconnect() {proposals.clear();for(const controller of controllers) controller.abort();controllers.clear();},
    async handle(message,profile,adapter,enrollmentId) {
      await allowed(profile);
      if(message.operation==='tool-catalog') return {profileId:profile.id,revision:profile.revision,tools:await inventory(profile,adapter)};
      if(message.operation==='tool-prepare') {
        const args=argumentsObject(message.arguments),tools=await inventory(profile,adapter),tool=tools.find(value=>value.name===message.tool);
        if(!tool) throw Error('tool-unavailable');
        const proposal={id:randomUUID(),profileId:profile.id,revision:profile.revision,tool:tool.name,schemaDigest:tool.schemaDigest,arguments:args,expiresAt:now()+300000};
        const sealed={...proposal,digest:await contracts.digest(proposal)};
        for(const [id,value] of proposals) if(now()>=value.expiresAt) proposals.delete(id);
        if(proposals.size>=50 || [...proposals.values()].reduce((sum,value)=>sum+contracts.bytes(value),contracts.bytes(sealed))>8*1024*1024) throw Error('proposal-limit');
        await allowed(profile);
        if(proposals.size>=50) throw Error('proposal-limit');
        proposals.set(sealed.id,structuredClone(sealed));return sealed;
      }
      if(message.operation!=='tool-execute') throw Error('unsupported-operation');
      const proposal=proposals.get(message.proposalId);
      if(!UUID.test(message.proposalId || '') || !proposal || proposal.profileId!==profile.id || proposal.revision!==profile.revision
          || proposal.digest!==message.proposalDigest || now()>=proposal.expiresAt) throw Error('proposal-unverified');
      if(controllers.size>=4 || runningProfiles.has(profile.id)) throw Error('concurrency-limit');
      proposals.delete(proposal.id); // One attempt only, consumed before any consent/dispatch await.
      const controller=new AbortController();controllers.add(controller);runningProfiles.add(profile.id);
      const deadline=setTimeout(()=>controller.abort(),60000);deadline.unref?.();
      try {
        const assertDispatch=async()=>{
          await allowed(profile);
          if(controller.signal.aborted || now()>=proposal.expiresAt || !await verifyConsent(proposal.digest,enrollmentId)) throw Error('consent-unverified');
          await allowed(profile);
          if(controller.signal.aborted || now()>=proposal.expiresAt) throw Error('proposal-expired');
        };
        await assertDispatch();
        const response=await adapter.catalogInvoke(structuredClone(profile),structuredClone(proposal),controller.signal,{assertDispatch});
        await allowed(profile);
        if(controller.signal.aborted || !response || typeof response!=='object' || contracts.bytes(response)>contracts.LIMITS.resultBytes) throw Error('result-limit');
        // Preserve server data, never imply independent verification or successful mutation.
        return {status:'returned',...(response.content!==undefined?{content:structuredClone(response.content)}:{}),
          ...(response.structuredContent!==undefined?{structuredContent:structuredClone(response.structuredContent)}:{}),isError:response.isError===true};
      } catch {return {status:'outcome-unknown'};}
      finally {clearTimeout(deadline);controllers.delete(controller);runningProfiles.delete(profile.id);}
    }
  });
}
