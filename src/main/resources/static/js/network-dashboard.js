import { initNetworkStatusPanels } from './network/status-panels.js';
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

    function bindRoleRequestForms() {
        document.querySelectorAll('[data-role-request-form]').forEach(roleForm => {
            roleForm.addEventListener('submit', event => {
                event.preventDefault();
                submitRoleRequestForm(roleForm);
            });
        });
    }

    async function submitRoleRequestForm(roleForm) {
        const feedback = roleForm.querySelector('.account-request-feedback');
        const submitButton = roleForm.querySelector('button[type="submit"]');
        const originalButtonHtml = submitButton ? submitButton.innerHTML : '';

        setFeedback(feedback, 'Procesando solicitud...', 'is-pending');

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando';
        }

        try {
            const response = await fetch(roleForm.action, {
                method: roleForm.method || 'POST',
                body: new FormData(roleForm),
                headers: {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'same-origin'
            });
            const payload = await response.json();

            setFeedback(
                feedback,
                payload.message || 'Operacion completada.',
                payload.feedbackClass || (response.ok ? 'is-success' : 'is-error')
            );

            if (response.ok && roleForm.dataset.roleRequestForm === 'create') {
                roleForm.reset();
            }
        } catch (error) {
            setFeedback(feedback, 'No se pudo completar la operacion. Intentalo de nuevo.', 'is-error');
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.innerHTML = originalButtonHtml;
            }
        }
    }

    function setFeedback(feedback, message, className) {
        if (!feedback) {
            return;
        }

        feedback.textContent = message;
        feedback.classList.remove('is-error', 'is-success', 'is-pending');

        if (className) {
            feedback.classList.add(className);
        }
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

            const [payload] = await Promise.all(checks);
            const topology = payload.data || payload;
            const nodes = Array.isArray(topology.nodes) ? topology.nodes : [];
            const edges = Array.isArray(topology.edges) ? topology.edges : [];

            localStorage.setItem('gestordered-api-server', input.value.trim());
            sessionStorage.setItem('gestordered-api-connected', 'true');
            lastUpdatedAt = new Date();
            setStatus('connected', 'Conectado');
            renderTopology(nodes, edges);
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
        `;
    }

    function renderTopology(nodes, edges) {
        if (!nodes.length) {
            renderMessage('Topologia vacia', 'La API respondio correctamente, pero no envio nodos.');
            return;
        }

        const layout = buildLayout(nodes, edges);
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

    function buildLayout(nodes, edges) {
        const width = 960;
        const height = 570;
        const switches = nodes.filter(node => node.type === 'switch');
        const hosts = nodes.filter(node => node.type !== 'switch');
        const positions = {};
        const center = { x: width / 2, y: height / 2 + 28 };

        switches.forEach((node, index) => {
            positions[node.id] = getSwitchPosition(index, switches.length, width, height, center);
        });

        hosts.forEach((node, index) => {
            const linkedSwitchId = findLinkedSwitch(node.id, edges);
            const anchor = positions[linkedSwitchId] || pointOnRow(index, hosts.length, 160, width - 160, height / 2);
            const siblings = hosts.filter(host => findLinkedSwitch(host.id, edges) === linkedSwitchId);
            const hostNumber = siblings.findIndex(host => host.id === node.id);
            const baseAngle = Math.atan2(anchor.y - center.y, anchor.x - center.x);
            const fanOffset = siblings.length <= 1 ? 0 : (hostNumber - (siblings.length - 1) / 2) * 0.42;
            const angle = baseAngle + fanOffset;
            const distance = 190 + Math.min(hostNumber, 2) * 22;

            positions[node.id] = {
                x: clamp(anchor.x + Math.cos(angle) * distance, 95, width - 95),
                y: clamp(anchor.y + Math.sin(angle) * distance, 90, height - 90)
            };
        });

        nodes.forEach((node, index) => {
            if (!positions[node.id]) {
                positions[node.id] = pointOnRow(index, nodes.length, 100, width - 100, height / 2);
            }
        });

        return { width, height, positions };
    }

    function getSwitchPosition(index, total, width, height, center) {
        if (total <= 2) {
            return pointOnRow(index, total, 235, width - 235, center.y);
        }

        const radiusX = Math.min(310, Math.max(190, 120 + total * 24));
        const radiusY = Math.min(190, Math.max(130, 90 + total * 12));
        const angle = -Math.PI / 2 + (Math.PI * 2 * index) / total;

        return {
            x: center.x + Math.cos(angle) * radiusX,
            y: center.y + Math.sin(angle) * radiusY
        };
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function findLinkedSwitch(hostId, edges) {
        const hostEdge = edges.find(edge => edge['source-h'] === hostId || edge['target-h'] === hostId);
        return hostEdge ? hostEdge['target-s'] || hostEdge['source-s'] : null;
    }

    function findHostLink(hostId, edges) {
        return edges.find(edge => edge.type === 'host-link' && (edge['source-h'] === hostId || edge['target-h'] === hostId));
    }

    function pointOnRow(index, total, startX, endX, y) {
        if (total <= 1) {
            return { x: (startX + endX) / 2, y };
        }

        return {
            x: startX + ((endX - startX) / (total - 1)) * index,
            y
        };
    }

    function renderEdge(edge, positions, index) {
        const sourceId = edge.source || edge['source-h'] || edge['source-s'];
        const targetId = edge.target || edge['target-s'] || edge['target-h'];
        const source = positions[sourceId];
        const target = positions[targetId];

        if (!source || !target) {
            return '';
        }

        const isUp = isEdgeUp(edge);
        const isBlocked = isEdgeBlocked(edge);
        const label = edge.type === 'host-link'
            ? `${edge['s-iface'] || ''}`
            : `${edge.src_iface || ''} - ${edge.dst_iface || ''}`;
        const labelPosition = getEdgeLabelPosition(source, target, edge.type, label, edge);

        return `
            <g class="topology-edge ${isUp ? 'is-up' : 'is-down'} ${isBlocked ? 'is-blocked' : ''}"
               data-detail-type="edge"
               data-detail-id="${index}"
               data-source-id="${escapeHtml(sourceId)}"
               data-target-id="${escapeHtml(targetId)}"
               data-edge-type="${escapeHtml(edge.type)}"
               data-switch-endpoint="${escapeHtml(getHostLinkSwitchEndpoint(edge, sourceId, targetId))}"
               data-edge-label="${escapeHtml(label)}"
               tabindex="0">
                <line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}"></line>
                <text x="${labelPosition.x}" y="${labelPosition.y}">${escapeHtml(label)}</text>
            </g>
        `;
    }

    function getEdgeLabelPosition(source, target, type, label = '', edge = null) {
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const length = Math.hypot(dx, dy) || 1;
        const normalX = -dy / length;
        const normalY = dx / length;

        if (type === 'host-link') {
            const switchIsSource = Boolean(edge?.['source-s']);
            const switchPoint = switchIsSource ? source : target;
            const hostPoint = switchIsSource ? target : source;
            const switchDx = hostPoint.x - switchPoint.x;
            const switchDy = hostPoint.y - switchPoint.y;
            const switchLength = Math.hypot(switchDx, switchDy) || 1;
            const fromSwitchDistance = 78;
            const sideOffset = Math.abs(switchDy) < 18 ? 42 : 30;

            return {
                x: switchPoint.x + (switchDx / switchLength) * fromSwitchDistance + normalX * sideOffset,
                y: switchPoint.y + (switchDy / switchLength) * fromSwitchDistance + normalY * sideOffset
            };
        }

        const offset = type === 'host-link' ? 42 : 18;
        const along = type === 'host-link' ? Math.min(52, Math.max(24, String(label).length * 2.2)) : 0;
        const direction = dx >= 0 ? 1 : -1;

        return {
            x: midX + normalX * offset + (dx / length) * along * direction,
            y: midY + normalY * offset
        };
    }

    function getHostLinkSwitchEndpoint(edge, sourceId, targetId) {
        if (edge.type !== 'host-link') {
            return '';
        }

        if (edge['source-s'] && edge['source-s'] === sourceId) {
            return 'source';
        }

        if (edge['target-s'] && edge['target-s'] === targetId) {
            return 'target';
        }

        return String(sourceId).startsWith('s') ? 'source' : 'target';
    }

    function renderNode(node, position) {
        const isSwitch = node.type === 'switch';
        const title = node.name || node.id;
        const ip = Array.isArray(node.ipv4) && node.ipv4.length ? node.ipv4[0] : '';
        const blocked = isNodeBlocked(node);
        const nodeClass = [
            'topology-node',
            isSwitch ? 'is-switch' : 'is-host',
            blocked ? 'is-blocked' : '',
            node.connected === false ? 'is-disconnected' : ''
        ].filter(Boolean).join(' ');

        return `
            <g class="${nodeClass}" transform="translate(${position.x} ${position.y})" data-detail-type="node" data-detail-id="${escapeHtml(node.id)}" data-node-id="${escapeHtml(node.id)}" tabindex="0">
                ${isSwitch ? '<rect x="-48" y="-36" width="96" height="72" rx="10"></rect>' : '<circle r="39"></circle>'}
                ${isSwitch ? renderSwitchIcon() : renderHostIcon()}
                <text class="node-title" y="${isSwitch ? 20 : 18}">${escapeHtml(title)}</text>
                ${ip ? `<text class="node-subtitle" y="62">${escapeHtml(ip)}</text>` : ''}
            </g>
        `;
    }

    function renderSwitchIcon() {
        return `
            <g class="node-icon node-icon-switch" transform="translate(0 -12)">
                <rect x="-22" y="-9" width="44" height="18" rx="4"></rect>
                <circle cx="-12" cy="0" r="2.4"></circle>
                <circle cx="0" cy="0" r="2.4"></circle>
                <circle cx="12" cy="0" r="2.4"></circle>
            </g>
        `;
    }

    function renderHostIcon() {
        return `
            <g class="node-icon node-icon-host" transform="translate(0 -13)">
                <rect x="-16" y="-10" width="32" height="20" rx="3"></rect>
                <line x1="-6" y1="15" x2="6" y2="15"></line>
                <line x1="0" y1="10" x2="0" y2="15"></line>
            </g>
        `;
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
            const text = edgeElement.querySelector('text');
            const labelPosition = getEdgeLabelPosition(source, target, edgeElement.dataset.edgeType, edgeElement.dataset.edgeLabel, {
                'source-s': edgeElement.dataset.switchEndpoint === 'source' ? edgeElement.dataset.sourceId : '',
                'target-s': edgeElement.dataset.switchEndpoint === 'target' ? edgeElement.dataset.targetId : ''
            });

            line.setAttribute('x1', source.x);
            line.setAttribute('y1', source.y);
            line.setAttribute('x2', target.x);
            line.setAttribute('y2', target.y);
            text.setAttribute('x', labelPosition.x);
            text.setAttribute('y', labelPosition.y);
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
            ${renderLiveInventoryDeleteControl(isSwitch ? 'switch' : 'host', title)}
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
            ${renderLiveInventoryDeleteControl('link', title)}
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

    function renderLiveInventoryDeleteControl(type, label) {
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
                <h4>Inventario vivo</h4>
                <button type="button"
                        class="contextual-action-button is-danger live-inventory-delete-button"
                        data-live-delete-trigger>
                    <i class="fas fa-trash"></i>
                    ${escapeHtml(labels[type] || 'Borrar elemento')}
                </button>
                <p class="edge-degradation-note">Vas a modificar Mininet en vivo: ${escapeHtml(label || 'elemento seleccionado')}.</p>
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

    function renderEmptyDetail() {
        return '<p class="detail-help">No se pudo cargar el detalle seleccionado.</p>';
    }

    function detailRow(label, value) {
        const visibleValue = value === null ? 'Sin configurar' : value;
        return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(visibleValue)}</dd></div>`;
    }

    function detailSection(title, rows) {
        const renderedRows = rows
            .filter(([, value]) => value !== undefined)
            .map(([label, value]) => detailRow(label, value))
            .join('');

        if (!renderedRows) {
            return '';
        }

        return `
            <section class="detail-section">
                <h4>${escapeHtml(title)}</h4>
                <dl class="detail-list">${renderedRows}</dl>
            </section>
        `;
    }

    function renderExtraSection(item, knownKeys) {
        const extraRows = Object.keys(item)
            .filter(key => !knownKeys.includes(key))
            .map(key => [key, formatValue(item[key])]);

        return detailSection('Otros datos', extraRows);
    }

    function getSwitchPorts(switchId, edges) {
        const ports = [];

        edges.forEach(edge => {
            if (edge.type === 'host-link' && edge['target-s'] === switchId) {
                ports.push({
                    port: edge['s-port'],
                    iface: edge['s-iface'],
                    neighbor: edge['source-h'],
                    kind: 'Host',
                    enabled: edge.enabled,
                    forwarding: edge.forwarding,
                    discovered: edge.discovered,
                    state: edge.state,
                    adminState: edge.admin_state,
                    stpState: edge.stp_state,
                    stpBlocked: edge.stp_blocked
                });
            }

            if (edge.type === 'switch-link' && edge.source === switchId) {
                ports.push({
                    port: edge.src_port,
                    iface: edge.src_iface,
                    neighbor: edge.target,
                    kind: 'Switch',
                    enabled: edge.enabled,
                    forwarding: edge.forwarding,
                    discovered: edge.discovered,
                    state: edge.state,
                    adminState: edge.admin_state?.src,
                    stpState: edge.stp?.src_state,
                    stpBlocked: edge.stp?.src_blocked
                });
            }

            if (edge.type === 'switch-link' && edge.target === switchId) {
                ports.push({
                    port: edge.dst_port,
                    iface: edge.dst_iface,
                    neighbor: edge.source,
                    kind: 'Switch',
                    enabled: edge.enabled,
                    forwarding: edge.forwarding,
                    discovered: edge.discovered,
                    state: edge.state,
                    adminState: edge.admin_state?.dst,
                    stpState: edge.stp?.dst_state,
                    stpBlocked: edge.stp?.dst_blocked
                });
            }
        });

        return ports.sort((left, right) => Number(left.port || 0) - Number(right.port || 0));
    }

    function renderSwitchPortsSection(ports) {
        if (!ports.length) {
            return detailSection('Puertos del switch', [['Puertos activos', 'Ninguno detectado']]);
        }

        const cards = ports.map(port => `
            <article class="switch-port-card">
                <div class="switch-port-main">
                    <strong>${escapeHtml(port.iface || `Puerto ${port.port}`)}</strong>
                    <span>${escapeHtml(port.kind)} ${escapeHtml(port.neighbor || 'sin vecino')}</span>
                </div>
                <div class="switch-port-tags">
                    ${statusBadge(port.enabled !== false ? 'Activo' : 'Inactivo', port.enabled !== false ? 'is-success' : 'is-danger')}
                    ${statusBadge(`STP: ${formatStpState(port.stpState, port.stpBlocked, port.forwarding)}`, port.stpBlocked ? 'is-warning' : 'is-success')}
                </div>
                <dl class="switch-port-list">
                    ${detailRow('Puerto', port.port)}
                    ${detailRow('Estado', formatState(port.state))}
                    ${detailRow('Administrativo', formatState(port.adminState))}
                    ${detailRow('STP', formatStpState(port.stpState, port.stpBlocked, port.forwarding))}
                    ${detailRow('Bloqueado por STP', formatBoolean(port.stpBlocked))}
                    ${detailRow('Descubierto', formatBoolean(port.discovered))}
                </dl>
            </article>
        `).join('');

        return `
            <section class="detail-section">
                <h4>Puertos del switch</h4>
                <div class="switch-port-listing">${cards}</div>
            </section>
        `;
    }

    function statusBadge(text, type) {
        return `<span class="detail-badge ${type}">${escapeHtml(text)}</span>`;
    }

    function formatList(value) {
        if (!Array.isArray(value)) {
            return undefined;
        }

        return value.length ? value.join(', ') : 'Ninguna';
    }

    function formatBoolean(value) {
        if (value === undefined) {
            return undefined;
        }

        if (value === null) {
            return 'No disponible';
        }

        return value ? 'Si' : 'No';
    }

    function formatValue(value) {
        if (Array.isArray(value)) {
            return formatList(value);
        }

        if (value && typeof value === 'object') {
            return JSON.stringify(value);
        }

        if (typeof value === 'boolean') {
            return formatBoolean(value);
        }

        return formatHealth(formatTrafficState(formatType(formatState(value))));
    }

    function formatType(value) {
        const labels = {
            switch: 'Switch',
            host: 'Host',
            'host-link': 'Enlace host-switch',
            'switch-link': 'Enlace entre switches'
        };

        return labels[value] || value;
    }

    function formatState(value) {
        const labels = {
            up: 'Activo',
            down: 'Desactivado',
            disabled: 'Deshabilitado',
            deleted: 'Eliminado',
            switch_removed: 'Switch eliminado',
            blocked_by_stp: 'Bloqueado para evitar bucles',
            stp_unknown: 'Control de bucles pendiente',
            stp_converging: 'Recalculando ruta',
            connected: 'Conectado',
            disconnected: 'Desconectado',
            running: 'En ejecucion',
            allowed: 'Permitido',
            blocked: 'Bloqueado',
            enabled: 'Habilitado',
            disabled: 'Deshabilitado'
        };

        return labels[value] || value;
    }

    function formatTrafficState(value) {
        const labels = {
            allowed: 'Trafico permitido',
            blocked: 'Trafico bloqueado'
        };

        return labels[value] || formatState(value);
    }

    function formatForwarding(value) {
        if (value === undefined) {
            return undefined;
        }

        if (value === null) {
            return 'Sin configurar';
        }

        return value ? 'Enviando trafico' : 'No envia trafico';
    }

    function formatHealth(value) {
        const labels = {
            healthy: 'Salud correcta',
            warning: 'Salud con aviso',
            degraded: 'Salud degradada',
            down: 'Desactivado'
        };

        return labels[value] || value;
    }

    function formatDegradation(value) {
        const labels = {
            healthy: 'Sin degradacion',
            warning: 'Aviso de degradacion',
            degraded: 'Degradado',
            down: 'Desactivado'
        };

        return labels[value] || value;
    }

    function formatStpState(value, blocked, forwarding) {
        if (blocked === true) {
            return 'Bloqueado para evitar bucles';
        }

        if (forwarding === true && Number(value) === 4) {
            return 'Reenviando trafico';
        }

        const labels = {
            0: 'Control de bucles desactivado',
            1: 'Bloqueado para evitar bucles',
            2: 'Recalculando ruta',
            3: 'Recalculando ruta',
            4: 'Reenviando trafico'
        };

        if (value === undefined) {
            return undefined;
        }

        if (value === null) {
            return 'Sin configurar';
        }

        return labels[Number(value)] || `Estado de control de bucles ${value}`;
    }

    function formatTime(date) {
        if (!date) {
            return 'Pendiente';
        }

        return date.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    function formatTcValue(value) {
        return value === undefined ? undefined : value;
    }

    function formatLossValue(value) {
        if (value === undefined) {
            return undefined;
        }

        if (value === null || value === '') {
            return value;
        }

        return String(value).endsWith('%') ? value : `${value}%`;
    }

    function isNodeBlocked(node) {
        if (node.type === 'switch') {
            return false;
        }

        return Boolean(
            node.ip_blocked ||
            node.traffic_blocked ||
            (Array.isArray(node.blocked_ipv4) && node.blocked_ipv4.length)
        );
    }

    function isEdgeUp(edge) {
        return !isEdgeDown(edge);
    }

    function isEdgeDown(edge) {
        const state = normalizeStateValue(edge.state);
        const adminState = normalizeStateValue(edge.admin_state);
        const srcAdminState = normalizeStateValue(edge.admin_state?.src);
        const dstAdminState = normalizeStateValue(edge.admin_state?.dst);
        const inventoryState = normalizeStateValue(edge.inventory_state);

        return Boolean(
            edge.enabled === false ||
            edge.manual_disabled === true ||
            state === 'down' ||
            state === 'disabled' ||
            adminState === 'down' ||
            adminState === 'disabled' ||
            srcAdminState === 'down' ||
            srcAdminState === 'disabled' ||
            dstAdminState === 'down' ||
            dstAdminState === 'disabled' ||
            inventoryState === 'down' ||
            inventoryState === 'disabled'
        );
    }

    function isEdgeBlocked(edge) {
        if (isEdgeDown(edge)) {
            return false;
        }

        const state = normalizeStateValue(edge.state);

        return Boolean(
            state === 'blocked_by_stp' ||
            state === 'stp_converging' ||
            state === 'stp_unknown' ||
            edge.stp_blocked ||
            edge.host_ip_blocked ||
            edge.stp?.src_blocked ||
            edge.stp?.dst_blocked ||
            edge.forwarding === false
        );
    }

    function normalizeStateValue(value) {
        return typeof value === 'string' ? value.toLowerCase() : value;
    }

    function getEdgeDegradation(edge) {
        return edge['degradation-link'] || edge.src_degradation || edge.dst_degradation || 'healthy';
    }

    function isEdgeDegraded(edge) {
        return [edge['degradation-link'], edge.src_degradation, edge.dst_degradation]
            .filter(Boolean)
            .some(value => value !== 'healthy');
    }

    function formatEdgeState(edge) {
        return formatState(edge.state) || (isEdgeUp(edge) ? 'Activo' : 'Desactivado');
    }

    function getEdgeStateBadgeClass(edge) {
        if (isEdgeBlocked(edge) || edge.state === 'stp_converging' || edge.state === 'stp_unknown') {
            return 'is-warning';
        }

        return isEdgeUp(edge) ? 'is-success' : 'is-danger';
    }

    function renderEdgeTrafficBadge(edge) {
        if (isEdgeDown(edge)) {
            return statusBadge('Enlace deshabilitado', 'is-danger');
        }

        if (isEdgeBlocked(edge)) {
            return statusBadge('Bloqueado por STP', 'is-warning');
        }

        return statusBadge('Enviando trafico', 'is-success');
    }

    function formatAdminState(edge) {
        if (typeof edge.admin_state === 'object' && edge.admin_state) {
            return `origen: ${formatState(edge.admin_state.src) || 'N/D'}, destino: ${formatState(edge.admin_state.dst) || 'N/D'}`;
        }

        return formatState(edge.admin_state || edge.inventory_state);
    }

    function formatStp(edge) {
        if (edge.stp) {
            return `origen: ${formatStpState(edge.stp.src_state)}, destino: ${formatStpState(edge.stp.dst_state)}`;
        }

        return formatStpState(edge.stp_state);
    }

    function formatTc(edge, key) {
        const values = [edge.tc_sw_port?.[key], edge.src_tc?.[key], edge.dst_tc?.[key]].filter(value => value !== null && value !== undefined);
        return values.length ? values.join(' / ') : undefined;
    }

    function parseResponseJson(value) {
        try {
            return JSON.parse(value);
        } catch (error) {
            return {};
        }
    }

    function compactObject(value) {
        return Object.fromEntries(Object.entries(value)
            .filter(([, child]) => child !== undefined && child !== null && child !== ''));
    }

    function normalizeNodeName(value) {
        return String(value || '').trim().toLowerCase();
    }

    function numberOrUndefined(value) {
        if (value === undefined || value === null || value === '') {
            return undefined;
        }

        const number = Number(value);
        return Number.isFinite(number) ? number : undefined;
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
})();
