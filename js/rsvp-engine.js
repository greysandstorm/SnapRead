/* ============================================
   SnapRead — RSVP Playback Engine
   Core speed reading engine with ORP calculation,
   punctuation-aware timing, and event system
   ============================================ */

class RSVPEngine {
    constructor() {
        // State
        this.words = [];
        this.currentIndex = 0;
        this.isPlaying = false;
        this.isPaused = false;
        this.timerId = null;

        // Settings
        this.wpm = 300;
        this.chunkSize = 1;

        // Event listeners
        this._listeners = {};
    }

    // --- PUBLIC API ---

    /**
     * Load a word array for playback
     * @param {string[]} words
     * @param {number} [startIndex=0] — resume from bookmark
     */
    load(words, startIndex = 0) {
        this.words = words;
        this.currentIndex = Math.min(startIndex, words.length - 1);
        this.isPlaying = false;
        this.isPaused = false;
        this._clearTimer();
        this._emit('load', { totalWords: words.length, currentIndex: this.currentIndex });
    }

    /**
     * Start or resume playback
     */
    play() {
        if (this.words.length === 0) return;
        if (this.currentIndex >= this.words.length) {
            this.currentIndex = 0;
        }

        this.isPlaying = true;
        this.isPaused = false;
        this._emit('play');
        this._tick();
    }

    /**
     * Pause playback
     */
    pause() {
        this.isPlaying = false;
        this.isPaused = true;
        this._clearTimer();
        this._emit('pause', { wordIndex: this.currentIndex });
    }

    /**
     * Toggle play/pause
     */
    togglePlay() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    /**
     * Rewind by N words (default: to start of current sentence)
     */
    rewind(count) {
        if (count !== undefined) {
            this.currentIndex = Math.max(0, this.currentIndex - count);
        } else {
            // Rewind to start of current sentence
            this.currentIndex = this._findSentenceStart(this.currentIndex);
        }
        this._emitCurrentWord();
        this._emit('progress', this._progressData());
    }

    /**
     * Skip forward by N words (default: to start of next sentence)
     */
    skip(count) {
        if (count !== undefined) {
            this.currentIndex = Math.min(this.words.length - 1, this.currentIndex + count);
        } else {
            // Skip to start of next sentence
            this.currentIndex = this._findSentenceEnd(this.currentIndex);
        }
        this._emitCurrentWord();
        this._emit('progress', this._progressData());
    }

    /**
     * Jump to a specific word index
     */
    jumpTo(index) {
        this.currentIndex = Math.max(0, Math.min(index, this.words.length - 1));
        this._emitCurrentWord();
        this._emit('progress', this._progressData());
    }

    /**
     * Set WPM speed
     */
    setSpeed(wpm) {
        this.wpm = Math.max(50, Math.min(1500, wpm));
        this._emit('speedChange', { wpm: this.wpm });
    }

    /**
     * Set chunk size (1, 2, or 3 words at a time)
     */
    setChunkSize(size) {
        this.chunkSize = Math.max(1, Math.min(3, size));
    }

    /**
     * Stop and reset
     */
    stop() {
        this.isPlaying = false;
        this.isPaused = false;
        this._clearTimer();
        this._emit('stop');
    }

    /**
     * Get current progress info
     */
    getProgress() {
        return this._progressData();
    }

    // --- ORP CALCULATION ---

