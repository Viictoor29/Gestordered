(() => {
    const root = document.querySelector('[data-admin-live-inventory]');
    const serverInput = document.querySelector('[data-server-input]') || document.querySelector('[data-admin-topology-server]');
    const feedback = document.querySelector('[data-admin-inventory-feedback]');

    if (!root || !serverInput) {
        return;
    }

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
            request = buildRequest(form);
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
            if (form.dataset.inventoryForm === 'add-switch') {
                const protocols = form.querySelector('input[name="protocols"]');
                if (protocols) {
                    protocols.value = 'OpenFlow13';
                }
            }
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

    function buildRequest(form) {
        const action = form.dataset.inventoryForm;
        const values = formValues(form);

        if (action === 'add-host') {
            requireValue(values.name, 'Indica el nombre del host.');
            return {
                method: 'POST',
                path: '/api/admin/mininet/hosts',
                body: compact({
                    name: normalizeNodeName(values.name),
                    ip: values.ip,
                    mac: values.mac,
                    switch: normalizeNodeName(values.switch),
                    switch_port: numberOrUndefined(values.switch_port)
                }),
                confirmMessage: `Vas a crear el host ${normalizeNodeName(values.name)}.`,
                successMessage: `Host ${normalizeNodeName(values.name)} creado correctamente.`
            };
        }

        if (action === 'add-switch') {
            requireValue(values.name, 'Indica el nombre del switch.');
            return {
                method: 'POST',
                path: '/api/admin/mininet/switches',
                body: compact({
                    name: normalizeNodeName(values.name),
                    dpid: values.dpid,
                    protocols: values.protocols || 'OpenFlow13'
                }),
                confirmMessage: `Vas a crear el switch ${normalizeNodeName(values.name)}.`,
                successMessage: `Switch ${normalizeNodeName(values.name)} creado correctamente.`
            };
        }

        if (action === 'add-link') {
            requireValue(values.node1, 'Indica el nodo 1.');
            requireValue(values.node2, 'Indica el nodo 2.');
            return {
                method: 'POST',
                path: '/api/admin/mininet/links',
                body: linkBody(values),
                confirmMessage: `Vas a crear el enlace ${values.node1} - ${values.node2}.`,
                successMessage: `Enlace ${values.node1} - ${values.node2} creado correctamente.`
            };
        }

        throw new Error('Accion de inventario no reconocida.');
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

    function linkBody(values) {
        return compact({
            node1: normalizeNodeName(values.node1),
            node2: normalizeNodeName(values.node2),
            port1: numberOrUndefined(values.port1),
            port2: numberOrUndefined(values.port2)
        });
    }

    function normalizeNodeName(value) {
        return String(value || '').trim().toLowerCase();
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
