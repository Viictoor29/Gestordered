import { initNetworkStatusPanels } from './network/status-panels.js?v=20260531-topology-editor';
import { initBlockedIpsPanel } from './network/blocked-ips-panel.js';
import { initHealthPanel } from './network/health-panel.js';
import { initStpPanel } from './network/stp-panel.js';
import { initTopologyExportActions } from './network/topology-export.js';
import { initTrafficPanel } from './network/traffic-panel.js';
import {
    bindEdgeDegradationForm,
    bindEdgeStateActions,
    bindNodeIpTrafficActions,
    renderEdgeDegradationControl,
    renderEdgeStateControl,
    renderNodeIpTrafficControl
} from './network/contextual-actions.js';
import { renderEmptyDetail, detailRow, detailSection, renderExtraSection, getSwitchPorts, renderSwitchPortsSection, statusBadge, formatList, formatBoolean, formatValue, formatType, formatState, formatTrafficState, formatForwarding, formatHealth, formatDegradation, formatStpState, formatTime, formatTcValue, formatLossValue, isNodeBlocked, isEdgeUp, isEdgeDown, isEdgeBlocked, normalizeStateValue, getEdgeDegradation, isEdgeDegraded, formatEdgeState, getEdgeStateBadgeClass, renderEdgeTrafficBadge, formatAdminState, formatStp, formatTc, parseResponseJson, compactObject, normalizeNodeName, numberOrUndefined, escapeHtml } from './network/dashboard-formatters.js';
import { renderPendingMininetDiscovery } from './network/mininet-discovery.js';
import { bindRoleRequestForms } from './network/role-request-forms.js';
import { buildLayout, clamp, findHostLink, renderEdge, renderNode } from './network/topology-renderer.js';


