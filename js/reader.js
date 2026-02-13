/* ============================================
   SnapRead — Reader View
   RSVP mode + Normal reading mode
   ============================================ */

class Reader {
    constructor() {
        this.currentFile = null;
        this.parsedDoc = null;
        this.mode = 'rsvp'; // 'rsvp' or 'normal'
        this._boundHandlers = {};
    }

    /**
     * Open a file for reading
     */
    async open(fileId) {
        const fileRecord = await db.getFile(fileId);
        if (!fileRecord) {
            app.showToast('File not found', 'error');
            return;
        }

        this.currentFile = fileRecord;

        // Parse the file
        const file = new File([fileRecord.blob], fileRecord.name);
        this.parsedDoc = await fileParser.parse(file);

        // Load bookmark
        const bookmark = await db.getBookmark(fileId);
        const startIndex = bookmark ? bookmark.wordIndex : 0;

        // Load into RSVP engine
        rsvpEngine.load(this.parsedDoc.words, startIndex);

        // Set up the reader UI
        this._setupUI();

        // Set up event listeners
        this._bindEvents();

        // Show the reader view
        app.navigateTo('reader');

        // Display current word if resuming
        if (startIndex > 0) {
            rsvpEngine.jumpTo(startIndex);
        } else {
            this._showIdleState();
        }
    }

    _setupUI() {
        // Title
        document.getElementById('reader-book-title').textContent = this.parsedDoc.title;

        // Set mode buttons
        this._updateModeButtons();

        // Render normal reading text
        this._renderNormalText();

        // Update progress
        this._updateProgress(rsvpEngine.getProgress());

        // Update speed display
        const speedSlider = document.getElementById('speed-slider');
        const speedValue = document.getElementById('speed-value');
        speedSlider.value = rsvpEngine.wpm;
        speedValue.textContent = rsvpEngine.wpm + ' WPM';
    }

    _bindEvents() {
        // Clean up old listeners
        this._unbindEvents();

        // RSVP engine events
        this._boundHandlers.onWord = (data) => this._displayWord(data);
        this._boundHandlers.onProgress = (data) => this._updateProgress(data);
        this._boundHandlers.onPause = (data) => this._onPause(data);
        this._boundHandlers.onEnd = () => this._onEnd();

        rsvpEngine.on('word', this._boundHandlers.onWord);
        rsvpEngine.on('progress', this._boundHandlers.onProgress);
        rsvpEngine.on('pause', this._boundHandlers.onPause);
        rsvpEngine.on('end', this._boundHandlers.onEnd);

        // Keyboard shortcuts
        this._boundHandlers.onKeydown = (e) => this._handleKeydown(e);
        document.addEventListener('keydown', this._boundHandlers.onKeydown);
    }

    _unbindEvents() {
        if (this._boundHandlers.onWord) {
            rsvpEngine.off('word', this._boundHandlers.onWord);
            rsvpEngine.off('progress', this._boundHandlers.onProgress);
            rsvpEngine.off('pause', this._boundHandlers.onPause);
            rsvpEngine.off('end', this._boundHandlers.onEnd);
        }
        if (this._boundHandlers.onKeydown) {
            document.removeEventListener('keydown', this._boundHandlers.onKeydown);
        }
    }

    /**
     * Display a word in the RSVP display with ORP highlighting.
     * Uses three fixed-width columns so the ORP letter is always
     * at the exact center of the display — your eye never moves.
     */
    _displayWord(data) {
        const container = document.getElementById('rsvp-word');
        if (!container) return;

        // Three-column layout: before (right-aligned) | ORP (center) | after (left-aligned)
        let html = '';
        html += `<span class="orp-before">${this._escapeHtml(data.before)}</span>`;
        html += `<span class="orp-letter">${this._escapeHtml(data.orp)}</span>`;
        html += `<span class="orp-after">${this._escapeHtml(data.after)}</span>`;

        container.innerHTML = html;

        // Update play button state
        const playBtn = document.getElementById('btn-play');
        if (playBtn) {
            playBtn.innerHTML = rsvpEngine.isPlaying ? this._pauseIcon() : this._playIcon();
        }
    }

    _showIdleState() {
        const container = document.getElementById('rsvp-word');
        if (container) {
            container.innerHTML = '<span class="rsvp-idle-message">Press play to start reading</span>';
        }
    }

    _updateProgress(data) {
        const progressThumb = document.getElementById('progress-thumb');
        const progressPercent = document.getElementById('progress-percent');
        const progressWords = document.getElementById('progress-words');
        const timeRemaining = document.getElementById('time-remaining');
        const statWpm = document.getElementById('stat-wpm');

        if (progressThumb) progressThumb.style.width = data.percent + '%';
        if (progressPercent) progressPercent.textContent = Math.round(data.percent) + '%';
        if (progressWords) progressWords.textContent = `${data.current} / ${data.total} words`;
        if (timeRemaining) timeRemaining.textContent = data.timeRemaining + ' left';
        if (statWpm) statWpm.textContent = rsvpEngine.wpm;
    }

