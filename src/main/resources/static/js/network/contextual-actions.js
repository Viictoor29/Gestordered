export function renderNodeIpTrafficControl(node) {
    if (!node || node.type === 'switch' || !Array.isArray(node.ipv4) || !node.ipv4.length) {
        return '';
    }

    const ip = normalizeIpForApi(node.ipv4[0]);
    const blocked = isNodeIpBlocked(node, ip);
    const blockDisabled = blocked ? 'disabled aria-disabled="true" title="La IP ya esta bloqueada"' : '';
    const unblockDisabled = blocked ? '' : 'disabled aria-disabled="true" title="La IP no esta bloqueada"';

    return `
        <section class="detail-section contextual-action-section">
            <h4>Gestionar trafico por IP</h4>
            <div class="contextual-actions" data-ip-traffic-actions data-ip="${escapeHtml(ip)}">
                <button type="button" class="contextual-action-button is-danger" data-ip-traffic-action="block" ${blockDisabled}>
                    <i class="fas fa-ban"></i>
                    Bloquear IP
                </button>
                <button type="button" class="contextual-action-button" data-ip-traffic-action="unblock" ${unblockDisabled}>
                    <i class="fas fa-unlock"></i>
                    Desbloquear IP
                </button>
                <div class="contextual-action-result" data-ip-traffic-result></div>
            </div>
        </section>
    `;
}

export function bindNodeIpTrafficActions(detail, node, context) {
    const actions = detail.querySelector('[data-ip-traffic-actions]');
    if (!actions || !node) {
        return;
    }

    const result = actions.querySelector('[data-ip-traffic-result]');
    actions.querySelectorAll('[data-ip-traffic-action]').forEach(button => {
        button.addEventListener('click', () => submitIpTrafficAction(actions.dataset.ip, button.dataset.ipTrafficAction, button, result, context));
    });
}

export function renderEdgeStateControl(edge) {
    if (!edge) {
        return '';
    }

    const endpoint = getEdgeSwitchEndpoint(edge);
    const disabled = isEdgeDisabled(edge);
    const disableDisabled = disabled ? 'disabled aria-disabled="true" title="El enlace ya esta deshabilitado"' : '';
    const enableDisabled = disabled ? '' : 'disabled aria-disabled="true" title="El enlace ya esta activo"';

    return `
        <section class="detail-section contextual-action-section">
            <h4>Cambiar estado del enlace</h4>
            <div class="contextual-actions"
                 data-edge-state-actions
                 data-edge-type="${escapeHtml(edge.type)}"
                 data-src-dpid="${escapeHtml(endpoint.srcDpid)}"
                 data-src-port="${escapeHtml(endpoint.srcPort)}"
                 data-dst-dpid="${escapeHtml(endpoint.dstDpid)}"
                 data-dst-port="${escapeHtml(endpoint.dstPort)}">
                <button type="button" class="contextual-action-button is-danger" data-edge-state-action="disable" ${disableDisabled}>
                    <i class="fas fa-power-off"></i>
                    Deshabilitar
                </button>
                <button type="button" class="contextual-action-button" data-edge-state-action="enable" ${enableDisabled}>
                    <i class="fas fa-plug-circle-bolt"></i>
                    Habilitar
                </button>
                <div class="contextual-action-result" data-edge-state-result></div>
            </div>
        </section>
    `;
}

export function bindEdgeStateActions(detail, edge, context) {
    const actions = detail.querySelector('[data-edge-state-actions]');
    if (!actions || !edge) {
        return;
    }

    const result = actions.querySelector('[data-edge-state-result]');
    actions.querySelectorAll('[data-edge-state-action]').forEach(button => {
        button.addEventListener('click', () => submitEdgeStateAction(actions, button.dataset.edgeStateAction, button, result, context));
    });
}

