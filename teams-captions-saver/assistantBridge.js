(function initializeAssistantBridge(root) {
    'use strict';

    const REQUEST_FORMAT = 'better-captionkeep-assistant-request';
    const RESPONSE_FORMAT = 'better-captionkeep-assistant-response';
    const VERSION = 1;
    const MAX_RESPONSE_BYTES = 1024 * 1024;
    const DEFAULT_TIMEOUT_MS = 20_000;
    const REMOTE_STATES = Object.freeze(['queued', 'running', 'confirmation_required', 'succeeded', 'failed', 'cancelled']);
    const NATIVE_HOST_PATTERN = /^[a-z0-9_]+(?:\.[a-z0-9_]+)+$/;

    class BridgeError extends Error {
        constructor(code, message, options = {}) {
            super(message);
            this.name = 'BridgeError';
            this.code = String(code || 'BRIDGE_ERROR');
            this.transient = options.transient === true;
            this.httpStatus = Number.isInteger(options.httpStatus) ? options.httpStatus : null;
        }
    }

    function clean(value, maximum = 500) {
        return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum);
    }

    function remoteEndpoint(value) {
        let endpoint;
        try {
            endpoint = new URL(String(value || '').trim());
        } catch {
            throw new BridgeError('CONFIGURATION_INVALID', 'The assistant endpoint is not a valid URL.');
        }
        if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
            throw new BridgeError('CONFIGURATION_INVALID', 'The assistant endpoint must be an HTTPS URL without credentials, query text, or a fragment.');
        }
        endpoint.pathname = endpoint.pathname.replace(/\/+$/, '') || '/';
        return endpoint;
    }

    function nativeHostName(value) {
        const host = clean(value, 200).toLowerCase();
        if (!NATIVE_HOST_PATTERN.test(host)) {
            throw new BridgeError('CONFIGURATION_INVALID', 'The local assistant host name is not valid.');
        }
        return host;
    }

    function createRequest(job, operation = 'submit') {
        if (!job || typeof job !== 'object' || !clean(job.jobId, 100) || !clean(job.idempotencyKey, 300)) {
            throw new BridgeError('JOB_INVALID', 'A valid Evidence Action job is required.');
        }
        if (!['submit', 'status', 'cancel'].includes(operation)) {
            throw new BridgeError('OPERATION_INVALID', 'The assistant operation is not supported.');
        }
        return Object.freeze({
            format: REQUEST_FORMAT,
            version: VERSION,
            operation,
            jobId: job.jobId,
            actionId: job.actionId,
            idempotencyKey: job.idempotencyKey,
            remoteJobId: clean(job.receipt?.remoteJobId || job.remoteJobId, 200) || null,
            action: operation === 'submit' ? job.action : null
        });
    }

    function responsePath(endpoint, request) {
        if (request.operation === 'submit') return endpoint.toString();
        if (!request.remoteJobId) throw new BridgeError('REMOTE_JOB_MISSING', 'The assistant did not provide a job identifier.');
        const basePath = endpoint.pathname.replace(/\/+$/, '');
        const suffix = request.operation === 'cancel' ? '/cancel' : '';
        endpoint.pathname = `${basePath}/${encodeURIComponent(request.remoteJobId)}${suffix}`;
        return endpoint.toString();
    }

    function normalizeResponse(value, request) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new BridgeError('RESPONSE_INVALID', 'The assistant returned an invalid response.');
        }
        if (value.format !== RESPONSE_FORMAT || value.version !== VERSION) {
            throw new BridgeError('RESPONSE_INVALID', 'The assistant response format is not supported.');
        }
        if (clean(value.jobId, 100) !== request.jobId || clean(value.actionId, 100) !== request.actionId) {
            throw new BridgeError('RESPONSE_MISMATCH', 'The assistant response belongs to another Evidence Action.');
        }
        const state = clean(value.state, 30).toLowerCase();
        if (!REMOTE_STATES.includes(state)) {
            throw new BridgeError('RESPONSE_INVALID', 'The assistant returned an unsupported job state.');
        }
        const remoteJobId = clean(value.remoteJobId, 200) || null;
        if (['queued', 'running'].includes(state) && !remoteJobId) {
            throw new BridgeError('RESPONSE_INVALID', 'The assistant response is missing its job identifier.');
        }
        const receipt = ['succeeded', 'failed'].includes(state) ? Object.freeze({
            status: state,
            assistantId: clean(value.assistantId, 200) || null,
            remoteJobId,
            resultKind: clean(value.resultKind, 100) || null,
            resultReference: clean(value.resultReference, 2048) || null,
            resultSha256: clean(value.resultSha256, 64) || null,
            citations: Array.isArray(value.citations) ? value.citations.slice(0, 100) : [],
            customerConfirmed: value.customerConfirmed === true,
            externalSystem: clean(value.externalSystem, 200) || null,
            externalRecordId: clean(value.externalRecordId, 500) || null,
            externalRecordUrl: clean(value.externalRecordUrl, 2048) || null,
            actionTime: clean(value.actionTime, 100) || null,
            evidenceIds: Array.isArray(value.evidenceIds) ? value.evidenceIds.slice(0, 50) : [],
            errorCode: state === 'failed' ? clean(value.errorCode, 100) || 'assistant_failed' : null,
            errorMessage: state === 'failed' ? clean(value.errorMessage, 500) || 'The assistant did not complete the request.' : null
        }) : null;
        const researchCard = value.researchCard && typeof value.researchCard === 'object' && !Array.isArray(value.researchCard)
            ? value.researchCard
            : null;
        const actionDraft = value.actionDraft && typeof value.actionDraft === 'object' && !Array.isArray(value.actionDraft)
            ? value.actionDraft
            : null;
        if (state === 'confirmation_required' && (!remoteJobId || !actionDraft)) {
            throw new BridgeError('RESPONSE_INVALID', 'Customer confirmation requires a remote job ID and structured action draft.');
        }
        return Object.freeze({state, remoteJobId, receipt, researchCard, actionDraft});
    }

    async function responseJson(response) {
        const contentLength = Number(response.headers?.get?.('content-length'));
        if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
            throw new BridgeError('RESPONSE_TOO_LARGE', 'The assistant response is too large.');
        }
        const text = await response.text();
        if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
            throw new BridgeError('RESPONSE_TOO_LARGE', 'The assistant response is too large.');
        }
        try {
            return JSON.parse(text);
        } catch {
            throw new BridgeError('RESPONSE_INVALID', 'The assistant did not return JSON.');
        }
    }

    async function sendRemote(profile, job, operation, accessToken, dependencies = {}) {
        const endpoint = remoteEndpoint(profile?.endpointUrl);
        const token = clean(accessToken, 16_384);
        if (!token) throw new BridgeError('AUTH_REQUIRED', 'Connect to the customer assistant before sending evidence.');
        const request = createRequest(job, operation);
        const fetchImpl = dependencies.fetch || fetch;
        const timeoutMs = Math.min(60_000, Math.max(5_000, Number(profile?.timeoutMs) || DEFAULT_TIMEOUT_MS));
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        let response;
        try {
            response = await fetchImpl(responsePath(endpoint, request), {
                method: request.operation === 'status' ? 'GET' : 'POST',
                headers: {
                    Accept: 'application/json',
                    ...(request.operation === 'status' ? {} : {'Content-Type':'application/json'}),
                    Authorization: `Bearer ${token}`,
                    'Idempotency-Key': request.idempotencyKey
                },
                body: request.operation === 'status' ? undefined : JSON.stringify(request),
                cache: 'no-store',
                credentials: 'omit',
                redirect: 'error',
                referrerPolicy: 'no-referrer',
                signal: controller.signal
            });
        } catch (error) {
            const timedOut = controller.signal.aborted;
            throw new BridgeError(timedOut ? 'TIMEOUT' : 'NETWORK_ERROR', timedOut
                ? 'The customer assistant did not respond in time.'
                : 'The customer assistant could not be reached.', {transient:true});
        } finally {
            clearTimeout(timeout);
        }
        const body = await responseJson(response);
        if (!response.ok) {
            const message = clean(body?.message, 500) || `The customer assistant rejected the request (${response.status}).`;
            throw new BridgeError(clean(body?.code, 100) || 'HTTP_ERROR', message, {
                httpStatus: response.status,
                transient: response.status === 408 || response.status === 429 || response.status >= 500
            });
        }
        return normalizeResponse(body, request);
    }

    async function sendLocal(profile, job, operation, dependencies = {}) {
        const host = nativeHostName(profile?.nativeHost);
        const request = createRequest(job, operation);
        const sendNativeMessage = dependencies.sendNativeMessage;
        if (typeof sendNativeMessage !== 'function') {
            throw new BridgeError('LOCAL_BRIDGE_UNAVAILABLE', 'The local assistant bridge is not available.');
        }
        let response;
        try {
            response = await sendNativeMessage(host, request);
        } catch {
            throw new BridgeError('LOCAL_BRIDGE_UNAVAILABLE', 'The enrolled local assistant bridge could not be reached.', {transient:true});
        }
        return normalizeResponse(response, request);
    }

    async function send(profile, job, operation, dependencies = {}) {
        if (profile?.mode === 'remote') {
            return sendRemote(profile, job, operation, dependencies.accessToken, dependencies);
        }
        if (profile?.mode === 'local') return sendLocal(profile, job, operation, dependencies);
        throw new BridgeError('BRIDGE_DISABLED', 'No customer assistant bridge is configured.');
    }

    root.CaptionKeepAssistantBridge = Object.freeze({
        REQUEST_FORMAT,
        RESPONSE_FORMAT,
        VERSION,
        MAX_RESPONSE_BYTES,
        DEFAULT_TIMEOUT_MS,
        REMOTE_STATES,
        BridgeError,
        remoteEndpoint,
        nativeHostName,
        createRequest,
        normalizeResponse,
        sendRemote,
        sendLocal,
        send
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = root.CaptionKeepAssistantBridge;
})(typeof globalThis !== 'undefined' ? globalThis : this);
