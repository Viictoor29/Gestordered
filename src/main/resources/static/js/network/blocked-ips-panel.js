export function initBlockedIpsPanel({ getServerUrl, buildApiUrl }) {
    const root = document.querySelector('[data-blocked-ips-panel]');
    const body = document.querySelector('[data-blocked-ips-body]');
    const refreshButton = document.querySelector('[data-blocked-ips-refresh]');

    if (!root || !body) {
        return { refresh: () => {} };
    }

    refreshButton?.addEventListener('click', () => refresh({ manual: true }));

    async function refresh({ manual = false } = {}) {
        const serverUrl = typeof getServerUrl === 'function' ? getServerUrl() : '';
        if (!serverUrl) {
            renderPlaceholder('empty', 'Conecta primero con la API para consultar las IPs bloqueadas.');
            return;
        }

        const originalHtml = refreshButton?.innerHTML;
        if (refreshButton) {
            refreshButton.disabled = true;
            refreshButton.innerHTML = manual
                ? '<i class="fas fa-spinner fa-spin"></i> Consultando'
                : '<i class="fas fa-spinner fa-spin"></i> Actualizando';
        }
        renderPlaceholder('loading', 'Consultando IPs bloqueadas...');

        try {
            const url = typeof buildApiUrl === 'function'
                ? buildApiUrl('/api/traffic/blocked-ips')
                : `${serverUrl}/api/traffic/blocked-ips`;
            const payload = await fetchJson(url);
            renderBlockedIps(payload.data || payload);
        } catch (error) {
            renderPlaceholder('error', error.message || 'No se pudieron consultar las IPs bloqueadas.');
        } finally {
            if (refreshButton) {
                refreshButton.disabled = false;
                refreshButton.innerHTML = originalHtml;
            }
        }
    }

    async function fetchJson(url) {
        const response = await fetch(url, {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin'
        });
        const payload = await response.json();

        if (!response.ok || payload.ok === false) {
            throw new Error(payload.error || `HTTP ${response.status}`);
        }

        return payload;
    }

    function renderBlockedIps(data) {
        const ips = extractBlockedIps(data);
        if (!ips.length) {
            renderPlaceholder('empty', 'No hay IPs bloqueadas.');
            return;
        }

        body.innerHTML = `
            <div class="blocked-ip-list">
                ${ips.map(ip => `<span class="blocked-ip-pill"><i class="fas fa-ban"></i>${escapeHtml(ip)}</span>`).join('')}
            </div>
        `;
    }

    function extractBlockedIps(data) {
        if (Array.isArray(data)) {
            return data.map(String);
        }

        if (!data || typeof data !== 'object') {
            return [];
        }

        const candidates = [
            data.blocked_ips,
            data.blocked_ipv4,
            data.ips,
            data.items,
            data.data
        ];

        for (const value of candidates) {
            if (Array.isArray(value)) {
                return value.map(String);
            }
        }

        return Object.values(data)
            .filter(value => typeof value === 'string')
            .map(String);
    }

    function renderPlaceholder(type, text) {
        body.innerHTML = `
            <span class="network-status-placeholder is-${type}">
                <i class="fas ${type === 'loading' ? 'fa-spinner fa-spin' : 'fa-circle-info'}"></i>
                ${escapeHtml(text)}
            </span>
        `;
    }

    return { refresh };
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