export function renderEdgeDegradationControl(edge) {
    if (!edge) {
        return '';
    }

    const endpoint = getEdgeSwitchEndpoint(edge);
    const isHostLink = edge.type === 'host-link';
    const note = isHostLink
        ? 'En enlaces switch-host se aplica el valor completo al puerto del switch.'
        : 'En enlaces switch-switch se envia la mitad del valor a cada extremo.';

    return `
        <section class="detail-section edge-action-section">
            <h4>Simular degradacion</h4>
            <form class="edge-degradation-form" data-edge-degradation-form>
                <input type="hidden" name="edge_type" value="${escapeHtml(edge.type)}">
                <input type="hidden" name="src_dpid" value="${escapeHtml(endpoint.srcDpid)}">
                <input type="hidden" name="src_port" value="${escapeHtml(endpoint.srcPort)}">
                <input type="hidden" name="dst_dpid" value="${escapeHtml(endpoint.dstDpid)}">
                <input type="hidden" name="dst_port" value="${escapeHtml(endpoint.dstPort)}">
                <label>
                    Tipo
                    <select name="metric" data-edge-degradation-metric>
                        <option value="loss">Perdida (%)</option>
                        <option value="bandwidth">Ancho de banda</option>
                        <option value="delay">Retardo</option>
                    </select>
                </label>
                <label data-edge-degradation-value-field>
                    Valor total
                    <input type="text" name="value" placeholder="100 / 10mbit / 100ms">
                </label>
                <p class="edge-degradation-note">${escapeHtml(note)}</p>
                <div class="edge-degradation-actions">
                    <button type="submit" class="contextual-action-button is-primary">
                        <i class="fas fa-sliders"></i>
                        Aplicar
                    </button>
                    <button type="button" class="contextual-action-button" data-edge-degradation-clear>
                        <i class="fas fa-eraser"></i>
                        Limpiar
                    </button>
                </div>
                <div class="edge-degradation-result" data-edge-degradation-result></div>
            </form>
        </section>
    `;
}

export function bindEdgeDegradationForm(detail, edge, context) {
    const form = detail.querySelector('[data-edge-degradation-form]');
    if (!form || !edge) {
        return;
    }

    const valueInput = form.querySelector('[data-edge-degradation-value-field] input');
    const result = form.querySelector('[data-edge-degradation-result]');
    const clearButton = form.querySelector('[data-edge-degradation-clear]');
    if (valueInput) {
        valueInput.required = true;
    }

    form.addEventListener('submit', event => {
        event.preventDefault();
        submitEdgeDegradation(form, result, form.querySelector('button[type="submit"]'), context);
    });

    clearButton?.addEventListener('click', () => {
        submitEdgeDegradation(form, result, clearButton, context, 'clear');
    });
}

async function submitIpTrafficAction(ip, action, button, result, context) {
    const serverUrl = context.getServerUrl();
    if (!serverUrl) {
        showTopologyActionModal('Conecta primero con la API.', 'error');
        return;
    }

    const path = action === 'unblock' ? '/api/traffic/unblock-ip' : '/api/traffic/block-ip';
    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = action === 'unblock'
        ? '<i class="fas fa-spinner fa-spin"></i> Desbloqueando'
        : '<i class="fas fa-spinner fa-spin"></i> Bloqueando';
    renderContextualMessage(result, 'loading', action === 'unblock' ? 'Desbloqueando IP...' : 'Bloqueando IP...');

    try {
        await postJson(buildActionUrl(context, path, serverUrl), { ip });
        clearActionMessage(result);
        showTopologyActionModal(action === 'unblock' ? 'IP desbloqueada.' : 'IP bloqueada.', 'success');
        context.refreshTopology();
        context.refreshHealth();
        context.refreshBlockedIps?.();
    } catch (error) {
        clearActionMessage(result);
        showTopologyActionModal(error.message || 'No se pudo gestionar la IP.', 'error');
    } finally {
        button.disabled = false;
        button.innerHTML = originalHtml;
    }
}

async function submitEdgeStateAction(actions, action, button, result, context) {
    const serverUrl = context.getServerUrl();
    if (!serverUrl) {
        showTopologyActionModal('Conecta primero con la API.', 'error');
        return;
    }

    const operation = buildEdgeStateOperation(actions, action);
    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = action === 'enable'
        ? '<i class="fas fa-spinner fa-spin"></i> Habilitando'
        : '<i class="fas fa-spinner fa-spin"></i> Deshabilitando';
    renderContextualMessage(result, 'loading', action === 'enable' ? 'Habilitando enlace...' : 'Deshabilitando enlace...');

    try {
        await postJson(buildActionUrl(context, operation.path, serverUrl), operation.body);
        clearActionMessage(result);
        showTopologyActionModal(action === 'enable' ? 'Enlace habilitado.' : 'Enlace deshabilitado.', 'success');
        context.refreshTopology();
        context.refreshStp();
        context.refreshHealth();
    } catch (error) {
        clearActionMessage(result);
        showTopologyActionModal(error.message || 'No se pudo cambiar el estado del enlace.', 'error');
    } finally {
        button.disabled = false;
        button.innerHTML = originalHtml;
    }
}

