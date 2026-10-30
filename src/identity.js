async function fetchIdentity(fetchImpl = fetch) {
    const response = await fetchImpl('/api/users/me', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'x-acs-client': 'web' }
    });
    if (!response.ok) {
        if (response.status === 401) throw new Error('Sign in to use calling.');
        if (response.status === 403) throw new Error('Ask the site owner for the acs-user role.');
        throw new Error('Calling service is unavailable. Try again later.');
    }
    const identity = await response.json();
    if (typeof identity.userId !== 'string' || !identity.userId.startsWith('8:acs:') ||
        typeof identity.userToken !== 'string' || !identity.userToken ||
        !Number.isFinite(Date.parse(identity.expiresOn)) || Date.parse(identity.expiresOn) <= Date.now()) {
        throw new Error('The calling service returned an invalid identity.');
    }
    return identity;
}

function credentialOptions(identity, fetchImpl = fetch) {
    return {
        token: identity.userToken,
        refreshProactively: true,
        tokenRefresher: async () => {
            const refreshed = await fetchIdentity(fetchImpl);
            if (refreshed.userId !== identity.userId) throw new Error('Your account changed. Reload to reconnect.');
            return refreshed.userToken;
        }
    };
}

// Sharing an ACS ID replaces the old email directory and avoids account enumeration.
function resolveCallee(value) {
    return typeof value === 'string' && /^8:acs:[A-Za-z0-9_-]+$/.test(value) ? value : undefined;
}

module.exports = { fetchIdentity, credentialOptions, resolveCallee };
