import { escapeHtml, normalizeNodeName } from './dashboard-formatters.js';

export function renderPendingMininetDiscovery(stage, nodes, edges, payload) {
    const target = stage.querySelector('[data-mininet-pending-discovery]');
    if (!target || !payload) {
        return;
    }

    const mininet = payload.topology?.mininet || payload.mininet || payload;
    const ryuNodeNames = new Set(nodes.map(node => normalizeNodeName(node.name || node.id)));
    const mininetNodeNames = [
        ...normalizeMininetNodeNames(payload.hosts || mininet.hosts),
        ...normalizeMininetNodeNames(payload.switches || mininet.switches)
    ];
    const pendingNodes = [...new Set(mininetNodeNames.filter(name => name && !ryuNodeNames.has(name)))];
    const ryuLinkNames = new Set(edges.map(edge => normalizeLinkPair(
        edge.source || edge['source-h'] || edge['source-s'],
        edge.target || edge['target-s'] || edge['target-h']
    )));
    const mininetLinks = Array.isArray(payload.links) ? payload.links : (Array.isArray(mininet.links) ? mininet.links : []);
    const pendingLinks = mininetLinks
        .map(normalizeMininetLinkPair)
        .filter(Boolean)
        .filter(pair => !ryuLinkNames.has(pair));

    if (!pendingNodes.length && !pendingLinks.length) {
        target.hidden = true;
        target.innerHTML = '';
        return;
    }

    const details = [];
    if (pendingNodes.length) {
        details.push(`Nodos pendientes: ${pendingNodes.join(', ')}.`);
    }
    if (pendingLinks.length) {
        details.push(`Enlaces pendientes: ${[...new Set(pendingLinks)].join(', ')}.`);
    }

    target.hidden = false;
    target.innerHTML = `
        <i class="fas fa-clock-rotate-left"></i>
        <div>
            <strong>Mininet ya contiene cambios que Ryu todavia no ha descubierto.</strong>
            <span>${escapeHtml(details.join(' '))} Apareceran en el mapa cuando se conecten y se genere trafico.</span>
        </div>
    `;
}

function normalizeMininetNodeNames(items) {
    if (!Array.isArray(items)) {
        return [];
    }

    return items
        .map(item => normalizeNodeName(typeof item === 'string' ? item : item?.name || item?.id || item?.node))
        .filter(Boolean);
}

function normalizeMininetLinkPair(link) {
    if (typeof link === 'string') {
        const names = extractPhysicalLinkNodes(link);
        return names.length >= 2 ? normalizeLinkPair(names[0], names[1]) : '';
    }

    if (!link || typeof link !== 'object') {
        return '';
    }

    return normalizeLinkPair(
        link.node1 || link.source || link['source-h'] || link['source-s'] || link.src?.node,
        link.node2 || link.target || link['target-h'] || link['target-s'] || link.dst?.node
    );
}

function extractPhysicalLinkNodes(link) {
    return String(link || '')
        .split('<->')
        .map(endpoint => endpoint.trim().match(/^(.+?)-eth\d+$/i)?.[1] || '')
        .map(normalizeNodeName)
        .filter(Boolean);
}

function normalizeLinkPair(left, right) {
    const endpoints = [normalizeNodeName(left), normalizeNodeName(right)].filter(Boolean).sort();
    return endpoints.length === 2 ? endpoints.join(' - ') : '';
}

