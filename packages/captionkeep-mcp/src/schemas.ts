import * as z from 'zod/v4';

export const ResponseFormatSchema = z.enum(['markdown', 'json']).default('markdown');

export const CaptionSchema = z.object({
    evidenceId: z.string().min(1).max(80),
    sourceKey: z.string().max(200).default(''),
    speaker: z.string().min(1).max(200).default('Unknown speaker'),
    time: z.string().min(1).max(100).default('time unavailable'),
    capturedAt: z.string().max(100).nullable().optional(),
    text: z.string().min(1).max(4000)
}).strict();

export const MarkerSchema = z.object({
    id: z.string().max(100).default(''),
    kind: z.enum(['Decision', 'Action item', 'Question', 'Risk', 'Follow-up', 'Important moment']),
    evidenceId: z.string().min(1).max(80),
    sourceKey: z.string().max(200).default(''),
    speaker: z.string().max(200).default('Unknown speaker'),
    time: z.string().max(100).default('time unavailable'),
    capturedAt: z.string().max(100).default(''),
    markedText: z.string().max(4000).default(''),
    finalText: z.string().max(4000).default(''),
    note: z.string().max(4000).default(''),
    createdAt: z.string().max(100).default('')
}).strict();

export const EvidenceBundleSchema = z.object({
    format: z.literal('better-captionkeep-evidence-bundle'),
    version: z.literal(1),
    generatedAt: z.string().min(1).max(100),
    authority: z.string().min(1).max(1000),
    source: z.object({
        sessionId: z.string().min(1).max(200),
        meetingTitle: z.string().min(1).max(300),
        providerLabel: z.string().min(1).max(100),
        transcriptSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
        transcriptIncluded: z.boolean(),
        captionCount: z.number().int().min(0).max(200000)
    }).strict(),
    captions: z.array(CaptionSchema).max(200000),
    markers: z.array(MarkerSchema).max(10000)
}).strict();

export const EvidenceActionSchema = z.object({
    format: z.literal('better-captionkeep-evidence-action'),
    version: z.literal(1),
    actionId: z.string().min(1).max(100),
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    state: z.literal('draft'),
    intent: z.enum(['research_reference', 'prepare_work_item', 'custom']),
    question: z.string().max(1000).nullable(),
    destinationId: z.string().max(200).nullable(),
    sourceScope: z.enum(['public', 'organization', 'both']),
    privacyMode: z.enum(['scrubbed', 'exact']),
    source: z.object({
        sessionId: z.string().min(1).max(200),
        meetingTitle: z.string().min(1).max(300),
        providerLabel: z.string().min(1).max(100)
    }).strict(),
    selectedCaptions: z.array(CaptionSchema).min(1).max(50),
    approvedContext: z.array(CaptionSchema).max(10),
    trust: z.object({
        captionContent: z.literal('untrusted_data'),
        authority: z.string().min(1).max(1000),
        instructionBoundary: z.string().min(1).max(1000)
    }).strict(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/).optional()
}).strict();

export const PaginationSchema = z.object({
    limit: z.number().int().min(1).max(100).default(20).describe('Maximum number of results to return, from 1 to 100.'),
    offset: z.number().int().min(0).default(0).describe('Number of matching results to skip.'),
    response_format: ResponseFormatSchema.describe('Return markdown for people or JSON for programmatic processing.')
}).strict();

export const ToolOutputSchema = z.object({
    data: z.unknown(),
    meta: z.object({
        count: z.number().int().min(0),
        total_count: z.number().int().min(0),
        has_more: z.boolean(),
        next_offset: z.number().int().min(0).nullable()
    }).strict()
}).strict();

export type Caption = z.infer<typeof CaptionSchema>;
export type EvidenceAction = z.infer<typeof EvidenceActionSchema>;
export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;
export type Marker = z.infer<typeof MarkerSchema>;
export type ResponseFormat = z.infer<typeof ResponseFormatSchema>;
