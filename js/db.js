/* ============================================
   SnapRead — IndexedDB Persistence Layer
   ============================================ */

const DB_NAME = 'snapread';
const DB_VERSION = 1;

class SnapReadDB {
    constructor() {
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;

                // Files store — holds uploaded file blobs + metadata
                if (!db.objectStoreNames.contains('files')) {
                    const fileStore = db.createObjectStore('files', { keyPath: 'id', autoIncrement: true });
                    fileStore.createIndex('name', 'name', { unique: false });
                    fileStore.createIndex('addedDate', 'addedDate', { unique: false });
                }

                // Bookmarks store — reading position per file
                if (!db.objectStoreNames.contains('bookmarks')) {
                    db.createObjectStore('bookmarks', { keyPath: 'fileId' });
                }

                // Settings store — user preferences
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };

            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };

            request.onerror = (e) => {
                reject(new Error('Failed to open database: ' + e.target.error));
            };
        });
    }

    // --- FILES ---

    async addFile(fileData) {
        return this._transaction('files', 'readwrite', (store) => {
            return store.add({
                name: fileData.name,
                type: fileData.type,
                blob: fileData.blob,
                title: fileData.title || fileData.name,
                author: fileData.author || '',
                addedDate: Date.now(),
                wordCount: fileData.wordCount || 0,
                fileSize: fileData.fileSize || 0,
            });
        });
    }

    async getFile(id) {
        return this._transaction('files', 'readonly', (store) => {
            return store.get(id);
        });
    }

    async getAllFiles() {
        return this._transaction('files', 'readonly', (store) => {
            return store.getAll();
        });
    }

    async deleteFile(id) {
        // Delete file and its bookmark
        await this._transaction('files', 'readwrite', (store) => {
            return store.delete(id);
        });
        await this.deleteBookmark(id);
    }

    // --- BOOKMARKS ---

    async saveBookmark(fileId, bookmarkData) {
        return this._transaction('bookmarks', 'readwrite', (store) => {
            return store.put({
                fileId: fileId,
                wordIndex: bookmarkData.wordIndex,
                chapter: bookmarkData.chapter || 0,
                lastRead: Date.now(),
                totalWords: bookmarkData.totalWords,
                progress: bookmarkData.totalWords > 0
                    ? Math.round((bookmarkData.wordIndex / bookmarkData.totalWords) * 100)
                    : 0,
            });
        });
    }

    async getBookmark(fileId) {
        return this._transaction('bookmarks', 'readonly', (store) => {
            return store.get(fileId);
        });
    }

    async deleteBookmark(fileId) {
        return this._transaction('bookmarks', 'readwrite', (store) => {
            return store.delete(fileId);
        });
    }

    async getAllBookmarks() {
        return this._transaction('bookmarks', 'readonly', (store) => {
            return store.getAll();
        });
    }

    // --- SETTINGS ---

    async saveSetting(key, value) {
        return this._transaction('settings', 'readwrite', (store) => {
            return store.put({ key, value });
        });
    }

    async getSetting(key) {
        const result = await this._transaction('settings', 'readonly', (store) => {
            return store.get(key);
        });
        return result ? result.value : null;
    }

    async getAllSettings() {
        const results = await this._transaction('settings', 'readonly', (store) => {
            return store.getAll();
        });
        const settings = {};
        results.forEach(r => { settings[r.key] = r.value; });
        return settings;
    }

    async saveAllSettings(settingsObj) {
        const tx = this.db.transaction('settings', 'readwrite');
        const store = tx.objectStore('settings');
        for (const [key, value] of Object.entries(settingsObj)) {
            store.put({ key, value });
        }
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    // --- INTERNAL ---

    _transaction(storeName, mode, callback) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, mode);
            const store = tx.objectStore(storeName);
            const request = callback(store);

            if (request && request.onsuccess !== undefined) {
                request.onsuccess = () => resolve(request.result);
                request.onerror = (e) => reject(e.target.error);
            } else {
                tx.oncomplete = () => resolve();
                tx.onerror = (e) => reject(e.target.error);
            }
        });
    }
}

// Export singleton
const db = new SnapReadDB();