    async _onPause(data) {
        // Save bookmark on pause
        await this._saveBookmark();
        const playBtn = document.getElementById('btn-play');
        if (playBtn) {
            playBtn.innerHTML = this._playIcon();
        }
    }

    async _onEnd() {
        const playBtn = document.getElementById('btn-play');
        if (playBtn) {
            playBtn.innerHTML = this._playIcon();
        }
        app.showToast('Finished reading!', 'success');
        await this._saveBookmark();
    }

    async _saveBookmark() {
        if (!this.currentFile || !this.parsedDoc) return;
        await db.saveBookmark(this.currentFile.id, {
            wordIndex: rsvpEngine.currentIndex,
            totalWords: this.parsedDoc.words.length,
        });
    }

    /**
     * Handle keyboard shortcuts
     */
    _handleKeydown(e) {
        // Don't handle if user is typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch (e.code) {
            case 'Space':
                e.preventDefault();
                rsvpEngine.togglePlay();
                const playBtn = document.getElementById('btn-play');
                if (playBtn) {
                    playBtn.innerHTML = rsvpEngine.isPlaying ? this._pauseIcon() : this._playIcon();
                }
                break;
            case 'ArrowLeft':
                e.preventDefault();
                rsvpEngine.rewind();
                break;
            case 'ArrowRight':
                e.preventDefault();
                rsvpEngine.skip();
                break;
            case 'ArrowUp':
                e.preventDefault();
                rsvpEngine.setSpeed(rsvpEngine.wpm + 25);
                document.getElementById('speed-slider').value = rsvpEngine.wpm;
                document.getElementById('speed-value').textContent = rsvpEngine.wpm + ' WPM';
                break;
            case 'ArrowDown':
                e.preventDefault();
                rsvpEngine.setSpeed(rsvpEngine.wpm - 25);
                document.getElementById('speed-slider').value = rsvpEngine.wpm;
                document.getElementById('speed-value').textContent = rsvpEngine.wpm + ' WPM';
                break;
            case 'Escape':
                rsvpEngine.pause();
                break;
        }
    }

    /**
     * Toggle between RSVP and normal reading mode
     */
    setMode(newMode) {
        this.mode = newMode;
        this._updateModeButtons();

        const rsvpContainer = document.getElementById('rsvp-container');
        const normalContainer = document.getElementById('normal-reader');

        if (newMode === 'rsvp') {
            rsvpContainer.style.display = 'flex';
            normalContainer.style.display = 'none';
        } else {
            rsvpContainer.style.display = 'none';
            normalContainer.style.display = 'block';
            this._scrollToCurrentWord();
        }
    }

    _updateModeButtons() {
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === this.mode);
        });
    }

    /**
     * Render full text for normal reading mode
     */
    _renderNormalText() {
        const container = document.getElementById('normal-reader');
        if (!container || !this.parsedDoc) return;

        const text = this.parsedDoc.fullText || this.parsedDoc.words.join(' ');
        const paragraphs = text.split(/\n\s*\n/);

        let wordIdx = 0;
        let html = '';

        for (const para of paragraphs) {
            const trimmed = para.trim();
            if (!trimmed) continue;

            html += '<p>';
            const words = trimmed.split(/\s+/);
            for (const word of words) {
                if (word) {
                    html += `<span class="word" data-word-idx="${wordIdx}">${this._escapeHtml(word)}</span> `;
                    wordIdx++;
                }
            }
            html += '</p>';
        }

        container.innerHTML = html;

        // Add click-to-seek on words
        container.querySelectorAll('.word').forEach(el => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.dataset.wordIdx);
                rsvpEngine.jumpTo(idx);
                this._highlightCurrentWord(idx);
                this._saveBookmark();
            });
        });
    }

    _highlightCurrentWord(index) {
        // Remove old highlights
        document.querySelectorAll('.normal-reader .current-word').forEach(el => {
            el.classList.remove('current-word');
        });

        // Add new highlight
        const wordEl = document.querySelector(`.word[data-word-idx="${index}"]`);
        if (wordEl) {
            wordEl.classList.add('current-word');
        }
    }

    _scrollToCurrentWord() {
        const idx = rsvpEngine.currentIndex;
        const wordEl = document.querySelector(`.word[data-word-idx="${idx}"]`);
        if (wordEl) {
            wordEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            this._highlightCurrentWord(idx);
        }
    }

    /**
     * Handle progress bar click for seeking
     */
    handleProgressSeek(e) {
        const track = document.getElementById('progress-track');
        if (!track || !this.parsedDoc) return;

        const rect = track.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const targetIndex = Math.floor(pct * this.parsedDoc.words.length);

        rsvpEngine.jumpTo(targetIndex);
        this._saveBookmark();
    }

    /**
     * Close reader and return to library
     */
    async close() {
        await this._saveBookmark();
        rsvpEngine.stop();
        this._unbindEvents();
        this.currentFile = null;
        this.parsedDoc = null;
        app.navigateTo('library');
        library.refresh();
    }

    // --- Helpers ---

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    _playIcon() {
        return `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"></polygon></svg>`;
    }

    _pauseIcon() {
        return `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
    }
}

// Export singleton
const reader = new Reader();
