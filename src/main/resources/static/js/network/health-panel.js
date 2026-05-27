export function initHealthPanel({ serverInput, refreshIntervalMs, getServerUrl }) {
    const refreshButton = document.querySelector('[data-health-refresh]');
    const body = document.querySelector('[data-health-body]');

    let refreshTimer = null;
    let isLoading = false;
    let cachedSwitchFlows = new Map();

    if (refreshButton && body) {
        refreshButton.addEventListener('click', () => refresh({ manual: true }));
        body.addEventListener('click', event => {
            const portTab = event.target.closest('[data-health-port-tab]');
            if (portTab) {
                selectPortTab(portTab);
                return;
            }

            const button = event.target.closest('[data-health-flows]');
            if (!button) {
                return;
            }

            toggleSwitchFlows(button.dataset.healthFlows, button);
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
                fetchJson(buildApiUrl('/api/health/summary')),
                fetchJson(buildApiUrl('/api/health'))
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

    async function toggleSwitchFlows(dpid, button) {
        if (!dpid || !button) {
            return;
        }

        if (!getActiveServerUrl()) {
            return;
        }

        const flowsTarget = Array.from(body.querySelectorAll('[data-health-flows-target]'))
            .find(target => target.dataset.healthFlowsTarget === dpid);
        if (!flowsTarget) {
            return;
        }

        if (flowsTarget.dataset.loaded === 'true' && !flowsTarget.hidden) {
            flowsTarget.hidden = true;
            button.classList.remove('is-open');
            button.innerHTML = '<i class="fas fa-list"></i> Ver flujos';
            return;
        }

        if (flowsTarget.dataset.loaded === 'true' && flowsTarget.hidden) {
            flowsTarget.hidden = false;
            button.classList.add('is-open');
            button.innerHTML = '<i class="fas fa-chevron-up"></i> Ocultar flujos';
            return;
        }

        const originalHtml = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando';
        flowsTarget.hidden = false;
        flowsTarget.innerHTML = renderInlineNotice('loading', 'Leyendo reglas de flujo...');

        try {
            const payload = await fetchJson(buildApiUrl(`/api/switch/${encodeURIComponent(dpid)}/flows`));
            const data = payload.data || payload;
            const endpointFlows = extractFlows(data);
            const cachedFlows = cachedSwitchFlows.get(dpid) || [];
            const flows = endpointFlows.length ? endpointFlows : cachedFlows;
            const expectedCount = Number(button.dataset.healthFlowCount || flows.length || 0);

            flowsTarget.innerHTML = renderFlows(flows, expectedCount);
            flowsTarget.dataset.loaded = 'true';
            button.classList.add('is-open');
            button.innerHTML = '<i class="fas fa-chevron-up"></i> Ocultar flujos';
        } catch (error) {
            flowsTarget.innerHTML = renderInlineNotice('error', 'No se pudieron cargar las reglas de flujo.');
            button.innerHTML = originalHtml;
        } finally {
            button.disabled = false;
        }
    }

    function renderHealth(summary, health) {
        const switches = Array.isArray(health.switches) ? health.switches : [];
        const updatedAt = summary.timestamp ? formatTimestamp(summary.timestamp) : 'Pendiente';
        cachedSwitchFlows = new Map(
            switches.map(sw => [String(sw.dpid || ''), extractFlows(sw)])
        );

        body.innerHTML = `
            <div class="health-summary-grid">
                ${renderHealthKpi('Estado global', formatOverallStatus(summary.overall_status), 'fa-heart-pulse', healthStatusClass(summary.overall_status))}
                ${renderHealthKpi('Switches', summary.switches?.total ?? health.switch_count ?? switches.length, 'fa-network-wired')}
                ${renderHealthKpi('Puertos correctos', summary.ports?.healthy ?? countPortsByStatus(switches, 'healthy'), 'fa-ethernet', 'is-success')}
                ${renderHealthKpi('Trafico total', formatTraffic(summary.traffic), 'fa-gauge-high')}
                ${renderHealthKpi('Puertos con aviso', summary.ports?.warning ?? countPortsByStatus(switches, 'warning'), 'fa-triangle-exclamation', 'is-warning')}
                ${renderHealthKpi('Puertos degradados', summary.ports?.degraded ?? countPortsByStatus(switches, 'degraded'), 'fa-bug', 'is-danger')}
                ${renderHealthKpi('Puertos caidos', summary.ports?.down ?? countPortsByEffectiveState(switches, 'down'), 'fa-circle-xmark', 'is-danger')}
                ${renderHealthKpi('Bloqueos STP', summary.ports?.stp_blocked ?? countStpBlockedPorts(switches), 'fa-shield-halved', 'is-warning')}
            </div>

            <dl class="network-status-details health-details">
                ${detailRow('Ultima lectura', updatedAt)}
                ${detailRow('Uptime controlador', formatDuration(summary.controller_uptime_seconds ?? health.controller_uptime_seconds))}
                ${detailRow('Flujos totales', summary.flows?.total ?? sumSwitchFlows(switches))}
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
                    ${detailRow('Trafico', formatTraffic(traffic))}
                    ${detailRow('RX errores', totals.rx_errors ?? 0)}
                    ${detailRow('TX errores', totals.tx_errors ?? 0)}
                    ${detailRow('RX drops', totals.rx_dropped ?? 0)}
                    ${detailRow('TX drops', totals.tx_dropped ?? 0)}
                </dl>

                ${renderPortTabs(sw.dpid || 'switch', ports)}

                <div class="health-switch-actions">
                    <button type="button" class="topology-refresh-button" data-health-flows="${escapeHtml(sw.dpid || '')}" data-health-flow-count="${escapeHtml(sw.flow_count ?? 0)}">
                        <i class="fas fa-list"></i>
                        Ver flujos
                    </button>
                </div>

                <div class="health-flow-list" data-health-flows-target="${escapeHtml(sw.dpid || '')}"></div>
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
                    ${detailRow('Trafico', formatTraffic(speed))}
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

    function renderFlows(flows, expectedCount = 0) {
        if (!flows.length) {
            if (expectedCount > 0) {
                return renderInlineNotice(
                    'info',
                    `Ryu indica ${expectedCount} regla(s) en este switch, pero no ha enviado el detalle de las reglas en esta lectura.`
                );
            }

            return renderInlineNotice('empty', 'Este switch no tiene reglas de flujo registradas.');
        }

        return `
            <div class="flow-table">
                ${flows.map(flow => `
                    <article class="flow-row">
                        <div class="flow-row-main">
                            <div>
                                <strong>${escapeHtml(flowTitle(flow))}</strong>
                                <p>${escapeHtml(flowSubtitle(flow))}</p>
                            </div>
                            <span>${escapeHtml(formatFlowDuration(flow))}</span>
                        </div>
                        <div class="flow-readable-grid">
                            <section>
                                <h5>Coincidencias</h5>
                                <div class="flow-chip-list">${renderFlowChips(describeMatch(flow.match))}</div>
                            </section>
                            <section>
                                <h5>Acciones</h5>
                                <div class="flow-chip-list">${renderFlowChips(describeActions(flow))}</div>
                            </section>
                        </div>
                        <dl class="health-port-data flow-counters">
                            ${detailRow('Paquetes', flow.packet_count ?? flow.packets ?? 0)}
                            ${detailRow('Bytes', flow.byte_count ?? flow.bytes ?? 0)}
                            ${detailRow('Tabla', flow.table_id ?? 0)}
                            ${detailRow('Prioridad', flow.priority ?? 'N/D')}
                        </dl>
                    </article>
                `).join('')}
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

    function buildApiUrl(path) {
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

function sumSwitchFlows(switches) {
    return switches.reduce((total, sw) => total + Number(sw.flow_count || 0), 0);
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
    if (traffic.mbps !== undefined) {
        return `${traffic.mbps} Mbps`;
    }

    if (traffic.kbps !== undefined) {
        return `${traffic.kbps} Kbps`;
    }

    if (traffic.bps !== undefined) {
        return `${traffic.bps} bps`;
    }

    return '0 bps';
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

function formatFlowDuration(flow) {
    if (flow.duration_sec !== undefined) {
        return formatDuration(flow.duration_sec);
    }

    if (flow.duration_nsec !== undefined) {
        return `${flow.duration_nsec} ns`;
    }

    return 'Duracion no disponible';
}

function flowTitle(flow) {
    const priority = flow.priority ?? 'N/D';
    const match = normalizeFlowMatch(flow.match);

    if (match.in_port !== undefined) {
        return `Regla de puerto ${match.in_port}`;
    }

    return `Regla de prioridad ${priority}`;
}

function flowSubtitle(flow) {
    const actions = describeActions(flow);
    return actions.length ? actions.join(' · ') : 'Sin accion registrada';
}

function renderFlowChips(items) {
    if (!items.length) {
        return '<span class="flow-chip is-muted">Cualquier trafico</span>';
    }

    return items.map(item => `<span class="flow-chip">${escapeHtml(item)}</span>`).join('');
}

function describeMatch(match) {
    const normalized = normalizeFlowMatch(match);
    const labels = {
        in_port: 'Puerto entrada',
        eth_src: 'MAC origen',
        eth_dst: 'MAC destino',
        ipv4_src: 'IP origen',
        ipv4_dst: 'IP destino',
        ip_proto: 'Protocolo IP',
        tcp_src: 'TCP origen',
        tcp_dst: 'TCP destino',
        udp_src: 'UDP origen',
        udp_dst: 'UDP destino',
        arp_spa: 'ARP origen',
        arp_tpa: 'ARP destino',
        eth_type: 'Tipo Ethernet'
    };

    return Object.entries(normalized).map(([key, value]) => `${labels[key] || key}: ${value}`);
}

function normalizeFlowMatch(match) {
    if (!match) {
        return {};
    }

    if (typeof match === 'object' && !Array.isArray(match)) {
        return match;
    }

    if (typeof match === 'string') {
        try {
            return JSON.parse(match);
        } catch (error) {
            return parseKeyValues(match);
        }
    }

    return {};
}

function describeActions(flow) {
    const raw = flow.actions || flow.instructions || flow.action;
    const text = formatFlowObject(raw);
    const outputMatches = [...text.matchAll(/(?:OUTPUT|port=)(?:[:=])?(\d+|CONTROLLER|FLOOD|LOCAL)/gi)]
        .map(match => `Enviar a ${formatOutputPort(match[1])}`);

    if (outputMatches.length) {
        return [...new Set(outputMatches)];
    }

    if (!raw) {
        return [];
    }

    return [text];
}

function formatOutputPort(port) {
    const labels = {
        CONTROLLER: 'controlador',
        FLOOD: 'todos los puertos',
        LOCAL: 'puerto local'
    };

    return labels[String(port).toUpperCase()] || `puerto ${port}`;
}

function parseKeyValues(value) {
    const result = {};
    const matches = String(value).matchAll(/["']?([A-Za-z0-9_:-]+)["']?\s*[:=]\s*["']?([^"',}\]\s]+)["']?/g);

    for (const match of matches) {
        result[match[1]] = match[2];
    }

    return result;
}

function buildPortPanelId(groupId, portNo, index) {
    return `health-port-${groupId}-${sanitizeId(portNo ?? index)}`;
}

function sanitizeId(value) {
    return String(value || 'item').replace(/[^A-Za-z0-9_-]+/g, '-');
}

function formatFlowObject(value) {
    if (value === undefined || value === null) {
        return 'Cualquiera';
    }

    if (typeof value === 'string') {
        return value;
    }

    return JSON.stringify(value);
}

function formatFlowActions(flow) {
    const actions = flow.actions || flow.instructions || flow.action;
    return formatFlowObject(actions);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
