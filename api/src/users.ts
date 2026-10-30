import { createHash } from 'node:crypto';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

interface Principal {
  identityProvider: string;
  userId: string;
  userRoles: string[];
}

export interface IdentityRecord {
  id: string;
  userId: string;
}

export interface Services {
  find(id: string): Promise<IdentityRecord | undefined>;
  create(record: IdentityRecord): Promise<void>;
  createUser(): Promise<string>;
  deleteUser(userId: string): Promise<void>;
  getToken(userId: string): Promise<{ token: string; expiresOn: Date }>;
}

function principalFrom(header: string | null): Principal | undefined {
  if (!header || header.length > 16384 || !/^[A-Za-z0-9+/]+={0,2}$/.test(header)) return;
  try {
    const value = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
    if (typeof value?.identityProvider !== 'string' || !value.identityProvider.trim() ||
        typeof value.userId !== 'string' || !value.userId.trim() ||
        !Array.isArray(value.userRoles) || !value.userRoles.every((role: unknown) => typeof role === 'string') ||
        !value.userRoles.includes('authenticated')) return;
    return value;
  } catch { return; }
}

// Never use a client-supplied email, display name, URL, or request body as an identity key.
export function recordId(principal: Pick<Principal, 'identityProvider' | 'userId'>): string {
  return 'v2-' + createHash('sha256')
    .update(JSON.stringify([principal.identityProvider, principal.userId])).digest('hex');
}

export function hasStatus(error: unknown, status: number): boolean {
  const value = error as { code?: unknown; statusCode?: unknown } | null;
  return value?.code === status || value?.statusCode === status;
}

function response(status: number, jsonBody: unknown): HttpResponseInit {
  return { status, jsonBody, headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache' } };
}

// This header is trusted ONLY behind the SWA managed API gateway. It is not a JWT.
export function createUsersHandler(getServices: () => Services) {
  return async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const principal = principalFrom(request.headers.get('x-ms-client-principal'));
    if (!principal) return response(401, { error: 'Sign in first.' });
    if (!principal.userRoles.includes('acs-user')) {
      return response(403, { error: 'Ask the site owner for the acs-user role.' });
    }
    if (request.method !== 'POST') {
      return { ...response(405, { error: 'Use POST.' }), headers: { 'Cache-Control': 'no-store', Allow: 'POST' } };
    }
    // A custom header prevents cross-site HTML forms from minting tokens. Do not enable cross-origin CORS.
    if (request.headers.get('x-acs-client') !== 'web') return response(400, { error: 'Invalid request.' });

    try {
      const services = getServices(); // Lazy: invalid/unauthorized requests never touch Azure.
      const id = recordId(principal);
      let record = await services.find(id);
      if (!record) {
        const userId = await services.createUser();
        try {
          await services.create({ id, userId }); // Atomic create, never upsert another request's identity.
          record = { id, userId };
        } catch (error) {
          if (!hasStatus(error, 409)) {
            // A timeout can mean the write succeeded. Do not delete a possibly persisted identity.
            throw error;
          }
          try { await services.deleteUser(userId); }
          catch { context.warn('Unused ACS identity cleanup failed; operator reconciliation required.'); }
          record = await services.find(id); // Use the winner of a simultaneous first login.
          if (!record) throw new Error('Identity conflict could not be resolved.');
        }
      }
      if (record.id !== id || typeof record.userId !== 'string' || !record.userId.startsWith('8:acs:')) {
        throw new Error('Invalid identity record.');
      }
      const token = await services.getToken(record.userId);
      return response(200, { userId: record.userId, userToken: token.token, expiresOn: token.expiresOn.toISOString() });
    } catch {
      // SDK exceptions may contain credentials, request URLs, or PII. Never echo or log them.
      context.error('ACS token request failed. Check service configuration and availability.');
      return response(503, { error: 'Calling service is unavailable. Try again later.' });
    }
  };
}