async function submitEdgeDegradation(form, result, button, context, forcedMetric = null) {
    const serverUrl = context.getServerUrl();
    if (!serverUrl) {
        showTopologyActionModal('Conecta primero con la API.', 'error');
        return;
    }

    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = forcedMetric === 'clear'
        ? '<i class="fas fa-spinner fa-spin"></i> Limpiando'
        : '<i class="fas fa-spinner fa-spin"></i> Aplicando';
    renderEdgeDegradationMessage(
        result,
        'loading',
        forcedMetric === 'clear' ? 'Limpiando degradacion...' : 'Aplicando degradacion...'
    );

    try {
        const operation = buildEdgeDegradationOperation(new FormData(form), forcedMetric);
        await postJson(buildActionUrl(context, operation.path, serverUrl), operation.body);
        clearActionMessage(result);
        showTopologyActionModal(buildEdgeDegradationSuccessMessage(operation), 'success');
        context.refreshTopology();
        context.refreshHealth();
        context.refreshStp();
    } catch (error) {
        clearActionMessage(result);
        showTopologyActionModal(error.message || 'No se pudo aplicar la degradacion.', 'error');
    } finally {
        button.disabled = false;
        button.innerHTML = originalHtml;
    }
}

function buildEdgeStateOperation(actions, action) {
    const isHostLink = actions.dataset.edgeType === 'host-link';
    if (isHostLink) {
        return {
            path: action === 'enable' ? '/api/ports/enable' : '/api/ports/disable',
            body: {
                dpid: normalizeDpidForApi(actions.dataset.srcDpid),
                port_no: numberOrString(actions.dataset.srcPort)
            }
        };
    }

    return {
        path: action === 'enable' ? '/api/links/enable' : '/api/links/disable',
        body: {
            src: {
                dpid: normalizeDpidForApi(actions.dataset.srcDpid),
                port_no: numberOrString(actions.dataset.srcPort)
            },
            dst: {
                dpid: normalizeDpidForApi(actions.dataset.dstDpid),
                port_no: numberOrString(actions.dataset.dstPort)
            }
        }
    };
}

function buildEdgeDegradationOperation(formData, forcedMetric = null) {
    const metric = forcedMetric || String(formData.get('metric') || '').trim();
    const edgeType = String(formData.get('edge_type') || '').trim();

    if (edgeType === 'host-link') {
        return buildHostLinkDegradationOperation(formData, metric);
    }

    const baseBody = {
        src: {
            dpid: normalizeDpidForApi(formData.get('src_dpid')),
            port_no: numberOrString(formData.get('src_port'))
        },
        dst: {
            dpid: normalizeDpidForApi(formData.get('dst_dpid')),
            port_no: numberOrString(formData.get('dst_port'))
        }
    };

    if (metric === 'clear') {
        return {
            path: '/api/links/tc/clear',
            metric,
            originalValue: null,
            appliedValue: null,
            body: baseBody
        };
    }

    const originalValue = parseMetricValue(metric, formData.get('value'));
    const appliedValue = splitMetricValue(originalValue);
    return {
        path: `/api/links/${metric}`,
        metric,
        originalValue,
        appliedValue,
        body: {
            ...baseBody,
            [metric]: appliedValue
        }
    };
}

function buildHostLinkDegradationOperation(formData, metric) {
    const baseBody = {
        port: {
            dpid: normalizeDpidForApi(formData.get('src_dpid')),
            port_no: numberOrString(formData.get('src_port'))
        }
    };

    if (metric === 'clear') {
        return {
            path: '/api/ports/tc/clear',
            metric,
            mode: 'host-link',
            originalValue: null,
            appliedValue: null,
            body: baseBody
        };
    }

    const originalValue = parseMetricValue(metric, formData.get('value'));
    return {
        path: `/api/ports/${metric}`,
        metric,
        mode: 'host-link',
        originalValue,
        appliedValue: originalValue,
        body: {
            ...baseBody,
            [metric]: originalValue
        }
    };
}

function isEdgeDisabled(edge) {
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

function normalizeStateValue(value) {
    return typeof value === 'string' ? value.toLowerCase() : value;
}

function getEdgeSwitchEndpoint(edge) {
    const isHostLink = edge.type === 'host-link';
    return {
        srcDpid: isHostLink ? (edge['target-s'] || edge['source-s']) : edge.source,
        srcPort: isHostLink ? edge['s-port'] : edge.src_port,
        dstDpid: isHostLink ? '' : edge.target,
        dstPort: isHostLink ? '' : edge.dst_port
    };
}

async function postJson(url, body) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
        },
        credentials: 'same-origin',
        body: JSON.stringify(body)
    });
    const payload = await response.json();

    if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || `HTTP ${response.status}`);
    }

    return payload;
}

function buildActionUrl(context, path, serverUrl) {
    if (typeof context.buildApiUrl === 'function') {
        return context.buildApiUrl(path);
    }

    return `${serverUrl}${path}`;
}

