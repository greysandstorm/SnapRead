/* ============================================
   SnapRead — Library Manager
   File upload, library grid, file cards
   ============================================ */

class Library {
    constructor() {
        this.files = [];
        this.bookmarks = {};
        this.isEditMode = false;
        this.selectedIds = new Set();
        this.onFileOpen = null; // callback set by app.js
    }

    async init() {
        await this.refresh();
    }

    async refresh() {
        this.files = await db.getAllFiles();
        const bookmarkList = await db.getAllBookmarks();
        this.bookmarks = {};
        bookmarkList.forEach(b => { this.bookmarks[b.fileId] = b; });
        this.render();
    }

    render() {
        const container = document.getElementById('library-grid');
        const emptyState = document.getElementById('library-empty');
        const editBtn = document.getElementById('btn-edit-library');
        const bulkBar = document.getElementById('bulk-action-bar');

        if (this.files.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'flex';
            editBtn.style.display = 'none';
            bulkBar.style.display = 'none';
            this.isEditMode = false;
            this.selectedIds.clear();
            return;
        }

        emptyState.style.display = 'none';
        editBtn.style.display = 'inline-flex';

        // Show/hide bulk action bar
        bulkBar.style.display = this.isEditMode ? 'flex' : 'none';

        // Sort by last read (or added date)
        const sorted = [...this.files].sort((a, b) => {
            const bkA = this.bookmarks[a.id];
            const bkB = this.bookmarks[b.id];
            const timeA = bkA ? bkA.lastRead : a.addedDate;
            const timeB = bkB ? bkB.lastRead : b.addedDate;
            return timeB - timeA;
        });

        container.innerHTML = sorted.map(file => this._renderCard(file)).join('');

        // Attach event listeners
        container.querySelectorAll('.file-card').forEach(card => {
            const fileId = parseInt(card.dataset.fileId);

            card.addEventListener('click', (e) => {
                if (e.target.closest('.delete-btn')) return;
                if (this.isEditMode) {
                    this._toggleSelect(fileId, card);
                    return;
                }
                this._openFile(fileId);
            });

            card.querySelector('.delete-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this._deleteFile(fileId);
            });
        });
    }

    _renderCard(file) {
        const bookmark = this.bookmarks[file.id];
        const progress = bookmark ? bookmark.progress : 0;
        const lastRead = bookmark
            ? this._relativeTime(bookmark.lastRead)
            : this._relativeTime(file.addedDate);
        const formatColors = {
            epub: '#6abf69',
            pdf: '#d45555',
            txt: '#5599dd',
            md: '#b580d4',
        };

        const badgeColor = formatColors[file.type] || 'var(--accent)';

        const isSelected = this.selectedIds.has(file.id);

        return `
      <div class="file-card${this.isEditMode ? ' selectable' : ''}${isSelected ? ' selected' : ''}" data-file-id="${file.id}">
        <div class="select-checkbox"></div>
        <button class="delete-btn" title="Remove from library" aria-label="Remove ${file.title}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        <span class="format-badge" style="background: ${badgeColor}22; color: ${badgeColor}">${file.type.toUpperCase()}</span>
        <div class="file-title">${this._escapeHtml(file.title)}</div>
        ${file.author ? `<div class="file-author">${this._escapeHtml(file.author)}</div>` : ''}
        <div class="file-meta">
          <span>${file.wordCount ? this._formatNumber(file.wordCount) + ' words' : ''}</span>
          <span>${lastRead}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
      </div>
    `;
    }

    async handleFileUpload(fileInput) {
        const files = fileInput.files;
        if (!files || files.length === 0) return;

        for (const file of files) {
            try {
                // Show loading state
                // Show loading state
                app.showToast(`Reading ${file.name}...`, 'info');

                // 1. Read the file into an ArrayBuffer once
                // This prevents issues with double-reading streams on mobile/iOS
                const arrayBuffer = await file.arrayBuffer();

                if (arrayBuffer.byteLength === 0) {
                    throw new Error('File is empty. If this is from iCloud, please ensure it is downloaded first.');
                }

                app.showToast(`Parsing ${file.name}...`, 'info');

                // 2. Parse using the buffer
                const parsed = await fileParser.parse(arrayBuffer, file.name);

                // 3. Store in IndexedDB using the same buffer
                await db.addFile({
                    name: file.name,
                    type: parsed.format,
                    blob: new Blob([arrayBuffer]),
                    title: parsed.title,
                    author: parsed.author,
                    wordCount: parsed.wordCount,
                    fileSize: file.size,
                });

                app.showToast(`Added "${parsed.title}" to library`, 'success');
            } catch (err) {
                console.error('Error parsing file:', err);
                app.showToast(`Failed to add ${file.name}: ${err.message}`, 'error');
            }
        }

        // Reset file input
        fileInput.value = '';

        // Refresh library
        await this.refresh();
    }

    async _openFile(fileId) {
        if (this.onFileOpen) {
            this.onFileOpen(fileId);
        }
    }

    async _deleteFile(fileId) {
        const file = this.files.find(f => f.id === fileId);
        if (!file) return;

        if (confirm(`Remove "${file.title}" from your library?`)) {
            await db.deleteFile(fileId);
            app.showToast(`Removed "${file.title}"`, 'success');
            await this.refresh();
        }
    }

    // --- Edit / Select Mode ---

    toggleEditMode() {
        this.isEditMode = !this.isEditMode;
        this.selectedIds.clear();

        const editBtn = document.getElementById('btn-edit-library');
        editBtn.textContent = this.isEditMode ? 'Done' : 'Edit';

        if (this.isEditMode) {
            editBtn.classList.remove('btn-ghost');
            editBtn.classList.add('btn-secondary');
        } else {
            editBtn.classList.remove('btn-secondary');
            editBtn.classList.add('btn-ghost');
        }

        this.render();
    }

    _toggleSelect(fileId, card) {
        if (this.selectedIds.has(fileId)) {
            this.selectedIds.delete(fileId);
            card.classList.remove('selected');
        } else {
            this.selectedIds.add(fileId);
            card.classList.add('selected');
        }

        // Update checkbox visuals
        const checkbox = card.querySelector('.select-checkbox');
        if (checkbox) {
            // CSS handles the visual via .selected class
        }

        this._updateBulkCount();
    }

    _updateBulkCount() {
        const countEl = document.getElementById('bulk-select-count');
        const deleteBtn = document.getElementById('btn-bulk-delete');
        const count = this.selectedIds.size;
        countEl.textContent = `${count} selected`;
        deleteBtn.disabled = count === 0;
        deleteBtn.style.opacity = count === 0 ? '0.5' : '1';
    }

    async bulkDelete() {
        const count = this.selectedIds.size;
        if (count === 0) return;

        if (!confirm(`Delete ${count} file${count > 1 ? 's' : ''} from your library?`)) return;

        for (const fileId of this.selectedIds) {
            await db.deleteFile(fileId);
        }

        app.showToast(`Deleted ${count} file${count > 1 ? 's' : ''}`, 'success');
        this.selectedIds.clear();
        this.isEditMode = false;

        const editBtn = document.getElementById('btn-edit-library');
        editBtn.textContent = 'Edit';
        editBtn.classList.remove('btn-secondary');
        editBtn.classList.add('btn-ghost');

        await this.refresh();
    }

    // --- Utilities ---

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    _formatNumber(num) {
        if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
        return num.toString();
    }

    _relativeTime(timestamp) {
        const diff = Date.now() - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return new Date(timestamp).toLocaleDateString();
    }
}

// Export singleton
const library = new Library();
