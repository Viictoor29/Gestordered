(() => {
    const root = document.querySelector('[data-admin-topology-actions]');
    const feedback = document.querySelector('[data-admin-topology-feedback]');
    const serverInput = document.querySelector('[data-admin-topology-server]');
    const saveNameInput = document.querySelector('[data-save-current-name]');
    const saveDescriptionInput = document.querySelector('[data-save-current-description]');
    const saveCurrentButton = document.querySelector('[data-action="save-current-topology"]');
    const applyFileInput = document.querySelector('[data-apply-topology-file]');
    const applyFileName = document.querySelector('[data-apply-topology-file-name]');
    const applyFileButton = document.querySelector('[data-action="apply-device-topology"]');
    const liveActionButtons = [
        saveCurrentButton,
        applyFileButton,
        ...document.querySelectorAll('[data-action="apply-db-topology"]')
    ].filter(Boolean);

    if (!root || !serverInput) {
        return;
    }

    const savedServer = localStorage.getItem('gestordered-api-server');
    if (savedServer) {
        serverInput.value = savedServer;
    }

    serverInput.addEventListener('change', () => {
        if (serverInput.value.trim()) {
            localStorage.setItem('gestordered-api-server', serverInput.value.trim());
        }
    });

    window.addEventListener('gestordered:network-connection', event => {
        if (event.detail?.serverUrl) {
            serverInput.value = event.detail.serverUrl;
        }
        refreshLiveActionState();
    });

    saveCurrentButton?.addEventListener('click', () => saveCurrentTopology());
    applyFileButton?.addEventListener('click', () => applyDeviceTopology());

    document.querySelectorAll('[data-action="apply-db-topology"]').forEach(button => {
        button.addEventListener('click', () => applyDatabaseTopology(button));
    });

    bindFileDrop(applyFileInput, applyFileName);
    refreshLiveActionState();

    async function saveCurrentTopology() {
        const serverUrl = getConnectedServerUrl(saveCurrentButton);
        if (!serverUrl) {
            return;
        }

        const name = saveNameInput?.value?.trim() || '';
        if (name.length < 3) {
            renderFeedback('Indica un nombre de al menos 3 caracteres.', 'is-error', saveCurrentButton);
            saveNameInput?.focus();
            return;
        }

        await withButtonLoading(saveCurrentButton, 'Guardando', async () => {
            renderFeedback('Leyendo topologia activa...', 'is-pending', saveCurrentButton);
            const topology = await fetchTopologyForStorage(serverUrl);
            const payload = extractApplyPayload(topology.data || topology);

            renderFeedback('Guardando en base de datos...', 'is-pending', saveCurrentButton);
            const saved = await postJson('/dashboard/topologies/save', {
                name,
                description: saveDescriptionInput?.value?.trim() || '',
                payload
            });

            renderFeedback(saved.message || 'Topologia guardada correctamente.', 'is-success', saveCurrentButton);
            window.setTimeout(() => window.location.reload(), 900);
        });
    }

    async function applyDatabaseTopology(button) {
        const serverUrl = getConnectedServerUrl(button);
        if (!serverUrl) {
            return;
        }

        const rawJson = button.closest('.topology-db-item')?.querySelector('[data-topology-json]')?.value || '{}';
        const payload = parseJson(rawJson);
        const topologyName = button.dataset.topologyName || 'seleccionada';

        await withButtonLoading(button, 'Importando', async () => {
            renderFeedback(`Importando ${topologyName} en la red...`, 'is-pending', button);
            await applyTopologyToNetwork(serverUrl, extractApplyPayload(payload));
            notifyLiveNetworkChanged();
            renderFeedback(`Topologia ${topologyName} importada en la red. Espera unos segundos a que Ryu la descubra.`, 'is-success', button);
        });
    }

    async function applyDeviceTopology() {
        const serverUrl = getConnectedServerUrl(applyFileButton);
        if (!serverUrl) {
            return;
        }

        const file = applyFileInput?.files?.[0];
        if (!file) {
            renderFeedback('Selecciona un archivo JSON para importar.', 'is-error', applyFileButton);
            return;
        }

        await withButtonLoading(applyFileButton, 'Importando', async () => {
            renderFeedback('Leyendo archivo...', 'is-pending', applyFileButton);
            const payload = parseJson(await file.text());

            renderFeedback('Importando topologia en la red...', 'is-pending', applyFileButton);
            await applyTopologyToNetwork(serverUrl, extractApplyPayload(payload));
            notifyLiveNetworkChanged();
            renderFeedback('Topologia importada en la red. Espera unos segundos a que Ryu la descubra.', 'is-success', applyFileButton);
        });
    }

    async function applyTopologyToNetwork(serverUrl, payload) {
        await postJson(proxyUrl('/api/admin/ryu/topology/import', toRyuUrl(serverUrl)), {
            scenario: payload,
            options: {
                apply_to_mininet: true,
                reset_controller: true,
                wait: true
            }
        });
    }

    async function fetchTopologyForStorage(serverUrl) {
        try {
            return await fetchJson(proxyUrl('/api/admin/mininet/topology/export', toMininetUrl(serverUrl)));
        } catch (mininetError) {
            renderFeedback('No se pudo leer desde Mininet. Probando exportacion del controlador...', 'is-pending', saveCurrentButton);
        }

        try {
            return await fetchJson(proxyUrl('/api/admin/ryu/topology/export', toRyuUrl(serverUrl)));
        } catch (exportError) {
            renderFeedback('No se pudo exportar. Leyendo la topologia visible del controlador...', 'is-pending', saveCurrentButton);
            return fetchJson(proxyUrl('/api/admin/ryu/topology', toRyuUrl(serverUrl)));
        }
    }

    function proxyUrl(path, serverUrl) {
        return `${path}?serverUrl=${encodeURIComponent(serverUrl)}`;
    }

    function getServerUrl() {
        try {
            const value = normalizeServer(serverInput.value);
            if (value) {
                localStorage.setItem('gestordered-api-server', serverInput.value.trim());
            }
            return value;
        } catch (error) {
            return '';
        }
    }

    function getConnectedServerUrl(button) {
        if (!isLiveNetworkConnected()) {
            renderFeedback('Conecta primero con la API desde el panel de red.', 'is-error', button);
            return '';
        }

        return getServerUrl();
    }

    function isLiveNetworkConnected() {
        return sessionStorage.getItem('gestordered-api-connected') === 'true';
    }

    function refreshLiveActionState() {
        const connected = isLiveNetworkConnected();
        liveActionButtons.forEach(button => {
            button.disabled = !connected;
            button.classList.toggle('is-disabled-live-action', !connected);
            button.title = connected ? '' : 'Conecta primero con la API desde el panel de red';
        });
    }

    function notifyLiveNetworkChanged() {
        window.dispatchEvent(new CustomEvent('gestordered:refresh-live-network'));
    }

    function normalizeServer(value) {
        const rawValue = String(value || '').trim().replace(/\/+$/, '');
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

    async function fetchJson(url) {
        const response = await fetch(url, {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin'
        });
        const text = await response.text();
        const payload = parseResponseJson(text);

        if (!response.ok || payload.ok === false) {
            throw new Error(payload.error || payload.message || text || `HTTP ${response.status}`);
        }

        return payload;
    }

    async function postJson(url, body) {
        const response = await fetch(url, {
            method: 'POST',
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

    function extractApplyPayload(payload) {
        if (payload && typeof payload === 'object' && !Array.isArray(payload) && payload.data) {
            return extractApplyPayload(payload.data);
        }

        if (payload && typeof payload === 'object' && !Array.isArray(payload) && payload.mininet) {
            return payload;
        }

        const topology = payload?.topology || payload;
        if (topology && typeof topology === 'object' && Array.isArray(topology.nodes) && Array.isArray(topology.edges)) {
            return convertDiscoveredTopology(topology);
        }

        return payload;
    }

    function convertDiscoveredTopology(topology) {
        const hostLinks = topology.edges.filter(edge => edge.type === 'host-link');
        const switches = topology.nodes
            .filter(node => node.type === 'switch')
            .map(node => ({
                name: String(node.id || node.name || '').toLowerCase(),
                dpid: normalizeDpid(node.dpid || node.id || node.name)
            }))
            .filter(sw => sw.name);

        const hosts = topology.nodes
            .filter(node => node.type !== 'switch')
            .map(node => {
                const hostLink = hostLinks.find(edge => edge.type === 'host-link' && (
                    edge['source-h'] === node.id ||
                    edge['target-h'] === node.id ||
                    edge.source === node.id ||
                    edge.target === node.id
                ));
                const linkParts = hostLink ? readHostLinkParts(hostLink, node.id) : {};
                return {
                    name: String(node.id || node.name || '').toLowerCase(),
                    mac: node.mac,
                    ip: Array.isArray(node.ipv4) ? node.ipv4[0] : node.ip,
                    ipv4: Array.isArray(node.ipv4) ? node.ipv4 : undefined,
                    switch: linkParts.switchName,
                    switch_dpid: normalizeDpid(linkParts.switchName),
                    switch_port: numberOrUndefined(linkParts.switchPort)
                };
            })
            .filter(host => host.name);

        const switchLinks = topology.edges
            .filter(edge => edge.type !== 'host-link')
            .map(edge => ({
                type: 'switch-link',
                src: {
                    node: String(edge.source || edge['source-s'] || '').toLowerCase(),
                    dpid: normalizeDpid(edge.source || edge['source-s']),
                    port_no: numberOrUndefined(edge.src_port)
                },
                dst: {
                    node: String(edge.target || edge['target-s'] || '').toLowerCase(),
                    dpid: normalizeDpid(edge.target || edge['target-s']),
                    port_no: numberOrUndefined(edge.dst_port)
                }
            }))
            .filter(link => link.src.node && link.dst.node);
        const explicitHostLinks = hostLinks
            .map(edge => readHostLinkParts(edge))
            .filter(parts => parts.hostName && parts.switchName)
            .filter(parts => !hosts.some(host => host.switch && host.name === parts.hostName))
            .map(parts => ({
                node1: parts.hostName,
                node2: parts.switchName,
                port2: numberOrUndefined(parts.switchPort)
            }))
            .filter(link => link.node1 && link.node2);

        return {
            kind: 'sdn_topology_scenario',
            version: 1,
            name: topology.name || 'topologia-importada',
            mininet: { switches, hosts, links: [...switchLinks, ...explicitHostLinks] },
            policies: {}
        };
    }

    function readHostLinkParts(edge, knownHost) {
        const source = String(edge.source || '').toLowerCase();
        const target = String(edge.target || '').toLowerCase();
        const explicitHost = edge['source-h'] || edge['target-h'];
        const explicitSwitch = edge['source-s'] || edge['target-s'];
        const hostName = String(knownHost || explicitHost || (isHostName(source) ? source : target)).toLowerCase();
        const switchName = String(explicitSwitch || (hostName === source ? target : source)).toLowerCase();
        const switchPort = edge['s-port'] ?? (switchName === source ? edge.src_port : edge.dst_port);

        return { hostName, switchName, switchPort };
    }

    function isHostName(value) {
        return /^h/i.test(String(value || '').trim());
    }

    function toMininetUrl(serverUrl) {
        return withPort(serverUrl, '8081');
    }

    function toRyuUrl(serverUrl) {
        return withPort(serverUrl, '8080');
    }

    function withPort(serverUrl, port) {
        const url = new URL(serverUrl);
        url.port = port;
        return url.origin;
    }

    function normalizeDpid(value) {
        const text = String(value || '').trim().toLowerCase();
        const match = text.match(/^s(\d+)$/);
        return match ? match[1] : text;
    }

    function numberOrUndefined(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : undefined;
    }

    function parseJson(value) {
        try {
            return JSON.parse(value);
        } catch (error) {
            throw new Error('El archivo no contiene un JSON valido.');
        }
    }

    function parseResponseJson(value) {
        try {
            return JSON.parse(value);
        } catch (error) {
            return {};
        }
    }

    async function withButtonLoading(button, loadingText, action) {
        const originalHtml = button?.innerHTML || '';
        if (button) {
            button.disabled = true;
            button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${loadingText}`;
        }

        try {
            await action();
        } catch (error) {
            renderFeedback(error.message || 'No se pudo completar la operacion.', 'is-error', button);
        } finally {
            if (button) {
                button.disabled = false;
                button.innerHTML = originalHtml;
            }
        }
    }

    function renderFeedback(message, className, button = null) {
        const target = button ? getButtonFeedback(button) : feedback;
        if (!target) {
            return;
        }

        target.hidden = false;
        target.textContent = message;
        target.classList.remove('is-error', 'is-success', 'is-pending');
        if (className) {
            target.classList.add(className);
        }
    }

    function getButtonFeedback(button) {
        if (!button) {
            return feedback;
        }

        const action = button.dataset.action || 'action';
        const topologyItem = button.closest('.topology-db-item');
        if (topologyItem) {
            const existingCardFeedback = topologyItem.querySelector(`[data-action-feedback-for="${action}"]`);
            if (existingCardFeedback) {
                return existingCardFeedback;
            }

            const actions = topologyItem.querySelector('.role-request-actions');
            const target = document.createElement('div');
            target.className = 'topology-action-feedback topology-action-feedback-row';
            target.dataset.actionFeedbackFor = action;
            target.hidden = true;
            actions?.insertAdjacentElement('afterend', target);
            return target;
        }

        const existing = button.parentElement?.querySelector(`[data-action-feedback-for="${action}"]`);
        if (existing) {
            return existing;
        }

        const target = document.createElement('span');
        target.className = 'topology-action-feedback';
        target.dataset.actionFeedbackFor = action;
        target.hidden = true;
        button.insertAdjacentElement('afterend', target);
        return target;
    }

    function bindFileDrop(input, fileNameLabel) {
        if (!input) {
            return;
        }

        const dropZone = input.closest('.topology-file-drop');
        const updateFileName = () => {
            if (fileNameLabel) {
                fileNameLabel.textContent = input.files?.[0]?.name || 'Seleccionar JSON';
            }
        };

        input.addEventListener('change', updateFileName);

        if (!dropZone) {
            return;
        }

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, event => {
                event.preventDefault();
                dropZone.classList.add('is-dragging');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, event => {
                event.preventDefault();
                dropZone.classList.remove('is-dragging');
            });
        });

        dropZone.addEventListener('drop', event => {
            const file = event.dataTransfer?.files?.[0];
            if (!file) {
                return;
            }

            const transfer = new DataTransfer();
            transfer.items.add(file);
            input.files = transfer.files;
            updateFileName();
        });
    }
})();
