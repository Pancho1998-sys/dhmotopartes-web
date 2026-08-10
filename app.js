/* ==========================================================================
   SUPABASE CLIENT CONFIGURATION
   ========================================================================== */
const supabaseUrl = "https://wkgxssfbzgahkztdjzmo.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndrZ3hzc2ZiemdhaGt6dGRqem1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NzI4MjcsImV4cCI6MjA5NjA0ODgyN30.BNlE6dOMlbMlERR7ri4c4QIKqVXCJPHcZviTNunku44";
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

/* ==========================================================================
   GLOBAL APP STATE
   ========================================================================== */
const state = {
    products: [],
    settings: {
        currency: '$',
        whatsapp: '+5493795331132', // Official DH Motopartes WhatsApp
        storeAlias: 'DHMOTOPARTES',
        storeHolder: 'DANIEL OSCAR HIDALGO'
    },
    cart: [],
    paymentMethod: 'cash' // 'cash' or 'qr'
};

let activeCategory = '';
let fuseInstance = null;

/* ==========================================================================
   INITIALIZATION & DATA FETCHING
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    // Load Lucide Icons
    if (window.lucide) {
        lucide.createIcons();
    }
    
    // Load cart from sessionStorage if available
    loadCartFromSession();
    
    // Fetch products from python server
    fetchCatalog();
});

async function fetchCatalog() {
    // Leer el ID de la tienda desde la URL (ej: misistema.com/catalogo?store=uuid-del-negocio)
    const urlParams = new URLSearchParams(window.location.search);
    let storeId = urlParams.get('store');

    // Fallback store ID para DH Motopartes si no se especifica en la URL
    if (!storeId) {
        storeId = "3cd7c0ff-735b-430f-8da6-c538e4d5ed77";
    }

    try {
        console.log(`Intentando cargar catálogo desde Supabase para la tienda: ${storeId}`);
        // Llamamos a la función segura pasándole el ID dinámico
        const { data: catalogData, error } = await supabaseClient.rpc('get_public_catalog', { 
            target_store_id: storeId 
        });

        if (error) {
            console.warn("Error cargando catálogo desde Supabase, intentando fallback local:", error);
            await fetchLocalFallback();
            return;
        }

        console.log("Catálogo cargado con éxito desde Supabase:", catalogData);
        
        // Populate products and categories
        state.products = catalogData?.products || [];
        state.categories = catalogData?.categories || [];
        
        // Populate settings dynamically from database
        if (catalogData?.settings) {
            state.settings = { ...state.settings, ...catalogData.settings };
        }
        
        // Apply dynamic branding to UI
        applyStoreBranding();
        
        // Render category tabs
        renderCategoryTabs();
        
        // Initialize Fuse.js for smart search
        if (window.Fuse) {
            fuseInstance = new Fuse(state.products, {
                keys: ['name', 'sku', 'category'],
                threshold: 0.3,
                ignoreLocation: true
            });
        }
        
        // Render initial UI
        renderCatalog();
        updateCartUI();
    } catch (err) {
        console.warn("Excepción al cargar catálogo desde Supabase, intentando fallback local:", err);
        await fetchLocalFallback();
    }
}

async function fetchLocalFallback() {
    console.log("Cargando datos estáticos desde /api/db...");
    try {
        const response = await fetch('/api/db?t=' + Date.now());
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const localData = await response.json();
        console.log("Loaded local catalog fallback:", localData);
        
        state.products = localData.products || [];
        if (localData.settings && localData.settings.categories) {
            state.categories = localData.settings.categories;
        } else {
            state.categories = [...new Set(state.products.map(p => p.category))];
        }
        
        if (localData.settings) {
            state.settings = { ...state.settings, ...localData.settings };
        }
        
        // Apply dynamic branding to UI
        applyStoreBranding();

        // Render tabs and catalog
        renderCategoryTabs();
        if (window.Fuse) {
            fuseInstance = new Fuse(state.products, {
                keys: ['name', 'sku', 'category'],
                threshold: 0.3,
                ignoreLocation: true
            });
        }
        renderCatalog();
        updateCartUI();
    } catch (localErr) {
        console.error("Local fallback failed:", localErr);
        // Si el fallback también falla, mostramos el mensaje de error de enlace inválido
        const grid = document.getElementById('products-grid');
        if (grid) {
            grid.innerHTML = `
                <div class="grid-empty">
                    <i data-lucide="link-2-off" class="empty-icon" style="color: var(--text-secondary);"></i>
                    <p class="empty-title">Catálogo no disponible</p>
                    <p class="empty-text">No se pudo establecer conexión con la base de datos ni con el respaldo local. Por favor, reintente más tarde.</p>
                </div>
            `;
        }
        if (window.lucide) lucide.createIcons();
    }
}

function showCatalogError() {
    const grid = document.getElementById('products-grid');
    grid.innerHTML = `
        <div class="grid-empty">
            <i data-lucide="alert-triangle" class="empty-icon" style="color: var(--rose-red);"></i>
            <p class="empty-title">Error al cargar el catálogo</p>
            <p class="empty-text">No pudimos conectar con el servidor de inventario. Por favor, reintentá en unos momentos.</p>
            <button class="btn btn-secondary" style="margin-top: 16px;" onclick="fetchCatalog()">Reintentar</button>
        </div>
    `;
    if (window.lucide) lucide.createIcons();
}

/* ==========================================================================
   CATALOG RENDERING & FILTERING
   ========================================================================== */
