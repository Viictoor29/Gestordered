export function initTrafficPanel({ serverInput, getServerUrl, onTrafficComplete }) {
    const root = document.querySelector('[data-traffic-panel]');
    const result = document.querySelector('[data-traffic-result]');

    if (!root || !result) {
        return {};
    }

    root.addEventListener('click', event => {
        const tab = event.target.closest('[data-traffic-tab]');
        if (tab) {
            selectTab(tab.dataset.trafficTab);
        }
    });

    root.querySelectorAll('[data-traffic-form]').forEach(form => {
        form.addEventListener('submit', event => {
            event.preventDefault();
            submitTrafficForm(form);
        });
    });

    function setConnected() {
        if (!result || result.querySelector('.traffic-result-card')) {
            return;
        }

        result.innerHTML = renderPlaceholder('ready', 'Selecciona una prueba y lanza trafico entre hosts.');
    }

    async function submitTrafficForm(form) {
        if (!getActiveServerUrl()) {
            result.innerHTML = renderPlaceholder('error', 'Conecta primero con la API para generar trafico.');
            return;
        }

        const type = form.dataset.trafficForm;
        const button = form.querySelector('button[type="submit"]');
        const originalHtml = button.innerHTML;

        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ejecutando';
        result.innerHTML = renderPlaceholder('loading', 'Ejecutando prueba de trafico...');

        try {
            const payload = buildPayload(type, form);
            const responsePayload = await postJson(endpointFor(type), payload);
            const data = responsePayload.data || responsePayload;
            result.innerHTML = renderTrafficResult(type, data);

            if (typeof onTrafficComplete === 'function') {
                onTrafficComplete();
            }
        } catch (error) {
            result.innerHTML = renderPlaceholder('error', error.message || 'No se pudo generar trafico.');
        } finally {
            button.disabled = false;
            button.innerHTML = originalHtml;
        }
    }

    async function postJson(path, payload) {
        const response = await fetch(`${getActiveServerUrl()}${path}`, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            credentials: 'same-origin',
            body: JSON.stringify(payload)
        });
        const responsePayload = await response.json();

        if (!response.ok || responsePayload.ok === false) {
            throw new Error(responsePayload.error || `HTTP ${response.status}`);
        }

        return responsePayload;
    }

    function selectTab(target) {
        root.querySelectorAll('[data-traffic-tab]').forEach(tab => {
            const isActive = tab.dataset.trafficTab === target;
            tab.classList.toggle('is-active', isActive);
            tab.setAttribute('aria-selected', String(isActive));
        });

        root.querySelectorAll('[data-traffic-panel-content]').forEach(panel => {
            const isActive = panel.dataset.trafficPanelContent === target;
            panel.classList.toggle('is-active', isActive);
            panel.hidden = !isActive;
        });
    }

    function buildPayload(type, form) {
        const formData = new FormData(form);

        if (type === 'ping') {
            return {
                src_host: clean(formData.get('src_host')),
                dst_host: clean(formData.get('dst_host')),
                count: numberValue(formData.get('count'), 4),
                interval: 0.2,
                timeout: 10
            };
        }

        if (type === 'pingall') {
            return {
                count: numberValue(formData.get('count'), 1),
                interval: 0.2,
                timeout_per_ping: numberValue(formData.get('timeout_per_ping'), 5)
            };
        }

        const udp = formData.get('udp') === 'on';
        const bandwidth = clean(formData.get('bandwidth'));
        return {
            src_host: clean(formData.get('src_host')),
            dst_host: clean(formData.get('dst_host')),
            duration: numberValue(formData.get('duration'), 10),
            udp,
            bandwidth: udp && bandwidth ? bandwidth : null,
            port: numberValue(formData.get('port'), 5201),
            timeout: Math.max(numberValue(formData.get('duration'), 10) + 10, 20)
        };
    }

    function endpointFor(type) {
        const endpoints = {
            ping: '/api/traffic/ping',
            pingall: '/api/traffic/pingall',
            iperf: '/api/traffic/iperf'
        };

        return endpoints[type];
    }

    function getActiveServerUrl() {
        return typeof getServerUrl === 'function' ? getServerUrl() : normalizeServer(serverInput.value);
    }

    return { setConnected };
}

function renderTrafficResult(type, data) {
    if (type === 'ping') {
        return renderPingResult(data);
    }

    if (type === 'pingall') {
        return renderPingAllResult(data);
    }

    return renderIperfResult(data);
}

