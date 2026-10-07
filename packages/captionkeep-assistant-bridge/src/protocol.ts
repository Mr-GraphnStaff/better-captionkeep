import {createHash} from 'node:crypto';

export const REQUEST_FORMAT = 'better-captionkeep-assistant-request' as const;
export const RESPONSE_FORMAT = 'better-captionkeep-assistant-response' as const;
export const VERSION = 1 as const;
export const MAX_MESSAGE_BYTES = 1024 * 1024;
export const OPERATIONS = ['submit', 'status', 'cancel'] as const;
export const STATES = ['queued', 'running', 'confirmation_required', 'succeeded', 'failed', 'cancelled'] as const;

export type Operation = typeof OPERATIONS[number];
export type State = typeof STATES[number];

export interface EvidenceAction {
  format: 'better-captionkeep-evidence-action';
  version: 1;
  actionId: string;
  expiresAt: string;
  sha256: string;
  trust: {captionContent: 'untrusted_data'; instructionBoundary: string};
  selectedCaptions: unknown[];
  [key: string]: unknown;
}

export interface AssistantRequest {
  format: typeof REQUEST_FORMAT;
  version: typeof VERSION;
  operation: Operation;
  jobId: string;
  actionId: string;
  idempotencyKey: string;
  remoteJobId: string | null;
  action: EvidenceAction | null;
}

export interface AssistantResponse {
  format: typeof RESPONSE_FORMAT;
  version: typeof VERSION;
  jobId: string;
  actionId: string;
  state: State;
  remoteJobId: string | null;
  assistantId?: string;
  resultKind?: string;
  resultReference?: string;
  resultSha256?: string;
  citations?: unknown[];
  errorCode?: string;
  errorMessage?: string;
  researchCard?: Record<string, unknown>;
  actionDraft?: Record<string, unknown>;
  customerConfirmed?: boolean;
  externalSystem?: string;
  externalRecordId?: string;
  externalRecordUrl?: string;
  actionTime?: string;
  evidenceIds?: string[];
}

export class ProtocolError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProtocolError('REQUEST_INVALID', 'The bridge request must be a JSON object.');
  }
  return value as Record<string, unknown>;
}

function boundedString(value: unknown, name: string, maximum: number): string {
  const output = typeof value === 'string' ? value.trim() : '';
  if (!output || output.length > maximum) {
    throw new ProtocolError('REQUEST_INVALID', `${name} is missing or too long.`);
  }
  return output;
}

function optionalString(value: unknown, name: string, maximum: number): string | null {
  if (value == null) return null;
  return boundedString(value, name, maximum);
}

export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalize(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function evidenceActionSeal(action: Record<string, unknown>): string {
  const unsigned = Object.fromEntries(Object.entries(action).filter(([key]) => key !== 'sha256'));
  return createHash('sha256').update(canonicalize(unsigned)).digest('hex');
}

function parseAction(value: unknown, actionId: string): EvidenceAction {
  const action = record(value) as unknown as EvidenceAction;
  if (action.format !== 'better-captionkeep-evidence-action' || action.version !== 1) {
    throw new ProtocolError('ACTION_INVALID', 'The Evidence Action format is not supported.');
  }
  if (boundedString(action.actionId, 'action.actionId', 100) !== actionId) {
    throw new ProtocolError('ACTION_MISMATCH', 'The Evidence Action belongs to another request.');
  }
  if (!/^[a-f0-9]{64}$/i.test(boundedString(action.sha256, 'action.sha256', 64))) {
    throw new ProtocolError('ACTION_INVALID', 'The Evidence Action seal is invalid.');
  }
  if (action.sha256.toLowerCase() !== evidenceActionSeal(action)) {
    throw new ProtocolError('ACTION_TAMPERED', 'The Evidence Action content does not match its seal.');
  }
  if (action.trust?.captionContent !== 'untrusted_data' || !String(action.trust?.instructionBoundary || '').trim()) {
    throw new ProtocolError('ACTION_INVALID', 'The untrusted-caption instruction boundary is missing.');
  }
  if (!Array.isArray(action.selectedCaptions) || action.selectedCaptions.length < 1 || action.selectedCaptions.length > 50) {
    throw new ProtocolError('ACTION_INVALID', 'The Evidence Action must contain 1 to 50 selected captions.');
  }
  const expiry = new Date(action.expiresAt).getTime();
  if (!Number.isFinite(expiry) || expiry <= Date.now()) {
    throw new ProtocolError('ACTION_EXPIRED', 'The Evidence Action has expired.');
  }
  return action;
}

export function parseRequest(value: unknown): AssistantRequest {
  const input = record(value);
  if (input.format !== REQUEST_FORMAT || input.version !== VERSION) {
    throw new ProtocolError('REQUEST_UNSUPPORTED', 'The bridge request format is not supported.');
  }
  if (!OPERATIONS.includes(input.operation as Operation)) {
    throw new ProtocolError('REQUEST_INVALID', 'The bridge operation is not supported.');
  }
  const operation = input.operation as Operation;
  const jobId = boundedString(input.jobId, 'jobId', 100);
  const actionId = boundedString(input.actionId, 'actionId', 100);
  const idempotencyKey = boundedString(input.idempotencyKey, 'idempotencyKey', 300);
  const remoteJobId = optionalString(input.remoteJobId, 'remoteJobId', 200);
  if (operation !== 'submit' && !remoteJobId) {
    throw new ProtocolError('REMOTE_JOB_MISSING', 'Status and cancellation require a remote job ID.');
  }
  const action = operation === 'submit' ? parseAction(input.action, actionId) : null;
  if (operation !== 'submit' && input.action != null) {
    throw new ProtocolError('REQUEST_INVALID', 'Only submit requests may contain evidence.');
  }
  if (action && idempotencyKey !== `evidence-action:${actionId}:${action.sha256.toLowerCase()}`) {
    throw new ProtocolError('IDEMPOTENCY_MISMATCH', 'The idempotency key does not match the sealed Evidence Action.');
  }
  return {format: REQUEST_FORMAT, version: VERSION, operation, jobId, actionId, idempotencyKey, remoteJobId, action};
}

export function createResponse(request: AssistantRequest, value: Omit<AssistantResponse, 'format' | 'version' | 'jobId' | 'actionId'>): AssistantResponse {
  if (!STATES.includes(value.state)) throw new ProtocolError('RESPONSE_INVALID', 'The response state is not supported.');
  if (['queued', 'running', 'confirmation_required'].includes(value.state) && !value.remoteJobId) {
    throw new ProtocolError('RESPONSE_INVALID', 'Non-terminal responses require a remote job ID.');
  }
  if (value.state === 'confirmation_required' && !value.actionDraft) {
    throw new ProtocolError('RESPONSE_INVALID', 'Customer confirmation requires a structured action draft.');
  }
  return {format: RESPONSE_FORMAT, version: VERSION, jobId: request.jobId, actionId: request.actionId, ...value};
}

export function messageSha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
