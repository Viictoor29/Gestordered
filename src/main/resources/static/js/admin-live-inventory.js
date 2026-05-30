(() => {
    const root = document.querySelector('[data-admin-live-inventory]');
    const serverInput = document.querySelector('[data-server-input]') || document.querySelector('[data-admin-topology-server]');
    const feedback = document.querySelector('[data-admin-inventory-feedback]');
    const HOST_NAME_PATTERN = /^h([1-9]\d*)$/i;
    const SWITCH_NAME_PATTERN = /^s([1-9]\d*)$/i;
    const MAX_HOST_NUMBER = 255;
    const FALLBACK_IPV4_PREFIX = 24;
    const MAX_SWITCH_PORT = 4096;

    if (!root || !serverInput) {
        return;
    }

    bindInventoryTabs();

    root.querySelectorAll('[data-inventory-form]').forEach(form => {
        form.addEventListener('submit', event => {
            event.preventDefault();
            submitInventoryForm(form);
        });
    });

    async function submitInventoryForm(form) {
        const button = form.querySelector('button[type="submit"]');
        const originalHtml = button?.innerHTML || '';
        const serverUrl = getConnectedServerUrl();

        if (!serverUrl) {
            renderFeedback('Conecta primero con la API desde el panel de red.', 'is-error');
            return;
        }

        let request;
        try {
            request = await buildRequest(form, serverUrl);
        } catch (error) {
            renderFeedback(error.message || 'Revisa los campos del formulario.', 'is-error');
            return;
        }

        if (!window.confirm(request.confirmMessage)) {
            return;
        }

        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aplicando';
        }

        try {
            renderFeedback('Aplicando cambio en Mininet...', 'is-pending');
            const payload = await sendJson(proxyUrl(request.path, serverUrl), request.method, request.body);
            form.reset();
            renderFeedback(payload.message || request.successMessage, 'is-success');
            window.dispatchEvent(new CustomEvent('gestordered:refresh-live-network'));
        } catch (error) {
            renderFeedback(error.message || 'No se pudo completar la operacion.', 'is-error');
        } finally {
            if (button) {
                button.disabled = false;
                button.innerHTML = originalHtml;
            }
        }
    }

    async function buildRequest(form, serverUrl) {
        const action = form.dataset.inventoryForm;
        const values = formValues(form);

        if (action === 'add-host') {
            const name = normalizeNodeName(values.name);
            const ip = normalizeIpValue(values.ip);
            requireValue(name, 'Indica el nombre del host.');
            requireValue(ip, 'Indica la IPv4 del host.');
            validateHostName(name);

            const inventory = await loadMininetInventory(serverUrl);
            ensureNodeDoesNotExist(name, inventory, 'Ya existe un nodo con ese nombre.');
            validateHostIpInNetwork(ip, inventory);

            const mac = buildMacFromHostName(name);
            return {
                method: 'POST',
                path: '/api/admin/mininet/hosts',
                body: compact({ name, ip, mac }),
                confirmMessage: `Vas a crear el host ${name.toUpperCase()} con IP ${ip}. La MAC se generara como ${mac}.`,
                successMessage: `Host ${name.toUpperCase()} creado correctamente con MAC ${mac}.`
            };
        }

        if (action === 'add-switch') {
            const name = normalizeNodeName(values.name);
            requireValue(name, 'Indica el nombre del switch.');
            validateSwitchName(name);

            const inventory = await loadMininetInventory(serverUrl);
            ensureNodeDoesNotExist(name, inventory, 'Ya existe un nodo con ese nombre.');

            return {
                method: 'POST',
                path: '/api/admin/mininet/switches',
                body: compact({ name }),
                confirmMessage: `Vas a crear el switch ${name}.`,
                successMessage: `Switch ${name} creado correctamente.`
            };
        }

        if (action === 'add-link') {
            const node1 = normalizeNodeName(values.node1);
            const node2 = normalizeNodeName(values.node2);
            requireValue(node1, 'Indica de donde sale el enlace.');
            requireValue(node2, 'Indica a donde llega el enlace.');

            if (node1 === node2) {
                throw new Error('El enlace debe unir dos nodos distintos.');
            }

            const inventory = await loadMininetInventory(serverUrl);
            const link = buildAutocompletedLink(node1, node2, inventory);
            return {
                method: 'POST',
                path: '/api/admin/mininet/links',
                body: compact(link.body),
                confirmMessage: link.confirmMessage,
                successMessage: link.successMessage
            };
        }

        throw new Error('Accion de inventario no reconocida.');
    }

    function bindInventoryTabs() {
        const tabs = root.querySelectorAll('[data-inventory-tab]');
        const panels = root.querySelectorAll('[data-inventory-panel]');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const selected = tab.dataset.inventoryTab;

                tabs.forEach(candidate => {
                    const isActive = candidate === tab;
                    candidate.classList.toggle('is-active', isActive);
                    candidate.setAttribute('aria-selected', String(isActive));
                });

                panels.forEach(panel => {
                    const isActive = panel.dataset.inventoryPanel === selected;
                    panel.classList.toggle('is-active', isActive);
                    panel.hidden = !isActive;
                });
            });
        });
    }

    async function loadMininetInventory(serverUrl) {
        try {
            const payload = await fetchJson(proxyUrl('/api/admin/mininet/topology/export', serverUrl));
            return normalizeInventory(payload);
        } catch (error) {
            throw new Error('No se pudo leer la topologia viva de Mininet para validar nombres, IPs y puertos.');
        }
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

    async function sendJson(url, method, body) {
        const response = await fetch(url, {
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

    function normalizeInventory(payload) {
        const rootPayload = unwrapPayload(payload);
        const topology = unwrapPayload(rootPayload.topology || rootPayload);
        const mininet = topology.mininet || rootPayload.mininet || {};
        const hosts = [];
        const switches = [];
        const links = [];

        collectHosts(hosts, rootPayload.hosts);
        collectHosts(hosts, topology.hosts);
        collectHosts(hosts, mininet.hosts);
        collectSwitches(switches, rootPayload.switches);
        collectSwitches(switches, topology.switches);
        collectSwitches(switches, mininet.switches);
        collectTopologyNodes(hosts, switches, topology.nodes);
        collectTopologyNodes(hosts, switches, rootPayload.nodes);
        collectLinks(links, rootPayload.links);
        collectLinks(links, topology.links);
        collectLinks(links, topology.edges);
        collectLinks(links, mininet.links);

        const hostMap = uniqueByName(hosts);
        const switchMap = uniqueByName(switches);
        const portUsage = buildPortUsage([...hostMap.values()], [...switchMap.values()], links);

        return {
            hosts: [...hostMap.values()],
            switches: [...switchMap.values()],
            links,
            hostNames: new Set(hostMap.keys()),
            switchNames: new Set(switchMap.keys()),
            portUsage
        };
    }

    function unwrapPayload(payload) {
        let current = payload;
        while (current && typeof current === 'object' && !Array.isArray(current) && current.data) {
            current = current.data;
        }

        return current && typeof current === 'object' ? current : {};
    }

    function collectHosts(target, value) {
        asArray(value).forEach(item => {
            const host = normalizeHost(item);
            if (host.name) {
                target.push(host);
            }
        });
    }

    function collectSwitches(target, value) {
        asArray(value).forEach(item => {
            const sw = normalizeSwitch(item);
            if (sw.name) {
                target.push(sw);
            }
        });
    }

    function collectTopologyNodes(hosts, switches, nodes) {
        asArray(nodes).forEach(node => {
            const type = String(node?.type || '').toLowerCase();
            if (type === 'switch') {
                const sw = normalizeSwitch(node);
                if (sw.name) {
                    switches.push(sw);
                }
                return;
            }

            const host = normalizeHost(node);
            if (host.name) {
                hosts.push(host);
            }
        });
    }

    function collectLinks(target, value) {
        asArray(value).forEach(link => {
            if (link && typeof link === 'object') {
                target.push(link);
            }
        });
    }

    function normalizeHost(item) {
        if (typeof item === 'string') {
            return { name: normalizeNodeName(item) };
        }

        const name = normalizeNodeName(item?.name || item?.id || item?.node || item?.host);
        return {
            ...item,
            name,
            ipValues: extractIpValues(item)
        };
    }

    function normalizeSwitch(item) {
        if (typeof item === 'string') {
            return { name: normalizeNodeName(item) };
        }

        return {
            ...item,
            name: normalizeNodeName(item?.name || item?.id || item?.node || item?.switch || item?.dpid)
        };
    }

    function uniqueByName(items) {
        const map = new Map();
        items.forEach(item => {
            if (item?.name && !map.has(item.name)) {
                map.set(item.name, item);
            }
        });
        return map;
    }

    function buildPortUsage(hosts, switches, links) {
        const usage = new Map(switches.map(sw => [sw.name, new Set()]));

        hosts.forEach(host => {
            const switchName = normalizeNodeName(host.switch || host.switch_name || host.switchName || host.switch_dpid);
            const switchPort = numberOrUndefined(host.switch_port || host.switchPort || host.port);
            addSwitchPortUsage(usage, switchName, switchPort);
        });

        links.forEach(link => registerLinkPorts(usage, link));

        return usage;
    }

    function registerLinkPorts(usage, link) {
        const sourceSwitch = normalizeNodeName(link['source-s'] || link.source_s || link.src?.node || link.source || link.src || link.node1);
        const targetSwitch = normalizeNodeName(link['target-s'] || link.target_s || link.dst?.node || link.target || link.dst || link.node2);
        const sourcePort = numberOrUndefined(link['s-port'] ?? link.s_port ?? link.src?.port_no ?? link.src_port ?? link.port1);
        const targetPort = numberOrUndefined(link.dst?.port_no ?? link.dst_port ?? link.port2);

        addSwitchPortUsage(usage, sourceSwitch, sourcePort);
        addSwitchPortUsage(usage, targetSwitch, targetPort);

        const hostLinkSwitch = normalizeNodeName(link['target-s'] || link['source-s'] || link.switch || link.switch_name);
        const hostLinkPort = numberOrUndefined(link['s-port'] ?? link.switch_port ?? link.switchPort);
        addSwitchPortUsage(usage, hostLinkSwitch, hostLinkPort);
    }

    function addSwitchPortUsage(usage, switchName, port) {
        if (!switchName || port === undefined || port < 1) {
            return;
        }

        if (!usage.has(switchName)) {
            usage.set(switchName, new Set());
        }
        usage.get(switchName).add(port);
    }

    function buildAutocompletedLink(rawNode1, rawNode2, inventory) {
        const first = classifyNode(rawNode1, inventory);
        const second = classifyNode(rawNode2, inventory);

        if (!first.exists) {
            throw new Error(`No existe el nodo ${rawNode1}. Crea primero el host o el switch.`);
        }

        if (!second.exists) {
            throw new Error(`No existe el nodo ${rawNode2}. Crea primero el host o el switch.`);
        }

        if (first.kind === 'host' && second.kind === 'host') {
            throw new Error('No se puede crear un enlace directo host-host. Usa host-switch o switch-switch.');
        }

        if (first.kind === 'host' || second.kind === 'host') {
            const host = first.kind === 'host' ? first.name : second.name;
            const sw = first.kind === 'switch' ? first.name : second.name;
            const switchPort = getNextFreePort(sw, inventory.portUsage);

            return {
                body: {
                    node1: host,
                    node2: sw,
                    port2: switchPort
                },
                confirmMessage: `Vas a crear el enlace ${host} - ${sw}. Se usara automaticamente el puerto libre ${switchPort} del switch ${sw}.`,
                successMessage: `Enlace ${host} - ${sw} creado en el puerto ${switchPort} de ${sw}.`
            };
        }

        const port1 = getNextFreePort(first.name, inventory.portUsage);
        const port2 = getNextFreePort(second.name, inventory.portUsage);

        return {
            body: {
                node1: first.name,
                node2: second.name,
                port1,
                port2
            },
            confirmMessage: `Vas a crear el enlace ${first.name} - ${second.name}. Se usaran automaticamente los puertos libres ${first.name}:${port1} y ${second.name}:${port2}.`,
            successMessage: `Enlace ${first.name} - ${second.name} creado en los puertos ${port1} y ${port2}.`
        };
    }

    function classifyNode(name, inventory) {
        const normalized = normalizeNodeName(name);
        const isHost = inventory.hostNames.has(normalized);
        const isSwitch = inventory.switchNames.has(normalized);

        if (isHost && isSwitch) {
            throw new Error(`El nombre ${normalized} existe como host y como switch. Renombra uno de ellos para poder calcular el enlace.`);
        }

        return {
            name: normalized,
            exists: isHost || isSwitch,
            kind: isSwitch ? 'switch' : 'host'
        };
    }

    function getNextFreePort(switchName, portUsage) {
        const used = portUsage.get(switchName) || new Set();
        for (let port = 1; port <= MAX_SWITCH_PORT; port += 1) {
            if (!used.has(port)) {
                used.add(port);
                portUsage.set(switchName, used);
                return port;
            }
        }

        throw new Error(`No se ha encontrado ningun puerto libre en ${switchName}.`);
    }

    function validateHostName(name) {
        const match = String(name || '').trim().match(HOST_NAME_PATTERN);
        const number = match ? Number(match[1]) : Number.NaN;

        if (!Number.isSafeInteger(number) || number < 1 || number > MAX_HOST_NUMBER) {
            throw new Error(`El nombre del host debe tener formato H1, H2... H${MAX_HOST_NUMBER}.`);
        }
    }

    function validateSwitchName(name) {
        if (!SWITCH_NAME_PATTERN.test(name)) {
            throw new Error('El nombre del switch debe tener formato S1, S2, S3...');
        }
    }

    function buildMacFromHostName(name) {
        const match = String(name || '').trim().match(HOST_NAME_PATTERN);
        const number = match ? Number(match[1]) : Number.NaN;

        if (!Number.isSafeInteger(number) || number < 1 || number > MAX_HOST_NUMBER) {
            throw new Error(`No se pudo generar la MAC: usa un host entre H1 y H${MAX_HOST_NUMBER}.`);
        }

        return `00:00:00:00:00:${number.toString(16).padStart(2, '0')}`;
    }

    function ensureNodeDoesNotExist(name, inventory, message) {
        if (inventory.hostNames.has(name) || inventory.switchNames.has(name)) {
            throw new Error(message);
        }
    }

    function validateHostIpInNetwork(ip, inventory) {
        const candidate = parseIpv4(ip);
        if (!candidate) {
            throw new Error('La IPv4 no tiene un formato valido. Usa, por ejemplo, 10.0.0.3/8.');
        }

        const existingIps = inventory.hosts
            .flatMap(host => host.ipValues || [])
            .map(parseIpv4)
            .filter(Boolean);

        if (!existingIps.length) {
            return;
        }

        const duplicate = existingIps.find(existing => existing.address === candidate.address);
        if (duplicate) {
            throw new Error('Ya existe un host con esa IPv4.');
        }

        const reference = existingIps[0];
        const prefix = reference.prefix ?? candidate.prefix ?? FALLBACK_IPV4_PREFIX;
        if (networkOf(reference.address, prefix) !== networkOf(candidate.address, prefix)) {
            throw new Error(`La IP debe pertenecer a la misma red que los otros hosts (${formatNetwork(reference.address, prefix)}).`);
        }
    }

    function extractIpValues(item) {
        if (!item || typeof item !== 'object') {
            return [];
        }

        const values = [];
        if (item.ip) {
            values.push(item.ip);
        }
        if (item.ipv4) {
            values.push(...asArray(item.ipv4));
        }
        if (item.ipv6) {
            values.push(...asArray(item.ipv6));
        }

        return values
            .map(value => String(value || '').trim())
            .filter(value => value && value.includes('.'));
    }

    function parseIpv4(value) {
        const text = String(value || '').trim();
        const match = text.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/);
        if (!match) {
            return null;
        }

        const octets = match.slice(1, 5).map(Number);
        const prefix = match[5] === undefined ? undefined : Number(match[5]);
        if (octets.some(octet => octet < 0 || octet > 255) || (prefix !== undefined && (prefix < 0 || prefix > 32))) {
            return null;
        }

        const address = octets.reduce((acc, octet) => ((acc << 8) + octet) >>> 0, 0);
        return { address, octets, prefix };
    }

    function networkOf(address, prefix) {
        const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
        return (address & mask) >>> 0;
    }

    function formatNetwork(address, prefix) {
        const network = networkOf(address, prefix);
        return `${[(network >>> 24) & 255, (network >>> 16) & 255, (network >>> 8) & 255, network & 255].join('.')}/${prefix}`;
    }

    function proxyUrl(path, serverUrl) {
        return `${path}?serverUrl=${encodeURIComponent(toMininetUrl(serverUrl))}`;
    }

    function getConnectedServerUrl() {
        if (sessionStorage.getItem('gestordered-api-connected') !== 'true') {
            return '';
        }

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

    function toMininetUrl(serverUrl) {
        const url = new URL(serverUrl);
        url.port = '8081';
        return url.origin;
    }

    function formValues(form) {
        return Object.fromEntries([...new FormData(form).entries()].map(([key, value]) => [
            key,
            typeof value === 'string' ? value.trim() : value
        ]));
    }

    function normalizeNodeName(value) {
        return String(value || '').trim().toLowerCase();
    }

    function normalizeIpValue(value) {
        return String(value || '').trim();
    }

    function asArray(value) {
        if (Array.isArray(value)) {
            return value;
        }
        if (value === undefined || value === null || value === '') {
            return [];
        }
        return [value];
    }

    function compact(value) {
        return Object.fromEntries(Object.entries(value)
                .filter(([, child]) => child !== undefined && child !== null && child !== ''));
    }

    function numberOrUndefined(value) {
        if (value === undefined || value === null || value === '') {
            return undefined;
        }

        const number = Number(value);
        return Number.isFinite(number) ? number : undefined;
    }

    function requireValue(value, message) {
        if (!value) {
            throw new Error(message);
        }
    }

    function parseResponseJson(value) {
        try {
            return JSON.parse(value);
        } catch (error) {
            return {};
        }
    }

    function renderFeedback(message, className) {
        if (!feedback) {
            return;
        }

        feedback.hidden = false;
        feedback.textContent = message;
        feedback.classList.remove('is-error', 'is-success', 'is-pending');
        if (className) {
            feedback.classList.add(className);
        }
    }
})();
