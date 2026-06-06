export function initHealthPanel({ serverInput, refreshIntervalMs, getServerUrl, buildApiUrl }) {
    const refreshButton = document.querySelector('[data-health-refresh]');
    const body = document.querySelector('[data-health-body]');
    const flowModal = createFlowModal();

    let refreshTimer = null;
    let isLoading = false;

    if (refreshButton && body) {
        refreshButton.addEventListener('click', () => refresh({ manual: true }));
        body.addEventListener('click', event => {
            const portTab = event.target.closest('[data-health-port-tab]');
            if (portTab) {
                selectPortTab(portTab);
                return;
            }

            const flowButton = event.target.closest('[data-health-flows]');
            if (flowButton) {
                openSwitchFlows(flowButton.dataset.healthFlows, flowButton.dataset.healthFlowCount);
            }
        });
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
        body.innerHTML = renderPlaceholder('loading', 'Consultando metricas de salud...');

        try {
            const [summaryPayload, healthPayload] = await Promise.all([
                fetchJson(buildRyuUrl('/api/health/summary')),
                fetchJson(buildRyuUrl('/api/health'))
            ]);
            renderHealth(summaryPayload.data || summaryPayload, healthPayload.data || healthPayload);
            start();
        } catch (error) {
            body.innerHTML = renderPlaceholder(
                'error',
                'No se pudieron consultar las metricas de salud de Ryu.'
            );
        } finally {
            refreshButton.disabled = false;
            refreshButton.innerHTML = originalHtml;
            isLoading = false;
        }
    }

    function renderHealth(summary, health) {
        const switches = Array.isArray(health.switches) ? health.switches : [];
        const updatedAt = summary.timestamp ? formatTimestamp(summary.timestamp) : 'Pendiente';

        body.innerHTML = `
            <div class="health-summary-grid">
                ${renderHealthKpi('Estado global', formatOverallStatus(summary.overall_status), 'fa-heart-pulse', healthStatusClass(summary.overall_status))}
                ${renderHealthKpi('Switches', summary.switches?.total ?? health.switch_count ?? switches.length, 'fa-network-wired')}
                ${renderHealthKpi('Puertos correctos', summary.ports?.healthy ?? countPortsByStatus(switches, 'healthy'), 'fa-ethernet', 'is-success')}
                ${renderHealthKpi('Trafico actual', formatTraffic(summary.traffic), 'fa-gauge-high')}
                ${renderHealthKpi('Puertos con aviso', summary.ports?.warning ?? countPortsByStatus(switches, 'warning'), 'fa-triangle-exclamation', 'is-warning')}
                ${renderHealthKpi('Puertos degradados', summary.ports?.degraded ?? countPortsByStatus(switches, 'degraded'), 'fa-bug', 'is-danger')}
                ${renderHealthKpi('Puertos caidos', summary.ports?.down ?? countPortsByEffectiveState(switches, 'down'), 'fa-circle-xmark', 'is-danger')}
                ${renderHealthKpi('Bloqueos STP', summary.ports?.stp_blocked ?? countStpBlockedPorts(switches), 'fa-shield-halved', 'is-warning')}
            </div>

            <dl class="network-status-details health-details">
                ${detailRow('Ultima lectura', updatedAt)}
                ${detailRow('Uptime controlador', formatDuration(summary.controller_uptime_seconds ?? health.controller_uptime_seconds))}
                ${detailRow('Flujos totales', summary.flows?.total)}
                ${detailRow('Enlaces en inventario', summary.links?.total_inventory)}
                ${detailRow('Enlaces habilitados', summary.links?.enabled)}
                ${detailRow('Enlaces descubiertos', summary.links?.discovered)}
            </dl>

            <div class="health-switch-list">
                ${switches.length ? switches.map(renderSwitchHealth).join('') : renderInlineNotice('empty', 'Ryu no ha enviado switches con metricas todavia.')}
            </div>
        `;
    }

    function renderSwitchHealth(sw) {
        const totals = sw.totals || {};
        const ports = Array.isArray(sw.ports) ? sw.ports : [];
        const traffic = sw.traffic || {};

        return `
            <article class="health-switch-card">
                <div class="health-switch-header">
                    <div>
                        <p>Switch</p>
                        <h4>${escapeHtml(sw.dpid || 'DPID desconocido')}</h4>
                    </div>
                    ${statusBadge(formatHealthStatus(sw.status), healthStatusClass(sw.status))}
                </div>

                <dl class="health-switch-stats">
                    ${detailRow('Flujos', sw.flow_count ?? 0)}
                    ${detailRow('Trafico actual', formatTraffic(traffic))}
                    ${detailRow('RX errores', totals.rx_errors ?? 0)}
                    ${detailRow('TX errores', totals.tx_errors ?? 0)}
                    ${detailRow('RX drops', totals.rx_dropped ?? 0)}
                    ${detailRow('TX drops', totals.tx_dropped ?? 0)}
                </dl>

                ${renderPortTabs(sw.dpid || 'switch', ports)}

                <div class="health-switch-actions">
                    <button type="button" class="contextual-action-button" data-health-flows="${escapeHtml(sw.dpid || '')}" data-health-flow-count="${escapeHtml(sw.flow_count ?? 0)}">
                        <i class="fas fa-list"></i>
                        Flujos
                    </button>
                </div>
            </article>
        `;
    }

    function renderPortTabs(dpid, ports) {
        if (!ports.length) {
            return `<div class="health-port-list">${renderInlineNotice('empty', 'Sin puertos con estadisticas.')}</div>`;
        }

        const groupId = sanitizeId(dpid);

        return `
            <div class="health-port-tabs" data-health-port-group="${escapeHtml(groupId)}">
                <div class="health-port-tablist" role="tablist" aria-label="Puertos del switch ${escapeHtml(dpid)}">
                    ${ports.map((port, index) => {
                        const portId = buildPortPanelId(groupId, port.port_no, index);
                        return `
                            <button type="button"
                                    class="health-port-tab ${index === 0 ? 'is-active' : ''}"
                                    role="tab"
                                    aria-selected="${index === 0 ? 'true' : 'false'}"
                                    aria-controls="${escapeHtml(portId)}"
                                    data-health-port-tab="${escapeHtml(portId)}">
                                Puerto ${escapeHtml(port.port_no ?? index + 1)}
                            </button>
                        `;
                    }).join('')}
                </div>
                <div class="health-port-panels">
                    ${ports.map((port, index) => renderPortHealth(port, buildPortPanelId(groupId, port.port_no, index), index === 0)).join('')}
                </div>
            </div>
        `;
    }

    function renderPortHealth(port, panelId, isActive) {
        const health = port.health || port;
        const stats = health.stats || {};
        const speed = health.speed || {};

        return `
            <article class="health-port-card ${isActive ? 'is-active' : ''}"
                     id="${escapeHtml(panelId)}"
                     role="tabpanel"
                     data-health-port-panel="${escapeHtml(panelId)}"
                     ${isActive ? '' : 'hidden'}>
                <div class="health-port-main">
                    <strong>Puerto ${escapeHtml(port.port_no ?? 'N/D')}</strong>
                    ${statusBadge(formatHealthStatus(health.status), healthStatusClass(health.status))}
                </div>
                <div class="health-port-badges">
                    ${statusBadge(formatEffectiveState(health.effective_state), effectiveStateClass(health.effective_state))}
                    ${statusBadge(`Admin: ${formatAdminState(health.admin_state)}`, health.admin_state === 'down' ? 'is-danger' : 'is-success')}
                    ${health.stp_blocked ? statusBadge('STP bloqueado', 'is-warning') : ''}
                </div>
                <dl class="health-port-data">
                    ${detailRow('Trafico actual', formatTraffic(speed))}
                    ${detailRow('RX paquetes', stats.rx_packets ?? 0)}
                    ${detailRow('TX paquetes', stats.tx_packets ?? 0)}
                    ${detailRow('RX errores', stats.rx_errors ?? 0)}
                    ${detailRow('TX errores', stats.tx_errors ?? 0)}
                    ${detailRow('RX drops', stats.rx_dropped ?? 0)}
                    ${detailRow('TX drops', stats.tx_dropped ?? 0)}
                    ${detailRow('Estado STP', formatStpState(health.stp_state, health.stp_blocked))}
                </dl>
            </article>
        `;
    }

    function selectPortTab(tab) {
        const group = tab.closest('[data-health-port-group]');
        if (!group) {
            return;
        }

        const target = tab.dataset.healthPortTab;
        group.querySelectorAll('[data-health-port-tab]').forEach(candidate => {
            const isActive = candidate.dataset.healthPortTab === target;
            candidate.classList.toggle('is-active', isActive);
            candidate.setAttribute('aria-selected', String(isActive));
        });

        group.querySelectorAll('[data-health-port-panel]').forEach(panel => {
            const isActive = panel.dataset.healthPortPanel === target;
            panel.classList.toggle('is-active', isActive);
            panel.hidden = !isActive;
        });
    }

    async function openSwitchFlows(dpid, expectedCount = 0) {
        if (!dpid || !flowModal) {
            return;
        }

        if (!getActiveServerUrl()) {
            setFlowModalMessage('Conecta primero con la API.');
            showFlowModal(dpid, expectedCount);
            return;
        }

        setFlowModalMessage('Cargando flujos...');
        showFlowModal(dpid, expectedCount);

        try {
            const payload = await fetchJson(buildRyuUrl(`/api/switch/${encodeURIComponent(dpid)}/flows`));
            renderFlowModalContent(payload.data || payload);
        } catch (error) {
            setFlowModalMessage(error.message || 'No se pudieron cargar los flujos.', 'error');
        }
    }

    function showFlowModal(dpid, expectedCount) {
        flowModal.title.textContent = `Flujos del switch ${dpid}`;
        flowModal.subtitle.textContent = `${Number(expectedCount || 0)} flujo(s) registrados`;
        flowModal.root.classList.add('is-open');
        flowModal.root.setAttribute('aria-hidden', 'false');
    }

    function setFlowModalMessage(text, type = 'info') {
        flowModal.content.innerHTML = `<p class="health-flow-empty is-${escapeHtml(type)}">${escapeHtml(text)}</p>`;
    }

    function renderFlowModalContent(data) {
        const flows = extractFlows(data);
        flowModal.subtitle.textContent = `${flows.length} flujo(s) registrados`;

        if (!flows.length) {
            setFlowModalMessage('No hay reglas de flujo en este switch.');
            return;
        }

        flowModal.content.innerHTML = `
            <div class="health-flow-minimal-list">
                ${flows.map(renderMinimalFlow).join('')}
            </div>
        `;
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

    function buildRyuUrl(path) {
        if (typeof buildApiUrl === 'function') {
            return buildApiUrl(path);
        }

        return `${getActiveServerUrl()}${path}`;
    }

    function getActiveServerUrl() {
        return typeof getServerUrl === 'function' ? getServerUrl() : normalizeServer(serverInput.value);
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

function renderHealthKpi(label, value, icon, extraClass = '') {
    return `
        <span class="network-status-kpi ${extraClass}">
            <i class="fas ${icon}"></i>
            <small>${escapeHtml(label)}</small>
            <strong>${escapeHtml(value ?? 'N/D')}</strong>
        </span>
    `;
}

function renderMinimalFlow(flow, index) {
    return `
        <article class="health-flow-minimal-row">
            <div>
                <strong>Flujo ${index + 1}</strong>
                <span>Prioridad: ${escapeHtml(flow.priority ?? 'N/D')}</span>
            </div>
            <dl>
                ${detailRow('Coincidencias', formatCompactValue(flow.match) || 'Cualquiera')}
                ${detailRow('Acciones', formatCompactValue(flow.actions || flow.instructions || flow.action) || 'Sin acciones')}
                ${detailRow('Paquetes', flow.packet_count ?? flow.packets ?? 0)}
                ${detailRow('Bytes', flow.byte_count ?? flow.bytes ?? 0)}
            </dl>
        </article>
    `;
}

function extractFlows(value) {
    if (Array.isArray(value)) {
        return value;
    }

    if (!value || typeof value !== 'object') {
        return [];
    }

    if (Array.isArray(value.flows)) {
        return value.flows;
    }

    if (Array.isArray(value.flow_stats)) {
        return value.flow_stats;
    }

    if (value.data) {
        return extractFlows(value.data);
    }

    return [];
}

function formatCompactValue(value) {
    if (value === undefined || value === null || value === '') {
        return '';
    }

    if (Array.isArray(value)) {
        return value.map(formatCompactValue).filter(Boolean).join(' | ');
    }

    if (typeof value === 'object') {
        return Object.entries(value)
            .map(([key, item]) => `${key}: ${formatCompactValue(item)}`)
            .join(', ');
    }

    return String(value);
}

function createFlowModal() {
    const root = document.createElement('div');
    root.className = 'account-request-modal health-flow-modal';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
        <section class="account-request-dialog health-flow-dialog" role="dialog" aria-modal="true" aria-labelledby="health-flow-title">
            <div class="panel-header">
                <div>
                    <p>Reglas de flujo</p>
                    <h2 id="health-flow-title">Flujos del switch</h2>
                    <span class="health-flow-subtitle" data-health-flow-subtitle></span>
                </div>
                <button type="button" class="modal-close-button" data-health-flow-close aria-label="Cerrar flujos">
                    <i class="fas fa-xmark"></i>
                </button>
            </div>
            <div class="health-flow-modal-content" data-health-flow-content></div>
        </section>
    `;

    document.body.appendChild(root);

    const close = () => {
        root.classList.remove('is-open');
        root.setAttribute('aria-hidden', 'true');
    };

    root.addEventListener('click', event => {
        if (event.target === root || event.target.closest('[data-health-flow-close]')) {
            close();
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && root.classList.contains('is-open')) {
            close();
        }
    });

    return {
        root,
        title: root.querySelector('#health-flow-title'),
        subtitle: root.querySelector('[data-health-flow-subtitle]'),
        content: root.querySelector('[data-health-flow-content]')
    };
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

function countPortsByStatus(switches, status) {
    return switches.flatMap(sw => sw.ports || [])
        .filter(port => (port.health || port).status === status)
        .length;
}

function countPortsByEffectiveState(switches, state) {
    return switches.flatMap(sw => sw.ports || [])
        .filter(port => (port.health || port).effective_state === state)
        .length;
}

function countStpBlockedPorts(switches) {
    return switches.flatMap(sw => sw.ports || [])
        .filter(port => (port.health || port).stp_blocked)
        .length;
}

function formatOverallStatus(status) {
    const labels = {
        healthy: 'Correcto',
        warning: 'Con avisos',
        degraded: 'Degradado'
    };

    return labels[status] || status || 'No disponible';
}

function formatHealthStatus(status) {
    const labels = {
        healthy: 'Correcto',
        warning: 'Aviso',
        degraded: 'Degradado'
    };

    return labels[status] || status || 'Sin datos';
}

function healthStatusClass(status) {
    if (status === 'degraded') {
        return 'is-danger';
    }

    if (status === 'warning') {
        return 'is-warning';
    }

    return 'is-success';
}

function formatEffectiveState(state) {
    const labels = {
        up: 'Activo',
        down: 'Caido',
        blocked_by_stp: 'Bloqueado por STP'
    };

    return labels[state] || state || 'Sin datos';
}

function effectiveStateClass(state) {
    if (state === 'down') {
        return 'is-danger';
    }

    if (state === 'blocked_by_stp') {
        return 'is-warning';
    }

    return 'is-success';
}

function formatAdminState(state) {
    const labels = {
        up: 'Activo',
        down: 'Caido'
    };

    return labels[state] || state || 'Sin datos';
}

function formatStpState(value, blocked) {
    if (blocked) {
        return 'Bloqueado';
    }

    const labels = {
        0: 'Desactivado',
        1: 'Bloqueado',
        2: 'Escuchando',
        3: 'Aprendiendo',
        4: 'Reenviando'
    };

    if (value === undefined || value === null) {
        return 'Sin datos';
    }

    return labels[Number(value)] || `Estado ${value}`;
}

function formatTraffic(traffic = {}) {
    if (traffic.bps !== undefined) {
        return formatBitrate(traffic.bps);
    }

    if (traffic.kbps !== undefined) {
        return formatBitrate(Number(traffic.kbps) * 1000);
    }

    if (traffic.mbps !== undefined) {
        return formatBitrate(Number(traffic.mbps) * 1000000);
    }

    return '0 bps';
}

function formatBitrate(bps) {
    const value = Number(bps || 0);
    if (!Number.isFinite(value) || value <= 0) {
        return '0 bps';
    }

    const units = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps'];
    let current = value;
    let unitIndex = 0;
    while (current >= 1000 && unitIndex < units.length - 1) {
        current /= 1000;
        unitIndex += 1;
    }

    const decimals = current >= 100 || unitIndex === 0 ? 0 : current >= 10 ? 1 : 2;
    return `${current.toFixed(decimals)} ${units[unitIndex]}`;
}

function formatDuration(seconds) {
    if (seconds === undefined || seconds === null || Number.isNaN(Number(seconds))) {
        return 'No disponible';
    }

    const totalSeconds = Number(seconds);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (days > 0) {
        return `${days}d ${hours}h`;
    }

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }

    return `${minutes}m`;
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


function buildPortPanelId(groupId, portNo, index) {
    return `health-port-${groupId}-${sanitizeId(portNo ?? index)}`;
}

function sanitizeId(value) {
    return String(value || 'item').replace(/[^A-Za-z0-9_-]+/g, '-');
}


function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
