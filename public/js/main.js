/**
 * Ticket Routing System — Client-side JS
 * Handles form submissions via fetch, flash messages, and UI interactions.
 */

// --- Flash Message System ---
function showAlert(message, type = 'error') {
  // Remove existing alerts
  const existing = document.querySelectorAll('.alert');
  existing.forEach(el => el.remove());

  const alert = document.createElement('div');
  alert.className = `alert alert--${type}`;

  const icons = {
    success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };

  alert.innerHTML = `${icons[type] || icons.info}<span>${message}</span>`;

  // Insert at the top of the form or main content
  const target = document.querySelector('.alert-container') || document.querySelector('main .container') || document.querySelector('main');
  if (target) {
    target.prepend(alert);
  }

  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    alert.style.opacity = '0';
    alert.style.transform = 'translateY(-10px)';
    setTimeout(() => alert.remove(), 300);
  }, 5000);
}

// --- Form Submit Helper ---
async function submitForm(url, data, options = {}) {
  const {
    method = 'POST',
    redirectTo = null,
    successMessage = null,
    button = null
  } = options;

  // Disable button and show spinner
  let originalContent = '';
  if (button) {
    originalContent = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span> Processing...';
  }

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'same-origin'
    });

    const result = await res.json();

    if (!res.ok) {
      showAlert(result.error || 'Something went wrong', 'error');
      return null;
    }

    if (successMessage) {
      showAlert(successMessage, 'success');
    }

    if (redirectTo) {
      setTimeout(() => {
        window.location.href = redirectTo;
      }, 500);
    }

    return result;
  } catch (err) {
    console.error('Request failed:', err);
    showAlert('Network error. Please check your connection.', 'error');
    return null;
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalContent;
    }
  }
}

// --- Logout ---
async function logout() {
  await submitForm('/api/auth/logout', {}, {
    redirectTo: '/login',
    successMessage: 'Logged out successfully'
  });
}

// --- DOM Ready ---
document.addEventListener('DOMContentLoaded', () => {
  // Attach logout handlers
  document.querySelectorAll('[data-action="logout"]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  });
});
