export function initNetworkStatusPanels({ serverInput, refreshIntervalMs, getServerUrl }) {
    const statusTabs = document.querySelectorAll('[data-status-tab]');
    const statusPanels = document.querySelectorAll('[data-status-panel]');
    const controllerStatusButton = document.querySelector('[data-controller-status-refresh]');
    const controllerStatusBody = document.querySelector('[data-controller-status-body]');
    const mininetStatusButton = document.querySelector('[data-mininet-status-refresh]');
    const mininetStatusBody = document.querySelector('[data-mininet-status-body]');

    let controllerStatusTimer = null;
    let mininetStatusTimer = null;
    let isLoadingControllerStatus = false;
    let isLoadingMininetStatus = false;

    if (controllerStatusButton && controllerStatusBody) {
        controllerStatusButton.addEventListener('click', () => loadControllerStatus({ manual: true }));
    }

    if (mininetStatusButton && mininetStatusBody) {
        mininetStatusButton.addEventListener('click', () => loadMininetStatus({ manual: true }));
    }

    bindStatusTabs();

    function start() {
        startControllerStatusAutoRefresh();
        startMininetStatusAutoRefresh();
    }

    function stop() {
        stopControllerStatusAutoRefresh();
        stopMininetStatusAutoRefresh();
    }

    function bindStatusTabs() {
        statusTabs.forEach(tab => {
            tab.addEventListener('click', () => selectStatusTab(tab.dataset.statusTab));
            tab.addEventListener('keydown', event => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
                    return;
                }

                event.preventDefault();
                const tabs = Array.from(statusTabs);
                const currentIndex = tabs.indexOf(tab);
                const offset = event.key === 'ArrowRight' ? 1 : -1;
                const nextTab = tabs[(currentIndex + offset + tabs.length) % tabs.length];
                nextTab.focus();
                selectStatusTab(nextTab.dataset.statusTab);
            });
        });
    }

    function selectStatusTab(target) {
        statusTabs.forEach(tab => {
            const isActive = tab.dataset.statusTab === target;
            tab.classList.toggle('is-active', isActive);
            tab.setAttribute('aria-selected', String(isActive));
        });

        statusPanels.forEach(panel => {
            const isActive = panel.dataset.statusPanel === target;
            panel.classList.toggle('is-active', isActive);
            panel.hidden = !isActive;
        });
    }

    async function refreshAll() {
        await Promise.allSettled([
            loadControllerStatus(),
            loadMininetStatus()
        ]);
    }

    function startControllerStatusAutoRefresh() {
        if (!controllerStatusButton || !controllerStatusBody) {
            return;
        }

        stopControllerStatusAutoRefresh();
        controllerStatusTimer = window.setInterval(() => {
            loadControllerStatus();
        }, refreshIntervalMs);
    }

    function stopControllerStatusAutoRefresh() {
        if (controllerStatusTimer) {
            window.clearInterval(controllerStatusTimer);
            controllerStatusTimer = null;
        }
    }

    function startMininetStatusAutoRefresh() {
        if (!mininetStatusButton || !mininetStatusBody) {
            return;
        }

        stopMininetStatusAutoRefresh();
        mininetStatusTimer = window.setInterval(() => {
            loadMininetStatus();
        }, refreshIntervalMs);
    }

    function stopMininetStatusAutoRefresh() {
        if (mininetStatusTimer) {
            window.clearInterval(mininetStatusTimer);
            mininetStatusTimer = null;
        }
    }

    async function loadControllerStatus({ manual = false } = {}) {
        if (!controllerStatusButton || !controllerStatusBody || isLoadingControllerStatus) {
            return;
        }

        if (!getActiveServerUrl()) {
            return;
        }

        isLoadingControllerStatus = true;
        const originalHtml = controllerStatusButton.innerHTML;
        controllerStatusButton.disabled = true;
        controllerStatusButton.innerHTML = manual
            ? '<i class="fas fa-spinner fa-spin"></i> Consultando'
            : '<i class="fas fa-spinner fa-spin"></i> Actualizando';
        controllerStatusBody.innerHTML = renderStatusPlaceholder('loading', 'Consultando el controlador...');

        try {
            const payload = await fetchJson(buildApiUrl('/api/controller/status'));
            renderControllerStatus(payload.data || payload);
            startControllerStatusAutoRefresh();
        } catch (error) {
            controllerStatusBody.innerHTML = renderStatusPlaceholder(
                'error',
                'No se pudo consultar el estado del controlador SDN.'
            );
        } finally {
            controllerStatusButton.disabled = false;
            controllerStatusButton.innerHTML = originalHtml;
            isLoadingControllerStatus = false;
        }
    }

    async function loadMininetStatus({ manual = false } = {}) {
        if (!mininetStatusButton || !mininetStatusBody || isLoadingMininetStatus) {
            return;
        }

        if (!getActiveServerUrl()) {
            return;
        }

        isLoadingMininetStatus = true;
        const originalHtml = mininetStatusButton.innerHTML;
        mininetStatusButton.disabled = true;
        mininetStatusButton.innerHTML = manual
            ? '<i class="fas fa-spinner fa-spin"></i> Consultando'
            : '<i class="fas fa-spinner fa-spin"></i> Actualizando';
        mininetStatusBody.innerHTML = renderStatusPlaceholder('loading', 'Consultando Mininet...');

        try {
            const payload = await fetchJson(buildMininetApiUrl('/api/mininet/status'));
            renderMininetStatus(payload.data || payload);
            startMininetStatusAutoRefresh();
        } catch (error) {
            mininetStatusBody.innerHTML = renderStatusPlaceholder(
                'error',
                'No se pudo consultar Mininet. Comprueba que la API de Mininet este levantada.'
            );
        } finally {
            mininetStatusButton.disabled = false;
            mininetStatusButton.innerHTML = originalHtml;
            isLoadingMininetStatus = false;
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

    function buildMininetApiUrl(path) {
        const url = new URL(getActiveServerUrl());
        if (!url.port || url.port === '8080') {
            url.port = '8081';
        }

        return `${url.origin}${path}`;
    }

    function getActiveServerUrl() {
        return typeof getServerUrl === 'function' ? getServerUrl() : normalizeServer(serverInput.value);
    }

    return {
        refreshAll,
        start,
        stop
    };
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

function renderStatusPlaceholder(type, text) {
    return `
        <span class="network-status-placeholder is-${type}">
            <i class="fas ${type === 'loading' ? 'fa-spinner fa-spin' : 'fa-triangle-exclamation'}"></i>
            ${escapeHtml(text)}
        </span>
    `;
}

function renderControllerStatus(data) {
    const controllerStatusBody = document.querySelector('[data-controller-status-body]');
    const controller = data.controller || {};
    const summary = data.summary || {};
    const statusText = formatState(controller.status) || 'No disponible';
    const uptime = formatDuration(controller.uptime_seconds);
    const ofpVersions = Array.isArray(controller.ofp_versions)
        ? controller.ofp_versions.join(', ')
        : controller.ofp_versions;

    controllerStatusBody.innerHTML = `
        <div class="network-status-summary">
            ${renderStatusKpi('Estado', statusText, 'fa-heart-pulse', controller.status === 'running' ? 'is-success' : 'is-warning')}
            ${renderStatusKpi('Uptime', uptime, 'fa-clock')}
            ${renderStatusKpi('Switches', summary.switches_connected ?? 0, 'fa-network-wired')}
            ${renderStatusKpi('Enlaces', summary.links_inventory ?? 0, 'fa-link')}
        </div>
        <dl class="network-status-details">
            ${detailRow('Controlador', controller.name || 'Ryu SDN Controller')}
            ${detailRow('Versiones OpenFlow', ofpVersions || 'No disponible')}
            ${detailRow('Intervalo monitorizacion', formatSeconds(controller.monitor_interval_seconds))}
            ${detailRow('Switches con estadisticas de puertos', summary.port_stats_switches)}
            ${detailRow('Switches con estadisticas de flujos', summary.flow_stats_switches)}
            ${detailRow('Puertos bloqueados por STP', summary.stp_blocked_ports)}
        </dl>
    `;
}

function renderMininetStatus(data) {
    const mininetStatusBody = document.querySelector('[data-mininet-status-body]');
    const topology = data.topology || {};
    const mininet = topology.mininet || {};
    const hosts = Array.isArray(data.hosts) ? data.hosts : (Array.isArray(mininet.hosts) ? mininet.hosts.map(host => host.name) : []);
    const switches = Array.isArray(data.switches) ? data.switches : (Array.isArray(mininet.switches) ? mininet.switches.map(sw => sw.name) : []);
    const links = Array.isArray(data.links) ? data.links : (Array.isArray(mininet.links) ? mininet.links : []);
    const exportedAt = topology.exported_at ? formatTimestamp(topology.exported_at) : 'Pendiente';
    const lastScenario = topology.last_applied_scenario || {};

    mininetStatusBody.innerHTML = `
        <div class="network-status-summary">
            ${renderStatusKpi('Estado', 'En ejecucion', 'fa-server', 'is-success')}
            ${renderStatusKpi('Switches', switches.length, 'fa-network-wired')}
            ${renderStatusKpi('Hosts', hosts.length, 'fa-desktop')}
            ${renderStatusKpi('Enlaces', links.length, 'fa-link')}
        </div>
        <dl class="network-status-details">
            ${detailRow('Tipo de topologia', formatTopologyKind(topology.kind))}
            ${detailRow('Ultima lectura', exportedAt)}
            ${detailRow('Escenario aplicado', lastScenario.name || lastScenario.path || 'No disponible')}
            ${detailRow('Switches detectados', formatList(switches))}
            ${detailRow('Hosts detectados', formatList(hosts))}
            ${detailRow('Enlaces fisicos', formatMininetLinks(links))}
        </dl>
    `;
}

function renderStatusKpi(label, value, icon, extraClass = '') {
    return `
        <span class="network-status-kpi ${extraClass}">
            <i class="fas ${icon}"></i>
            <small>${escapeHtml(label)}</small>
            <strong>${escapeHtml(value ?? 'N/D')}</strong>
        </span>
    `;
}

function detailRow(label, value) {
    const visibleValue = value === null ? 'Sin configurar' : value;
    return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(visibleValue)}</dd></div>`;
}

function formatList(value) {
    if (!Array.isArray(value)) {
        return undefined;
    }

    return value.length ? value.join(', ') : 'Ninguna';
}

function formatState(value) {
    const labels = {
        connected: 'Conectado',
        disconnected: 'Desconectado',
        running: 'En ejecucion'
    };

    return labels[value] || value;
}

function formatSeconds(seconds) {
    if (seconds === undefined || seconds === null || Number.isNaN(Number(seconds))) {
        return undefined;
    }

    return `${seconds} s`;
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

function formatTopologyKind(kind) {
    const labels = {
        mininet_live_topology: 'Topologia viva de Mininet'
    };

    return labels[kind] || kind || 'No disponible';
}

function formatMininetLinks(links) {
    if (!Array.isArray(links)) {
        return undefined;
    }

    if (!links.length) {
        return 'Ninguno';
    }

    return links.map(link => {
        if (typeof link === 'string') {
            return link;
        }

        const src = link.src?.node || link.source || link.src || 'origen';
        const dst = link.dst?.node || link.target || link.dst || 'destino';
        return `${src} - ${dst}`;
    }).join(', ');
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
