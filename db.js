// Zero POS - Local Database (IndexedDB + LocalStorage)
const DB_NAME = 'ZeroPOS';
const DB_VERSION = 2;

class LocalDB {
    constructor() {
        this.db = null;
        this.pendingSync = [];
        this.init();
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Companies store
                if (!db.objectStoreNames.contains('companies')) {
                    db.createObjectStore('companies', { keyPath: 'id' });
                }

                // Users store
                if (!db.objectStoreNames.contains('users')) {
                    db.createObjectStore('users', { keyPath: 'id' });
                }

                // Products store with indexes
                if (!db.objectStoreNames.contains('products')) {
                    const productStore = db.createObjectStore('products', { keyPath: 'id', autoIncrement: true });
                    productStore.createIndex('companyId', 'companyId', { unique: false });
                    productStore.createIndex('category', 'category', { unique: false });
                }

                // Invoices store with indexes
                if (!db.objectStoreNames.contains('invoices')) {
                    const invoiceStore = db.createObjectStore('invoices', { keyPath: 'id', autoIncrement: true });
                    invoiceStore.createIndex('companyId', 'companyId', { unique: false });
                    invoiceStore.createIndex('createdAt', 'createdAt', { unique: false });
                }

                // Stock movements
                if (!db.objectStoreNames.contains('stockMovements')) {
                    db.createObjectStore('stockMovements', { keyPath: 'id', autoIncrement: true });
                }

                // Settings store
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    }

    async add(store, data) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(store, 'readwrite');
            const st = tx.objectStore(store);
            const request = st.add(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async put(store, data) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(store, 'readwrite');
            const st = tx.objectStore(store);
            const request = st.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async get(store, id) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(store, 'readonly');
            const st = tx.objectStore(store);
            const request = st.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAll(store) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(store, 'readonly');
            const st = tx.objectStore(store);
            const request = st.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async getByIndex(store, indexName, value) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(store, 'readonly');
            const st = tx.objectStore(store);
            const index = st.index(indexName);
            const request = index.getAll(value);
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async delete(store, id) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(store, 'readwrite');
            const st = tx.objectStore(store);
            const request = st.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clear(store) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(store, 'readwrite');
            const st = tx.objectStore(store);
            const request = st.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Export all data as JSON
    async exportAll() {
        const data = {};
        const stores = ['companies', 'users', 'products', 'invoices', 'stockMovements', 'settings'];

        for (const store of stores) {
            data[store] = await this.getAll(store);
        }

        return JSON.stringify(data, null, 2);
    }

    // Import data from JSON
    async importAll(jsonData) {
        const data = JSON.parse(jsonData);
        const stores = ['companies', 'users', 'products', 'invoices', 'stockMovements', 'settings'];

        // Clear all stores first
        for (const store of stores) {
            await this.clear(store);
        }

        // Import data
        for (const store of stores) {
            if (data[store] && Array.isArray(data[store])) {
                for (const item of data[store]) {
                    await this.put(store, item);
                }
            }
        }
    }

    // Get database size info
    async getSizeInfo() {
        const stores = ['companies', 'users', 'products', 'invoices', 'stockMovements', 'settings'];
        const info = {};

        for (const store of stores) {
            const items = await this.getAll(store);
            const size = new Blob([JSON.stringify(items)]).size;
            info[store] = {
                count: items.length,
                size: (size / 1024).toFixed(2) + ' KB'
            };
        }

        return info;
    }
}

const localDB = new LocalDB();

// LocalStorage Helpers
const Storage = {
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.error('Storage error:', e);
            return false;
        }
    },
    get(key) {
        try {
            return JSON.parse(localStorage.getItem(key));
        } catch {
            return null;
        }
    },
    remove(key) {
        localStorage.removeItem(key);
    },
    clear() {
        localStorage.clear();
    }
};

// Generate ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// Register service worker
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('sw.js');
            console.log('Service Worker registered:', registration);

            // Request background sync permission
            if ('sync' in registration) {
                await registration.sync.register('sync-data');
            }

            return registration;
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }
}

// Check online/offline status
function updateOnlineStatus() {
    const isOnline = navigator.onLine;
    document.body.classList.toggle('offline', !isOnline);

    if (!isOnline) {
        showOfflineNotification();
    } else {
        hideOfflineNotification();
    }
}

function showOfflineNotification() {
    let notification = document.getElementById('offline-notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'offline-notification';
        notification.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: #f59e0b;
            color: white;
            text-align: center;
            padding: 10px;
            z-index: 10000;
            font-weight: bold;
            direction: rtl;
        `;
        notification.textContent = '⚠️ أنت offline - البيانات ستحفظ محلياً وتتزامن عند الاتصال';
        document.body.appendChild(notification);
    }
}

function hideOfflineNotification() {
    const notification = document.getElementById('offline-notification');
    if (notification) {
        notification.remove();
    }
}

// Export data as file
downloadData = async function() {
    try {
        const data = await localDB.exportAll();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `zero-pos-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
    } catch (error) {
        console.error('Export error:', error);
        return false;
    }
};

// Import data from file
uploadData = async function(file) {
    try {
        const text = await file.text();
        await localDB.importAll(text);
        return true;
    } catch (error) {
        console.error('Import error:', error);
        return false;
    }
};

// Listen for online/offline events
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

export { localDB, Storage, generateId, registerServiceWorker };