(() => {
    const form = document.querySelector('[data-server-form]');
    const input = document.querySelector('[data-server-input]');
    const button = document.querySelector('[data-server-connect]');
    const status = document.querySelector('[data-server-status]');
    const stage = document.querySelector('[data-topology-stage]');
    const refreshIntervalMs = 60000;
    const usesGuestProxy = form.dataset.publicNetworkView === 'true';
    const readOnlyTopology = form.dataset.readOnlyNetworkView === 'true';
    const canManageLiveInventory = form.dataset.adminNetworkView === 'true';
    const requiresMininetConnection = form.dataset.requireMininetConnection === 'true'
        || Boolean(document.querySelector('[data-mininet-status-body]'));
    let refreshTimer = null;
    let isLoadingTopology = false;
    let currentServer = '';
    let lastUpdatedAt = null;
    let pendingDeleteRequest = null;
    const movedNodePositions = new Map();

    if (!form || !input || !button || !status || !stage) {
        return;
    }

    const savedServer = localStorage.getItem('gestordered-api-server');
    if (savedServer) {
        input.value = savedServer;
        if (sessionStorage.getItem('gestordered-api-connected') === 'true') {
            window.setTimeout(() => loadTopology(), 0);
        }
    }

    form.addEventListener('submit', event => {
        event.preventDefault();
        loadTopology({ manual: true });
    });

    const networkStatusPanels = initNetworkStatusPanels({
        serverInput: input,
        refreshIntervalMs,
        getServerUrl: () => currentServer
    });
    const healthPanel = initHealthPanel({
        serverInput: input,
        refreshIntervalMs,
        getServerUrl: () => currentServer
    });
    const stpPanel = initStpPanel({
        serverInput: input,
        refreshIntervalMs,
        getServerUrl: () => currentServer
    });
    const trafficPanel = initTrafficPanel({
        serverInput: input,
        getServerUrl: () => currentServer,
        onTrafficComplete: () => healthPanel.refresh()
    });
    const blockedIpsPanel = initBlockedIpsPanel({
        getServerUrl: () => currentServer
    });
    const topologyExportActions = initTopologyExportActions({
        getServerUrl: () => currentServer
    });
    const contextualActionContext = {
        getServerUrl: () => currentServer,
        refreshTopology: () => loadTopology(),
        refreshHealth: () => healthPanel.refresh(),
        refreshStp: () => stpPanel.refresh(),
        refreshBlockedIps: () => blockedIpsPanel.refresh()
    };

    bindRoleRequestForms();
    bindNetworkDeleteModal();

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

    async function loadTopology({ manual = false } = {}) {
        if (isLoadingTopology) {
            return;
        }

        let baseUrl;

        try {
            baseUrl = normalizeServer(input.value);
        } catch (error) {
            setStatus('error', 'Servidor no valido');
            renderMessage('Direccion no valida', 'Revisa la IP o URL del servidor de la API.');
            return;
        }

        if (!baseUrl) {
            setStatus('error', 'Introduce servidor');
            renderMessage('Falta el servidor', 'Escribe la IP o URL de la API para cargar la topologia.');
            return;
        }

        currentServer = baseUrl;
        isLoadingTopology = true;
        setLoading(true);
        setStatus('loading', manual ? 'Conectando' : 'Actualizando');

        try {
            const topologyUrl = usesGuestProxy
                ? buildGuestProxyUrl('/guest/api/topology', baseUrl)
                : `${baseUrl}/api/topology`;
            const checks = [fetchRequiredJson(topologyUrl, 'Ryu')];
            if (requiresMininetConnection) {
                const mininetUrl = usesGuestProxy
                    ? buildGuestProxyUrl('/guest/api/mininet/status', toMininetUrl(baseUrl))
                    : `${toMininetUrl(baseUrl)}/api/mininet/status`;
                checks.push(fetchRequiredJson(mininetUrl, 'Mininet'));
            }

            const [payload, mininetPayload] = await Promise.all(checks);
            const topology = payload.data || payload;
            const nodes = Array.isArray(topology.nodes) ? topology.nodes : [];
            const edges = Array.isArray(topology.edges) ? topology.edges : [];

            localStorage.setItem('gestordered-api-server', input.value.trim());
            sessionStorage.setItem('gestordered-api-connected', 'true');
            lastUpdatedAt = new Date();
            setStatus('connected', 'Conectado');
            renderTopology(nodes, edges);
            renderPendingMininetDiscovery(stage, nodes, edges, mininetPayload?.data || mininetPayload);
            refreshLivePanels();
            trafficPanel.setConnected?.();
            notifyConnectionChange();
            startAutoRefresh();
        } catch (error) {
            currentServer = '';
            sessionStorage.removeItem('gestordered-api-connected');
            setStatus('error', 'Sin conexion');
            renderMessage(
                requiresMininetConnection ? 'No se pudo conectar con las dos APIs' : 'No se pudo conectar con Ryu',
                error.message || (requiresMininetConnection ? 'Comprueba que Ryu y Mininet esten levantados.' : 'Comprueba que Ryu este levantado.')
            );
            notifyConnectionChange();
            stopAutoRefresh();
        } finally {
            isLoadingTopology = false;
            setLoading(false);
        }
    }

    async function fetchRequiredJson(url, serviceName) {
        let response;
        try {
            response = await fetch(url, { headers: { Accept: 'application/json' } });
        } catch (error) {
            throw new Error(`${serviceName} no responde.`);
        }

        if (!response.ok) {
            throw new Error(`${serviceName} responde con HTTP ${response.status}.`);
        }

        const payload = await response.json();
        if (payload && payload.ok === false) {
            throw new Error(payload.error || `${serviceName} no esta disponible.`);
        }

        return payload;
    }

    function toMininetUrl(serverUrl) {
        const url = new URL(serverUrl);
        url.port = '8081';
        return url.origin;
    }

    function buildGuestProxyUrl(path, serverUrl) {
        return `${path}?serverUrl=${encodeURIComponent(serverUrl)}`;
    }

    function refreshLivePanels() {
        networkStatusPanels.refreshAll();
        stpPanel.refresh();
        healthPanel.refresh();
        blockedIpsPanel.refresh();
    }

    function notifyConnectionChange() {
        window.dispatchEvent(new CustomEvent('gestordered:network-connection', {
            detail: {
                connected: Boolean(currentServer),
                serverUrl: currentServer
            }
        }));
    }

    window.addEventListener('gestordered:refresh-live-network', () => {
        if (!currentServer) {
            return;
        }

        loadTopology();
    });

    window.gestorderedNetwork = {
        isConnected: () => Boolean(currentServer),
        getServerUrl: () => currentServer,
        refresh: () => {
            if (currentServer) {
                loadTopology();
            }
        }
    };

    function startAutoRefresh() {
        stopAutoRefresh();
        refreshTimer = window.setInterval(() => {
            if (currentServer) {
                loadTopology();
            }
        }, refreshIntervalMs);
        networkStatusPanels.start();
        stpPanel.start();
        healthPanel.start();
    }

    function stopAutoRefresh() {
        if (refreshTimer) {
            window.clearInterval(refreshTimer);
            refreshTimer = null;
        }
        networkStatusPanels.stop();
        stpPanel.stop();
        healthPanel.stop();
    }

    function setLoading(isLoading) {
        button.disabled = isLoading;
        button.innerHTML = isLoading
            ? '<i class="fas fa-spinner fa-spin"></i> Conectando'
            : '<i class="fas fa-plug"></i> Conectar';
    }

    function setStatus(type, text) {
        status.classList.remove('is-loading', 'is-connected', 'is-error');
        status.classList.add(`is-${type}`);
        status.innerHTML = `<i class="fas fa-circle"></i> ${escapeHtml(text)}`;
    }

    function renderMessage(title, text) {
        stage.innerHTML = `
            <div class="empty-state" data-topology-empty>
                <i class="fas fa-network-wired"></i>
                <h3>${escapeHtml(title)}</h3>
                <p>${escapeHtml(text)}</p>
            </div>
            ${canManageLiveInventory ? '<div class="topology-pending-discovery" data-mininet-pending-discovery hidden></div>' : ''}
        `;
    }

    function renderTopology(nodes, edges) {
        if (!nodes.length) {
            renderMessage('Topologia vacia', 'La API respondio correctamente, pero no envio nodos.');
            return;
        }

        const layout = buildLayout(nodes, edges, getSavedNodePosition);
        const summary = buildSummary(nodes, edges);
        const svgEdges = edges.map((edge, index) => renderEdge(edge, layout.positions, index)).join('');
        const svgNodes = nodes.map(node => renderNode(node, layout.positions[node.id])).join('');
        const panelHeight = getTopologyPanelHeight(nodes, edges);

        stage.innerHTML = `
            <div class="topology-meta">
                ${renderMetric('Switches', summary.switches, 'fa-network-wired')}
                ${renderMetric('Hosts', summary.hosts, 'fa-desktop')}
                ${renderMetric('Enlaces activos', summary.linksUp, 'fa-link')}
                ${renderMetric('Bloqueos', summary.blocked, 'fa-ban', summary.blocked ? 'is-warning' : '')}
            </div>
            <div class="topology-refresh">
                <span><i class="fas fa-rotate"></i> Actualizacion automatica cada minuto</span>
                <span>Ultima lectura: ${escapeHtml(formatTime(lastUpdatedAt))}</span>
                <button type="button" class="topology-refresh-button" data-refresh-topology>
                    <i class="fas fa-arrows-rotate"></i>
                    Actualizar ahora
                </button>
            </div>
            <div class="topology-discovery-note">
                <i class="fas fa-circle-info"></i>
                Los hosts se muestran cuando Ryu los descubre al generar o recibir trafico. Puedes arrastrar los nodos para recolocar el mapa.
            </div>
            ${canManageLiveInventory ? '<div class="topology-pending-discovery" data-mininet-pending-discovery hidden></div>' : ''}
            <div class="topology-workspace">
                <div class="topology-canvas">
                    <svg class="topology-map" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="Topologia de red">
                        ${svgEdges}
                        ${svgNodes}
                    </svg>
                    <div class="topology-legend" aria-label="Leyenda de estados">
                        <span><i class="legend-dot is-up"></i> Activo</span>
                        <span><i class="legend-dot is-down"></i> Desactivado</span>
                        <span><i class="legend-dot is-blocked"></i> Bloqueado</span>
                    </div>
                </div>
                <aside class="topology-detail" data-topology-detail>
                    ${renderOverviewDetail(summary)}
                </aside>
            </div>
            ${readOnlyTopology ? '' : `
                <div class="topology-export-footer" data-topology-export-actions>
                    <button type="button" class="topology-refresh-button" data-topology-export="/api/topology/export">
                        <i class="fas fa-download"></i>
                        Exportar topologia
                    </button>
                    <span class="topology-export-status" data-topology-export-status></span>
                </div>
            `}
        `;

        stage.style.setProperty('--topology-panel-height', `${panelHeight}px`);
        bindTopologySelection(nodes, edges);
        bindNodeDragging(layout.positions, edges, layout.width, layout.height);
        bindManualRefresh();
        if (!readOnlyTopology) {
            topologyExportActions.bind();
        }
    }

    function getTopologyPanelHeight(nodes, edges) {
        const complexity = Math.max(nodes.length, edges.length);

        if (complexity >= 18) {
            return 780;
        }

        if (complexity >= 12) {
            return 680;
        }

        if (complexity >= 7) {
            return 580;
        }

        return 500;
    }

    function bindManualRefresh() {
        const refreshButton = stage.querySelector('[data-refresh-topology]');

        if (!refreshButton) {
            return;
        }

        refreshButton.addEventListener('click', () => loadTopology({ manual: true }));
    }

    function buildSummary(nodes, edges) {
        return {
            switches: nodes.filter(node => node.type === 'switch').length,
            hosts: nodes.filter(node => node.type === 'host').length,
            linksUp: edges.filter(edge => isEdgeUp(edge)).length,
            linksDown: edges.filter(edge => !isEdgeUp(edge)).length,
            blocked: nodes.filter(isNodeBlocked).length + edges.filter(isEdgeBlocked).length,
            degraded: edges.filter(isEdgeDegraded).length
        };
    }

    function renderMetric(label, value, icon, extraClass = '') {
        return `
            <span class="topology-metric ${extraClass}">
                <i class="fas ${icon}"></i>
                <small>${escapeHtml(label)}</small>
                <strong>${escapeHtml(value)}</strong>
            </span>
        `;
    }

    function renderOverviewDetail(summary) {
        return `
            <div class="detail-heading">
                <span class="detail-icon"><i class="fas fa-chart-simple"></i></span>
                <div>
                    <p>Resumen</p>
                    <h3>Estado general</h3>
                </div>
            </div>
            <dl class="detail-list">
                ${detailRow('Switches', summary.switches)}
                ${detailRow('Hosts', summary.hosts)}
                ${detailRow('Enlaces activos', summary.linksUp)}
                ${detailRow('Enlaces desactivados', summary.linksDown)}
                ${detailRow('Elementos bloqueados', summary.blocked)}
                ${detailRow('Enlaces con avisos de salud', summary.degraded)}
            </dl>
            <p class="detail-help">Selecciona un nodo o enlace del mapa para consultar sus datos completos.</p>
        `;
    }

    function getSavedNodePosition(nodeId) {
        const key = nodePositionKey(nodeId);
        if (!key) {
            return null;
        }

        if (movedNodePositions.has(key)) {
            return movedNodePositions.get(key);
        }

        try {
            const saved = JSON.parse(localStorage.getItem(key) || 'null');
            if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
                movedNodePositions.set(key, saved);
                return saved;
            }
        } catch (error) {
            return null;
        }

        return null;
    }

    function saveNodePosition(nodeId, position) {
        const key = nodePositionKey(nodeId);
        if (!key) {
            return;
        }

        movedNodePositions.set(key, position);
        try {
            localStorage.setItem(key, JSON.stringify(position));
        } catch (error) {
            // La posicion se conserva durante la sesion aunque el navegador no permita persistirla.
        }
    }

    function nodePositionKey(nodeId) {
        return currentServer && nodeId
            ? `gestordered-node-position:${currentServer}:${nodeId}`
            : '';
    }

    function bindTopologySelection(nodes, edges) {
        const detail = stage.querySelector('[data-topology-detail]');
        const selectableItems = stage.querySelectorAll('[data-detail-type]');

        selectableItems.forEach(item => {
            item.addEventListener('click', event => {
                if (item.dataset.skipClick === 'true') {
                    event.preventDefault();
                    item.dataset.skipClick = 'false';
                    return;
                }

                selectTopologyItem(item, detail, nodes, edges);
            });
            item.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectTopologyItem(item, detail, nodes, edges);
                }
            });
        });
    }

    function bindNodeDragging(positions, edges, width, height) {
        const svg = stage.querySelector('.topology-map');
        if (!svg) {
            return;
        }

        let dragState = null;

        svg.querySelectorAll('[data-node-id]').forEach(nodeElement => {
            nodeElement.addEventListener('pointerdown', event => {
                if (event.button !== 0) {
                    return;
                }

                const nodeId = nodeElement.dataset.nodeId;
                const startPoint = svgPointFromEvent(svg, event);
                const currentPosition = positions[nodeId];
                if (!currentPosition) {
                    return;
                }

                dragState = {
                    nodeElement,
                    nodeId,
                    pointerId: event.pointerId,
                    startPoint,
                    startPosition: { ...currentPosition },
                    moved: false
                };
                nodeElement.setPointerCapture(event.pointerId);
                nodeElement.classList.add('is-dragging');
                event.preventDefault();
            });
        });

        svg.addEventListener('pointermove', event => {
            if (!dragState || event.pointerId !== dragState.pointerId) {
                return;
            }

            const point = svgPointFromEvent(svg, event);
            const dx = point.x - dragState.startPoint.x;
            const dy = point.y - dragState.startPoint.y;
            if (Math.hypot(dx, dy) > 3) {
                dragState.moved = true;
            }

            const nextPosition = {
                x: clamp(dragState.startPosition.x + dx, 70, width - 70),
                y: clamp(dragState.startPosition.y + dy, 72, height - 72)
            };

            positions[dragState.nodeId] = nextPosition;
            saveNodePosition(dragState.nodeId, nextPosition);
            dragState.nodeElement.setAttribute('transform', `translate(${nextPosition.x} ${nextPosition.y})`);
            updateConnectedEdges(svg, dragState.nodeId, positions);
        });

        svg.addEventListener('pointerup', finishDrag);
        svg.addEventListener('pointercancel', finishDrag);

        function finishDrag(event) {
            if (!dragState || event.pointerId !== dragState.pointerId) {
                return;
            }

            dragState.nodeElement.classList.remove('is-dragging');
            if (dragState.moved) {
                dragState.nodeElement.dataset.skipClick = 'true';
            }
            dragState = null;
        }
    }

    function svgPointFromEvent(svg, event) {
        const point = svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        return point.matrixTransform(svg.getScreenCTM().inverse());
    }

    function updateConnectedEdges(svg, nodeId, positions) {
        svg.querySelectorAll(`.topology-edge[data-source-id="${cssEscape(nodeId)}"], .topology-edge[data-target-id="${cssEscape(nodeId)}"]`).forEach(edgeElement => {
            const source = positions[edgeElement.dataset.sourceId];
            const target = positions[edgeElement.dataset.targetId];
            if (!source || !target) {
                return;
            }

            const line = edgeElement.querySelector('line');

            line.setAttribute('x1', source.x);
            line.setAttribute('y1', source.y);
            line.setAttribute('x2', target.x);
            line.setAttribute('y2', target.y);

            if (edgeElement.dataset.edgeType === 'switch-link') {
                const sourceText = edgeElement.querySelector('.edge-endpoint-label.is-source');
                const targetText = edgeElement.querySelector('.edge-endpoint-label.is-target');
                const sourceLabelPosition = getSwitchEdgeEndpointLabelPosition(source, target, 'source');
                const targetLabelPosition = getSwitchEdgeEndpointLabelPosition(source, target, 'target');
                sourceText?.setAttribute('x', sourceLabelPosition.x);
                sourceText?.setAttribute('y', sourceLabelPosition.y);
                targetText?.setAttribute('x', targetLabelPosition.x);
                targetText?.setAttribute('y', targetLabelPosition.y);
                return;
            }

            const text = edgeElement.querySelector('text');
            const labelPosition = getEdgeLabelPosition(source, target, edgeElement.dataset.edgeType, edgeElement.dataset.edgeLabel, {
                'source-s': edgeElement.dataset.switchEndpoint === 'source' ? edgeElement.dataset.sourceId : '',
                'target-s': edgeElement.dataset.switchEndpoint === 'target' ? edgeElement.dataset.targetId : ''
            });
            text?.setAttribute('x', labelPosition.x);
            text?.setAttribute('y', labelPosition.y);
        });
    }

    function cssEscape(value) {
        if (window.CSS && typeof window.CSS.escape === 'function') {
            return window.CSS.escape(value);
        }

        return String(value).replace(/["\\]/g, '\\$&');
    }

    function selectTopologyItem(item, detail, nodes, edges) {
        stage.querySelectorAll('.is-selected').forEach(selected => selected.classList.remove('is-selected'));
        item.classList.add('is-selected');

        if (item.dataset.detailType === 'node') {
            const node = nodes.find(candidate => candidate.id === item.dataset.detailId);
            detail.innerHTML = renderNodeDetail(node, edges);
            if (!readOnlyTopology) {
                bindNodeIpTrafficActions(detail, node, contextualActionContext);
            }
            bindLiveInventoryDeleteAction(detail, buildNodeDeleteRequest(node));
            return;
        }

        const edge = edges[Number(item.dataset.detailId)];
        detail.innerHTML = renderEdgeDetail(edge);
        if (!readOnlyTopology) {
            bindEdgeStateActions(detail, edge, contextualActionContext);
            bindEdgeDegradationForm(detail, edge, contextualActionContext);
        }
        bindLiveInventoryDeleteAction(detail, buildEdgeDeleteRequest(edge));
    }

    function renderNodeDetail(node, edges = []) {
        if (!node) {
            return renderEmptyDetail();
        }

        const isSwitch = node.type === 'switch';
        const title = node.name || node.id;
        const state = node.connected === false ? 'Desconectado' : formatState(node.state) || 'Activo';
        const traffic = node.traffic_state || (node.traffic_blocked !== undefined ? (node.traffic_blocked ? 'blocked' : 'allowed') : undefined);
        const trafficFilters = node.traffic_filters || {};
        const hostLink = !isSwitch ? findHostLink(node.id, edges) : null;
        const switchPorts = isSwitch ? getSwitchPorts(node.id, edges) : [];

        return `
            <div class="detail-heading">
                <span class="detail-icon ${isSwitch ? 'is-switch' : 'is-host'}"><i class="fas ${isSwitch ? 'fa-network-wired' : 'fa-desktop'}"></i></span>
                <div>
                    <p>${escapeHtml(isSwitch ? 'Switch' : 'Host')}</p>
                    <h3>${escapeHtml(title)}</h3>
                </div>
            </div>
            <div class="detail-badges">
                ${statusBadge(state, node.connected === false ? 'is-danger' : 'is-success')}
                ${isSwitch ? '' : statusBadge(isNodeBlocked(node) ? 'Bloqueado' : 'Permitido', isNodeBlocked(node) ? 'is-danger' : 'is-success')}
            </div>
            ${readOnlyTopology ? '' : renderNodeIpTrafficControl(node)}
            ${renderLiveInventoryDeleteControl(isSwitch ? 'switch' : 'host')}
            ${detailSection('Identidad', [
                ['ID', node.id],
                ['Tipo', formatType(node.type)],
                ['Nombre', node.name],
                ['MAC', node.mac]
            ])}
            ${!isSwitch ? detailSection('Direccionamiento', [
                ['IPv4', formatList(node.ipv4)],
                ['IPv6', formatList(node.ipv6)]
            ]) : ''}
            ${hostLink ? detailSection('Conexion al switch', [
                ['Switch conectado', hostLink['target-s'] || hostLink['source-s']],
                ['Puerto del switch', hostLink['s-port']],
                ['Interfaz del switch', hostLink['s-iface']],
                ['MAC del host', hostLink.mac]
            ]) : ''}
            ${isSwitch ? renderSwitchPortsSection(switchPorts) : ''}
            ${detailSection('Estado y filtros', [
                ['Conectado', formatBoolean(node.connected)],
                ['Estado', formatState(node.state)],
                ['IP bloqueada', formatBoolean(node.ip_blocked)],
                ['Trafico bloqueado', formatBoolean(node.traffic_blocked)],
                ['Estado de trafico', formatTrafficState(traffic)],
                ['IPv4 bloqueadas', formatList(node.blocked_ipv4)],
                ['Filtros IPv4 del switch', formatList(trafficFilters.blocked_ipv4)]
            ])}
            ${renderExtraSection(node, ['id', 'type', 'name', 'mac', 'ipv4', 'ipv6', 'connected', 'state', 'ip_blocked', 'traffic_blocked', 'blocked_ipv4', 'traffic_state', 'traffic_filters'])}
        `;
    }

    function renderEdgeDetail(edge) {
        if (!edge) {
            return renderEmptyDetail();
        }

        const isHostLink = edge.type === 'host-link';
        const title = isHostLink
            ? `${edge['source-h']} -> ${edge['target-s']}`
            : `${edge.source} -> ${edge.target}`;
        const degradation = getEdgeDegradation(edge);
        const endpointRows = isHostLink
            ? [
                ['Tipo', formatType(edge.type)],
                ['Host', edge['source-h']],
                ['Switch', edge['target-s']],
                ['MAC host', edge.mac]
            ]
            : [
                ['Tipo', formatType(edge.type)],
                ['Switch origen', edge.source],
                ['Switch destino', edge.target],
                ['Puerto origen', edge.src_port],
                ['Puerto destino', edge.dst_port],
                ['Interfaz origen', edge.src_iface],
                ['Interfaz destino', edge.dst_iface]
            ];
        const tcRows = isHostLink
            ? [
                ['Retardo', formatTcValue(edge.tc_sw_port?.delay)],
                ['Perdida de paquetes', formatLossValue(edge.tc_sw_port?.loss)],
                ['Ancho de banda', formatTcValue(edge.tc_sw_port?.bandwidth)]
            ]
            : [
                ['Retardo en origen', formatTcValue(edge.src_tc?.delay)],
                ['Perdida en origen', formatLossValue(edge.src_tc?.loss)],
                ['Ancho de banda en origen', formatTcValue(edge.src_tc?.bandwidth)],
                ['Retardo en destino', formatTcValue(edge.dst_tc?.delay)],
                ['Perdida en destino', formatLossValue(edge.dst_tc?.loss)],
                ['Ancho de banda en destino', formatTcValue(edge.dst_tc?.bandwidth)]
            ];
        const linkStpRows = isHostLink
            ? []
            : [
                ['STP origen', formatStpState(edge.stp?.src_state, edge.stp?.src_blocked, edge.forwarding)],
                ['STP destino', formatStpState(edge.stp?.dst_state, edge.stp?.dst_blocked, edge.forwarding)],
                ['Origen bloqueado por STP', formatBoolean(edge.stp?.src_blocked)],
                ['Destino bloqueado por STP', formatBoolean(edge.stp?.dst_blocked)]
            ];

        return `
            <div class="detail-heading">
                <span class="detail-icon is-link"><i class="fas fa-link"></i></span>
                <div>
                    <p>${escapeHtml(isHostLink ? 'Enlace host-switch' : 'Enlace switch-switch')}</p>
                    <h3>${escapeHtml(title)}</h3>
                </div>
            </div>
            <div class="detail-badges">
                ${isEdgeBlocked(edge) ? '' : statusBadge(formatEdgeState(edge), getEdgeStateBadgeClass(edge))}
                ${statusBadge(formatHealth(degradation), degradation === 'healthy' ? 'is-success' : 'is-warning')}
                ${renderEdgeTrafficBadge(edge)}
            </div>
            ${readOnlyTopology ? '' : renderEdgeStateControl(edge)}
            ${readOnlyTopology ? '' : renderEdgeDegradationControl(edge)}
            ${renderLiveInventoryDeleteControl('link')}
            ${detailSection('Extremos', endpointRows)}
            ${detailSection('Estado operativo', [
                ['Estado', formatState(edge.state)],
                ['Habilitado', formatBoolean(edge.enabled)],
                ['Envio de trafico', formatForwarding(edge.forwarding)],
                ['Descubierto', formatBoolean(edge.discovered)],
                ['Estado administrativo', formatAdminState(edge)],
                ['IPs bloqueadas', formatList(edge.blocked_ipv4)]
            ])}
            ${detailSection('TC', tcRows)}
            ${detailSection('STP', linkStpRows)}
            ${renderExtraSection(edge, ['type', 'source-h', 'target-s', 'source', 'target', 'mac', 'src_port', 'dst_port', 's-port', 'src_iface', 'dst_iface', 's-iface', 'state', 'enabled', 'forwarding', 'discovered', 'inventory_state', 'manual_disabled', 'admin_state', 'blocked_ipv4', 'stp_state', 'stp_blocked', 'stp', 'tc_sw_port', 'src_tc', 'dst_tc', 'src_degradation', 'dst_degradation', 'degradation-link'])}
        `;
    }

    function renderLiveInventoryDeleteControl(type) {
        if (!canManageLiveInventory) {
            return '';
        }

        const labels = {
            host: 'Borrar host',
            switch: 'Borrar switch',
            link: 'Borrar enlace'
        };

        return `
            <section class="detail-section live-inventory-delete-section">
                <h4>Modificar topologia</h4>
                <button type="button"
                        class="contextual-action-button is-danger live-inventory-delete-button"
                        data-live-delete-trigger>
                    <i class="fas fa-trash"></i>
                    ${escapeHtml(labels[type] || 'Borrar elemento')}
                </button>
            </section>
        `;
    }

    function bindLiveInventoryDeleteAction(detail, request) {
        if (!canManageLiveInventory || !request) {
            return;
        }

        const button = detail.querySelector('[data-live-delete-trigger]');
        if (!button) {
            return;
        }

        button.addEventListener('click', () => openNetworkDeleteModal(request));
    }

    function buildNodeDeleteRequest(node) {
        if (!node || !node.id) {
            return null;
        }

        const type = node.type === 'switch' ? 'switch' : 'host';
        const name = normalizeNodeName(node.name || node.id);
        return {
            method: 'DELETE',
            path: `/api/admin/mininet/${type === 'switch' ? 'switches' : 'hosts'}/${encodeURIComponent(name)}`,
            body: {},
            label: `${type === 'switch' ? 'switch' : 'host'} ${name}`,
            successMessage: `${type === 'switch' ? 'Switch' : 'Host'} ${name} eliminado correctamente.`
        };
    }

    function buildEdgeDeleteRequest(edge) {
        if (!edge) {
            return null;
        }

        const isHostLink = edge.type === 'host-link';
        const body = isHostLink
            ? {
                node1: normalizeNodeName(edge['source-h'] || edge.source),
                node2: normalizeNodeName(edge['target-s'] || edge.target),
                port2: numberOrUndefined(edge['s-port'] ?? edge.dst_port)
            }
            : {
                node1: normalizeNodeName(edge.source || edge['source-s']),
                node2: normalizeNodeName(edge.target || edge['target-s']),
                port1: numberOrUndefined(edge.src_port),
                port2: numberOrUndefined(edge.dst_port)
            };

        return {
            method: 'DELETE',
            path: '/api/admin/mininet/links',
            body: compactObject(body),
            label: `enlace ${body.node1 || '?'} - ${body.node2 || '?'}`,
            successMessage: `Enlace ${body.node1 || '?'} - ${body.node2 || '?'} eliminado correctamente.`
        };
    }

    function bindNetworkDeleteModal() {
        const modal = document.getElementById('network-delete-modal');
        const formElement = modal?.querySelector('[data-network-delete-form]');
        const summary = modal?.querySelector('[data-network-delete-summary]');
        const feedback = modal?.querySelector('[data-network-delete-feedback]');

        if (!modal || !formElement || !summary) {
            return;
        }

        const closeModal = () => {
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
            pendingDeleteRequest = null;
            formElement.reset();
            if (feedback) {
                feedback.textContent = '';
                feedback.classList.remove('is-error', 'is-success', 'is-pending');
            }
        };

        modal.querySelectorAll('[data-action="close-network-delete"]').forEach(button => {
            button.addEventListener('click', closeModal);
        });

        formElement.addEventListener('submit', event => {
            event.preventDefault();
            submitNetworkDelete(formElement, feedback, closeModal);
        });
    }

    function openNetworkDeleteModal(request) {
        const modal = document.getElementById('network-delete-modal');
        const summary = modal?.querySelector('[data-network-delete-summary]');
        const input = modal?.querySelector('input[name="confirmation"]');

        if (!modal || !summary) {
            return;
        }

        pendingDeleteRequest = request;
        summary.textContent = `Vas a borrar ${request.label}. Esta accion puede desconectar hosts o eliminar enlaces asociados.`;
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        window.setTimeout(() => input?.focus(), 0);
    }

    async function submitNetworkDelete(formElement, feedback, closeModal) {
        if (!pendingDeleteRequest) {
            return;
        }

        const confirmation = new FormData(formElement).get('confirmation');
        if (String(confirmation || '').trim() !== 'CONFIRMAR') {
            setNetworkDeleteFeedback(feedback, 'Escribe CONFIRMAR para continuar.', 'is-error');
            return;
        }

        try {
            setNetworkDeleteFeedback(feedback, 'Borrando elemento en Mininet...', 'is-pending');
            await sendLiveInventoryJson(pendingDeleteRequest.path, pendingDeleteRequest.method, pendingDeleteRequest.body);
            setNetworkDeleteFeedback(feedback, pendingDeleteRequest.successMessage, 'is-success');
            window.setTimeout(() => {
                closeModal();
                loadTopology({ manual: true });
            }, 700);
        } catch (error) {
            setNetworkDeleteFeedback(feedback, error.message || 'No se pudo borrar el elemento.', 'is-error');
        }
    }

    async function sendLiveInventoryJson(path, method, body) {
        const response = await fetch(`${path}?serverUrl=${encodeURIComponent(toMininetUrl(currentServer))}`, {
            method,
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            credentials: 'same-origin',
            body: JSON.stringify(body || {})
        });
        const text = await response.text();
        const payload = parseResponseJson(text);

        if (!response.ok || payload.ok === false) {
            throw new Error(payload.error || payload.message || text || `HTTP ${response.status}`);
        }

        return payload;
    }

    function setNetworkDeleteFeedback(feedback, message, className) {
        if (!feedback) {
            return;
        }

        feedback.textContent = message;
        feedback.classList.remove('is-error', 'is-success', 'is-pending');
        if (className) {
            feedback.classList.add(className);
        }
    }

})();