function buildEdgeDegradationSuccessMessage(operation) {
    const message = operation.metric === 'clear'
        ? 'Degradacion limpiada.'
        : (operation.mode === 'host-link'
            ? `Valor aplicado al puerto: ${operation.appliedValue}.`
            : `Valor aplicado por extremo: ${operation.appliedValue}.`);
    return operation.originalValue !== null
        ? `${message} Total solicitado: ${operation.originalValue}.`
        : message;
}

function renderEdgeDegradationMessage(target, type, text) {
    target.innerHTML = `
        <div class="edge-degradation-feedback is-${type}">
            <strong>${escapeHtml(text)}</strong>
        </div>
    `;
}

function renderContextualMessage(target, type, text) {
    if (!target) {
        return;
    }

    target.innerHTML = `
        <div class="edge-degradation-feedback is-${type}">
            <strong>${escapeHtml(text)}</strong>
        </div>
    `;
}

function clearActionMessage(target) {
    if (target) {
        target.innerHTML = '';
    }
}

function showTopologyActionModal(message, type = 'success') {
    const modal = getTopologyActionModal();
    const icon = modal.querySelector('[data-topology-action-modal-icon]');
    const title = modal.querySelector('[data-topology-action-modal-title]');
    const text = modal.querySelector('[data-topology-action-modal-text]');

    modal.classList.remove('is-success', 'is-error');
    modal.classList.add(`is-${type}`, 'is-open');
    modal.setAttribute('aria-hidden', 'false');
    icon.className = `fas ${type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-check'}`;
    title.textContent = type === 'error' ? 'No se pudo completar' : 'Operacion completada';
    text.textContent = message;
}

function getTopologyActionModal() {
    let modal = document.querySelector('[data-topology-action-modal]');
    if (modal) {
        return modal;
    }

    modal = document.createElement('div');
    modal.className = 'topology-action-modal';
    modal.dataset.topologyActionModal = '';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
        <div class="topology-action-modal-backdrop" data-topology-action-modal-close></div>
        <section class="topology-action-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="topology-action-modal-title">
            <button type="button" class="topology-action-modal-close" data-topology-action-modal-close aria-label="Cerrar">
                <i class="fas fa-xmark"></i>
            </button>
            <span class="topology-action-modal-icon">
                <i class="fas fa-circle-check" data-topology-action-modal-icon></i>
            </span>
            <div>
                <p id="topology-action-modal-title" data-topology-action-modal-title>Operacion completada</p>
                <h3 data-topology-action-modal-text></h3>
            </div>
        </section>
    `;

    modal.addEventListener('click', event => {
        if (event.target.closest('[data-topology-action-modal-close]')) {
            closeTopologyActionModal(modal);
        }
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modal.classList.contains('is-open')) {
            closeTopologyActionModal(modal);
        }
    });
    document.body.appendChild(modal);
    return modal;
}

function closeTopologyActionModal(modal) {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
}

function parseMetricValue(metric, value) {
    const text = String(value || '').trim();
    if (!text) {
        throw new Error('Indica el valor total de degradacion.');
    }

    if (metric === 'loss') {
        const number = Number(text);
        if (!Number.isFinite(number)) {
            throw new Error('La perdida debe ser numerica.');
        }

        return number;
    }

    return text;
}

function splitMetricValue(value) {
    if (typeof value === 'number') {
        return roundMetric(value / 2);
    }

    const match = String(value).match(/^([0-9]+(?:\.[0-9]+)?)(.*)$/);
    if (!match) {
        throw new Error('No se pudo dividir el valor. Usa formatos como 100, 100ms o 10mbit.');
    }

    return `${roundMetric(Number(match[1]) / 2)}${match[2].trim()}`;
}

function roundMetric(value) {
    return Math.round(value * 1000) / 1000;
}

function numberOrString(value) {
    const text = String(value || '').trim();
    const number = Number(text);
    return Number.isFinite(number) ? number : text;
}

function normalizeDpidForApi(value) {
    const text = String(value || '').trim();
    const switchNameMatch = text.match(/^s(\d+)$/i);
    if (switchNameMatch) {
        return switchNameMatch[1];
    }

    return text;
}

function normalizeIpForApi(value) {
    return String(value || '').trim().replace(/\/\d+$/, '');
}

function isNodeIpBlocked(node, ip) {
    const blockedIps = [
        ...(Array.isArray(node.blocked_ipv4) ? node.blocked_ipv4 : []),
        ...(Array.isArray(node.traffic_filters?.blocked_ipv4) ? node.traffic_filters.blocked_ipv4 : [])
    ].map(normalizeIpForApi);

    return Boolean(
        node.ip_blocked ||
        node.traffic_blocked ||
        blockedIps.includes(normalizeIpForApi(ip))
    );
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
