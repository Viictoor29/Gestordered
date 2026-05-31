export function bindRoleRequestForms() {
    document.querySelectorAll('[data-role-request-form]').forEach(roleForm => {
        roleForm.addEventListener('submit', event => {
            event.preventDefault();
            submitRoleRequestForm(roleForm);
        });
    });
}

async function submitRoleRequestForm(roleForm) {
    const feedback = roleForm.querySelector('.account-request-feedback');
    const submitButton = roleForm.querySelector('button[type="submit"]');
    const originalButtonHtml = submitButton ? submitButton.innerHTML : '';

    setFeedback(feedback, 'Procesando solicitud...', 'is-pending');

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando';
    }

    try {
        const response = await fetch(roleForm.action, {
            method: roleForm.method || 'POST',
            body: new FormData(roleForm),
            headers: {
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'same-origin'
        });
        const payload = await response.json();

        setFeedback(
            feedback,
            payload.message || 'Operacion completada.',
            payload.feedbackClass || (response.ok ? 'is-success' : 'is-error')
        );

        if (response.ok && roleForm.dataset.roleRequestForm === 'create') {
            roleForm.reset();
        }
    } catch (error) {
        setFeedback(feedback, 'No se pudo completar la operacion. Intentalo de nuevo.', 'is-error');
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = originalButtonHtml;
        }
    }
}

function setFeedback(feedback, message, className) {
    if (!feedback) {
        return;
    }

    feedback.textContent = message;
    feedback.classList.remove('is-error', 'is-success', 'is-pending');

    if (className) {
        feedback.classList.add(className);
    }
}

