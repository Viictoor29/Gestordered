const bindModal = (openAction, closeAction, modalId) => {
    const modal = document.getElementById(modalId);
    if (!modal) {
        return;
    }

    document.querySelectorAll(`[data-action="${openAction}"]`).forEach(trigger => {
        trigger.addEventListener('click', event => {
            event.preventDefault();
            if (trigger.disabled) {
                return;
            }
            modal.classList.add('is-open');
            modal.setAttribute('aria-hidden', 'false');
        });
    });

    document.querySelectorAll(`[data-action="${closeAction}"]`).forEach(trigger => {
        trigger.addEventListener('click', () => {
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
        });
    });
};

document.querySelectorAll('[data-collapsible]').forEach((panel, index) => {
    const header = panel.querySelector(':scope > .network-status-heading, :scope > .topology-live-inventory-header, :scope > .profile-section-heading, :scope > .panel-header');
    if (!header) {
        return;
    }

    const panelId = panel.id || panel.dataset.collapsibleId || `dashboard-collapsible-${index}`;
    const storageKey = `gestodered:${window.location.pathname}:${panelId}`;
    const getStoredState = () => {
        try {
            return sessionStorage.getItem(storageKey);
        } catch (error) {
            return null;
        }
    };
    const setStoredState = state => {
        try {
            sessionStorage.setItem(storageKey, state);
        } catch (error) {
            // Keeping the accordion usable matters more than persisting the state.
        }
    };
    const body = document.createElement('div');
    body.className = 'collapsible-panel-body';
    body.id = `${panelId}-body`;

    while (header.nextSibling) {
        body.appendChild(header.nextSibling);
    }

    panel.appendChild(body);
    panel.classList.add('collapsible-panel');

    const headerChildren = Array.from(header.children);
    const titleEndIndex = header.classList.contains('profile-section-heading') ? 2 : 1;
    const actionGroup = document.createElement('div');
    actionGroup.className = 'collapsible-header-actions';

    headerChildren.slice(titleEndIndex).forEach(child => {
        actionGroup.appendChild(child);
    });

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'collapsible-toggle';
    toggle.setAttribute('aria-controls', body.id);
    toggle.innerHTML = '<span>Ocultar</span><i class="fas fa-chevron-up" aria-hidden="true"></i>';
    actionGroup.appendChild(toggle);
    header.appendChild(actionGroup);

    const storedState = getStoredState();
    const startsCollapsed = storedState ? storedState === 'collapsed' : panel.dataset.collapsed === 'true';

    const setCollapsed = collapsed => {
        body.hidden = collapsed;
        panel.classList.toggle('is-collapsed', collapsed);
        toggle.setAttribute('aria-expanded', String(!collapsed));
        toggle.querySelector('span').textContent = collapsed ? 'Mostrar' : 'Ocultar';
        toggle.querySelector('i').className = collapsed ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
        setStoredState(collapsed ? 'collapsed' : 'expanded');
    };

    toggle.addEventListener('click', () => {
        setCollapsed(!body.hidden);
    });

    setCollapsed(startsCollapsed);
});

bindModal('open-operator-request', 'close-operator-request', 'operator-request-modal');
bindModal('open-operator-status', 'close-operator-status', 'operator-status-modal');
bindModal('open-operator-pending', 'close-operator-pending', 'operator-pending-modal');

const formatJson = rawJson => {
    try {
        return JSON.stringify(JSON.parse(rawJson), null, 2);
    } catch (error) {
        return rawJson;
    }
};

const topologyJsonModal = document.getElementById('topology-json-modal');
const topologyJsonTitle = document.getElementById('topology-json-title');
const topologyJsonContent = document.getElementById('topology-json-content');

if (topologyJsonModal && topologyJsonTitle && topologyJsonContent) {
    const closeTopologyJsonModal = () => {
        topologyJsonModal.classList.remove('is-open');
        topologyJsonModal.setAttribute('aria-hidden', 'true');
        topologyJsonContent.textContent = '{}';
    };

    document.querySelectorAll('[data-action="open-topology-json"]').forEach(button => {
        button.addEventListener('click', () => {
            const jsonSource = button.closest('.topology-db-item')?.querySelector('[data-topology-json]');
            const rawJson = jsonSource?.value || jsonSource?.textContent || '{}';

            topologyJsonTitle.textContent = button.dataset.topologyName || 'Topologia';
            topologyJsonContent.textContent = formatJson(rawJson);
            topologyJsonModal.classList.add('is-open');
            topologyJsonModal.setAttribute('aria-hidden', 'false');
        });
    });

    document.querySelectorAll('[data-action="close-topology-json"]').forEach(button => {
        button.addEventListener('click', closeTopologyJsonModal);
    });
}

document.querySelectorAll('[data-action="switch-pending-to-status"]').forEach(button => {
    button.addEventListener('click', () => {
        const pendingModal = document.getElementById('operator-pending-modal');
        const statusModal = document.getElementById('operator-status-modal');

        if (pendingModal) {
            pendingModal.classList.remove('is-open');
            pendingModal.setAttribute('aria-hidden', 'true');
        }

        if (statusModal) {
            statusModal.classList.add('is-open');
            statusModal.setAttribute('aria-hidden', 'false');
        }
    });
});