function renderCatalog() {
    const grid = document.getElementById('products-grid');
    const searchVal = document.getElementById('catalog-search').value.toLowerCase().trim();
    const onlyWithStock = document.getElementById('filter-stock').checked;
    const currency = state.settings.currency || '$';
    
    // Apply filters
    let baseProducts = state.products;
    
    // 1. Apply Fuzzy Search (Fuse.js)
    if (searchVal) {
        if (fuseInstance) {
            const results = fuseInstance.search(searchVal);
            baseProducts = results.map(result => result.item);
        } else {
            // Fallback to strict search if Fuse fails to load
            baseProducts = state.products.filter(p => 
                p.name.toLowerCase().includes(searchVal) || 
                p.sku.toLowerCase().includes(searchVal)
            );
        }
    }

    // 2. Apply Category and Stock filters
    const filtered = baseProducts.filter(p => {
        const matchesCategory = !activeCategory || (p.category && p.category.trim().toLowerCase() === activeCategory.trim().toLowerCase());
        const matchesStock = !onlyWithStock || p.stock > 0;
        return matchesCategory && matchesStock;
    });
    
    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="grid-empty">
                <i data-lucide="package-x" class="empty-icon"></i>
                <p class="empty-title">No se encontraron productos</p>
                <p class="empty-text">Probá ajustando los filtros de búsqueda o categoría.</p>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }
    
    let html = '';
    filtered.forEach(p => {
        const hasStock = p.stock > 0;
        let stockBadgeClass = 'out';
        let stockBadgeText = 'Consultar Stock';
        
        if (hasStock) {
            if (p.stock <= 3) {
                stockBadgeClass = 'low';
                stockBadgeText = `Últimas ${p.stock} u.`;
            } else {
                stockBadgeClass = 'available';
                stockBadgeText = 'Disponible';
            }
        }
        
        // Define action button based on stock
        const actionButton = hasStock 
            ? `<button class="btn-add-cart" onclick="addToCart('${p.id}', event, 1)" title="Agregar al Carrito">
                   <i data-lucide="plus" style="width: 18px; height: 18px;"></i>
               </button>`
            : `<button class="btn-ask-item" onclick="askProductDirect('${p.id}', event)" title="Consultar por WhatsApp">
                   <i data-lucide="message-circle" style="width: 18px; height: 18px;"></i>
               </button>`;
               
        const cardImage = p.image 
            ? `<img src="${p.image}" class="card-image" alt="${p.name}">` 
            : `<i data-lucide="package" class="card-icon"></i>`;

        html += `
            <div class="product-card" onclick="viewProductDetails('${p.id}')">
                <div class="card-image-wrapper">
                    ${cardImage}
                    <span class="card-category-tag">${p.category}</span>
                    <span class="card-stock-badge ${stockBadgeClass}">${stockBadgeText}</span>
                </div>
                <div class="card-content">
                    <span class="card-sku">SKU: ${p.sku}</span>
                    <h3 class="card-title">${p.name}</h3>
                    <div class="card-bottom">
                        <div class="card-price-area">
                            <span class="price-label">Precio</span>
                            <span class="card-price">${currency}${p.price.toFixed(2)}</span>
                        </div>
                        ${actionButton}
                    </div>
                </div>
            </div>
        `;
    });
    
    grid.innerHTML = html;
    if (window.lucide) lucide.createIcons();
}

