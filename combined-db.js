// Zero POS - Local Database (No ES6 Modules)
(function() {
    'use strict';

    const DB_NAME = 'ZeroPOS';
    const DB_VERSION = 2;

    window.LocalDB = {
        db: null,

        init: function() {
            return new Promise((resolve, reject) => {
                if (this.db) { resolve(this.db); return; }

                const request = indexedDB.open(DB_NAME, DB_VERSION);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    this.db = request.result;
                    resolve(this.db);
                };

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;

                    if (!db.objectStoreNames.contains('companies')) {
                        db.createObjectStore('companies', { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains('users')) {
                        db.createObjectStore('users', { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains('products')) {
                        const ps = db.createObjectStore('products', { keyPath: 'id' });
                        ps.createIndex('companyId', 'companyId', { unique: false });
                        ps.createIndex('category', 'category', { unique: false });
                    }
                    if (!db.objectStoreNames.contains('invoices')) {
                        const is = db.createObjectStore('invoices', { keyPath: 'id' });
                        is.createIndex('companyId', 'companyId', { unique: false });
                        is.createIndex('createdAt', 'createdAt', { unique: false });
                    }
                    if (!db.objectStoreNames.contains('stockMovements')) {
                        db.createObjectStore('stockMovements', { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains('settings')) {
                        db.createObjectStore('settings', { keyPath: 'key' });
                    }
                };
            });
        },

        add: function(store, data) {
            return this.init().then(() => new Promise((resolve, reject) => {
                const tx = this.db.transaction(store, 'readwrite');
                const st = tx.objectStore(store);
                const request = st.add(data);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            }));
        },

        put: function(store, data) {
            return this.init().then(() => new Promise((resolve, reject) => {
                const tx = this.db.transaction(store, 'readwrite');
                const st = tx.objectStore(store);
                const request = st.put(data);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            }));
        },

        get: function(store, id) {
            return this.init().then(() => new Promise((resolve, reject) => {
                const tx = this.db.transaction(store, 'readonly');
                const st = tx.objectStore(store);
                const request = st.get(id);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            }));
        },

        getAll: function(store) {
            return this.init().then(() => new Promise((resolve, reject) => {
                const tx = this.db.transaction(store, 'readonly');
                const st = tx.objectStore(store);
                const request = st.getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            }));
        },

        delete: function(store, id) {
            return this.init().then(() => new Promise((resolve, reject) => {
                const tx = this.db.transaction(store, 'readwrite');
                const st = tx.objectStore(store);
                const request = st.delete(id);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            }));
        },

        clear: function(store) {
            return this.init().then(() => new Promise((resolve, reject) => {
                const tx = this.db.transaction(store, 'readwrite');
                const st = tx.objectStore(store);
                const request = st.clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            }));
        },

        exportAll: function() {
            const stores = ['companies', 'users', 'products', 'invoices', 'stockMovements', 'settings'];
            const promises = stores.map(s => this.getAll(s));
            return Promise.all(promises).then(results => {
                const data = {};
                stores.forEach((s, i) => data[s] = results[i]);
                return JSON.stringify(data, null, 2);
            });
        },

        importAll: function(jsonData) {
            const data = JSON.parse(jsonData);
            const stores = ['companies', 'users', 'products', 'invoices', 'stockMovements', 'settings'];

            return Promise.all(stores.map(s => this.clear(s))).then(() => {
                const promises = [];
                for (const store of stores) {
                    if (data[store] && Array.isArray(data[store])) {
                        for (const item of data[store]) {
                            promises.push(this.put(store, item));
                        }
                    }
                }
                return Promise.all(promises);
            });
        }
    };

    // LocalStorage Helpers
    window.Storage = {
        set: function(key, value) {
            try { localStorage.setItem(key, JSON.stringify(value)); return true; }
            catch(e) { console.error('Storage error:', e); return false; }
        },
        get: function(key) {
            try { return JSON.parse(localStorage.getItem(key)); }
            catch { return null; }
        },
        remove: function(key) { localStorage.removeItem(key); },
        clear: function() { localStorage.clear(); }
    };

    // Generate ID
    window.generateId = function() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    };

    // Register service worker
    window.registerServiceWorker = function() {
        if ('serviceWorker' in navigator) {
            return navigator.serviceWorker.register('sw.js')
                .then(reg => { console.log('SW registered'); return reg; })
                .catch(err => { console.error('SW failed:', err); });
        }
        return Promise.resolve();
    };

    // Check online status
    window.updateOnlineStatus = function() {
        const isOnline = navigator.onLine;
        document.body.classList.toggle('offline', !isOnline);
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
})();