function renderPingResult(data) {
    const stats = data.stats || {};
    return `
        <article class="traffic-result-card ${data.success ? 'is-success' : 'is-danger'}">
            <div class="traffic-result-header">
                <div>
                    <p>Ping</p>
                    <h4>${escapeHtml(data.src_host || 'origen')} -> ${escapeHtml(data.dst_ip || 'destino')}</h4>
                </div>
                ${statusBadge(data.success ? 'Correcto' : 'Fallido', data.success ? 'is-success' : 'is-danger')}
            </div>
            <dl class="traffic-result-grid">
                ${detailRow('Transmitidos', stats.transmitted)}
                ${detailRow('Recibidos', stats.received)}
                ${detailRow('Perdidas', formatPercent(stats.packet_loss_percent))}
                ${detailRow('RTT medio', formatMs(stats.rtt_avg_ms))}
                ${detailRow('RTT minimo', formatMs(stats.rtt_min_ms))}
                ${detailRow('RTT maximo', formatMs(stats.rtt_max_ms))}
            </dl>
            ${renderCommand(data.command)}
        </article>
    `;
}

function renderPingAllResult(data) {
    const failed = Number(data.failed_tests || 0);
    return `
        <article class="traffic-result-card ${data.success ? 'is-success' : 'is-warning'}">
            <div class="traffic-result-header">
                <div>
                    <p>Ping all</p>
                    <h4>${escapeHtml(data.host_count || 0)} hosts probados</h4>
                </div>
                ${statusBadge(data.success ? 'Conectividad correcta' : 'Hay fallos', data.success ? 'is-success' : 'is-warning')}
            </div>
            <dl class="traffic-result-grid">
                ${detailRow('Hosts', formatList(data.hosts))}
                ${detailRow('Pruebas totales', data.total_tests)}
                ${detailRow('Fallos', failed)}
                ${detailRow('Correctas', Math.max(Number(data.total_tests || 0) - failed, 0))}
            </dl>
            ${renderPingAllFailures(data.results || [])}
        </article>
    `;
}

function renderIperfResult(data) {
    const result = data.result || {};
    return `
        <article class="traffic-result-card ${data.success ? 'is-success' : 'is-danger'}">
            <div class="traffic-result-header">
                <div>
                    <p>Iperf ${data.udp ? 'UDP' : 'TCP'}</p>
                    <h4>${escapeHtml(data.src_host || 'origen')} -> ${escapeHtml(data.dst_host || 'destino')}</h4>
                </div>
                ${statusBadge(data.success ? 'Correcto' : 'Fallido', data.success ? 'is-success' : 'is-danger')}
            </div>
            <dl class="traffic-result-grid">
                ${detailRow('Transferencia', result.transfer)}
                ${detailRow('Ancho de banda', result.bandwidth)}
                ${detailRow('Jitter', formatMs(result.jitter_ms))}
                ${detailRow('Perdidas UDP', formatPercent(result.loss_percent))}
                ${detailRow('Duracion', `${data.duration_seconds || 0} s`)}
                ${detailRow('Puerto', data.port)}
            </dl>
            ${renderCommand(data.command)}
        </article>
    `;
}

function renderPingAllFailures(results) {
    const failed = results.filter(item => !item.success);
    if (!failed.length) {
        return '<p class="traffic-success-note">Todos los hosts descubiertos tienen conectividad.</p>';
    }

    return `
        <div class="traffic-failure-list">
            <strong>Pruebas fallidas</strong>
            ${failed.slice(0, 8).map(item => `
                <span>${escapeHtml(item.src_host || 'origen')} -> ${escapeHtml(item.dst_host || item.dst_ip || 'destino')}: ${escapeHtml(item.error || 'sin respuesta')}</span>
            `).join('')}
            ${failed.length > 8 ? `<small>Y ${failed.length - 8} fallo(s) mas.</small>` : ''}
        </div>
    `;
}

function renderCommand(command) {
    if (!command) {
        return '';
    }

    return `<p class="traffic-command"><strong>Comando:</strong> ${escapeHtml(command)}</p>`;
}

function renderPlaceholder(type, text) {
    const icon = type === 'loading'
        ? 'fa-spinner fa-spin'
        : (type === 'ready' ? 'fa-circle-info' : 'fa-triangle-exclamation');

    return `
        <span class="network-status-placeholder is-${type}">
            <i class="fas ${icon}"></i>
            ${escapeHtml(text)}
        </span>
    `;
}

function statusBadge(text, type) {
    return `<span class="detail-badge ${type}">${escapeHtml(text)}</span>`;
}

function detailRow(label, value) {
    const visibleValue = value === undefined || value === null || value === '' ? 'No disponible' : value;
    return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(visibleValue)}</dd></div>`;
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

function clean(value) {
    return String(value || '').trim();
}

function numberValue(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function formatPercent(value) {
    return value === undefined || value === null ? 'No disponible' : `${value}%`;
}

function formatMs(value) {
    return value === undefined || value === null ? 'No disponible' : `${value} ms`;
}

function formatList(value) {
    return Array.isArray(value) && value.length ? value.join(', ') : 'Ninguno';
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
