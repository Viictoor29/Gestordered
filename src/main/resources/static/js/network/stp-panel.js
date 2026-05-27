export function initStpPanel({ serverInput, refreshIntervalMs, getServerUrl }) {
    const refreshButton = document.querySelector('[data-stp-refresh]');
    const body = document.querySelector('[data-stp-body]');

    let refreshTimer = null;
    let isLoading = false;

    if (refreshButton && body) {
        refreshButton.addEventListener('click', () => refresh({ manual: true }));
    }

    function start() {
        if (!refreshButton || !body) {
            return;
        }

        stop();
        refreshTimer = window.setInterval(() => {
            refresh();
        }, refreshIntervalMs);
    }

    function stop() {
        if (refreshTimer) {
            window.clearInterval(refreshTimer);
            refreshTimer = null;
        }
    }

    async function refresh({ manual = false } = {}) {
        if (!refreshButton || !body || isLoading) {
            return;
        }

        if (!getActiveServerUrl()) {
            return;
        }

        isLoading = true;
        const originalHtml = refreshButton.innerHTML;
        refreshButton.disabled = true;
        refreshButton.innerHTML = manual
            ? '<i class="fas fa-spinner fa-spin"></i> Consultando'
            : '<i class="fas fa-spinner fa-spin"></i> Actualizando';
        body.innerHTML = renderPlaceholder('loading', 'Consultando estado STP...');

        try {
            const payload = await fetchJson(buildApiUrl('/api/stp/status'));
            renderStpStatus(payload.data || payload);
            start();
        } catch (error) {
            body.innerHTML = renderPlaceholder(
                'error',
                'No se pudo consultar el estado STP de Ryu.'
            );
        } finally {
            refreshButton.disabled = false;
            refreshButton.innerHTML = originalHtml;
            isLoading = false;
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

    function buildApiUrl(path) {
        return `${getActiveServerUrl()}${path}`;
    }

    function getActiveServerUrl() {
        return typeof getServerUrl === 'function' ? getServerUrl() : normalizeServer(serverInput.value);
    }

    function renderStpStatus(data) {
        const ports = flattenPorts(data.ports || {});
        const blockedPorts = Array.isArray(data.blocked_ports) ? data.blocked_ports : [];
        const forwardingPorts = ports.filter(port => Number(port.state) === 4);
        const convergingPorts = ports.filter(port => [2, 3].includes(Number(port.state)));
        const disabledPorts = ports.filter(port => Number(port.state) === 0);
        const switches = groupPortsBySwitch(ports);

        body.innerHTML = `
            <div class="health-summary-grid stp-summary-grid">
                ${renderKpi('Convergencia', data.ready ? 'Convergido' : 'En proceso', 'fa-shield-halved', data.ready ? 'is-success' : 'is-warning')}
                ${renderKpi('Puertos bloqueados', blockedPorts.length, 'fa-ban', blockedPorts.length ? 'is-warning' : 'is-success')}
                ${renderKpi('Reenviando', forwardingPorts.length, 'fa-route', 'is-success')}
                ${renderKpi('Convergiendo', convergingPorts.length, 'fa-arrows-spin', convergingPorts.length ? 'is-warning' : '')}
            </div>

            <dl class="network-status-details stp-details">
                ${detailRow('Ultimo cambio', formatTimestamp(data.last_change))}
                ${detailRow('Convergido desde', formatTimestamp(data.ready_since))}
                ${detailRow('Retardo de convergencia', formatSeconds(data.ready_delay_seconds))}
                ${detailRow('Pingall automatico', formatBoolean(data.auto_pingall))}
                ${detailRow('Ultimo pingall', formatTimestamp(data.last_pingall))}
                ${detailRow('Resultado pingall', formatPingall(data.last_pingall_result))}
            </dl>

            <div class="stp-switch-list">
                ${switches.length ? switches.map(renderSwitch).join('') : renderInlineNotice('empty', 'Ryu no ha enviado estados STP de puertos todavia.')}
            </div>

            ${disabledPorts.length ? renderInlineNotice('info', `${disabledPorts.length} puerto(s) aparecen con STP desactivado o sin participar.`) : ''}
        `;
    }

    return { refresh, start, stop };
}

function normalizeServer(value) {
    const rawValue = value.trim().replace(/\/+$/, '');
    if (!rawValue) {
        return '';
    }

    const withProtocol = /^https?:\/\//i.test(rawValue) ? rawValue : `http://${rawValue}`;
    const url = new URL(withProtocol);
    if (!url.port) {
        url.port = '8080';
    }

    return url.origin;
}

function flattenPorts(portsBySwitch) {
    return Object.entries(portsBySwitch).flatMap(([dpid, ports]) => {
        if (!ports || typeof ports !== 'object') {
            return [];
        }

        return Object.entries(ports).map(([portNo, state]) => ({
            dpid,
            portNo,
            state
        }));
    });
}

function groupPortsBySwitch(ports) {
    const groups = new Map();

    ports.forEach(port => {
        if (!groups.has(port.dpid)) {
            groups.set(port.dpid, []);
        }

        groups.get(port.dpid).push(port);
    });

    return Array.from(groups.entries()).map(([dpid, switchPorts]) => ({
        dpid,
        ports: switchPorts.sort((left, right) => Number(left.portNo) - Number(right.portNo))
    }));
}

function renderSwitch(sw) {
    const blocked = sw.ports.filter(port => Number(port.state) === 1).length;
    const forwarding = sw.ports.filter(port => Number(port.state) === 4).length;

    return `
        <article class="stp-switch-card">
            <div class="health-switch-header">
                <div>
                    <p>Switch STP</p>
                    <h4>${escapeHtml(sw.dpid)}</h4>
                </div>
                ${statusBadge(blocked ? `${blocked} bloqueado(s)` : 'Sin bloqueos', blocked ? 'is-warning' : 'is-success')}
            </div>
            <div class="stp-port-strip">
                ${sw.ports.map(renderPort).join('')}
            </div>
            <dl class="network-status-details stp-switch-details">
                ${detailRow('Puertos STP', sw.ports.length)}
                ${detailRow('Reenviando trafico', forwarding)}
                ${detailRow('Bloqueados', blocked)}
            </dl>
        </article>
    `;
}

function renderPort(port) {
    const state = Number(port.state);
    return `
        <span class="stp-port-pill ${stateClass(state)}">
            <strong>Puerto ${escapeHtml(port.portNo)}</strong>
            <small>${escapeHtml(formatStpState(state))}</small>
        </span>
    `;
}

function renderKpi(label, value, icon, extraClass = '') {
    return `
        <span class="network-status-kpi ${extraClass}">
            <i class="fas ${icon}"></i>
            <small>${escapeHtml(label)}</small>
            <strong>${escapeHtml(value ?? 'N/D')}</strong>
        </span>
    `;
}

function renderPlaceholder(type, text) {
    return `
        <span class="network-status-placeholder is-${type}">
            <i class="fas ${type === 'loading' ? 'fa-spinner fa-spin' : 'fa-triangle-exclamation'}"></i>
            ${escapeHtml(text)}
        </span>
    `;
}

function renderInlineNotice(type, text) {
    return `<p class="health-inline-notice is-${type}">${escapeHtml(text)}</p>`;
}

function statusBadge(text, type) {
    return `<span class="detail-badge ${type}">${escapeHtml(text)}</span>`;
}

function detailRow(label, value) {
    const visibleValue = value === undefined || value === null || value === '' ? 'No disponible' : value;
    return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(visibleValue)}</dd></div>`;
}

function formatStpState(state) {
    const labels = {
        0: 'Desactivado',
        1: 'Bloqueado',
        2: 'Escuchando',
        3: 'Aprendiendo',
        4: 'Reenviando'
    };

    return labels[state] || `Estado ${state}`;
}

function stateClass(state) {
    if (state === 1) {
        return 'is-warning';
    }

    if (state === 4) {
        return 'is-success';
    }

    if (state === 0) {
        return 'is-muted';
    }

    return 'is-pending';
}

function formatTimestamp(seconds) {
    const timestamp = Number(seconds);
    if (!timestamp || Number.isNaN(timestamp)) {
        return 'Pendiente';
    }

    return new Date(timestamp * 1000).toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function formatSeconds(seconds) {
    if (seconds === undefined || seconds === null || Number.isNaN(Number(seconds))) {
        return 'No disponible';
    }

    return `${seconds} s`;
}

function formatBoolean(value) {
    if (value === undefined || value === null) {
        return 'No disponible';
    }

    return value ? 'Activado' : 'Desactivado';
}

function formatPingall(result) {
    if (!result) {
        return 'Pendiente';
    }

    const data = result.data || result;
    if (data.success !== undefined) {
        return data.success ? 'Correcto' : 'Con fallos';
    }

    if (data.packet_loss_percent !== undefined) {
        return `${data.packet_loss_percent}% perdidas`;
    }

    if (data.error) {
        return data.error;
    }

    return 'Registrado';
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
