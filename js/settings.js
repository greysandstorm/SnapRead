/* ============================================
   SnapRead — Settings Panel
   User preferences management
   ============================================ */

class Settings {
    constructor() {
        this.defaults = {
            wpm: 300,
            orpColor: '#ff4444',
            fontSize: 'medium',
            chunkSize: 1,
            theme: 'amber-dark',
        };

        this.current = { ...this.defaults };
    }

    /**
     * Load settings from IndexedDB
     */
    async load() {
        const saved = await db.getAllSettings();
        this.current = { ...this.defaults, ...saved };
        this._applyAll();
    }

    /**
     * Save a single setting
     */
    async set(key, value) {
        this.current[key] = value;
        await db.saveSetting(key, value);
        this._apply(key, value);
    }

    /**
     * Apply all settings to the UI
     */
    _applyAll() {
        for (const [key, value] of Object.entries(this.current)) {
            this._apply(key, value);
        }
    }

    /**
     * Apply a single setting
     */
    _apply(key, value) {
        switch (key) {
            case 'wpm':
                rsvpEngine.setSpeed(value);
                const speedSlider = document.getElementById('speed-slider');
                const speedValue = document.getElementById('speed-value');
                const settingSpeedSlider = document.getElementById('setting-speed');
                const settingSpeedValue = document.getElementById('setting-speed-value');
                if (speedSlider) speedSlider.value = value;
                if (speedValue) speedValue.textContent = value + ' WPM';
                if (settingSpeedSlider) settingSpeedSlider.value = value;
                if (settingSpeedValue) settingSpeedValue.textContent = value + ' WPM';
                break;

            case 'orpColor':
                document.documentElement.style.setProperty('--orp-color', value);
                const colorPicker = document.getElementById('setting-orp-color');
                if (colorPicker) colorPicker.value = value;
                break;

            case 'fontSize':
                const sizes = { small: '1.4rem', medium: '2rem', large: '2.6rem', xl: '3.2rem' };
                document.documentElement.style.setProperty('--rsvp-font-size', sizes[value] || sizes.medium);
                this._updateToggleGroup('font-size-toggle', value);
                break;

            case 'chunkSize':
                rsvpEngine.setChunkSize(value);
                this._updateToggleGroup('chunk-size-toggle', value.toString());
                break;
        }
    }

    _updateToggleGroup(groupId, activeValue) {
        const group = document.getElementById(groupId);
        if (!group) return;
        group.querySelectorAll('button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === activeValue);
        });
    }

    /**
     * Open settings panel
     */
    open() {
        document.getElementById('settings-overlay').classList.add('open');
        document.getElementById('settings-panel').classList.add('open');
        this._renderPanel();
    }

    /**
     * Close settings panel
     */
    close() {
        document.getElementById('settings-overlay').classList.remove('open');
        document.getElementById('settings-panel').classList.remove('open');
    }

    /**
     * Render settings panel content
     */
    _renderPanel() {
        // Speed slider
        const speedSlider = document.getElementById('setting-speed');
        const speedValue = document.getElementById('setting-speed-value');
        if (speedSlider) {
            speedSlider.value = this.current.wpm;
            speedValue.textContent = this.current.wpm + ' WPM';
        }

        // ORP color
        const colorPicker = document.getElementById('setting-orp-color');
        if (colorPicker) colorPicker.value = this.current.orpColor;

        // Font size
        this._updateToggleGroup('font-size-toggle', this.current.fontSize);

        // Chunk size
        this._updateToggleGroup('chunk-size-toggle', this.current.chunkSize.toString());
    }

    /**
     * Bind settings panel event listeners (called once on init)
     */
    bindEvents() {
        // Speed slider in settings
        const settingSpeed = document.getElementById('setting-speed');
        if (settingSpeed) {
            settingSpeed.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                document.getElementById('setting-speed-value').textContent = val + ' WPM';
                this.set('wpm', val);
            });
        }

        // ORP color picker
        const orpColor = document.getElementById('setting-orp-color');
        if (orpColor) {
            orpColor.addEventListener('input', (e) => {
                this.set('orpColor', e.target.value);
            });
        }

        // Font size toggles
        const fontToggle = document.getElementById('font-size-toggle');
        if (fontToggle) {
            fontToggle.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                if (btn) this.set('fontSize', btn.dataset.value);
            });
        }

        // Chunk size toggles
        const chunkToggle = document.getElementById('chunk-size-toggle');
        if (chunkToggle) {
            chunkToggle.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                if (btn) this.set('chunkSize', parseInt(btn.dataset.value));
            });
        }

        // Close buttons
        document.getElementById('settings-overlay')?.addEventListener('click', () => this.close());
        document.getElementById('settings-close')?.addEventListener('click', () => this.close());
    }
}

// Export singleton
const settings = new Settings();
