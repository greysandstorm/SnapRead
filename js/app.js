/* ============================================
   SnapRead — App Entry Point
   View management, initialization, toasts
   ============================================ */

class App {
    constructor() {
        this.currentView = 'library';
    }

    /**
     * Initialize the entire application
     */
    async init() {
        try {
            // Initialize database
            await db.init();

            // Load settings
            await settings.load();

            // Bind global UI events
            this._bindGlobalEvents();

            // Bind settings panel events
            settings.bindEvents();

            // Set up library callbacks
            library.onFileOpen = (fileId) => reader.open(fileId);

            // Initialize library
            await library.init();

            // Check URL hash for navigation
            this._handleHashChange();
            window.addEventListener('hashchange', () => this._handleHashChange());

            // Register service worker
            this._registerServiceWorker();

            console.log('SnapRead initialized');
        } catch (err) {
            console.error('Failed to initialize SnapRead:', err);
            this.showToast('Failed to initialize app: ' + err.message, 'error');
        }
    }

    /**
     * Navigate to a view
     */
    navigateTo(view) {
        this.currentView = view;

        // Update hash without triggering hashchange
        history.replaceState(null, '', `#${view}`);

        // Toggle view visibility
        document.querySelectorAll('.view').forEach(el => {
            el.classList.toggle('active', el.id === `view-${view}`);
        });

        // Update header
        this._updateHeader(view);
    }

    _updateHeader(view) {
        const backBtn = document.getElementById('btn-back');
        if (backBtn) {
            backBtn.style.display = view === 'reader' ? 'flex' : 'none';
        }
    }

    _handleHashChange() {
        const hash = location.hash.replace('#', '') || 'library';
        if (['library', 'reader'].includes(hash)) {
            this.navigateTo(hash);
        }
    }

    /**
     * Bind global UI event listeners
     */
    _bindGlobalEvents() {
        // Add file button
        document.getElementById('btn-add-file')?.addEventListener('click', () => {
            document.getElementById('file-input').click();
        });

        // Also the empty state button
        document.getElementById('btn-add-file-empty')?.addEventListener('click', () => {
            document.getElementById('file-input').click();
        });

        // File input change
        document.getElementById('file-input')?.addEventListener('change', (e) => {
            library.handleFileUpload(e.target);
        });

        // Back button
        document.getElementById('btn-back')?.addEventListener('click', () => {
            reader.close();
        });

        // Settings button
        document.getElementById('btn-settings')?.addEventListener('click', () => {
            settings.open();
        });

        // Logo -> home
        document.getElementById('app-logo')?.addEventListener('click', () => {
            if (this.currentView === 'reader') {
                reader.close();
            } else {
                this.navigateTo('library');
            }
        });

        // Mode toggle buttons
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                reader.setMode(btn.dataset.mode);
            });
        });

        // RSVP controls
        document.getElementById('btn-play')?.addEventListener('click', () => {
            rsvpEngine.togglePlay();
            const btn = document.getElementById('btn-play');
            if (btn) {
                btn.innerHTML = rsvpEngine.isPlaying
                    ? `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`
                    : `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"></polygon></svg>`;
            }
        });

        document.getElementById('btn-rewind')?.addEventListener('click', () => {
            rsvpEngine.rewind();
        });

        document.getElementById('btn-skip')?.addEventListener('click', () => {
            rsvpEngine.skip();
        });

        // Speed slider (in reader view)
        document.getElementById('speed-slider')?.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            settings.set('wpm', val);
        });

        // Progress bar seeking
        document.getElementById('progress-track')?.addEventListener('click', (e) => {
            reader.handleProgressSeek(e);
        });
    }

    /**
     * Show a toast notification
     */
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        // Auto remove after 3 seconds
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(20px)';
            toast.style.transition = 'all 300ms ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Register service worker for PWA
     */
    async _registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.register('./sw.js');
                console.log('Service worker registered');
            } catch (err) {
                console.warn('Service worker registration failed:', err);
            }
        }
    }
}

// Create app instance and initialize
const app = new App();
document.addEventListener('DOMContentLoaded', () => app.init());
