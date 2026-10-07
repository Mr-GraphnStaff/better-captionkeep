import {pathToFileURL} from 'node:url';
import {isAbsolute} from 'node:path';
import {
  AssistantRequest,
  AssistantResponse,
  createResponse,
  parseRequest,
  ProtocolError
} from './protocol.js';

export type AdapterResult = Omit<AssistantResponse, 'format' | 'version' | 'jobId' | 'actionId'>;

export interface AssistantAdapter {
  submit(request: AssistantRequest): Promise<AdapterResult>;
  status(request: AssistantRequest): Promise<AdapterResult>;
  cancel(request: AssistantRequest): Promise<AdapterResult>;
}

export function createHandler(adapter: AssistantAdapter, assistantId = 'customer-assistant'): (value: unknown) => Promise<AssistantResponse> {
  return async (value: unknown) => {
    const request = parseRequest(value);
    try {
      const result = await adapter[request.operation](request);
      return createResponse(request, {...result, assistantId: result.assistantId || assistantId});
    } catch (error) {
      const code = error instanceof ProtocolError ? error.code : 'ADAPTER_FAILED';
      const message = error instanceof Error ? error.message : 'The customer assistant failed.';
      return createResponse(request, {
        state: 'failed',
        remoteJobId: request.remoteJobId,
        assistantId,
        errorCode: code,
        errorMessage: message.slice(0, 500)
      });
    }
  };
}

export async function loadAdapter(modulePath: string | undefined): Promise<AssistantAdapter> {
  if (!modulePath || !isAbsolute(modulePath)) {
    throw new Error('CAPTIONKEEP_ASSISTANT_ADAPTER must be an absolute path to a customer-owned ES module.');
  }
  const imported = await import(pathToFileURL(modulePath).href);
  const candidate = typeof imported.createAdapter === 'function' ? await imported.createAdapter() : imported.default;
  for (const method of ['submit', 'status', 'cancel'] as const) {
    if (typeof candidate?.[method] !== 'function') throw new Error(`The customer adapter must implement ${method}().`);
  }
  return candidate as AssistantAdapter;
}
