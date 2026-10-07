import { createServer as createNodeServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
    hostHeaderValidation,
    originValidation,
    toNodeHandler,
    type NodeIncomingMessageLike,
    type NodeServerResponseLike
} from '@modelcontextprotocol/node';
import { createMcpHandler, type AuthInfo } from '@modelcontextprotocol/server';
import { AccessTokenError, type CaptionKeepAuthInfo } from './auth.js';
import { FileEvidenceRepository } from './repository.js';
import { createServer as createCaptionKeepServer } from './server.js';

const MAX_REQUEST_BYTES = 1024 * 1024;

export interface RemoteHttpConfig {
    host: string;
    port: number;
    endpointPath: string;
    publicOrigin: URL;
    authorizationServer: string;
    allowedHostnames: readonly string[];
    allowedOriginHostnames: readonly string[];
    requiredScopes: readonly string[];
}

type AuthenticatedRequest = IncomingMessage & {auth?: AuthInfo};
type VerifyAccessToken = (authorization: string | string[] | undefined) => Promise<CaptionKeepAuthInfo>;

function list(value: string | undefined): string[] {
    return [...new Set(String(value || '').split(/[\s,]+/).map(entry => entry.trim()).filter(Boolean))];
}

function normalizedPath(value: string | undefined): string {
    const path = String(value || '/mcp').trim();
    if (!/^\/[a-z0-9/_-]*$/i.test(path) || path.includes('//') || path.includes('..')) {
        throw new TypeError('CAPTIONKEEP_MCP_PATH must be a simple absolute path.');
    }
    return path.length > 1 ? path.replace(/\/$/, '') : path;
}

export function parseRemoteHttpConfig(environment: NodeJS.ProcessEnv): RemoteHttpConfig {
    const publicOrigin = new URL(String(environment.CAPTIONKEEP_MCP_PUBLIC_ORIGIN || '').trim());
    if (publicOrigin.protocol !== 'https:' || publicOrigin.username || publicOrigin.password || publicOrigin.pathname !== '/' || publicOrigin.search || publicOrigin.hash) {
        throw new TypeError('CAPTIONKEEP_MCP_PUBLIC_ORIGIN must be an HTTPS origin without a path, query, or credentials.');
    }
    const authorizationServer = new URL(String(environment.CAPTIONKEEP_MCP_ISSUER || '').trim());
    if (authorizationServer.protocol !== 'https:' || authorizationServer.username || authorizationServer.password || authorizationServer.search || authorizationServer.hash) {
        throw new TypeError('CAPTIONKEEP_MCP_ISSUER must be an HTTPS authorization-server URL.');
    }
    const port = Number.parseInt(String(environment.CAPTIONKEEP_MCP_PORT || '3333'), 10);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new TypeError('CAPTIONKEEP_MCP_PORT must be between 1 and 65535.');
    const allowedHostnames = list(environment.CAPTIONKEEP_MCP_ALLOWED_HOSTS || publicOrigin.hostname);
    const allowedOriginHostnames = list(environment.CAPTIONKEEP_MCP_ALLOWED_ORIGINS || publicOrigin.hostname);
    if (!allowedHostnames.length || !allowedOriginHostnames.length) throw new TypeError('Remote host and Origin allowlists cannot be empty.');
    const requiredScopes = list(environment.CAPTIONKEEP_MCP_REQUIRED_SCOPES);
    if (!requiredScopes.length) throw new TypeError('CAPTIONKEEP_MCP_REQUIRED_SCOPES must contain at least one scope or app role.');
    return Object.freeze({
        host:String(environment.CAPTIONKEEP_MCP_HOST || '127.0.0.1').trim(),
        port,
        endpointPath:normalizedPath(environment.CAPTIONKEEP_MCP_PATH),
        publicOrigin,
        authorizationServer:authorizationServer.toString().replace(/\/$/, ''),
        allowedHostnames:Object.freeze(allowedHostnames),
        allowedOriginHostnames:Object.freeze(allowedOriginHostnames),
        requiredScopes:Object.freeze(requiredScopes)
    });
}

function json(res: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}): void {
    const body = JSON.stringify(value);
    res.writeHead(status, {'content-type':'application/json; charset=utf-8', 'content-length':String(Buffer.byteLength(body)), ...headers});
    res.end(body);
}

function metadata(config: RemoteHttpConfig): object {
    const resource = new URL(config.endpointPath, config.publicOrigin).toString();
    return {
        resource,
        authorization_servers:[config.authorizationServer],
        bearer_methods_supported:['header'],
        scopes_supported:config.requiredScopes
    };
}

function challenge(config: RemoteHttpConfig, error: AccessTokenError): string {
    const metadataUrl = new URL('/.well-known/oauth-protected-resource', config.publicOrigin).toString();
    const scope = config.requiredScopes.join(' ');
    return `Bearer error="${error.code}", resource_metadata="${metadataUrl}", scope="${scope}"`;
}

export function createAuthenticatedHttpServer(
    repository: FileEvidenceRepository,
    config: RemoteHttpConfig,
    verifyAccessToken: VerifyAccessToken,
    onError: (error: unknown) => void = error => console.error(error)
): Server {
    const handler = createMcpHandler(() => createCaptionKeepServer(repository));
    const nodeHandler = toNodeHandler(handler, {maxRequestBodySize:MAX_REQUEST_BYTES, onerror:onError});
    const validateHost = hostHeaderValidation([...config.allowedHostnames]);
    const validateOrigin = originValidation([...config.allowedOriginHostnames]);

    const server = createNodeServer(async (request, response) => {
        try {
            const url = new URL(request.url || '/', config.publicOrigin);
            if (!validateHost(request, response) || !validateOrigin(request, response)) return;
            if (request.method === 'GET' && url.pathname === '/.well-known/oauth-protected-resource') {
                json(response, 200, metadata(config), {'cache-control':'public, max-age=300'});
                return;
            }
            if (url.pathname !== config.endpointPath) {
                json(response, 404, {error:'not_found'});
                return;
            }
            try {
                (request as AuthenticatedRequest).auth = await verifyAccessToken(request.headers.authorization);
            } catch (error) {
                const authError = error instanceof AccessTokenError
                    ? error
                    : new AccessTokenError('Access token validation failed.', 401, 'invalid_token');
                json(response, authError.status, {error:authError.code, error_description:authError.message}, {'www-authenticate':challenge(config, authError)});
                return;
            }
            await nodeHandler(
                request as unknown as NodeIncomingMessageLike,
                response as unknown as NodeServerResponseLike
            );
        } catch (error) {
            onError(error);
            if (!response.headersSent) json(response, 500, {error:'server_error'});
            else response.end();
        }
    });
    server.on('clientError', error => onError(error));
    return server;
}
