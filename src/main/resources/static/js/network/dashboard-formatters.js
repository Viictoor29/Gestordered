export function renderEmptyDetail() {
    return '<p class="detail-help">No se pudo cargar el detalle seleccionado.</p>';
}

export function detailRow(label, value) {
    const visibleValue = value === null ? 'Sin configurar' : value;
    return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(visibleValue)}</dd></div>`;
}

export function detailSection(title, rows) {
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

export function renderExtraSection(item, knownKeys) {
    const extraRows = Object.keys(item)
        .filter(key => !knownKeys.includes(key))
        .map(key => [key, formatValue(item[key])]);

    return detailSection('Otros datos', extraRows);
}

export function getSwitchPorts(switchId, edges) {
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

export function renderSwitchPortsSection(ports) {
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

export function statusBadge(text, type) {
    return `<span class="detail-badge ${type}">${escapeHtml(text)}</span>`;
}

export function formatList(value) {
    if (!Array.isArray(value)) {
        return undefined;
    }

    return value.length ? value.join(', ') : 'Ninguna';
}

export function formatBoolean(value) {
    if (value === undefined) {
        return undefined;
    }

    if (value === null) {
        return 'No disponible';
    }

    return value ? 'Si' : 'No';
}

export function formatValue(value) {
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

export function formatType(value) {
    const labels = {
        switch: 'Switch',
        host: 'Host',
        'host-link': 'Enlace host-switch',
        'switch-link': 'Enlace entre switches'
    };

    return labels[value] || value;
}

export function formatState(value) {
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

export function formatTrafficState(value) {
    const labels = {
        allowed: 'Trafico permitido',
        blocked: 'Trafico bloqueado'
    };

    return labels[value] || formatState(value);
}

export function formatForwarding(value) {
    if (value === undefined) {
        return undefined;
    }

    if (value === null) {
        return 'Sin configurar';
    }

    return value ? 'Enviando trafico' : 'No envia trafico';
}

export function formatHealth(value) {
    const labels = {
        healthy: 'Salud correcta',
        warning: 'Salud con aviso',
        degraded: 'Salud degradada',
        down: 'Desactivado'
    };

    return labels[value] || value;
}

export function formatDegradation(value) {
    const labels = {
        healthy: 'Sin degradacion',
        warning: 'Aviso de degradacion',
        degraded: 'Degradado',
        down: 'Desactivado'
    };

    return labels[value] || value;
}

export function formatStpState(value, blocked, forwarding) {
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

export function formatTime(date) {
    if (!date) {
        return 'Pendiente';
    }

    return date.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

export function formatTcValue(value) {
    return value === undefined ? undefined : value;
}

export function formatLossValue(value) {
    if (value === undefined) {
        return undefined;
    }

    if (value === null || value === '') {
        return value;
    }

    return String(value).endsWith('%') ? value : `${value}%`;
}

export function isNodeBlocked(node) {
    if (node.type === 'switch') {
        return false;
    }

    return Boolean(
        node.ip_blocked ||
        node.traffic_blocked ||
        (Array.isArray(node.blocked_ipv4) && node.blocked_ipv4.length)
    );
}

export function isEdgeUp(edge) {
    return !isEdgeDown(edge);
}

export function isEdgeDown(edge) {
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

export function isEdgeBlocked(edge) {
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

export function normalizeStateValue(value) {
    return typeof value === 'string' ? value.toLowerCase() : value;
}

export function getEdgeDegradation(edge) {
    return edge['degradation-link'] || edge.src_degradation || edge.dst_degradation || 'healthy';
}

export function isEdgeDegraded(edge) {
    return [edge['degradation-link'], edge.src_degradation, edge.dst_degradation]
        .filter(Boolean)
        .some(value => value !== 'healthy');
}

export function formatEdgeState(edge) {
    return formatState(edge.state) || (isEdgeUp(edge) ? 'Activo' : 'Desactivado');
}

export function getEdgeStateBadgeClass(edge) {
    if (isEdgeBlocked(edge) || edge.state === 'stp_converging' || edge.state === 'stp_unknown') {
        return 'is-warning';
    }

    return isEdgeUp(edge) ? 'is-success' : 'is-danger';
}

export function renderEdgeTrafficBadge(edge) {
    if (isEdgeDown(edge)) {
        return statusBadge('Enlace deshabilitado', 'is-danger');
    }

    if (isEdgeBlocked(edge)) {
        return statusBadge('Bloqueado por STP', 'is-warning');
    }

    return statusBadge('Enviando trafico', 'is-success');
}

export function formatAdminState(edge) {
    if (typeof edge.admin_state === 'object' && edge.admin_state) {
        return `origen: ${formatState(edge.admin_state.src) || 'N/D'}, destino: ${formatState(edge.admin_state.dst) || 'N/D'}`;
    }

    return formatState(edge.admin_state || edge.inventory_state);
}

export function formatStp(edge) {
    if (edge.stp) {
        return `origen: ${formatStpState(edge.stp.src_state)}, destino: ${formatStpState(edge.stp.dst_state)}`;
    }

    return formatStpState(edge.stp_state);
}

export function formatTc(edge, key) {
    const values = [edge.tc_sw_port?.[key], edge.src_tc?.[key], edge.dst_tc?.[key]].filter(value => value !== null && value !== undefined);
    return values.length ? values.join(' / ') : undefined;
}

export function parseResponseJson(value) {
    try {
        return JSON.parse(value);
    } catch (error) {
        return {};
    }
}

export function compactObject(value) {
    return Object.fromEntries(Object.entries(value)
        .filter(([, child]) => child !== undefined && child !== null && child !== ''));
}

export function normalizeNodeName(value) {
    return String(value || '').trim().toLowerCase();
}

export function numberOrUndefined(value) {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
}

export function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
