import { createHash } from 'node:crypto';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import {
    EvidenceActionSchema,
    EvidenceBundleSchema,
    type Caption,
    type EvidenceAction,
    type EvidenceBundle,
    type Marker
} from './schemas.js';

const MAX_FILE_BYTES = 4 * 1024 * 1024;

export interface MeetingSummary {
    sessionId: string;
    meetingTitle: string;
    providerLabel: string;
    generatedAt: string;
    captionCount: number;
    markerCount: number;
}

export interface CaptionMatch extends Caption {
    sessionId: string;
    meetingTitle: string;
    providerLabel: string;
}

export interface VerificationResult {
    sessionId: string;
    status: 'verified' | 'mismatch' | 'not_verifiable';
    expectedSha256: string | null;
    calculatedSha256: string | null;
    captionCountMatches: boolean;
}

interface RepositorySnapshot {
    bundles: EvidenceBundle[];
    actions: EvidenceAction[];
    rejected: { file: string; reason: string }[];
}

function canonicalTranscript(bundle: EvidenceBundle): string {
    return JSON.stringify({
        sessionId: bundle.source.sessionId,
        meetingTitle: bundle.source.meetingTitle,
        providerLabel: bundle.source.providerLabel,
        captions: bundle.captions
    });
}

function paginate<T>(items: T[], offset: number, limit: number): {
    items: T[];
    total_count: number;
    count: number;
    has_more: boolean;
    next_offset: number | null;
} {
    const page = items.slice(offset, offset + limit);
    const next = offset + page.length;
    return {
        items: page,
        total_count: items.length,
        count: page.length,
        has_more: next < items.length,
        next_offset: next < items.length ? next : null
    };
}

export class FileEvidenceRepository {
    readonly directory: string;

    constructor(directory: string) {
        if (!directory.trim()) throw new TypeError('An evidence directory is required.');
        this.directory = path.resolve(directory);
    }

    private async snapshot(): Promise<RepositorySnapshot> {
        const base = await realpath(this.directory);
        const entries = await readdir(base, { withFileTypes: true });
        const bundles: EvidenceBundle[] = [];
        const actions: EvidenceAction[] = [];
        const rejected: { file: string; reason: string }[] = [];

        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
            const candidate = path.resolve(base, entry.name);
            if (path.dirname(candidate) !== base) continue;
            try {
                const fileStat = await stat(candidate);
                if (fileStat.size > MAX_FILE_BYTES) throw new Error('File exceeds the 4 MiB evidence limit.');
                const parsed: unknown = JSON.parse(await readFile(candidate, 'utf8'));
                const bundle = EvidenceBundleSchema.safeParse(parsed);
                if (bundle.success) {
                    bundles.push(bundle.data);
                    continue;
                }
                const action = EvidenceActionSchema.safeParse(parsed);
                if (action.success) {
                    actions.push(action.data);
                    continue;
                }
                throw new Error('JSON is not a supported CaptionKeep evidence bundle or action envelope.');
            } catch (error: unknown) {
                rejected.push({file:entry.name, reason:error instanceof Error ? error.message : 'Unknown evidence error.'});
            }
        }

        bundles.sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
        actions.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        return {bundles, actions, rejected};
    }

    async searchMeetings(query: string, provider: string, offset: number, limit: number) {
        const {bundles} = await this.snapshot();
        const needle = query.trim().toLocaleLowerCase();
        const providerNeedle = provider.trim().toLocaleLowerCase();
        const seen = new Set<string>();
        const meetings: MeetingSummary[] = [];
        for (const bundle of bundles) {
            if (seen.has(bundle.source.sessionId)) continue;
            if (needle && !`${bundle.source.meetingTitle} ${bundle.source.sessionId}`.toLocaleLowerCase().includes(needle)) continue;
            if (providerNeedle && !bundle.source.providerLabel.toLocaleLowerCase().includes(providerNeedle)) continue;
            seen.add(bundle.source.sessionId);
            meetings.push({
                sessionId:bundle.source.sessionId,
                meetingTitle:bundle.source.meetingTitle,
                providerLabel:bundle.source.providerLabel,
                generatedAt:bundle.generatedAt,
                captionCount:bundle.captions.length,
                markerCount:bundle.markers.length
            });
        }
        return paginate(meetings, offset, limit);
    }

    async searchCaptions(query: string, sessionId: string, offset: number, limit: number) {
        const {bundles} = await this.snapshot();
        const needle = query.trim().toLocaleLowerCase();
        const matches: CaptionMatch[] = [];
        for (const bundle of bundles) {
            if (sessionId && bundle.source.sessionId !== sessionId) continue;
            for (const caption of bundle.captions) {
                if (!`${caption.speaker} ${caption.text}`.toLocaleLowerCase().includes(needle)) continue;
                matches.push({...caption, sessionId:bundle.source.sessionId, meetingTitle:bundle.source.meetingTitle, providerLabel:bundle.source.providerLabel});
            }
        }
        return paginate(matches, offset, limit);
    }

    async getMeeting(sessionId: string): Promise<EvidenceBundle | null> {
        const {bundles} = await this.snapshot();
        return bundles.find(bundle => bundle.source.sessionId === sessionId) ?? null;
    }

    async getDecisionsAndActions(sessionId: string): Promise<Marker[]> {
        const bundle = await this.getMeeting(sessionId);
        return (bundle?.markers ?? []).filter(marker => marker.kind === 'Decision' || marker.kind === 'Action item');
    }

    async getCaptionSources(sessionId: string, evidenceIds: string[]): Promise<Caption[]> {
        const bundle = await this.getMeeting(sessionId);
        if (!bundle) return [];
        const requested = new Set(evidenceIds);
        return evidenceIds.length ? bundle.captions.filter(caption => requested.has(caption.evidenceId)) : bundle.captions;
    }

    async verifyBundle(sessionId: string): Promise<VerificationResult | null> {
        const bundle = await this.getMeeting(sessionId);
        if (!bundle) return null;
        const captionCountMatches = bundle.source.captionCount === bundle.captions.length;
        if (!bundle.source.transcriptSha256) {
            return {sessionId, status:'not_verifiable', expectedSha256:null, calculatedSha256:null, captionCountMatches};
        }
        const calculatedSha256 = createHash('sha256').update(canonicalTranscript(bundle)).digest('hex');
        return {
            sessionId,
            status:calculatedSha256 === bundle.source.transcriptSha256 && captionCountMatches ? 'verified' : 'mismatch',
            expectedSha256:bundle.source.transcriptSha256,
            calculatedSha256,
            captionCountMatches
        };
    }

    async getActiveSelection(now = new Date()): Promise<EvidenceAction | null> {
        const {actions} = await this.snapshot();
        return actions.find(action => new Date(action.expiresAt).getTime() > now.getTime()) ?? null;
    }

    async diagnostics(): Promise<{ rejected: { file: string; reason: string }[] }> {
        const {rejected} = await this.snapshot();
        return {rejected};
    }
}
