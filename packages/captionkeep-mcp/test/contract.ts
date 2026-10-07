import assert from 'node:assert/strict';
import type { Client } from '@modelcontextprotocol/client';

export const EXPECTED_TOOLS = [
    'captionkeep_get_active_selection',
    'captionkeep_get_caption_sources',
    'captionkeep_get_decisions_and_actions',
    'captionkeep_get_meeting_evidence',
    'captionkeep_search_captions',
    'captionkeep_search_meetings',
    'captionkeep_verify_evidence_bundle'
];

const EMPTY_REPOSITORY_CALLS = [
    {name:'captionkeep_search_meetings', arguments:{query:'', provider:'', limit:20, offset:0, response_format:'json'}, isError:false},
    {name:'captionkeep_search_captions', arguments:{query:'missing', session_id:'', limit:20, offset:0, response_format:'json'}, isError:false},
    {name:'captionkeep_get_meeting_evidence', arguments:{session_id:'missing', response_format:'json'}, isError:true},
    {name:'captionkeep_get_decisions_and_actions', arguments:{session_id:'missing', response_format:'json'}, isError:false},
    {name:'captionkeep_get_caption_sources', arguments:{session_id:'missing', evidence_ids:[], response_format:'json'}, isError:false},
    {name:'captionkeep_verify_evidence_bundle', arguments:{session_id:'missing', response_format:'json'}, isError:true},
    {name:'captionkeep_get_active_selection', arguments:{response_format:'json'}, isError:false}
] as const;

export async function assertReadOnlyToolContract(client: Client): Promise<void> {
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map(tool => tool.name).sort(), EXPECTED_TOOLS);
    for (const tool of listed.tools) {
        assert.equal(tool.annotations?.readOnlyHint, true, tool.name);
        assert.equal(tool.annotations?.destructiveHint, false, tool.name);
        assert.equal(tool.annotations?.idempotentHint, true, tool.name);
    }
    for (const call of EMPTY_REPOSITORY_CALLS) {
        const result = await client.callTool({name:call.name, arguments:call.arguments});
        assert.equal(!!result.isError, call.isError, call.name);
        assert(result.structuredContent, `${call.name} must return structured content.`);
    }
}
