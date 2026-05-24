(() => {
    const form = document.querySelector('[data-server-form]');
    const input = document.querySelector('[data-server-input]');
    const button = document.querySelector('[data-server-connect]');
    const status = document.querySelector('[data-server-status]');
    const stage = document.querySelector('[data-topology-stage]');
    const refreshIntervalMs = 300000;
    let refreshTimer = null;
    let isLoadingTopology = false;
    let currentServer = '';
    let lastUpdatedAt = null;

    if (!form || !input || !button || !status || !stage) {
        return;
    }

    const savedServer = localStorage.getItem('gestordered-api-server');
    if (savedServer) {
        input.value = savedServer;
    }

    form.addEventListener('submit', event => {
        event.preventDefault();
        loadTopology({ manual: true });
    });

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
            const response = await fetch(`${baseUrl}/api/topology`, { headers: { Accept: 'application/json' } });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const payload = await response.json();
            const topology = payload.data || payload;
            const nodes = Array.isArray(topology.nodes) ? topology.nodes : [];
            const edges = Array.isArray(topology.edges) ? topology.edges : [];

            localStorage.setItem('gestordered-api-server', input.value.trim());
            lastUpdatedAt = new Date();
            setStatus('connected', 'Conectado');
            renderTopology(nodes, edges);
            startAutoRefresh();
        } catch (error) {
            setStatus('error', 'Sin conexion');
            renderMessage('No se pudo cargar la topologia', 'Comprueba que la API este levantada y permita peticiones desde esta web.');
            stopAutoRefresh();
        } finally {
            isLoadingTopology = false;
            setLoading(false);
        }
    }

    function startAutoRefresh() {
        stopAutoRefresh();
        refreshTimer = window.setInterval(() => {
            if (currentServer) {
                loadTopology();
            }
        }, refreshIntervalMs);
    }

    function stopAutoRefresh() {
        if (refreshTimer) {
            window.clearInterval(refreshTimer);
            refreshTimer = null;
        }
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
                <span><i class="fas fa-rotate"></i> Actualizacion automatica cada 5 minutos</span>
                <span>Ultima lectura: ${escapeHtml(formatTime(lastUpdatedAt))}</span>
                <button type="button" class="topology-refresh-button" data-refresh-topology>
                    <i class="fas fa-arrows-rotate"></i>
                    Actualizar ahora
                </button>
            </div>
            <div class="topology-workspace">
                <div class="topology-canvas">
                    <svg class="topology-map" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="Topologia de red">
                        ${svgEdges}
                        ${svgNodes}
                    </svg>
                    <div class="topology-legend" aria-label="Leyenda de estados">
                        <span><i class="legend-dot is-up"></i> Activo</span>
                        <span><i class="legend-dot is-down"></i> Caido</span>
                        <span><i class="legend-dot is-blocked"></i> Bloqueado</span>
                    </div>
                </div>
                <aside class="topology-detail" data-topology-detail>
                    ${renderOverviewDetail(summary)}
                </aside>
            </div>
        `;

        stage.style.setProperty('--topology-panel-height', `${panelHeight}px`);
        bindTopologySelection(nodes, edges);
        bindManualRefresh();
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
                ${detailRow('Enlaces caidos', summary.linksDown)}
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

        switches.forEach((node, index) => {
            positions[node.id] = pointOnRow(index, switches.length, 205, width - 205, height / 2 + 62);
        });

        hosts.forEach((node, index) => {
            const linkedSwitchId = findLinkedSwitch(node.id, edges);
            const anchor = positions[linkedSwitchId] || pointOnRow(index, hosts.length, 160, width - 160, height / 2);
            const hostNumber = hosts.filter(host => findLinkedSwitch(host.id, edges) === linkedSwitchId).findIndex(host => host.id === node.id);
            const direction = hostNumber % 2 === 0 ? -1 : 1;
            const offset = Math.floor(hostNumber / 2) * 90;

            positions[node.id] = {
                x: Math.max(95, Math.min(width - 95, anchor.x + direction * (130 + offset))),
                y: direction < 0 ? 105 : height - 105
            };
        });

        nodes.forEach((node, index) => {
            if (!positions[node.id]) {
                positions[node.id] = pointOnRow(index, nodes.length, 100, width - 100, height / 2);
            }
        });

        return { width, height, positions };
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
        const labelPosition = getEdgeLabelPosition(source, target, edge.type);

        return `
            <g class="topology-edge ${isUp ? 'is-up' : 'is-down'} ${isBlocked ? 'is-blocked' : ''}" data-detail-type="edge" data-detail-id="${index}" tabindex="0">
                <line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}"></line>
                <text x="${labelPosition.x}" y="${labelPosition.y}">${escapeHtml(label)}</text>
            </g>
        `;
    }

    function getEdgeLabelPosition(source, target, type) {
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const length = Math.hypot(dx, dy) || 1;
        const normalX = -dy / length;
        const normalY = dx / length;
        const offset = type === 'host-link' ? 28 : 16;

        return {
            x: midX + normalX * offset,
            y: midY + normalY * offset
        };
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
            <g class="${nodeClass}" transform="translate(${position.x} ${position.y})" data-detail-type="node" data-detail-id="${escapeHtml(node.id)}" tabindex="0">
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
            item.addEventListener('click', () => selectTopologyItem(item, detail, nodes, edges));
            item.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectTopologyItem(item, detail, nodes, edges);
                }
            });
        });
    }

    function selectTopologyItem(item, detail, nodes, edges) {
        stage.querySelectorAll('.is-selected').forEach(selected => selected.classList.remove('is-selected'));
        item.classList.add('is-selected');

        if (item.dataset.detailType === 'node') {
            const node = nodes.find(candidate => candidate.id === item.dataset.detailId);
            detail.innerHTML = renderNodeDetail(node, edges);
            return;
        }

        const edge = edges[Number(item.dataset.detailId)];
        detail.innerHTML = renderEdgeDetail(edge);
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
                ${statusBadge(isNodeBlocked(node) ? 'Bloqueado' : 'Permitido', isNodeBlocked(node) ? 'is-danger' : 'is-success')}
            </div>
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
                ['Perdida de paquetes', formatTcValue(edge.tc_sw_port?.loss)],
                ['Ancho de banda', formatTcValue(edge.tc_sw_port?.bandwidth)]
            ]
            : [
                ['Retardo en origen', formatTcValue(edge.src_tc?.delay)],
                ['Perdida en origen', formatTcValue(edge.src_tc?.loss)],
                ['Ancho de banda en origen', formatTcValue(edge.src_tc?.bandwidth)],
                ['Retardo en destino', formatTcValue(edge.dst_tc?.delay)],
                ['Perdida en destino', formatTcValue(edge.dst_tc?.loss)],
                ['Ancho de banda en destino', formatTcValue(edge.dst_tc?.bandwidth)]
            ];
        const degradationRows = isHostLink
            ? [
                ['Degradacion del enlace', formatDegradation(edge['degradation-link'])]
            ]
            : [
                ['Degradacion en origen', formatDegradation(edge.src_degradation)],
                ['Degradacion en destino', formatDegradation(edge.dst_degradation)],
                ['Degradacion del enlace', formatDegradation(edge['degradation-link'])]
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
                ${statusBadge(formatEdgeState(edge), getEdgeStateBadgeClass(edge))}
                ${statusBadge(formatHealth(degradation), degradation === 'healthy' ? 'is-success' : 'is-warning')}
                ${statusBadge(isEdgeBlocked(edge) ? 'Bloqueado para evitar bucles' : 'Enviando trafico', isEdgeBlocked(edge) ? 'is-warning' : 'is-success')}
            </div>
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
            ${detailSection('Degradacion', degradationRows)}
            ${detailSection('STP', linkStpRows)}
            ${renderExtraSection(edge, ['type', 'source-h', 'target-s', 'source', 'target', 'mac', 'src_port', 'dst_port', 's-port', 'src_iface', 'dst_iface', 's-iface', 'state', 'enabled', 'forwarding', 'discovered', 'inventory_state', 'manual_disabled', 'admin_state', 'blocked_ipv4', 'stp_state', 'stp_blocked', 'stp', 'tc_sw_port', 'src_tc', 'dst_tc', 'src_degradation', 'dst_degradation', 'degradation-link'])}
        `;
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
                    ${statusBadge(formatForwarding(port.forwarding), port.forwarding ? 'is-success' : 'is-warning')}
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
            down: 'Caido',
            disabled: 'Deshabilitado',
            deleted: 'Eliminado',
            switch_removed: 'Switch eliminado',
            blocked_by_stp: 'Bloqueado para evitar bucles',
            stp_unknown: 'Control de bucles pendiente',
            stp_converging: 'Recalculando ruta',
            connected: 'Conectado',
            disconnected: 'Desconectado',
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
            down: 'Caido'
        };

        return labels[value] || value;
    }

    function formatDegradation(value) {
        const labels = {
            healthy: 'Sin degradacion',
            warning: 'Aviso de degradacion',
            degraded: 'Degradado',
            down: 'Caido'
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

    function isNodeBlocked(node) {
        return Boolean(
            node.ip_blocked ||
            node.traffic_blocked ||
            (Array.isArray(node.blocked_ipv4) && node.blocked_ipv4.length) ||
            (Array.isArray(node.traffic_filters?.blocked_ipv4) && node.traffic_filters.blocked_ipv4.length)
        );
    }

    function isEdgeUp(edge) {
        return edge.enabled !== false && edge.forwarding !== false && edge.state !== 'down';
    }

    function isEdgeBlocked(edge) {
        return Boolean(
            edge.state === 'blocked_by_stp' ||
            edge.stp_blocked ||
            edge.host_ip_blocked ||
            edge.stp?.src_blocked ||
            edge.stp?.dst_blocked
        );
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
        return formatState(edge.state) || (isEdgeUp(edge) ? 'Activo' : 'Caido');
    }

    function getEdgeStateBadgeClass(edge) {
        if (isEdgeBlocked(edge) || edge.state === 'stp_converging' || edge.state === 'stp_unknown') {
            return 'is-warning';
        }

        return isEdgeUp(edge) ? 'is-success' : 'is-danger';
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

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
})();
