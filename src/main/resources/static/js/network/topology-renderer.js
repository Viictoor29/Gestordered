import { escapeHtml, isEdgeBlocked, isEdgeUp, isNodeBlocked } from './dashboard-formatters.js';

export function buildLayout(nodes, edges, getSavedNodePosition) {
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

        const savedPosition = getSavedNodePosition(node.id);
        if (savedPosition) {
            positions[node.id] = {
                x: clamp(savedPosition.x, 70, width - 70),
                y: clamp(savedPosition.y, 72, height - 72)
            };
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

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function findLinkedSwitch(hostId, edges) {
    const hostEdge = edges.find(edge => edge['source-h'] === hostId || edge['target-h'] === hostId);
    return hostEdge ? hostEdge['target-s'] || hostEdge['source-s'] : null;
}

export function findHostLink(hostId, edges) {
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

export function renderEdge(edge, positions, index) {
    const sourceId = edge.source || edge['source-h'] || edge['source-s'];
    const targetId = edge.target || edge['target-s'] || edge['target-h'];
    const source = positions[sourceId];
    const target = positions[targetId];

    if (!source || !target) {
        return '';
    }

    const isUp = isEdgeUp(edge);
    const isBlocked = isEdgeBlocked(edge);
    const label = edge.type === 'host-link' ? `${edge['s-iface'] || ''}` : '';
    const sourceLabel = edge.type === 'switch-link' ? `${edge.src_iface || ''}` : '';
    const targetLabel = edge.type === 'switch-link' ? `${edge.dst_iface || ''}` : '';
    const labelPosition = getEdgeLabelPosition(source, target, edge.type, label, edge);
    const sourceLabelPosition = getSwitchEdgeEndpointLabelPosition(source, target, 'source');
    const targetLabelPosition = getSwitchEdgeEndpointLabelPosition(source, target, 'target');

    return `
        <g class="topology-edge ${isUp ? 'is-up' : 'is-down'} ${isBlocked ? 'is-blocked' : ''}"
           data-detail-type="edge"
           data-detail-id="${index}"
           data-source-id="${escapeHtml(sourceId)}"
           data-target-id="${escapeHtml(targetId)}"
           data-edge-type="${escapeHtml(edge.type)}"
            data-switch-endpoint="${escapeHtml(getHostLinkSwitchEndpoint(edge, sourceId, targetId))}"
            data-edge-label="${escapeHtml(label)}"
            data-source-label="${escapeHtml(sourceLabel)}"
            data-target-label="${escapeHtml(targetLabel)}"
            tabindex="0">
             <line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}"></line>
             ${edge.type === 'switch-link'
                ? `<text class="edge-endpoint-label is-source" x="${sourceLabelPosition.x}" y="${sourceLabelPosition.y}">${escapeHtml(sourceLabel)}</text>
                   <text class="edge-endpoint-label is-target" x="${targetLabelPosition.x}" y="${targetLabelPosition.y}">${escapeHtml(targetLabel)}</text>`
                : `<text x="${labelPosition.x}" y="${labelPosition.y}">${escapeHtml(label)}</text>`}
        </g>
    `;
}

export function getEdgeLabelPosition(source, target, type, label = '', edge = null) {
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

export function getSwitchEdgeEndpointLabelPosition(source, target, endpoint) {
    const from = endpoint === 'source' ? source : target;
    const to = endpoint === 'source' ? target : source;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const normalX = -dy / length;
    const normalY = dx / length;

    return {
        x: from.x + (dx / length) * 88 + normalX * 22,
        y: from.y + (dy / length) * 88 + normalY * 22
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

export function renderNode(node, position) {
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