const adminRejectModal = document.getElementById('admin-reject-modal');
const adminRejectForm = document.getElementById('admin-reject-form');
const adminRejectTarget = document.getElementById('admin-reject-target');

if (adminRejectModal && adminRejectForm) {
    const rejectionTextarea = adminRejectForm.querySelector('textarea[name="rejectionReason"]');

    const closeAdminRejectModal = () => {
        adminRejectModal.classList.remove('is-open');
        adminRejectModal.setAttribute('aria-hidden', 'true');
        adminRejectForm.removeAttribute('action');
        adminRejectForm.reset();
    };

    document.querySelectorAll('[data-action="open-admin-reject"]').forEach(button => {
        button.addEventListener('click', () => {
            const action = button.dataset.rejectAction;
            if (!action) {
                return;
            }

            adminRejectForm.action = action;
            adminRejectTarget.textContent = `Vas a rechazar la petición de ${button.dataset.requestName || 'este usuario'}.`;
            adminRejectModal.classList.add('is-open');
            adminRejectModal.setAttribute('aria-hidden', 'false');
            rejectionTextarea.focus();
        });
    });

    document.querySelectorAll('[data-action="close-admin-reject"]').forEach(button => {
        button.addEventListener('click', closeAdminRejectModal);
    });
}

const topologyDeleteModal = document.getElementById('topology-delete-modal');
const topologyDeleteForm = document.getElementById('topology-delete-form');
const topologyDeleteTarget = document.getElementById('topology-delete-target');

if (topologyDeleteModal && topologyDeleteForm) {
    const passwordInput = topologyDeleteForm.querySelector('input[name="adminPassword"]');

    const closeTopologyDeleteModal = () => {
        topologyDeleteModal.classList.remove('is-open');
        topologyDeleteModal.setAttribute('aria-hidden', 'true');
        topologyDeleteForm.removeAttribute('action');
        topologyDeleteForm.reset();
    };

    document.querySelectorAll('[data-action="open-topology-delete"]').forEach(button => {
        button.addEventListener('click', () => {
            const action = button.dataset.deleteAction;
            if (!action) {
                return;
            }

            topologyDeleteForm.action = action;
            topologyDeleteTarget.textContent = `Vas a eliminar la topologia ${button.dataset.topologyName || 'seleccionada'}.`;
            topologyDeleteModal.classList.add('is-open');
            topologyDeleteModal.setAttribute('aria-hidden', 'false');
            passwordInput.focus();
        });
    });

    document.querySelectorAll('[data-action="close-topology-delete"]').forEach(button => {
        button.addEventListener('click', closeTopologyDeleteModal);
    });
}

const operatorDeleteModal = document.getElementById('operator-delete-modal');
const operatorDeleteForm = document.getElementById('operator-delete-form');
const operatorDeleteTarget = document.getElementById('operator-delete-target');

if (operatorDeleteModal && operatorDeleteForm) {
    const passwordInput = operatorDeleteForm.querySelector('input[name="adminPassword"]');

    const closeOperatorDeleteModal = () => {
        operatorDeleteModal.classList.remove('is-open');
        operatorDeleteModal.setAttribute('aria-hidden', 'true');
        operatorDeleteForm.removeAttribute('action');
        operatorDeleteForm.reset();
    };

    document.querySelectorAll('[data-action="open-operator-delete"]').forEach(button => {
        button.addEventListener('click', () => {
            const action = button.dataset.deleteAction;
            if (!action) {
                return;
            }

            operatorDeleteForm.action = action;
            operatorDeleteTarget.textContent = `Vas a eliminar a ${button.dataset.operatorName || 'este operador'}.`;
            operatorDeleteModal.classList.add('is-open');
            operatorDeleteModal.setAttribute('aria-hidden', 'false');
            passwordInput.focus();
        });
    });

    document.querySelectorAll('[data-action="close-operator-delete"]').forEach(button => {
        button.addEventListener('click', closeOperatorDeleteModal);
    });
}

document.querySelectorAll('[data-action="toggle-profile-password"]').forEach(button => {
    button.addEventListener('click', () => {
        const input = button.closest('.profile-password-field').querySelector('input');
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        button.setAttribute('aria-pressed', String(isHidden));
        button.setAttribute('aria-label', isHidden ? 'Ocultar contraseña' : 'Mostrar contraseña');
        button.querySelector('i').className = isHidden ? 'fas fa-eye-slash' : 'fas fa-eye';
    });
});

document.querySelectorAll('[data-topology-file-input]').forEach(input => {
    const dropZone = input.closest('.topology-file-drop');
    const fileNameLabel = dropZone?.querySelector('[data-topology-file-name]');
    const updateFileName = () => {
        if (fileNameLabel) {
            fileNameLabel.textContent = input.files?.[0]?.name || 'Seleccionar JSON';
        }
    };

    input.addEventListener('change', () => {
        updateFileName();
    });

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
});

document.querySelectorAll('[data-confirm-delete]').forEach(form => {
    form.addEventListener('submit', event => {
        if (!window.confirm(form.dataset.confirmDelete || 'Seguro que quieres borrar este elemento?')) {
            event.preventDefault();
        }
    });
});
