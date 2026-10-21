// UI Helpers, Modals, Toasts, and QR Canvas Renderers
export const ui = {
  toast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toastEl = document.createElement('div');
    toastEl.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'danger') icon = '🚨';
    if (type === 'warning') icon = '⚠️';

    toastEl.innerHTML = `
      <span style="font-size: 1.1rem;">${icon}</span>
      <div style="flex: 1; font-weight: 500;">${message}</div>
    `;

    container.appendChild(toastEl);

    setTimeout(() => {
      toastEl.style.opacity = '0';
      toastEl.style.transform = 'translateX(100%)';
      toastEl.style.transition = 'all 0.3s ease';
      setTimeout(() => toastEl.remove(), 300);
    }, duration);
  },

  showModal(title, bodyHtml, footerHtml = '') {
    const overlay = document.getElementById('app-modal');
    if (!overlay) return;

    document.getElementById('modal-title').innerHTML = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-footer').innerHTML = footerHtml || `
      <button class="btn btn-secondary" onclick="ui.closeModal()">Close</button>
    `;

    overlay.classList.add('active');
  },

  closeModal() {
    const overlay = document.getElementById('app-modal');
    if (overlay) overlay.classList.remove('active');
  },

  formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return d.toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  },

  renderQRCode(elementId, text, size = 180) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = '';
    
    if (window.QRCode) {
      new window.QRCode(el, {
        text: text,
        width: size,
        height: size,
        colorDark: "#0f172a",
        colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel.M
      });
    } else {
      // Fallback to QR API image if library loading deferred
      const img = document.createElement('img');
      img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`;
      img.alt = "QR Code Pass";
      img.style.borderRadius = "8px";
      el.appendChild(img);
    }
  },

  getStatusBadge(status) {
    const s = (status || '').toUpperCase();
    if (s === 'APPROVED' || s === 'PRESENT' || s === 'PAID' || s === 'RESOLVED') {
      return `<span class="badge badge-success">${s}</span>`;
    }
    if (s === 'PENDING_PARENT' || s === 'PENDING_RC' || s === 'IN_PROGRESS' || s === 'UNPAID') {
      return `<span class="badge badge-warning">${s.replace('_', ' ')}</span>`;
    }
    if (s === 'OVERDUE' || s === 'REJECTED' || s === 'UNACCOUNTED') {
      return `<span class="badge badge-danger">⚠️ ${s}</span>`;
    }
    if (s === 'ACTIVE' || s === 'OUTSIDE_AUTHORIZED') {
      return `<span class="badge badge-info">🏃 ${s.replace('_', ' ')}</span>`;
    }
    if (s === 'RETURNED' || s === 'CLOSED' || s === 'REDEEMED') {
      return `<span class="badge badge-purple">✔️ ${s}</span>`;
    }
    return `<span class="badge badge-gray">${s}</span>`;
  }
};

window.ui = ui;
