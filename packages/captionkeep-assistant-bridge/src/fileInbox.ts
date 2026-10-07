import {createHash, randomUUID} from 'node:crypto';
import {lstat, mkdir, readFile, readdir, rename, unlink, writeFile} from 'node:fs/promises';
import {isAbsolute, join, resolve} from 'node:path';
import type {AdapterResult, AssistantAdapter} from './handler.js';
import type {AssistantRequest, State} from './protocol.js';

const INBOX_FORMAT = 'better-captionkeep-assistant-inbox-job';
const INBOX_VERSION = 1;
const REMOTE_ID = /^ckj-[a-f0-9]{32}$/;
const TERMINAL_STATES = new Set<State>(['succeeded', 'failed', 'cancelled']);
const TRANSITIONS = {
  queued: ['running', 'confirmation_required', 'succeeded', 'failed', 'cancelled'],
  running: ['confirmation_required', 'succeeded', 'failed', 'cancelled'],
  confirmation_required: ['running', 'succeeded', 'failed', 'cancelled'],
  succeeded: [],
  failed: [],
  cancelled: []
} as const satisfies Readonly<Record<State, readonly State[]>>;

interface InboxJob {
  format: typeof INBOX_FORMAT;
  version: typeof INBOX_VERSION;
  remoteJobId: string;
  jobId: string;
  actionId: string;
  idempotencyKey: string;
  state: State;
  request: AssistantRequest;
  result: AdapterResult;
  createdAt: string;
  updatedAt: string;
  deleteAfter: string;
}

interface FileInboxOptions {
  retentionMs?: number;
  now?: () => Date;
}

function remoteId(request: AssistantRequest): string {
  return `ckj-${createHash('sha256').update(request.idempotencyKey).digest('hex').slice(0, 32)}`;
}

export class FileInboxAdapter implements AssistantAdapter {
  private readonly root: string;
  private readonly retentionMs: number;
  private readonly now: () => Date;
  private initialized = false;

  constructor(directory: string, options: FileInboxOptions = {}) {
    if (!directory || !isAbsolute(directory)) throw new Error('The assistant inbox path must be absolute.');
    this.root = resolve(directory);
    this.retentionMs = Math.min(30 * 24 * 60 * 60 * 1000, Math.max(60 * 60 * 1000, options.retentionMs || 7 * 24 * 60 * 60 * 1000));
    this.now = options.now || (() => new Date());
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    await mkdir(this.root, {recursive: true, mode: 0o700});
    if ((await lstat(this.root)).isSymbolicLink()) throw new Error('The assistant inbox may not be a symbolic link.');
    this.initialized = true;
  }

  private path(remoteJobId: string): string {
    if (!REMOTE_ID.test(remoteJobId)) throw new Error('The remote job ID is invalid.');
    return join(this.root, `${remoteJobId}.json`);
  }

  private async read(remoteJobId: string): Promise<InboxJob> {
    await this.initialize();
    const file = this.path(remoteJobId);
    const fileInfo = await lstat(file);
    if (fileInfo.isSymbolicLink() || !fileInfo.isFile()) throw new Error('The inbox job is not a regular file.');
    const value = JSON.parse(await readFile(file, 'utf8')) as InboxJob;
    if (value.format !== INBOX_FORMAT || value.version !== INBOX_VERSION || value.remoteJobId !== remoteJobId) {
      throw new Error('The inbox job format is invalid.');
    }
    return value;
  }

  private async write(job: InboxJob): Promise<void> {
    await this.initialize();
    const target = this.path(job.remoteJobId);
    const temporary = join(this.root, `.${job.remoteJobId}.${randomUUID()}.tmp`);
    await writeFile(temporary, `${JSON.stringify(job, null, 2)}\n`, {encoding: 'utf8', mode: 0o600, flag: 'wx'});
    await rename(temporary, target);
  }

  private assertIdentity(job: InboxJob, request: AssistantRequest): void {
    if (job.jobId !== request.jobId || job.actionId !== request.actionId || job.idempotencyKey !== request.idempotencyKey) {
      throw new Error('The inbox job belongs to another Evidence Action.');
    }
  }

  async submit(request: AssistantRequest): Promise<AdapterResult> {
    await this.initialize();
    await this.purgeExpired();
    const id = remoteId(request);
    try {
      const existing = await this.read(id);
      this.assertIdentity(existing, request);
      return existing.result;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const createdAt = this.now().toISOString();
    const result: AdapterResult = {state: 'queued', remoteJobId: id};
    await this.write({
      format: INBOX_FORMAT,
      version: INBOX_VERSION,
      remoteJobId: id,
      jobId: request.jobId,
      actionId: request.actionId,
      idempotencyKey: request.idempotencyKey,
      state: 'queued',
      request,
      result,
      createdAt,
      updatedAt: createdAt,
      deleteAfter: new Date(this.now().getTime() + this.retentionMs).toISOString()
    });
    return result;
  }

  async status(request: AssistantRequest): Promise<AdapterResult> {
    const job = await this.read(request.remoteJobId || '');
    this.assertIdentity(job, request);
    return job.result;
  }

  async cancel(request: AssistantRequest): Promise<AdapterResult> {
    const job = await this.read(request.remoteJobId || '');
    this.assertIdentity(job, request);
    if (TERMINAL_STATES.has(job.state)) return job.result;
    return this.update(job.remoteJobId, {state: 'cancelled', remoteJobId: job.remoteJobId});
  }

  async update(remoteJobId: string, result: AdapterResult): Promise<AdapterResult> {
    const job = await this.read(remoteJobId);
    if (!['queued', 'running', 'confirmation_required', 'succeeded', 'failed', 'cancelled'].includes(result.state)) {
      throw new Error('The inbox result state is invalid.');
    }
    if (result.remoteJobId !== remoteJobId) throw new Error('The inbox result remote job ID does not match.');
    const allowedTransitions = TRANSITIONS[job.state] as readonly State[];
    if (result.state !== job.state && !allowedTransitions.includes(result.state)) {
      throw new Error(`The inbox job cannot move from ${job.state} to ${result.state}.`);
    }
    await this.write({...job, state: result.state, result, updatedAt: this.now().toISOString()});
    return result;
  }

  async purgeExpired(): Promise<number> {
    await this.initialize();
    const names = await readdir(this.root);
    let removed = 0;
    for (const name of names) {
      const match = /^(ckj-[a-f0-9]{32})\.json$/.exec(name);
      if (!match?.[1]) continue;
      try {
        const job = await this.read(match[1]);
        if (new Date(job.deleteAfter).getTime() <= this.now().getTime()) {
          await unlink(this.path(job.remoteJobId));
          removed += 1;
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    return removed;
  }
}