window.filterCatalog = function() {
    renderCatalog();
};

window.selectCategory = function(category) {
    activeCategory = category;
    
    // Update active tab styling
    const tabs = document.querySelectorAll('#category-tabs .category-tab');
    tabs.forEach(tab => {
        const catName = tab.getAttribute('data-category') || '';
        if (catName === category) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    renderCatalog();
};

function renderCategoryTabs() {
    const tabsContainer = document.getElementById('category-tabs');
    if (!tabsContainer) return;
    
    // Calculate category product counts with case-insensitive normalization
    const counts = {};
    state.products.forEach(p => {
        if (p.category) {
            const key = p.category.trim().toLowerCase();
            counts[key] = (counts[key] || 0) + 1;
        }
    });
    const totalCount = state.products.length;

    let html = `
        <button class="category-tab ${activeCategory === '' ? 'active' : ''}" data-category="" onclick="selectCategory('')">
            Todos <span class="category-count-badge">${totalCount}</span>
        </button>
    `;
    
    // Extract unique categories from products if state.categories is empty or non-matching
    const productCategories = [...new Set(state.products.map(p => p.category).filter(Boolean))];
    const categoriesList = (state.categories && state.categories.length > 0)
        ? [...new Set([...state.categories, ...productCategories])]
        : productCategories;

    categoriesList.forEach(cat => {
        const key = cat.trim().toLowerCase();
        const count = counts[key] || 0;
        // Only render categories that actually have products
        if (count > 0) {
            const isActive = activeCategory && activeCategory.trim().toLowerCase() === key ? 'active' : '';
            html += `
                <button class="category-tab ${isActive}" data-category="${cat}" onclick="selectCategory('${cat}')">
                    ${cat} <span class="category-count-badge">${count}</span>
                </button>
            `;
        }
    });
    
    tabsContainer.innerHTML = html;
}

/* ==========================================================================
   PRODUCT DETAIL MODAL & QUANTITY STATE
   ========================================================================== */
let modalCurrentProduct = null;
let modalSelectedQty = 1;

window.viewProductDetails = function(productId) {
    const p = state.products.find(prod => prod.id === productId);
    if (!p) return;
    
    modalCurrentProduct = p;
    modalSelectedQty = 1;
    
    // Render product image or placeholder
    const imageArea = document.querySelector('.modal-image-area');
    if (imageArea) {
        if (p.image) {
            imageArea.style.backgroundImage = `url('${p.image}')`;
            imageArea.style.backgroundSize = 'cover';
            imageArea.style.backgroundPosition = 'center';
            imageArea.innerHTML = `
                <span id="modal-product-category" class="image-category-tag">${p.category}</span>
            `;
        } else {
            imageArea.style.backgroundImage = 'none';
            imageArea.innerHTML = `
                <div class="modal-image-placeholder">
                    <i data-lucide="package" class="placeholder-icon"></i>
                </div>
                <span id="modal-product-category" class="image-category-tag">${p.category}</span>
            `;
        }
    }
    
    const currency = state.settings.currency || '$';
    const hasStock = p.stock > 0;
    
    document.getElementById('modal-product-sku').textContent = `SKU: ${p.sku}`;
    document.getElementById('modal-product-title').textContent = p.name;
    document.getElementById('modal-product-category').textContent = p.category;
    document.getElementById('modal-product-price').textContent = `${currency}${p.price.toFixed(2)}`;
    
    const stockStatus = document.getElementById('modal-product-stock-status');
    const stockQty = document.getElementById('modal-product-stock-qty');
    
    if (hasStock) {
        if (p.stock <= 3) {
            stockStatus.textContent = "Últimas unidades disponibles";
            stockStatus.className = "spec-val low";
        } else {
            stockStatus.textContent = "Disponible en stock";
            stockStatus.className = "spec-val available";
        }
        stockQty.textContent = `${p.stock} unidades en local`;
    } else {
        stockStatus.textContent = "Sin stock físico";
        stockStatus.className = "spec-val out";
        stockQty.textContent = "Consultar tiempo de entrega por WhatsApp";
    }
    
    // Set up modal action button and quantity selector
    const actionRow = document.getElementById('modal-action-row');
    if (hasStock) {
        actionRow.innerHTML = `
            <div class="modal-qty-picker">
                <span class="modal-qty-label">Cantidad a solicitar:</span>
                <div class="modal-qty-controls">
                    <button type="button" class="btn-modal-qty" onclick="changeModalQty(-1)">-</button>
                    <span class="modal-qty-val" id="modal-qty-display">1</span>
                    <button type="button" class="btn-modal-qty" onclick="changeModalQty(1)">+</button>
                </div>
            </div>
            <button class="btn btn-primary btn-full-width btn-large" onclick="addModalProductToCart()">
                <i data-lucide="shopping-cart"></i>
                <span>Agregar al Carrito</span>
            </button>
        `;
    } else {
        actionRow.innerHTML = `
            <button class="btn btn-secondary btn-full-width btn-large" style="background-color: rgba(245, 158, 11, 0.15); border-color: var(--amber-yellow); color: var(--amber-yellow);" onclick="askProductDirect('${p.id}')">
                <i data-lucide="message-square"></i>
                <span>Consultar Disponibilidad en WhatsApp</span>
            </button>
        `;
    }
    
    if (window.lucide) lucide.createIcons();
    document.getElementById('modal-product-detail').classList.add('active');
};

window.changeModalQty = function(change) {
    if (!modalCurrentProduct) return;
    const max = modalCurrentProduct.stock || 1;
    const newQty = modalSelectedQty + change;
    if (newQty >= 1 && newQty <= max) {
        modalSelectedQty = newQty;
        const display = document.getElementById('modal-qty-display');
        if (display) display.textContent = modalSelectedQty;
    } else if (newQty > max) {
        showToast(`Stock disponible máximo: ${max} unidades`, 'info');
    }
};

window.addModalProductToCart = function() {
    if (!modalCurrentProduct) return;
    addToCart(modalCurrentProduct.id, null, modalSelectedQty);
    closeProductModal();
};

window.closeProductModal = function(e) {
    document.getElementById('modal-product-detail').classList.remove('active');
};

/* ==========================================================================
   CART OPERATIONS
   ========================================================================== */
window.addToCart = function(productId, event, addQty = 1) {
    if (event) {
        event.stopPropagation(); // Prevent opening modal when clicking plus button
    }
    
    const product = state.products.find(p => p.id === productId);
    if (!product || product.stock <= 0) return;
    
    const existing = state.cart.find(item => item.product.id === productId);
    
    if (existing) {
        const potentialQty = existing.qty + addQty;
        if (potentialQty <= product.stock) {
            existing.qty = potentialQty;
            showToast(`¡Se agregaron +${addQty} u. de ${product.name}!`, 'success');
        } else {
            const maxAddable = product.stock - existing.qty;
            if (maxAddable > 0) {
                existing.qty = product.stock;
                showToast(`Alcanzado el límite de stock disponible (${product.stock} u.)`, 'info');
            } else {
                showToast(`Ya tienes el máximo de stock en tu carrito (${product.stock} u.)`, 'info');
            }
        }
    } else {
        const initialQty = Math.min(addQty, product.stock);
        state.cart.push({
            product: product,
            qty: initialQty
        });
        showToast(`¡${product.name} agregado al carrito!`, 'success');
    }
    
    saveCartToSession();
    updateCartUI();
    
    // Optional micro-animation trigger: briefly bounce cart icon in header
    const cartToggle = document.getElementById('cart-toggle');
    if (cartToggle) {
        cartToggle.style.transform = 'scale(1.25)';
        setTimeout(() => {
            cartToggle.style.transform = 'scale(1)';
        }, 220);
    }
};

window.removeFromCart = function(productId) {
    state.cart = state.cart.filter(item => item.product.id !== productId);
    saveCartToSession();
    updateCartUI();
};

window.changeCartQty = function(productId, change) {
    const item = state.cart.find(i => i.product.id === productId);
    if (!item) return;
    
    const newQty = item.qty + change;
    if (newQty <= 0) {
        removeFromCart(productId);
    } else if (newQty <= item.product.stock) {
        item.qty = newQty;
        saveCartToSession();
        updateCartUI();
    } else {
        alert(`Lo sentimos, no hay más stock disponible de este producto.`);
    }
};

function updateCartUI() {
    const cartList = document.getElementById('cart-items-list');
    const totalQtySpan = document.getElementById('cart-items-total-qty');
    const totalPriceSpan = document.getElementById('cart-total-price');
    const headerCountSpan = document.getElementById('cart-count');
    const currency = state.settings.currency || '$';
    
    let totalQty = 0;
    let totalPrice = 0;
    
    if (state.cart.length === 0) {
        cartList.innerHTML = `
            <div class="cart-empty-state">
                <i data-lucide="shopping-bag" class="empty-icon"></i>
                <p class="empty-title">Tu carrito está vacío</p>
                <p class="empty-text">Explorá el catálogo y agregá los repuestos que necesitás consultar.</p>
            </div>
        `;
        totalQtySpan.textContent = '0';
        totalPriceSpan.textContent = `${currency}0.00`;
        headerCountSpan.textContent = '0';
        document.getElementById('btn-checkout').disabled = true;
        if (window.lucide) lucide.createIcons();
        return;
    }
    
    document.getElementById('btn-checkout').disabled = false;
    let html = '';
    state.cart.forEach(item => {
        const itemTotal = item.product.price * item.qty;
        totalQty += item.qty;
        totalPrice += itemTotal;
        
        html += `
            <div class="cart-item">
                <div class="cart-item-details">
                    <span class="cart-item-sku">SKU: ${item.product.sku}</span>
                    <h4 class="cart-item-title">${item.product.name}</h4>
                    <div class="cart-item-controls">
                        <div class="qty-counter">
                            <button class="btn-qty" onclick="changeCartQty('${item.product.id}', -1)">-</button>
                            <span class="qty-val">${item.qty}</span>
                            <button class="btn-qty" onclick="changeCartQty('${item.product.id}', 1)">+</button>
                        </div>
                        <span class="cart-item-price">${currency}${itemTotal.toFixed(2)}</span>
                    </div>
                </div>
                <button class="btn-remove-item" onclick="removeFromCart('${item.product.id}')" title="Eliminar">
                    <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                </button>
            </div>
        `;
    });
    
    cartList.innerHTML = html;
    totalQtySpan.textContent = totalQty;
    totalPriceSpan.textContent = `${currency}${totalPrice.toFixed(2)}`;
    headerCountSpan.textContent = totalQty;
    
    if (window.lucide) lucide.createIcons();
}

window.toggleCart = function() {
    document.getElementById('cart-drawer').classList.toggle('active');
    document.getElementById('cart-overlay').classList.toggle('active');
};

/* ==========================================================================
   WHATSAPP INTEGRATION
   ========================================================================== */
window.checkoutWhatsApp = function() {
    if (state.cart.length === 0) return;
    
    const currency = state.settings.currency || '$';
    let message = `🏍️ *Nueva Consulta de Repuestos - DH Motopartes* 🏍️\n\n`;
    message += `Hola, me gustaría consultar la disponibilidad y coordinar la compra de los siguientes productos:\n\n`;
    message += `----------------------------------------\n`;
    
    let total = 0;
    state.cart.forEach(item => {
        const itemTotal = item.product.price * item.qty;
        total += itemTotal;
        message += `• *${item.qty}x* ${item.product.name} [${item.product.sku}]\n`;
        message += `  _Precio: ${currency}${item.product.price.toFixed(2)} c/u_ -> *${currency}${itemTotal.toFixed(2)}*\n\n`;
    });
    
    const payText = state.paymentMethod === 'qr' 
        ? 'Transferencia / Alias (Comprobante adjunto)' 
        : 'Efectivo / Retiro en local';
        
    message += `----------------------------------------\n\n`;
    message += `💳 *Método de Pago:* ${payText}\n`;
    if (state.paymentMethod === 'qr') {
        const alias = state.settings.storeAlias || 'DHMOTOPARTES';
        const holder = state.settings.storeHolder || 'DANIEL OSCAR HIDALGO';
        message += `📍 *Alias del Negocio:* ${alias}\n`;
        message += `👤 *Titular de la Cuenta:* ${holder}\n`;
    }
    message += `💰 *Total Estimado:* *${currency}${total.toFixed(2)}*\n\n`;
    message += `📱 _Consulta generada desde el catálogo web oficial._`;
    
    const encodedText = encodeURIComponent(message);
    const phoneNumber = state.settings.whatsapp.replace('+', '').replace(' ', '');
    const waUrl = `https://wa.me/${phoneNumber}?text=${encodedText}`;
    
    window.open(waUrl, '_blank');
};

window.askProductDirect = function(productId, event) {
    if (event) {
        event.stopPropagation();
    }
    
    const product = state.products.find(p => p.id === productId);
    if (!product) return;
    
    const currency = state.settings.currency || '$';
    let message = `🏍️ *Consulta Directa - DH Motopartes* 🏍️\n\n`;
    message += `Hola, me gustaría consultar sobre este repuesto de mi interés:\n\n`;
    message += `• *Producto:* ${product.name}\n`;
    message += `• *SKU:* ${product.sku}\n`;
    message += `• *Categoría:* ${product.category}\n`;
    message += `• *Precio Estimado:* ${currency}${product.price.toFixed(2)}\n\n`;
    
    if (product.stock <= 0) {
        message += `⚠️ _Consulto tiempo estimado de reposición._`;
    } else {
        message += `✅ _Consulto disponibilidad en local._`;
    }
    
    const encodedText = encodeURIComponent(message);
    const phoneNumber = state.settings.whatsapp.replace('+', '').replace(' ', '');
    const waUrl = `https://wa.me/${phoneNumber}?text=${encodedText}`;
    
    window.open(waUrl, '_blank');
};

/* ==========================================================================
   QR PAYMENT MODAL & METHOD SELECTION
   ========================================================================== */
window.selectPaymentMethod = function(method) {
    state.paymentMethod = method;
    
    const cashOpt = document.getElementById('pay-option-cash');
    const qrOpt = document.getElementById('pay-option-qr');
    const btnViewQr = document.getElementById('btn-view-qr');
    
    if (method === 'cash') {
        cashOpt.classList.add('active');
        qrOpt.classList.remove('active');
        btnViewQr.style.display = 'none';
    } else if (method === 'qr') {
        cashOpt.classList.remove('active');
        qrOpt.classList.add('active');
        btnViewQr.style.display = 'block';
    }
};

window.openQRModal = function() {
    const modal = document.getElementById('modal-qr-payment');
    if (modal) {
        modal.classList.add('active');
        if (window.lucide) lucide.createIcons();
    }
};

window.closeQRModal = function(e) {
    const modal = document.getElementById('modal-qr-payment');
    if (modal) {
        modal.classList.remove('active');
    }
};

/* ==========================================================================
   SESSION STORAGE PERSISTENCE
   ========================================================================== */
function saveCartToSession() {
    sessionStorage.setItem('dhmotopartes_client_cart', JSON.stringify(state.cart));
}

function loadCartFromSession() {
    const saved = sessionStorage.getItem('dhmotopartes_client_cart');
    if (saved) {
        try {
            state.cart = JSON.parse(saved);
        } catch (e) {
            console.error("Error loading cart from storage:", e);
            state.cart = [];
        }
    }
}

/* ==========================================================================
   DYNAMIC STORE BRANDING & TRANSFER UTILITIES
   ========================================================================== */
function applyStoreBranding() {
    const storeName = state.settings.storeName || 'DH Motopartes';
    
    // Page title
    document.title = `${storeName} - Catálogo Oficial`;
    
    // Header and Footer Logo Badge & Text
    const headerLogoBadge = document.getElementById('header-logo-badge');
    const headerLogoText = document.getElementById('header-logo-text');
    const footerLogoBadge = document.getElementById('footer-logo-badge');
    const footerLogoText = document.getElementById('footer-logo-text');
    
    const initials = storeName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    
    if (headerLogoBadge) headerLogoBadge.textContent = initials || 'DH';
    if (headerLogoText) headerLogoText.textContent = storeName.toUpperCase() || 'MOTOPARTES';
    if (footerLogoBadge) footerLogoBadge.textContent = initials || 'DH';
    if (footerLogoText) footerLogoText.textContent = storeName.toUpperCase() || 'MOTOPARTES';
    
    // Footer info
    const footerAddress = document.getElementById('footer-address');
    if (footerAddress && state.settings.storeAddress) {
        footerAddress.textContent = state.settings.storeAddress;
    }
    
    const footerPhone = document.getElementById('footer-phone');
    if (footerPhone && state.settings.storePhone) {
        footerPhone.textContent = state.settings.storePhone;
    }
    
    const footerBrandDesc = document.getElementById('footer-brand-desc');
    if (footerBrandDesc && state.settings.brandDescription) {
        footerBrandDesc.textContent = state.settings.brandDescription;
    }
    
    // Social/Contact links in footer
    const footerWhatsapp = document.getElementById('footer-whatsapp-link');
    if (footerWhatsapp && state.settings.whatsapp) {
        let wa = state.settings.whatsapp.trim();
        let waUrl = wa;
        if (!wa.startsWith('http://') && !wa.startsWith('https://')) {
            const digits = wa.replace(/[^\d+]/g, '');
            waUrl = `https://wa.me/${digits.replace('+', '')}`;
        }
        footerWhatsapp.href = waUrl;
    }
    
    const footerInstagram = document.getElementById('footer-instagram-link');
    if (footerInstagram && state.settings.instagram) {
        let insta = state.settings.instagram.trim();
        let instaUrl = insta;
        if (!insta.startsWith('http://') && !insta.startsWith('https://')) {
            const username = insta.replace('@', '');
            instaUrl = `https://instagram.com/${username}`;
        }
        footerInstagram.href = instaUrl;
    }
    
    // Update Alias Display in Transfer Modal
    const modalDisplayAlias = document.getElementById('modal-display-alias');
    if (modalDisplayAlias) {
        modalDisplayAlias.textContent = state.settings.storeAlias || 'DHMOTOPARTES';
    }
    const modalDisplayHolder = document.getElementById('modal-display-holder');
    if (modalDisplayHolder) {
        modalDisplayHolder.textContent = state.settings.storeHolder || 'DANIEL OSCAR HIDALGO';
    }
}

window.copyModalAlias = function () {
    const alias = state.settings.storeAlias || 'DHMOTOPARTES';
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(alias).then(() => {
            const textSpan = document.getElementById('modal-copy-alias-text');
            if (textSpan) {
                const orig = textSpan.textContent;
                textSpan.textContent = '¡Copiado!';
                setTimeout(() => { textSpan.textContent = orig; }, 2000);
            }
            showToast(`¡Alias "${alias}" copiado al portapapeles!`, 'success');
        }).catch(err => {
            console.error('Failed to copy alias:', err);
            showToast(`Alias: ${alias}`, 'info');
        });
    } else {
        showToast(`Alias: ${alias}`, 'info');
    }
};

/* ==========================================================================
   FLOATING TOAST NOTIFICATION HELPER
   ========================================================================== */
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const iconName = type === 'success' ? 'check-circle-2' : 'info';
    toast.innerHTML = `
        <i data-lucide="${iconName}" class="toast-icon"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    if (window.lucide) lucide.createIcons();
    
    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 2800);
}
