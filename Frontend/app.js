import { api } from './api.js';
import { ui } from './ui.js';
import { sound } from './sound.js';
import { studentView } from './views/studentView.js';
import { parentView } from './views/parentView.js';
import { rcView } from './views/rcView.js';
import { wardenView } from './views/wardenView.js';
import { gatekeeperView } from './views/gatekeeperView.js';
import { messStaffView } from './views/messStaffView.js';
import { adminView } from './views/adminView.js';

class App {
  constructor() {
    this.currentUser = null;
    this.currentView = null;
  }

  async init() {
    window.addEventListener('auth:unauthorized', () => {
      this.showLogin('Your session has expired. Please sign in again.');
    });

    document.getElementById('login-form')?.addEventListener('submit', (event) => this.handleLogin(event));

    if (!api.token) {
      this.showLogin();
      return;
    }
    try {
      this.currentUser = await api.getMe();
    } catch (e) {
      this.showLogin('Please sign in to continue.');
      return;
    }

    this.showApplication();
    this.updateHeaderUI();
    await this.mountViewForRole(this.currentUser.role);
    await this.refreshNotificationCount();
  }

  showLogin(message = '') {
    api.clearSession();
    this.currentUser = null;
    document.getElementById('application-shell').hidden = true;
    document.getElementById('login-screen').hidden = false;
    const error = document.getElementById('login-error');
    if (message) {
      error.textContent = message;
      error.style.display = 'block';
    } else {
      error.style.display = 'none';
    }
    document.getElementById('login-email')?.focus();
  }

  showApplication() {
    document.getElementById('login-screen').hidden = true;
    document.getElementById('application-shell').hidden = false;
  }

  async handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const error = document.getElementById('login-error');
    const submit = document.getElementById('login-submit');
    error.style.display = 'none';
    submit.disabled = true;
    submit.textContent = 'Signing in…';
    try {
      await api.login(email, password);
      this.currentUser = await api.getMe();
      this.showApplication();
      this.updateHeaderUI();
      await this.mountViewForRole(this.currentUser.role);
      await this.refreshNotificationCount();
    } catch (err) {
      api.clearSession();
      error.textContent = err.message || 'Unable to sign in.';
      error.style.display = 'block';
    } finally {
      submit.disabled = false;
      submit.textContent = 'Sign in securely';
    }
  }

  logout() {
    this.showLogin('You have been signed out.');
  }

  updateHeaderUI() {
    const nameEl = document.getElementById('header-user-name');
    const roleEl = document.getElementById('header-user-role');
    const avatarEl = document.getElementById('header-user-avatar');

    if (nameEl) nameEl.textContent = this.currentUser.full_name;
    if (roleEl) roleEl.textContent = this.currentUser.role.replace('_', ' ');
    if (avatarEl) avatarEl.src = this.currentUser.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150';

    document.getElementById('demo-bar').hidden = true;
  }

  async mountViewForRole(role) {
    const container = document.getElementById('main-view-container');
    if (!container) return;

    if (role === 'STUDENT') {
      this.currentView = studentView;
    } else if (role === 'PARENT') {
      this.currentView = parentView;
    } else if (role === 'RC') {
      this.currentView = rcView;
    } else if (role === 'WARDEN') {
      this.currentView = wardenView;
    } else if (role === 'GATEKEEPER') {
      this.currentView = gatekeeperView;
    } else if (role === 'MESS_STAFF') {
      this.currentView = messStaffView;
    } else if (role === 'ADMIN') {
      this.currentView = adminView;
    } else {
      this.currentView = studentView;
    }

    await this.currentView.render(container);
  }

  async refreshNotificationCount() {
    try {
      const notifs = await api.getNotifications();
      const unread = notifs.filter(n => !n.is_read).length;
      const countEl = document.getElementById('notif-badge-count');
      if (countEl) {
        countEl.textContent = unread;
        countEl.style.display = unread > 0 ? 'inline-block' : 'none';
      }
    } catch (e) {}
  }

  async openNotificationDrawer() {
    try {
      const notifs = await api.getNotifications();
      const listHtml = notifs.length === 0 ? `
        <div style="text-align: center; padding: 24px; color: var(--text-muted);">No notifications.</div>
      ` : `
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${notifs.map(n => `
            <div style="background: ${n.is_read ? 'rgba(15, 23, 42, 0.4)' : 'rgba(99, 102, 241, 0.15)'}; border-left: 3px solid ${n.priority === 'CRITICAL' ? 'var(--danger)' : n.priority === 'WARNING' ? 'var(--warning)' : 'var(--info)'}; padding: 10px 12px; border-radius: 6px; font-size: 0.82rem;">
              <div style="display: flex; justify-content: space-between; font-weight: 700; color: #fff; margin-bottom: 2px;">
                <span>${n.title}</span>
                <span style="font-size: 0.7rem; color: var(--text-muted);">${ui.formatDate(n.created_at)}</span>
              </div>
              <div style="color: var(--text-muted); font-size: 0.78rem;">${n.message}</div>
            </div>
          `).join('')}
        </div>
      `;

      ui.showModal(
        '🔔 Notifications & Alerts',
        listHtml,
        `
          <button class="btn btn-secondary btn-sm" onclick="window.app.markAllRead()">Mark All Read</button>
          <button class="btn btn-primary btn-sm" onclick="ui.closeModal()">Close</button>
        `
      );
    } catch (err) {
      ui.toast('Failed to load notifications', 'danger');
    }
  }

  async markAllRead() {
    try {
      await api.markAllNotificationsRead();
      ui.toast('Notifications marked as read', 'info');
      await this.refreshNotificationCount();
      ui.closeModal();
    } catch (e) {}
  }
}

export const app = new App();
window.app = app;

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
