// Zero POS System - Main Application Logic (Local Version)
import { localDB, Storage, generateId } from './db.js';

// Global State
let currentUser = null;
let companyData = null;
let sessionStartTime = null;
let sessionTimer = null;

// ==================== UTILITY FUNCTIONS ====================

function showAlert(message, type = 'success') {
    const existing = document.querySelector('.alert-popup');
    if (existing) existing.remove();

    const alertDiv = document.createElement('div');
    alertDiv.className = `alert-popup alert-${type}`;
    alertDiv.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 15px 30px;
        border-radius: 10px;
        color: white;
        font-weight: bold;
        z-index: 9999;
        animation: slideDown 0.3s ease-out;
        direction: rtl;
    `;
    alertDiv.style.background = type === 'success' ? '#10b981' : type === 'danger' ? '#ef4444' : '#f59e0b';
    alertDiv.textContent = message;

    document.body.appendChild(alertDiv);
    setTimeout(() => {
        alertDiv.style.animation = 'slideUp 0.3s ease-out';
        setTimeout(() => alertDiv.remove(), 300);
    }, 3000);
}

function formatDate(date) {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleDateString('ar-EG');
}

function formatDateTime(date) {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleString('ar-EG');
}

function validatePassword(password) {
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const isLongEnough = password.length >= 10;
    return hasUpper && hasLower && hasNumber && isLongEnough;
}

function getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
}

// ==================== SESSION MANAGEMENT ====================

function startSessionTimer() {
    sessionStartTime = Date.now();
    updateSessionDisplay();
    sessionTimer = setInterval(updateSessionDisplay, 1000);
}

function updateSessionDisplay() {
    const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;
    const timerEl = document.getElementById('sessionTimer');
    if (timerEl) {
        timerEl.textContent = `${hours.toString().padStart(2,'0')}:${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}`;
    }
}

function stopSessionTimer() {
    if (sessionTimer) {
        clearInterval(sessionTimer);
        sessionTimer = null;
    }
}

// ==================== COMPANY REGISTRATION ====================

async function registerCompany(e) {
    e.preventDefault();

    const companyName = document.getElementById('companyName').value.trim();
    const taxNumber = document.getElementById('taxNumber').value.trim();
    const landline = document.getElementById('landline').value.trim();
    const mobile = document.getElementById('mobile').value.trim();
    const serviceNumber = document.getElementById('serviceNumber').value.trim();
    const adminEmail = document.getElementById('adminEmail').value.trim();
    const adminPassword = document.getElementById('adminPassword').value;
    const logoFile = document.getElementById('companyLogo').files[0];

    if (!companyName || !adminEmail || !adminPassword) {
        showAlert('الرجاء ملء جميع الحقول الإلزامية', 'danger');
        return;
    }

    try {
        // Check if company already exists
        const existingCompanies = await localDB.getAll('companies');
        if (existingCompanies.length > 0) {
            showAlert('تم تسجيل شركة بالفعل! استخدم صفحة الدخول', 'danger');
            return;
        }

        // Process logo
        let logoUrl = '';
        if (logoFile) {
            logoUrl = await readFileAsDataURL(logoFile);
        }

        const companyId = generateId();
        const companyData = {
            id: companyId,
            name: companyName,
            taxNumber: taxNumber || '',
            phones: {
                landline: landline || '',
                mobile: mobile || '',
                service: serviceNumber || ''
            },
            logo: logoUrl,
            adminEmail: adminEmail,
            adminPassword: adminPassword, // In production, hash this!
            createdAt: new Date().toISOString(),
            maintenanceMode: false
        };

        await localDB.put('companies', companyData);

        // Create admin user
        const adminId = generateId();
        const adminUser = {
            id: adminId,
            name: 'المدير',
            email: adminEmail,
            password: adminPassword, // In production, hash this!
            role: 'مدير',
            permissions: ['عرض', 'تعديل', 'إضافة', 'حذف', 'طباعة'],
            isActive: true,
            createdAt: new Date().toISOString(),
            expiryDate: null,
            companyId: companyId,
            lastLogin: new Date().toISOString()
        };

        await localDB.put('users', adminUser);

        showAlert('تم تسجيل الشركة بنجاح! جاري التوجيه...', 'success');
        setTimeout(() => window.location.href = 'index.html', 2000);

    } catch (error) {
        showAlert('خطأ: ' + error.message, 'danger');
        console.error(error);
    }
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ==================== LOGIN ====================

async function login(e) {
    e.preventDefault();

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
        // Find user by email
        const users = await localDB.getAll('users');
        const user = users.find(u => u.email === email && u.password === password);

        if (!user) {
            showAlert('البريد الإلكتروني أو كلمة المرور غير صحيحة', 'danger');
            return;
        }

        // Check if account is active
        if (!user.isActive) {
            showAlert('الحساب معطل، يرجى التواصل مع المدير', 'danger');
            return;
        }

        // Check expiry date for non-admin users
        if (user.role !== 'مدير' && user.expiryDate) {
            const expiryDate = new Date(user.expiryDate);
            if (expiryDate < new Date()) {
                showAlert('صلاحية الحساب منتهية، يرجى التواصل مع المدير', 'danger');
                return;
            }
        }

        // Check maintenance mode
        const companies = await localDB.getAll('companies');
        const company = companies[0];
        if (company && company.maintenanceMode && user.role !== 'مدير') {
            showAlert('النظام تحت الصيانة حالياً', 'warning');
            return;
        }

        // Update last login
        user.lastLogin = new Date().toISOString();
        await localDB.put('users', user);

        currentUser = user;

        // Save session
        Storage.set('currentUser', user);
        Storage.set('sessionStart', Date.now().toString());

        showAlert(`مرحباً ${user.name}!`, 'success');
        window.location.href = 'dashboard.html';

    } catch (error) {
        showAlert('خطأ في تسجيل الدخول: ' + error.message, 'danger');
        console.error(error);
    }
}

// ==================== LOAD COMPANY DATA ====================

async function loadCompanyData() {
    try {
        const companies = await localDB.getAll('companies');
        if (companies.length > 0) {
            companyData = companies[0];

            // Update UI with company data
            document.querySelectorAll('.company-name-display').forEach(el => {
                el.textContent = companyData.name;
            });

            document.querySelectorAll('.company-logo-display').forEach(el => {
                if (companyData.logo) el.src = companyData.logo;
            });

            // Update sidebar
            const sidebarLogo = document.getElementById('sidebarLogo');
            const sidebarCompany = document.getElementById('sidebarCompany');
            if (sidebarLogo && companyData.logo) sidebarLogo.src = companyData.logo;
            if (sidebarCompany) sidebarCompany.textContent = companyData.name;
        }
    } catch (error) {
        console.error('Error loading company data:', error);
    }
}

// ==================== USER MANAGEMENT ====================

async function loadUsers() {
    try {
        const userData = Storage.get('currentUser');
        if (!userData || userData.role !== 'مدير') return;

        const users = await localDB.getAll('users');
        const companyUsers = users.filter(u => u.companyId === userData.companyId);

        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (companyUsers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">لا يوجد مستخدمين</td></tr>';
            return;
        }

        companyUsers.forEach(user => {
            const createdAt = formatDate(user.createdAt);
            const expiryDate = user.expiryDate ? formatDate(user.expiryDate) : 'دائم';
            const hoursOnline = user.lastLogin ? 
                Math.floor((Date.now() - new Date(user.lastLogin).getTime()) / (1000 * 60 * 60)) : 0;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${user.name}</strong></td>
                <td>${user.email}</td>
                <td><span class="badge badge-${user.role === 'مدير' ? 'danger' : user.role === 'مشرف' ? 'warning' : 'info'}">${user.role}</span></td>
                <td>${hoursOnline} ساعة</td>
                <td>${createdAt}</td>
                <td>${expiryDate}</td>
                <td>
                    <span class="badge badge-${user.isActive ? 'success' : 'danger'}">${user.isActive ? 'نشط' : 'معطل'}</span>
                </td>
                <td>
                    <button class="btn btn-sm btn-warning" onclick="editUser('${user.id}')">تعديل</button>
                    <button class="btn btn-sm btn-secondary" onclick="extendUser('${user.id}')">+ أيام</button>
                    <button class="btn btn-sm btn-${user.isActive ? 'danger' : 'success'}" onclick="toggleUser('${user.id}', ${!user.isActive})">${user.isActive ? 'تعطيل' : 'تفعيل'}</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteUser('${user.id}')">حذف</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error('Error loading users:', error);
    }
}

async function addNewUser(e) {
    e.preventDefault();

    const currentUserData = Storage.get('currentUser');
    if (!currentUserData || currentUserData.role !== 'مدير') {
        showAlert('غير مصرح لك بإضافة مستخدمين', 'danger');
        return;
    }

    const name = document.getElementById('userName').value.trim();
    const email = document.getElementById('userEmail').value.trim();
    const password = document.getElementById('userPassword').value;
    const role = document.getElementById('userRole').value;
    const expiryDays = parseInt(document.getElementById('expiryDays').value) || 30;

    if (!validatePassword(password)) {
        showAlert('كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم وأن لا تقل عن 10 أحرف', 'danger');
        return;
    }

    try {
        // Check if email already exists
        const existingUsers = await localDB.getAll('users');
        if (existingUsers.some(u => u.email === email)) {
            showAlert('البريد الإلكتروني مستخدم بالفعل', 'danger');
            return;
        }

        // Calculate expiry date
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + expiryDays);

        // Set permissions based on role
        let permissions = [];
        if (role === 'مدير') {
            permissions = ['عرض', 'تعديل', 'إضافة', 'حذف', 'طباعة'];
        } else if (role === 'مشرف') {
            permissions = ['عرض', 'تعديل', 'إضافة', 'طباعة'];
        } else if (role === 'كاشير') {
            permissions = ['عرض', 'إضافة', 'طباعة'];
        } else {
            permissions = ['عرض'];
        }

        const newUser = {
            id: generateId(),
            name: name,
            email: email,
            password: password,
            role: role,
            permissions: permissions,
            isActive: true,
            createdAt: new Date().toISOString(),
            expiryDate: role === 'مدير' ? null : expiryDate.toISOString(),
            companyId: currentUserData.companyId,
            createdBy: currentUserData.id,
            lastLogin: null
        };

        await localDB.put('users', newUser);

        showAlert(`تم إضافة المستخدم ${name} بنجاح!`, 'success');
        closeModal('addUserModal');
        document.getElementById('addUserForm').reset();
        loadUsers();

    } catch (error) {
        showAlert('خطأ: ' + error.message, 'danger');
    }
}

async function toggleUser(uid, active) {
    try {
        const user = await localDB.get('users', uid);
        if (user) {
            user.isActive = active;
            await localDB.put('users', user);
            showAlert(active ? 'تم تفعيل المستخدم' : 'تم تعطيل المستخدم', 'success');
            loadUsers();
        }
    } catch (error) {
        showAlert('خطأ: ' + error.message, 'danger');
    }
}

async function deleteUser(uid) {
    if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟')) return;

    try {
        await localDB.delete('users', uid);
        showAlert('تم حذف المستخدم بنجاح', 'success');
        loadUsers();
    } catch (error) {
        showAlert('خطأ: ' + error.message, 'danger');
    }
}

async function extendUser(uid) {
    const days = prompt('أدخل عدد الأيام لإضافتها:');
    if (!days || isNaN(days)) return;

    try {
        const user = await localDB.get('users', uid);
        if (user) {
            let currentExpiry = user.expiryDate ? new Date(user.expiryDate) : new Date();
            currentExpiry.setDate(currentExpiry.getDate() + parseInt(days));

            user.expiryDate = currentExpiry.toISOString();
            await localDB.put('users', user);

            showAlert(`تم إضافة ${days} يوم بنجاح`, 'success');
            loadUsers();
        }
    } catch (error) {
        showAlert('خطأ: ' + error.message, 'danger');
    }
}

// ==================== MAINTENANCE MODE ====================

async function toggleMaintenance() {
    const userData = Storage.get('currentUser');
    if (!userData || userData.role !== 'مدير') {
        showAlert('غير مصرح لك', 'danger');
        return;
    }

    try {
        const companies = await localDB.getAll('companies');
        if (companies.length > 0) {
            const company = companies[0];
            company.maintenanceMode = !company.maintenanceMode;
            await localDB.put('companies', company);

            showAlert(company.maintenanceMode ? 'تم تفعيل وضع الصيانة' : 'تم إلغاء وضع الصيانة', 'success');

            if (company.maintenanceMode) {
                alert('سيتم تسجيل خروج جميع المستخدمين عند تحديث الصفحة!');
            }
        }
    } catch (error) {
        showAlert('خطأ: ' + error.message, 'danger');
    }
}

// ==================== PRODUCTS ====================

async function addProduct(e) {
    e.preventDefault();

    const userData = Storage.get('currentUser');
    if (!userData) return;

    const product = {
        id: generateId(),
        name: document.getElementById('productName').value.trim(),
        code: document.getElementById('productCode').value.trim(),
        category: document.getElementById('productCategory').value.trim(),
        purchasePrice: parseFloat(document.getElementById('purchasePrice').value) || 0,
        salePrice: parseFloat(document.getElementById('salePrice').value) || 0,
        quantity: parseInt(document.getElementById('productQuantity').value) || 0,
        minQuantity: parseInt(document.getElementById('minQuantity').value) || 5,
        unit: document.getElementById('productUnit').value,
        description: document.getElementById('productDescription').value.trim(),
        companyId: userData.companyId,
        createdAt: new Date().toISOString(),
        createdBy: userData.id,
        updatedAt: new Date().toISOString()
    };

    try {
        await localDB.put('products', product);
        showAlert('تم إضافة المنتج بنجاح', 'success');
        closeModal('addProductModal');
        document.getElementById('addProductForm').reset();
        loadProducts();
    } catch (error) {
        showAlert('خطأ: ' + error.message, 'danger');
    }
}

async function loadProducts() {
    try {
        const userData = Storage.get('currentUser');
        if (!userData) return;

        const products = await localDB.getAll('products');
        const companyProducts = products.filter(p => p.companyId === userData.companyId);

        const tbody = document.getElementById('productsTableBody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (companyProducts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">لا توجد منتجات</td></tr>';
            return;
        }

        companyProducts.forEach(product => {
            const profit = product.salePrice - product.purchasePrice;
            const isLowStock = product.quantity <= product.minQuantity;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${product.code}</td>
                <td><strong>${product.name}</strong></td>
                <td>${product.category}</td>
                <td>${product.purchasePrice.toFixed(2)}</td>
                <td>${product.salePrice.toFixed(2)}</td>
                <td><span class="badge badge-${isLowStock ? 'danger' : 'success'}">${product.quantity} ${product.unit}</span></td>
                <td>${profit.toFixed(2)}</td>
                <td>
                    <button class="btn btn-sm btn-warning" onclick="editProduct('${product.id}')">تعديل</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteProduct('${product.id}')">حذف</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error('Error loading products:', error);
    }
}

// ==================== SALES / POS ====================

let cart = [];

async function loadProductsForSale() {
    try {
        const userData = Storage.get('currentUser');
        if (!userData) return;

        const products = await localDB.getAll('products');
        const companyProducts = products.filter(p => p.companyId === userData.companyId && p.quantity > 0);

        const grid = document.getElementById('productsGrid');
        const select = document.getElementById('saleProduct');

        if (grid) {
            grid.innerHTML = '';
            if (companyProducts.length === 0) {
                grid.innerHTML = '<div style="text-align:center; grid-column:1/-1;">لا توجد منتجات متاحة</div>';
                return;
            }

            companyProducts.forEach(product => {
                const isLowStock = product.quantity <= product.minQuantity;
                const card = document.createElement('div');
                card.className = 'product-card';
                card.innerHTML = `
                    <div style="font-size:40px;">📦</div>
                    <h4>${product.name}</h4>
                    <div class="price">${product.salePrice.toFixed(2)} ج.م</div>
                    <div class="stock" style="color:${isLowStock ? 'var(--danger)' : 'var(--secondary)'};">
                        ${isLowStock ? '⚠️ ' : ''}المخزون: ${product.quantity} ${product.unit}
                    </div>
                `;
                card.onclick = () => addToCartFromProduct(product);
                grid.appendChild(card);
            });
        }

        if (select) {
            select.innerHTML = '<option value="">-- اختر منتج --</option>';
            companyProducts.forEach(product => {
                select.innerHTML += `<option value="${product.id}" data-price="${product.salePrice}" data-stock="${product.quantity}">${product.name} - ${product.salePrice.toFixed(2)} ج.م</option>`;
            });
        }

        return companyProducts;
    } catch (error) {
        console.error('Error loading products for sale:', error);
        return [];
    }
}

function addToCartFromProduct(product) {
    const existingItem = cart.find(item => item.id === product.id);
    if (existingItem) {
        if (existingItem.quantity < product.quantity) {
            existingItem.quantity++;
            existingItem.total = existingItem.quantity * existingItem.price;
        } else {
            showAlert('الكمية المتاحة غير كافية', 'warning');
            return;
        }
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: product.salePrice,
            quantity: 1,
            total: product.salePrice
        });
    }
    updateCartDisplay();
}

function updateCartDisplay() {
    const tbody = document.getElementById('cartItems');
    if (!tbody) return;

    tbody.innerHTML = '';
    let total = 0;

    if (cart.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">السلة فارغة</td></tr>';
        document.getElementById('cartTotal').textContent = '0.00';
        return;
    }

    cart.forEach((item, index) => {
        total += item.total;
        tbody.innerHTML += `
            <tr>
                <td>${item.name}</td>
                <td>${item.price.toFixed(2)}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="changeQty(${index}, -1)">-</button>
                    ${item.quantity}
                    <button class="btn btn-sm btn-secondary" onclick="changeQty(${index}, 1)">+</button>
                </td>
                <td>${item.total.toFixed(2)}</td>
                <td><button class="btn btn-sm btn-danger" onclick="removeCartItem(${index})">×</button></td>
            </tr>
        `;
    });

    const discount = parseFloat(document.getElementById('saleDiscount')?.value) || 0;
    document.getElementById('cartTotal').textContent = (total - discount).toFixed(2);
}

function changeQty(index, change) {
    const item = cart[index];
    // Get current stock from loaded products
    loadProductsForSale().then(products => {
        const product = products.find(p => p.id === item.id);
        if (!product) return;

        if (change > 0 && item.quantity >= product.quantity) {
            showAlert('الكمية المتاحة غير كافية', 'warning');
            return;
        }

        item.quantity += change;
        if (item.quantity <= 0) {
            cart.splice(index, 1);
        } else {
            item.total = item.quantity * item.price;
        }
        updateCartDisplay();
    });
}

function removeCartItem(index) {
    cart.splice(index, 1);
    updateCartDisplay();
}

function clearCart() {
    cart = [];
    updateCartDisplay();
    const customerName = document.getElementById('customerName');
    const saleDiscount = document.getElementById('saleDiscount');
    if (customerName) customerName.value = '';
    if (saleDiscount) saleDiscount.value = '0';
}

async function completeSale() {
    if (cart.length === 0) {
        showAlert('السلة فارغة', 'warning');
        return;
    }

    const userData = Storage.get('currentUser');
    const customerName = document.getElementById('customerName')?.value || 'عميل نقدي';
    const discount = parseFloat(document.getElementById('saleDiscount')?.value) || 0;

    let subtotal = 0;
    cart.forEach(item => subtotal += item.total);
    const total = subtotal - discount;

    try {
        const invoice = {
            id: generateId(),
            invoiceNumber: 'INV-' + Date.now(),
            customerName: customerName,
            items: cart.map(item => ({...item})),
            subtotal: subtotal,
            discount: discount,
            total: total,
            companyId: userData.companyId,
            createdBy: userData.id,
            createdByName: userData.name,
            createdAt: new Date().toISOString(),
            status: 'مكتملة'
        };

        await localDB.put('invoices', invoice);

        // Update product quantities
        const products = await localDB.getAll('products');
        for (const item of cart) {
            const product = products.find(p => p.id === item.id);
            if (product) {
                product.quantity -= item.quantity;
                product.updatedAt = new Date().toISOString();
                await localDB.put('products', product);
            }
        }

        showAlert('تم إتمام البيع بنجاح!', 'success');

        // Print invoice
        if (confirm('هل تريد طباعة الفاتورة؟')) {
            printInvoice(invoice.id);
        }

        clearCart();
        loadProductsForSale();

    } catch (error) {
        showAlert('خطأ: ' + error.message, 'danger');
    }
}

// ==================== INVOICES ====================

async function loadInvoices() {
    try {
        const userData = Storage.get('currentUser');
        if (!userData) return;

        const invoices = await localDB.getAll('invoices');
        const companyInvoices = invoices.filter(inv => inv.companyId === userData.companyId);

        const tbody = document.getElementById('invoicesTableBody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (companyInvoices.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">لا توجد فواتير</td></tr>';
            return;
        }

        // Sort by date descending
        companyInvoices.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        companyInvoices.forEach(invoice => {
            const date = formatDate(invoice.createdAt);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${invoice.invoiceNumber}</strong></td>
                <td>${invoice.customerName}</td>
                <td>${invoice.items ? invoice.items.length : 0} منتجات</td>
                <td>${invoice.total ? invoice.total.toFixed(2) : '0.00'} ج.م</td>
                <td><span class="badge badge-${invoice.status === 'مكتملة' ? 'success' : 'warning'}">${invoice.status || 'مكتملة'}</span></td>
                <td>${date}</td>
                <td>${invoice.createdByName || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="viewInvoice('${invoice.id}')">👁️ عرض</button>
                    <button class="btn btn-sm btn-info" onclick="printInvoice('${invoice.id}')">🖨️ طباعة</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error('Error loading invoices:', error);
    }
}

async function viewInvoice(invoiceId) {
    try {
        const invoice = await localDB.get('invoices', invoiceId);
        if (!invoice) {
            showAlert('الفاتورة غير موجودة', 'danger');
            return;
        }

        const companies = await localDB.getAll('companies');
        const company = companies[0];

        const date = formatDateTime(invoice.createdAt);

        let itemsHtml = '';
        if (invoice.items) {
            invoice.items.forEach((item, index) => {
                itemsHtml += `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${item.name}</td>
                        <td>${item.price.toFixed(2)}</td>
                        <td>${item.quantity}</td>
                        <td>${item.total.toFixed(2)}</td>
                    </tr>
                `;
            });
        }

        const content = document.getElementById('invoiceContent');
        if (content) {
            content.innerHTML = `
                <div class="invoice-print" id="printableInvoice">
                    <div class="invoice-header">
                        ${company && company.logo ? `<img src="${company.logo}" alt="شعار الشركة">` : ''}
                        <h2>${company ? company.name : 'Zero POS'}</h2>
                        ${company && company.taxNumber ? `<p>الرقم الضريبي: ${company.taxNumber}</p>` : ''}
                        ${company && company.phones ? `
                            <p style="font-size:14px; color:#666;">
                                ${company.phones.mobile ? `موبايل: ${company.phones.mobile} | ` : ''}
                                ${company.phones.landline ? `أرضي: ${company.phones.landline} | ` : ''}
                                ${company.phones.service ? `خدمة: ${company.phones.service}` : ''}
                            </p>
                        ` : ''}
                    </div>

                    <div class="invoice-details">
                        <div>
                            <p><strong>رقم الفاتورة:</strong> ${invoice.invoiceNumber}</p>
                            <p><strong>التاريخ:</strong> ${date}</p>
                            <p><strong>الحالة:</strong> ${invoice.status || 'مكتملة'}</p>
                        </div>
                        <div>
                            <p><strong>العميل:</strong> ${invoice.customerName}</p>
                            <p><strong>الكاشير:</strong> ${invoice.createdByName || '-'}</p>
                        </div>
                    </div>

                    <table class="invoice-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>المنتج</th>
                                <th>السعر</th>
                                <th>الكمية</th>
                                <th>الإجمالي</th>
                            </tr>
                        </thead>
                        <tbody>${itemsHtml}</tbody>
                    </table>

                    <div class="invoice-totals">
                        <div><strong>المجموع:</strong> ${invoice.subtotal ? invoice.subtotal.toFixed(2) : '0.00'} ج.م</div>
                        ${invoice.discount > 0 ? `<div><strong>الخصم:</strong> ${invoice.discount.toFixed(2)} ج.م</div>` : ''}
                        <div class="grand-total"><strong>الإجمالي النهائي:</strong> ${invoice.total ? invoice.total.toFixed(2) : '0.00'} ج.م</div>
                    </div>

                    <div style="text-align:center; margin-top:40px; padding-top:20px; border-top:1px dashed #ccc;">
                        <p style="font-size:14px; color:#666;">شكراً لثقتكم بنا</p>
                        <p style="font-size:12px; color:#999;">تم إنشاء هذه الفاتورة بواسطة نظام Zero POS</p>
                    </div>
                </div>
            `;
            openModal('invoiceViewModal');
        }
    } catch (error) {
        showAlert('خطأ: ' + error.message, 'danger');
    }
}

async function printInvoice(invoiceId) {
    await viewInvoice(invoiceId);
    setTimeout(() => window.print(), 500);
}

// ==================== REPORTS ====================

async function generateSalesReport(fromDate, toDate, companyId) {
    const invoices = await localDB.getAll('invoices');
    const filtered = invoices.filter(inv => {
        const invDate = new Date(inv.createdAt);
        return inv.companyId === companyId && invDate >= fromDate && invDate <= toDate;
    });

    let totalSales = 0, totalInvoices = 0, totalDiscounts = 0;
    const dailySales = {};

    filtered.forEach(inv => {
        totalSales += inv.total || 0;
        totalInvoices++;
        totalDiscounts += inv.discount || 0;
        const dateKey = new Date(inv.createdAt).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
        dailySales[dateKey] = (dailySales[dateKey] || 0) + inv.total;
    });

    const totalSalesEl = document.getElementById('totalSales');
    const totalInvoicesEl = document.getElementById('totalInvoices');
    const avgInvoiceEl = document.getElementById('avgInvoice');
    const totalDiscountsEl = document.getElementById('totalDiscounts');

    if (totalSalesEl) totalSalesEl.textContent = totalSales.toFixed(2) + ' ج.م';
    if (totalInvoicesEl) totalInvoicesEl.textContent = totalInvoices;
    if (avgInvoiceEl) avgInvoiceEl.textContent = totalInvoices > 0 ? (totalSales / totalInvoices).toFixed(2) + ' ج.م' : '0 ج.م';
    if (totalDiscountsEl) totalDiscountsEl.textContent = totalDiscounts.toFixed(2) + ' ج.م';

    const chartContainer = document.getElementById('salesChart');
    if (chartContainer) {
        if (Object.keys(dailySales).length === 0) {
            chartContainer.innerHTML = '<div style="text-align:center; width:100%; color:var(--secondary);">لا توجد بيانات في هذا النطاق</div>';
            return;
        }

        const maxValue = Math.max(...Object.values(dailySales));
        chartContainer.innerHTML = '';

        Object.entries(dailySales).forEach(([date, value]) => {
            const height = maxValue > 0 ? (value / maxValue) * 100 : 0;
            const bar = document.createElement('div');
            bar.className = 'bar';
            bar.style.height = height + '%';
            bar.innerHTML = `<div class="bar-value">${value.toFixed(0)}</div><div class="bar-label">${date}</div>`;
            chartContainer.appendChild(bar);
        });
    }
}

async function generateProductsReport(fromDate, toDate, companyId) {
    const invoices = await localDB.getAll('invoices');
    const filtered = invoices.filter(inv => {
        const invDate = new Date(inv.createdAt);
        return inv.companyId === companyId && invDate >= fromDate && invDate <= toDate;
    });

    const productStats = {};
    let grandTotal = 0;

    filtered.forEach(inv => {
        if (inv.items) {
            inv.items.forEach(item => {
                if (!productStats[item.name]) productStats[item.name] = { qty: 0, total: 0 };
                productStats[item.name].qty += item.quantity;
                productStats[item.name].total += item.total;
                grandTotal += item.total;
            });
        }
    });

    const tbody = document.getElementById('topProductsTable');
    if (tbody) {
        tbody.innerHTML = '';
        const sorted = Object.entries(productStats).sort((a, b) => b[1].total - a[1].total);

        if (sorted.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">لا توجد بيانات</td></tr>';
            return;
        }

        sorted.forEach(([name, stats], index) => {
            const percentage = grandTotal > 0 ? ((stats.total / grandTotal) * 100).toFixed(1) : 0;
            tbody.innerHTML += `
                <tr>
                    <td>${index + 1}</td>
                    <td><strong>${name}</strong></td>
                    <td>${stats.qty}</td>
                    <td>${stats.total.toFixed(2)} ج.م</td>
                    <td>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <div style="flex:1; background:var(--border); height:8px; border-radius:4px; overflow:hidden;">
                                <div style="width:${percentage}%; background:var(--primary); height:100%;"></div>
                            </div>
                            <span>${percentage}%</span>
                        </div>
                    </td>
                </tr>
            `;
        });
    }
}

async function generateInventoryReport(companyId) {
    const products = await localDB.getAll('products');
    const companyProducts = products.filter(p => p.companyId === companyId);

    let totalValue = 0, lowStock = 0;
    companyProducts.forEach(product => {
        totalValue += (product.purchasePrice || 0) * (product.quantity || 0);
        if (product.quantity <= (product.minQuantity || 5)) lowStock++;
    });

    const inventoryValueEl = document.getElementById('inventoryValue');
    const lowStockCountEl = document.getElementById('lowStockCount');
    const totalProductsEl = document.getElementById('totalProducts');

    if (inventoryValueEl) inventoryValueEl.textContent = totalValue.toFixed(2) + ' ج.م';
    if (lowStockCountEl) lowStockCountEl.textContent = lowStock;
    if (totalProductsEl) totalProductsEl.textContent = companyProducts.length;
}

async function generateUsersReport(fromDate, toDate, companyId) {
    const invoices = await localDB.getAll('invoices');
    const filtered = invoices.filter(inv => {
        const invDate = new Date(inv.createdAt);
        return inv.companyId === companyId && invDate >= fromDate && invDate <= toDate;
    });

    const userStats = {};
    filtered.forEach(inv => {
        const userName = inv.createdByName || 'غير معروف';
        if (!userStats[userName]) userStats[userName] = { invoices: 0, total: 0 };
        userStats[userName].invoices++;
        userStats[userName].total += inv.total || 0;
    });

    const tbody = document.getElementById('usersReportTable');
    if (tbody) {
        tbody.innerHTML = '';
        if (Object.keys(userStats).length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">لا توجد بيانات</td></tr>';
            return;
        }
        Object.entries(userStats).forEach(([name, stats]) => {
            tbody.innerHTML += `<tr><td><strong>${name}</strong></td><td>-</td><td>${stats.invoices}</td><td>${stats.total.toFixed(2)} ج.م</td><td>${stats.invoices > 0 ? (stats.total / stats.invoices).toFixed(2) : '0'} ج.م</td></tr>`;
        });
    }
}

// ==================== LOGOUT ====================

function logout() {
    stopSessionTimer();
    Storage.remove('currentUser');
    Storage.remove('sessionStart');
    window.location.href = 'index.html';
}

// ==================== MODAL FUNCTIONS ====================

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

// ==================== INITIALIZATION ====================

function init() {
    // Check auth state
    const userData = Storage.get('currentUser');
    const publicPages = ['index.html', 'register.html', ''];
    const currentPage = window.location.pathname.split('/').pop();

    if (userData) {
        currentUser = userData;
        loadCompanyData();

        // Update user display
        document.querySelectorAll('.current-user-name').forEach(el => {
            el.textContent = userData.name;
        });
        document.querySelectorAll('.current-user-role').forEach(el => {
            el.textContent = userData.role;
        });

        // Start session timer
        const sessionStart = Storage.get('sessionStart');
        if (sessionStart) {
            sessionStartTime = parseInt(sessionStart);
            startSessionTimer();
        }

        // Show/hide admin-only elements
        if (userData.role === 'مدير') {
            document.querySelectorAll('.admin-only').forEach(el => {
                el.style.display = 'flex';
            });
        } else {
            document.querySelectorAll('.admin-only').forEach(el => {
                el.style.display = 'none';
            });
        }

        // Load page-specific data
        if (currentPage === 'users.html') loadUsers();
        if (currentPage === 'products.html') loadProducts();
        if (currentPage === 'sales.html') loadProductsForSale();
        if (currentPage === 'inventory.html') loadInventory();
        if (currentPage === 'invoices.html') loadInvoices();
        if (currentPage === 'dashboard.html') loadDashboardStats();
        if (currentPage === 'reports.html') generateReport();

    } else {
        // Not logged in, redirect to login if not on public page
        if (!publicPages.includes(currentPage)) {
            window.location.href = 'index.html';
        }
    }

    // Setup event listeners
    setupEventListeners();
}

function setupEventListeners() {
    // Company registration form
    const companyForm = document.getElementById('companyRegisterForm');
    if (companyForm) companyForm.addEventListener('submit', registerCompany);

    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', login);

    // Add user form
    const addUserForm = document.getElementById('addUserForm');
    if (addUserForm) addUserForm.addEventListener('submit', addNewUser);

    // Add product form
    const addProductForm = document.getElementById('addProductForm');
    if (addProductForm) addProductForm.addEventListener('submit', addProduct);

    // Logout buttons
    document.querySelectorAll('.logout-btn').forEach(btn => {
        btn.addEventListener('click', logout);
    });

    // Modal close buttons
    document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal-overlay');
            if (modal) modal.classList.remove('active');
        });
    });
}

// ==================== DASHBOARD STATS ====================

async function loadDashboardStats() {
    const userData = Storage.get('currentUser');
    if (!userData) return;

    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const invoices = await localDB.getAll('invoices');
        const todayInvoices = invoices.filter(inv => {
            const invDate = new Date(inv.createdAt);
            return inv.companyId === userData.companyId && invDate >= today;
        });

        let todayTotal = 0;
        todayInvoices.forEach(inv => todayTotal += inv.total || 0);

        const todaySalesEl = document.getElementById('todaySales');
        const todayInvoicesEl = document.getElementById('todayInvoices');
        if (todaySalesEl) todaySalesEl.textContent = todayTotal.toFixed(2) + ' ج.م';
        if (todayInvoicesEl) todayInvoicesEl.textContent = todayInvoices.length;

        // Total products
        const products = await localDB.getAll('products');
        const companyProducts = products.filter(p => p.companyId === userData.companyId);
        const totalProductsEl = document.getElementById('totalProducts');
        if (totalProductsEl) totalProductsEl.textContent = companyProducts.length;

        // Low stock
        let lowStockCount = 0;
        companyProducts.forEach(p => {
            if (p.quantity <= (p.minQuantity || 5)) lowStockCount++;
        });
        const lowStockEl = document.getElementById('lowStock');
        if (lowStockEl) lowStockEl.textContent = lowStockCount;

        // Recent invoices
        const recentInvoicesBody = document.getElementById('recentInvoicesBody');
        if (recentInvoicesBody) {
            recentInvoicesBody.innerHTML = '';
            const recent = companyInvoices
                .filter(inv => inv.companyId === userData.companyId)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, 5);

            if (recent.length === 0) {
                recentInvoicesBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">لا توجد فواتير</td></tr>';
                return;
            }

            recent.forEach(inv => {
                const date = formatDate(inv.createdAt);
                recentInvoicesBody.innerHTML += `
                    <tr>
                        <td><strong>${inv.invoiceNumber}</strong></td>
                        <td>${inv.customerName}</td>
                        <td>${inv.total ? inv.total.toFixed(2) : '0.00'} ج.م</td>
                        <td><span class="badge badge-success">${inv.status || 'مكتملة'}</span></td>
                        <td>${date}</td>
                    </tr>
                `;
            });
        }
    } catch (error) {
        console.error('Dashboard stats error:', error);
    }
}

// ==================== INVENTORY ====================

async function loadInventory() {
    const userData = Storage.get('currentUser');
    if (!userData) return;

    try {
        const products = await localDB.getAll('products');
        const companyProducts = products.filter(p => p.companyId === userData.companyId);

        const tbody = document.getElementById('inventoryTableBody');
        const lowStockContainer = document.getElementById('lowStockAlert');

        if (tbody) {
            tbody.innerHTML = '';
            companyProducts.forEach(product => {
                const isLow = product.quantity <= (product.minQuantity || 5);
                tbody.innerHTML += `
                    <tr>
                        <td>${product.code}</td>
                        <td><strong>${product.name}</strong></td>
                        <td>${product.category}</td>
                        <td>${product.quantity} ${product.unit}</td>
                        <td>${product.minQuantity || 5}</td>
                        <td><span class="badge badge-${isLow ? 'danger' : 'success'}">${isLow ? 'منخفض ⚠️' : 'متوفر ✅'}</span></td>
                        <td>${product.updatedAt ? formatDate(product.updatedAt) : '-'}</td>
                    </tr>
                `;
            });
        }

        if (lowStockContainer) {
            lowStockContainer.innerHTML = '';
            const lowStockProducts = companyProducts.filter(p => p.quantity <= (p.minQuantity || 5));

            if (lowStockProducts.length === 0) {
                lowStockContainer.innerHTML = '<div style="text-align:center; color:var(--success); padding:20px;">✅ جميع المنتجات متوفرة بكميات جيدة</div>';
            } else {
                lowStockProducts.forEach(product => {
                    const stockPercent = Math.min((product.quantity / (product.minQuantity * 3 || 15)) * 100, 100);
                    const barColor = stockPercent > 50 ? 'green' : stockPercent > 25 ? 'yellow' : 'red';

                    lowStockContainer.innerHTML += `
                        <div class="inventory-card" style="border-right: 4px solid var(--danger);">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <div>
                                    <h4>${product.name}</h4>
                                    <p style="color:var(--secondary); font-size:14px;">الكود: ${product.code}</p>
                                </div>
                                <div style="text-align:center;">
                                    <div style="font-size:28px; font-weight:bold; color:var(--danger);">${product.quantity}</div>
                                    <div style="font-size:12px;">متبقي</div>
                                </div>
                            </div>
                            <div class="stock-bar">
                                <div class="stock-bar-fill ${barColor}" style="width:${stockPercent}%"></div>
                            </div>
                        </div>
                    `;
                });
            }
        }

        // Update stats
        const totalItemsEl = document.getElementById('totalItems');
        const inventoryValueEl = document.getElementById('inventoryValue');
        const lowStockItemsEl = document.getElementById('lowStockItems');
        const categoriesCountEl = document.getElementById('categoriesCount');

        let totalValue = 0, lowStock = 0;
        const categories = new Set();

        companyProducts.forEach(p => {
            totalValue += (p.purchasePrice || 0) * (p.quantity || 0);
            if (p.quantity <= (p.minQuantity || 5)) lowStock++;
            categories.add(p.category);
        });

        if (totalItemsEl) totalItemsEl.textContent = companyProducts.length;
        if (inventoryValueEl) inventoryValueEl.textContent = totalValue.toFixed(2) + ' ج.م';
        if (lowStockItemsEl) lowStockItemsEl.textContent = lowStock;
        if (categoriesCountEl) categoriesCountEl.textContent = categories.size;

        // Populate stock select
        const stockSelect = document.getElementById('stockProduct');
        if (stockSelect) {
            stockSelect.innerHTML = '<option value="">-- اختر منتج --</option>';
            companyProducts.forEach(p => {
                stockSelect.innerHTML += `<option value="${p.id}">${p.name} (متوفر: ${p.quantity})</option>`;
            });
        }

    } catch (error) {
        console.error('Error loading inventory:', error);
    }
}

// ==================== REPORTS ====================

async function generateReport() {
    const fromDateInput = document.getElementById('fromDate');
    const toDateInput = document.getElementById('toDate');
    const reportTypeSelect = document.getElementById('reportType');

    if (!fromDateInput || !toDateInput || !reportTypeSelect) return;

    const fromDate = new Date(fromDateInput.value);
    const toDate = new Date(toDateInput.value);
    toDate.setHours(23, 59, 59, 999);
    const reportType = reportTypeSelect.value;

    const userData = Storage.get('currentUser');
    if (!userData) return;

    // Hide all reports
    const salesReport = document.getElementById('salesReport');
    const productsReport = document.getElementById('productsReport');
    const inventoryReport = document.getElementById('inventoryReport');
    const usersReport = document.getElementById('usersReport');

    if (salesReport) salesReport.style.display = 'none';
    if (productsReport) productsReport.style.display = 'none';
    if (inventoryReport) inventoryReport.style.display = 'none';
    if (usersReport) usersReport.style.display = 'none';

    try {
        if (reportType === 'sales') {
            await generateSalesReport(fromDate, toDate, userData.companyId);
            if (salesReport) salesReport.style.display = 'block';
        } else if (reportType === 'products') {
            await generateProductsReport(fromDate, toDate, userData.companyId);
            if (productsReport) productsReport.style.display = 'block';
        } else if (reportType === 'inventory') {
            await generateInventoryReport(userData.companyId);
            if (inventoryReport) inventoryReport.style.display = 'block';
        } else if (reportType === 'users') {
            await generateUsersReport(fromDate, toDate, userData.companyId);
            if (usersReport) usersReport.style.display = 'block';
        }
    } catch (error) {
        console.error('Report error:', error);
        showAlert('خطأ في تحميل التقرير', 'danger');
    }
}

// ==================== STOCK MANAGEMENT ====================

async function addStock(e) {
    e.preventDefault();

    const productId = document.getElementById('stockProduct').value;
    const quantity = parseInt(document.getElementById('addQuantity').value);
    const notes = document.getElementById('stockNotes').value;

    if (!productId || !quantity) {
        showAlert('الرجاء اختيار منتج وإدخال الكمية', 'warning');
        return;
    }

    try {
        const product = await localDB.get('products', productId);
        if (!product) {
            showAlert('المنتج غير موجود', 'danger');
            return;
        }

        const newQty = product.quantity + quantity;
        product.quantity = newQty;
        product.updatedAt = new Date().toISOString();
        await localDB.put('products', product);

        // Add stock movement record
        const userData = Storage.get('currentUser');
        await localDB.put('stockMovements', {
            id: generateId(),
            productId: productId,
            productName: product.name,
            type: 'إضافة',
            quantity: quantity,
            previousQty: product.quantity - quantity,
            newQty: newQty,
            notes: notes,
            companyId: userData.companyId,
            createdBy: userData.id,
            createdAt: new Date().toISOString()
        });

        showAlert(`تم إضافة ${quantity} ${product.unit} إلى ${product.name}`, 'success');
        closeModal('addStockModal');
        document.getElementById('addStockForm').reset();
        loadInventory();

    } catch (error) {
        showAlert('خطأ: ' + error.message, 'danger');
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Export functions for global access
window.openModal = openModal;
window.closeModal = closeModal;
window.toggleUser = toggleUser;
window.deleteUser = deleteUser;
window.extendUser = extendUser;
window.toggleMaintenance = toggleMaintenance;
window.changeQty = changeQty;
window.removeCartItem = removeCartItem;
window.clearCart = clearCart;
window.completeSale = completeSale;
window.logout = logout;
window.viewInvoice = viewInvoice;
window.printInvoice = printInvoice;
window.editProduct = async function(id) {
    const product = await localDB.get('products', id);
    if (product) {
        // Populate edit form (simplified - in production, open edit modal)
        const newName = prompt('اسم المنتج:', product.name);
        if (newName) {
            product.name = newName;
            await localDB.put('products', product);
            showAlert('تم التعديل بنجاح', 'success');
            loadProducts();
        }
    }
};
window.deleteProduct = async function(id) {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;
    try {
        await localDB.delete('products', id);
        showAlert('تم حذف المنتج بنجاح', 'success');
        loadProducts();
    } catch (error) {
        showAlert('خطأ: ' + error.message, 'danger');
    }
};
window.editUser = async function(id) {
    const user = await localDB.get('users', id);
    if (user) {
        const newName = prompt('اسم المستخدم:', user.name);
        if (newName) {
            user.name = newName;
            await localDB.put('users', user);
            showAlert('تم التعديل بنجاح', 'success');
            loadUsers();
        }
    }
};
window.generateReport = generateReport;
window.addStock = addStock;
window.filterInvoices = async function() {
    const filterDate = document.getElementById('filterDate').value;
    if (!filterDate) {
        loadInvoices();
        return;
    }

    const userData = Storage.get('currentUser');
    const startDate = new Date(filterDate);
    startDate.setHours(0,0,0,0);
    const endDate = new Date(filterDate);
    endDate.setHours(23,59,59,999);

    try {
        const invoices = await localDB.getAll('invoices');
        const filtered = invoices.filter(inv => {
            const invDate = new Date(inv.createdAt);
            return inv.companyId === userData.companyId && invDate >= startDate && invDate <= endDate;
        });

        const tbody = document.getElementById('invoicesTableBody');
        tbody.innerHTML = '';

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">لا توجد فواتير في هذا التاريخ</td></tr>';
            return;
        }

        filtered.forEach(inv => {
            const date = formatDate(inv.createdAt);
            tbody.innerHTML += `
                <tr>
                    <td><strong>${inv.invoiceNumber}</strong></td>
                    <td>${inv.customerName}</td>
                    <td>${inv.items ? inv.items.length : 0} منتجات</td>
                    <td>${inv.total ? inv.total.toFixed(2) : '0.00'} ج.م</td>
                    <td><span class="badge badge-${inv.status === 'مكتملة' ? 'success' : 'warning'}">${inv.status || 'مكتملة'}</span></td>
                    <td>${date}</td>
                    <td>${inv.createdByName || '-'}</td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="viewInvoice('${inv.id}')">👁️ عرض</button>
                        <button class="btn btn-sm btn-info" onclick="printInvoice('${inv.id}')">🖨️ طباعة</button>
                    </td>
                </tr>
            `
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Filter error:', error);
    }
};

// Data export/import for backup
window.exportData = async function() {
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
        showAlert('تم تصدير البيانات بنجاح', 'success');
    } catch (error) {
        showAlert('خطأ في التصدير: ' + error.message, 'danger');
    }
};

window.importData = async function(file) {
    try {
        const text = await file.text();
        await localDB.importAll(text);
        showAlert('تم استيراد البيانات بنجاح', 'success');
        location.reload();
    } catch (error) {
        showAlert('خطأ في الاستيراد: ' + error.message, 'danger');
    }
};

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Ctrl+S or Cmd+S to prevent accidental save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
    }

    // Escape to close modals
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(modal => {
            modal.classList.remove('active');
        });
        document.body.style.overflow = '';
    }
});

// Handle visibility change (tab switching)
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        // Pause timer when tab is hidden
    } else {
        // Resume when visible
    }
});

// Prevent accidental navigation with unsaved changes
window.addEventListener('beforeunload', function(e) {
    if (cart && cart.length > 0) {
        e.preventDefault();
        e.returnValue = 'لديك منتجات في السلة، هل تريد المغادرة؟';
    }
});
