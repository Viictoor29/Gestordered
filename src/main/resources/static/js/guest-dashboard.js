(() => {
    const form = document.querySelector('[data-server-form]');
    const input = document.querySelector('[data-server-input]');
    const button = document.querySelector('[data-server-connect]');
    const status = document.querySelector('[data-server-status]');
    const stage = document.querySelector('[data-topology-stage]');

    if (!form || !input || !button || !status || !stage) {
        return;
    }

    const savedServer = localStorage.getItem('gestordered-api-server');
    if (savedServer) {
        input.value = savedServer;
    }

    form.addEventListener('submit', event => {
        event.preventDefault();
        loadTopology();
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

    async function loadTopology() {
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

        setLoading(true);
        setStatus('loading', 'Conectando');

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
            setStatus('connected', 'Conectado');
            renderTopology(nodes, edges);
        } catch (error) {
            setStatus('error', 'Sin conexion');
            renderMessage('No se pudo cargar la topologia', 'Comprueba que la API este levantada y permita peticiones desde esta web.');
        } finally {
            setLoading(false);
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

        stage.innerHTML = `
            <div class="topology-meta">
                ${renderMetric('Switches', summary.switches, 'fa-network-wired')}
                ${renderMetric('Hosts', summary.hosts, 'fa-desktop')}
                ${renderMetric('Enlaces activos', summary.linksUp, 'fa-link')}
                ${renderMetric('Bloqueos', summary.blocked, 'fa-ban', summary.blocked ? 'is-warning' : '')}
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

        bindTopologySelection(nodes, edges);
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
                ${detailRow('Enlaces degradados', summary.degraded)}
            </dl>
            <p class="detail-help">Selecciona un nodo o enlace del mapa para consultar sus datos completos.</p>
        `;
    }

    function buildLayout(nodes, edges) {
        const width = 1100;
        const height = 560;
        const switches = nodes.filter(node => node.type === 'switch');
        const hosts = nodes.filter(node => node.type !== 'switch');
        const positions = {};

        switches.forEach((node, index) => {
            positions[node.id] = pointOnRow(index, switches.length, 190, width - 190, height / 2);
        });

        hosts.forEach((node, index) => {
            const linkedSwitchId = findLinkedSwitch(node.id, edges);
            const anchor = positions[linkedSwitchId] || pointOnRow(index, hosts.length, 160, width - 160, height / 2);
            const hostNumber = hosts.filter(host => findLinkedSwitch(host.id, edges) === linkedSwitchId).findIndex(host => host.id === node.id);
            const direction = hostNumber % 2 === 0 ? -1 : 1;
            const offset = Math.floor(hostNumber / 2) * 90;

            positions[node.id] = {
                x: Math.max(90, Math.min(width - 90, anchor.x + direction * (115 + offset))),
                y: direction < 0 ? 115 : height - 115
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

        return `
            <g class="topology-edge ${isUp ? 'is-up' : 'is-down'} ${isBlocked ? 'is-blocked' : ''}" data-detail-type="edge" data-detail-id="${index}" tabindex="0">
                <line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}"></line>
                <text x="${(source.x + target.x) / 2}" y="${(source.y + target.y) / 2 - 8}">${escapeHtml(label)}</text>
            </g>
        `;
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
                ${isSwitch ? '<rect x="-34" y="-26" width="68" height="52" rx="8"></rect>' : '<circle r="28"></circle>'}
                <text class="node-title" y="${isSwitch ? 5 : 2}">${escapeHtml(title)}</text>
                ${ip ? `<text class="node-subtitle" y="44">${escapeHtml(ip)}</text>` : ''}
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
            detail.innerHTML = renderNodeDetail(node);
            return;
        }

        const edge = edges[Number(item.dataset.detailId)];
        detail.innerHTML = renderEdgeDetail(edge);
    }

    function renderNodeDetail(node) {
        if (!node) {
            return renderEmptyDetail();
        }

        const isSwitch = node.type === 'switch';
        const title = node.name || node.id;
        const state = node.connected === false ? 'Desconectado' : node.state || 'Activo';
        const traffic = node.traffic_state || (node.traffic_blocked ? 'blocked' : 'allowed');
        const trafficFilters = node.traffic_filters || {};

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
                ['Tipo', node.type],
                ['Nombre', node.name],
                ['MAC', node.mac]
            ])}
            ${detailSection('Direccionamiento', [
                ['IPv4', formatList(node.ipv4)],
                ['IPv6', formatList(node.ipv6)]
            ])}
            ${detailSection('Estado y filtros', [
                ['Conectado', formatBoolean(node.connected)],
                ['Estado', node.state],
                ['IP bloqueada', formatBoolean(node.ip_blocked)],
                ['Trafico bloqueado', formatBoolean(node.traffic_blocked)],
                ['Estado de trafico', traffic],
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

        return `
            <div class="detail-heading">
                <span class="detail-icon is-link"><i class="fas fa-link"></i></span>
                <div>
                    <p>${escapeHtml(isHostLink ? 'Enlace host-switch' : 'Enlace switch-switch')}</p>
                    <h3>${escapeHtml(title)}</h3>
                </div>
            </div>
            <div class="detail-badges">
                ${statusBadge(isEdgeUp(edge) ? 'Activo' : 'Caido', isEdgeUp(edge) ? 'is-success' : 'is-danger')}
                ${statusBadge(degradation, degradation === 'healthy' ? 'is-success' : 'is-warning')}
                ${statusBadge(isEdgeBlocked(edge) ? 'STP bloqueado' : 'Forwarding', isEdgeBlocked(edge) ? 'is-warning' : 'is-success')}
            </div>
            ${detailSection('Extremos', [
                ['Tipo', edge.type],
                ['Host origen', edge['source-h']],
                ['Switch destino', edge['target-s']],
                ['Switch origen', edge.source],
                ['Switch destino', edge.target],
                ['MAC host', edge.mac],
                ['Puerto origen', edge.src_port],
                ['Puerto destino', edge.dst_port],
                ['Puerto switch', edge['s-port']],
                ['Interfaz origen', edge.src_iface],
                ['Interfaz destino', edge.dst_iface],
                ['Interfaz switch', edge['s-iface']]
            ])}
            ${detailSection('Estado operativo', [
                ['Estado', edge.state],
                ['Habilitado', formatBoolean(edge.enabled)],
                ['Forwarding', formatBoolean(edge.forwarding)],
                ['Descubierto', formatBoolean(edge.discovered)],
                ['Estado inventario', edge.inventory_state],
                ['Deshabilitado manualmente', formatBoolean(edge.manual_disabled)],
                ['Estado admin', formatAdminState(edge)],
                ['IPs bloqueadas', formatList(edge.blocked_ipv4)]
            ])}
            ${detailSection('STP', [
                ['Estado STP', edge.stp_state],
                ['STP bloqueado', formatBoolean(edge.stp_blocked)],
                ['STP origen', edge.stp?.src_state],
                ['STP destino', edge.stp?.dst_state],
                ['Origen bloqueado', formatBoolean(edge.stp?.src_blocked)],
                ['Destino bloqueado', formatBoolean(edge.stp?.dst_blocked)]
            ])}
            ${detailSection('Calidad y degradacion', [
                ['Delay switch-host', edge.tc_sw_port?.delay],
                ['Loss switch-host', edge.tc_sw_port?.loss],
                ['Bandwidth switch-host', edge.tc_sw_port?.bandwidth],
                ['Delay origen', edge.src_tc?.delay],
                ['Loss origen', edge.src_tc?.loss],
                ['Bandwidth origen', edge.src_tc?.bandwidth],
                ['Delay destino', edge.dst_tc?.delay],
                ['Loss destino', edge.dst_tc?.loss],
                ['Bandwidth destino', edge.dst_tc?.bandwidth],
                ['Degradacion origen', edge.src_degradation],
                ['Degradacion destino', edge.dst_degradation],
                ['Degradacion enlace', edge['degradation-link']]
            ])}
            ${renderExtraSection(edge, ['type', 'source-h', 'target-s', 'source', 'target', 'mac', 'src_port', 'dst_port', 's-port', 'src_iface', 'dst_iface', 's-iface', 'state', 'enabled', 'forwarding', 'discovered', 'inventory_state', 'manual_disabled', 'admin_state', 'blocked_ipv4', 'stp_state', 'stp_blocked', 'stp', 'tc_sw_port', 'src_tc', 'dst_tc', 'src_degradation', 'dst_degradation', 'degradation-link'])}
        `;
    }

    function renderEmptyDetail() {
        return '<p class="detail-help">No se pudo cargar el detalle seleccionado.</p>';
    }

    function detailRow(label, value) {
        const visibleValue = value === undefined || value === null || value === '' ? 'No disponible' : value;
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

    function statusBadge(text, type) {
        return `<span class="detail-badge ${type}">${escapeHtml(text)}</span>`;
    }

    function formatList(value) {
        return Array.isArray(value) && value.length ? value.join(', ') : 'No disponible';
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

        return value;
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
        return Boolean(edge.stp_blocked || edge.host_ip_blocked || edge.stp?.src_blocked || edge.stp?.dst_blocked);
    }

    function getEdgeDegradation(edge) {
        return edge['degradation-link'] || edge.src_degradation || edge.dst_degradation || 'healthy';
    }

    function isEdgeDegraded(edge) {
        return [edge['degradation-link'], edge.src_degradation, edge.dst_degradation]
            .filter(Boolean)
            .some(value => value !== 'healthy');
    }

    function formatAdminState(edge) {
        if (typeof edge.admin_state === 'object' && edge.admin_state) {
            return `src: ${edge.admin_state.src || 'N/D'}, dst: ${edge.admin_state.dst || 'N/D'}`;
        }

        return edge.admin_state || edge.inventory_state || 'No disponible';
    }

    function formatStp(edge) {
        if (edge.stp) {
            return `src: ${edge.stp.src_state ?? 'N/D'}, dst: ${edge.stp.dst_state ?? 'N/D'}`;
        }

        return edge.stp_state ?? 'No disponible';
    }

    function formatTc(edge, key) {
        const values = [edge.tc_sw_port?.[key], edge.src_tc?.[key], edge.dst_tc?.[key]].filter(value => value !== null && value !== undefined);
        return values.length ? values.join(' / ') : 'No aplicado';
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