    /**
     * Calculate Optimal Recognition Point (ORP) for a word.
     * Returns the index of the ORP letter (0-based).
     *
     * Based on O'Regan & Jacobs (1992) Optimal Viewing Position (OVP)
     * research: the eye naturally fixates ~35% from the left of a word,
     * slightly left of center. This position minimizes recognition time
     * and reduces the probability of needing to re-fixate.
     *
     * For very short words the ORP is near the start; for longer words
     * it converges on the ~35% mark, which is the scientifically optimal
     * fixation point for Latin-script languages.
     */
    static calculateORP(word) {
        // Strip punctuation to get the "real" word length
        const cleanWord = word.replace(/[^a-zA-Z0-9À-ÿ'-]/g, '');
        const len = cleanWord.length;

        if (len <= 0) return 0;
        if (len === 1) return 0;
        if (len === 2) return 0;  // "it" → fix on 'i'
        if (len === 3) return 1;  // "the" → fix on 'h'

        // For words 4+ chars, use OVP at ~35% from left, rounded
        // This places the fixation slightly left-of-center, matching
        // the research-backed OVP for fastest word recognition.
        return Math.floor(len * 0.35);
    }

    /**
     * Split a word into pre-ORP, ORP letter, and post-ORP parts.
     * Also returns orpIndex for CSS centering.
     */
    static splitAtORP(word) {
        const orpIndex = RSVPEngine.calculateORP(word);
        return {
            before: word.substring(0, orpIndex),
            orp: word[orpIndex] || '',
            after: word.substring(orpIndex + 1),
            orpIndex,
            wordLength: word.length,
        };
    }

    // --- EVENT SYSTEM ---

    on(event, callback) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(callback);
        return () => this.off(event, callback);
    }

    off(event, callback) {
        if (!this._listeners[event]) return;
        this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
    }

    _emit(event, data) {
        if (!this._listeners[event]) return;
        this._listeners[event].forEach(cb => cb(data));
    }

    // --- INTERNAL ---

    _tick() {
        if (!this.isPlaying || this.currentIndex >= this.words.length) {
            if (this.currentIndex >= this.words.length) {
                this.isPlaying = false;
                this._emit('end');
            }
            return;
        }

        // Get current word(s) based on chunk size
        const chunk = [];
        for (let i = 0; i < this.chunkSize && this.currentIndex + i < this.words.length; i++) {
            chunk.push(this.words[this.currentIndex + i]);
        }
        const displayWord = chunk.join(' ');

        // Emit the current word
        this._emit('word', {
            word: displayWord,
            index: this.currentIndex,
            ...RSVPEngine.splitAtORP(displayWord),
        });

        // Emit progress
        this._emit('progress', this._progressData());

        // Calculate delay for this word
        const delay = this._calculateDelay(displayWord);

        // Advance index
        this.currentIndex += this.chunkSize;

        // Schedule next tick
        this.timerId = setTimeout(() => this._tick(), delay);
    }

    /**
     * Calculate display duration for a word based on WPM + modifiers
     */
    _calculateDelay(word) {
        const baseDelay = 60000 / this.wpm;

        // Word length modifier
        const cleanLen = word.replace(/[^a-zA-Z0-9]/g, '').length;
        let modifier = 1.0;

        if (cleanLen <= 3) {
            modifier = 0.8;
        } else if (cleanLen >= 8) {
            modifier = 1.2;
        }

        // Punctuation pauses
        const lastChar = word[word.length - 1];
        if (['.', '!', '?'].includes(lastChar)) {
            modifier += 1.0; // Full stop = double pause
        } else if ([',', ';', ':'].includes(lastChar)) {
            modifier += 0.6; // Comma = 60% extra
        } else if (['"', '"', '"', '\'', ')'].includes(lastChar)) {
            modifier += 0.3; // Closing quotes = slight pause
        }

        // Paragraph indicator (if word has trailing newlines in original)
        if (word.includes('\n') || word.includes('¶')) {
            modifier += 1.5;
        }

        return Math.round(baseDelay * modifier);
    }

    /**
     * Find the start of the sentence containing wordIndex
     */
    _findSentenceStart(index) {
        for (let i = index - 1; i >= 0; i--) {
            const word = this.words[i];
            if (word && /[.!?]$/.test(word)) {
                return i + 1;
            }
        }
        return 0;
    }

    /**
     * Find the start of the next sentence after wordIndex
     */
    _findSentenceEnd(index) {
        for (let i = index; i < this.words.length; i++) {
            const word = this.words[i];
            if (word && /[.!?]$/.test(word)) {
                return Math.min(i + 1, this.words.length - 1);
            }
        }
        return this.words.length - 1;
    }

    _emitCurrentWord() {
        if (this.currentIndex < this.words.length) {
            const chunk = [];
            for (let i = 0; i < this.chunkSize && this.currentIndex + i < this.words.length; i++) {
                chunk.push(this.words[this.currentIndex + i]);
            }
            const displayWord = chunk.join(' ');
            this._emit('word', {
                word: displayWord,
                index: this.currentIndex,
                ...RSVPEngine.splitAtORP(displayWord),
            });
        }
    }

    _progressData() {
        const total = this.words.length;
        const current = this.currentIndex;
        const percent = total > 0 ? (current / total) * 100 : 0;
        const wordsRemaining = Math.max(0, total - current);
        const minutesRemaining = wordsRemaining / this.wpm;

        return {
            current,
            total,
            percent: Math.min(100, percent),
            wordsRemaining,
            timeRemaining: this._formatTime(minutesRemaining),
        };
    }

    _formatTime(minutes) {
        if (minutes < 1) return '< 1 min';
        if (minutes < 60) return `${Math.ceil(minutes)} min`;
        const hrs = Math.floor(minutes / 60);
        const mins = Math.ceil(minutes % 60);
        return `${hrs}h ${mins}m`;
    }

    _clearTimer() {
        if (this.timerId) {
            clearTimeout(this.timerId);
            this.timerId = null;
        }
    }
}

// Export singleton
const rsvpEngine = new RSVPEngine();
