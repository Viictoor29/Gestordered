export function initTopologyExportActions({ getServerUrl }) {
    const modal = createExportModal();
    let currentButton = null;
    let currentStatus = null;
    let formBound = false;

    function bind() {
        const actions = document.querySelector('[data-topology-export-actions]');
        const button = actions?.querySelector('[data-topology-export]');
        const status = actions?.querySelector('[data-topology-export-status]');

        if (!button || button.dataset.bound === 'true') {
            return;
        }

        button.dataset.bound = 'true';
        button.addEventListener('click', () => {
            currentButton = button;
            currentStatus = status;

            if (!getServerUrl()) {
                setStatus(status, 'Conecta primero con la API.', 'error');
                return;
            }

            openModal(modal);
        });

        if (!formBound) {
            modal.form.addEventListener('submit', event => {
                event.preventDefault();
                exportTopology(currentButton, currentStatus, modal, getServerUrl);
            });
            formBound = true;
        }
    }

    return { bind };
}

async function exportTopology(button, status, modal, getServerUrl) {
    const serverUrl = getServerUrl();
    const endpoint = button?.dataset.topologyExport || '/api/topology/export';
    const originalHtml = button?.innerHTML || '';

    if (!serverUrl) {
        setModalFeedback(modal, 'Conecta primero con la API.', 'error');
        return;
    }

    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exportando';
    }
    modal.submit.disabled = true;
    setStatus(status, 'Preparando descarga...', 'loading');
    setModalFeedback(modal, 'Preparando descarga...', 'loading');

    try {
        const response = await fetch(`${serverUrl}${endpoint}`, {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin'
        });
        const text = await response.text();

        if (!response.ok) {
            throw new Error(readErrorMessage(text) || `HTTP ${response.status}`);
        }

        const payload = parseJson(text);
        const exportPayload = payload?.data || payload || text;
        const content = typeof exportPayload === 'string'
            ? exportPayload
            : JSON.stringify(exportPayload, null, 2);

        downloadText(content, buildFilename(modal.nameInput.value));
        setStatus(status, 'Topologia exportada.', 'success');
        closeModal(modal);
    } catch (error) {
        const message = error.message || 'No se pudo exportar la topologia.';
        setStatus(status, message, 'error');
        setModalFeedback(modal, message, 'error');
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = originalHtml;
        }
        modal.submit.disabled = false;
    }
}

function createExportModal() {
    const root = document.createElement('div');
    root.className = 'account-request-modal topology-export-modal';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
        <div class="account-request-backdrop" data-topology-export-close></div>
        <section class="account-request-dialog topology-export-dialog" role="dialog" aria-modal="true" aria-labelledby="topology-export-title">
            <div class="panel-header">
                <div>
                    <p>Exportar</p>
                    <h2 id="topology-export-title">Exportar topologia</h2>
                </div>
                <button type="button" class="modal-close-button" data-topology-export-close aria-label="Cerrar exportacion">
                    <i class="fas fa-xmark"></i>
                </button>
            </div>
            <form class="topology-export-form" data-topology-export-form>
                <label>
                    Nombre del archivo
                    <input type="text" data-topology-export-name placeholder="topologia-exportada" autocomplete="off">
                </label>
                <p class="topology-export-modal-feedback" data-topology-export-feedback></p>
                <div class="modal-actions">
                    <button type="button" class="btn-panel btn-panel-secondary" data-topology-export-close>Cancelar</button>
                    <button type="submit" class="btn-panel" data-topology-export-submit>
                        <i class="fas fa-download"></i>
                        Descargar
                    </button>
                </div>
            </form>
        </section>
    `;

    document.body.appendChild(root);

    const modal = {
        root,
        form: root.querySelector('[data-topology-export-form]'),
        nameInput: root.querySelector('[data-topology-export-name]'),
        feedback: root.querySelector('[data-topology-export-feedback]'),
        submit: root.querySelector('[data-topology-export-submit]')
    };

    root.querySelectorAll('[data-topology-export-close]').forEach(element => {
        element.addEventListener('click', () => closeModal(modal));
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && root.classList.contains('is-open')) {
            closeModal(modal);
        }
    });

    return modal;
}

function openModal(modal) {
    modal.form.reset();
    setModalFeedback(modal, '', '');
    modal.root.classList.add('is-open');
    modal.root.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => modal.nameInput.focus(), 0);
}

function closeModal(modal) {
    modal.root.classList.remove('is-open');
    modal.root.setAttribute('aria-hidden', 'true');
}

function downloadText(content, filename) {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function buildFilename(customName) {
    const cleanName = sanitizeFilename(customName);
    if (cleanName) {
        return `${cleanName}.json`;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `topologia-${timestamp}.json`;
}

function sanitizeFilename(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function setStatus(status, message, type) {
    if (!status) {
        return;
    }

    status.textContent = message;
    status.classList.remove('is-loading', 'is-success', 'is-error');
    if (type) {
        status.classList.add(`is-${type}`);
    }
}

function setModalFeedback(modal, message, type) {
    modal.feedback.textContent = message;
    modal.feedback.classList.remove('is-loading', 'is-success', 'is-error');
    if (type) {
        modal.feedback.classList.add(`is-${type}`);
    }
}

function parseJson(text) {
    try {
        return JSON.parse(text);
    } catch (error) {
        return null;
    }
}

function readErrorMessage(text) {
    const payload = parseJson(text);
    return payload?.error || payload?.message || '';
}
