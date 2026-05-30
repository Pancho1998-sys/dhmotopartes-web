/* ==========================================================================
   GLOBAL APP STATE
   ========================================================================== */
const state = {
    products: [],
    settings: {
        currency: '$',
        whatsapp: '+5493795331132' // Official DH Motopartes WhatsApp
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
    try {
        const response = await fetch('/api/db');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        // Populate products and settings
        state.products = data.products || [];
        if (data.settings) {
            state.settings = { ...state.settings, ...data.settings };
        }
        
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
        console.error("Could not fetch catalog data:", err);
        showCatalogError();
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
        const matchesCategory = !activeCategory || p.category === activeCategory;
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
        const stockBadgeClass = hasStock ? 'available' : 'out';
        const stockBadgeText = hasStock ? 'Disponible' : 'Consultar Stock';
        
        // Define action button based on stock
        const actionButton = hasStock 
            ? `<button class="btn-add-cart" onclick="addToCart('${p.id}', event)" title="Agregar al Carrito">
                   <i data-lucide="plus" style="width: 18px; height: 18px;"></i>
               </button>`
            : `<button class="btn-ask-item" onclick="askProductDirect('${p.id}', event)" title="Consultar por WhatsApp">
                   <i data-lucide="message-circle" style="width: 18px; height: 18px;"></i>
               </button>`;
               
        html += `
            <div class="product-card" onclick="viewProductDetails('${p.id}')">
                <div class="card-image-wrapper">
                    <i data-lucide="package" class="card-icon"></i>
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
        // Compare text or set default
        const text = tab.textContent;
        if ((category === '' && text === 'Todos') || text === category) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    renderCatalog();
};

/* ==========================================================================
   PRODUCT DETAIL MODAL
   ========================================================================== */
window.viewProductDetails = function(productId) {
    const p = state.products.find(prod => prod.id === productId);
    if (!p) return;
    
    const currency = state.settings.currency || '$';
    const hasStock = p.stock > 0;
    
    document.getElementById('modal-product-sku').textContent = `SKU: ${p.sku}`;
    document.getElementById('modal-product-title').textContent = p.name;
    document.getElementById('modal-product-category').textContent = p.category;
    document.getElementById('modal-product-price').textContent = `${currency}${p.price.toFixed(2)}`;
    
    const stockStatus = document.getElementById('modal-product-stock-status');
    const stockQty = document.getElementById('modal-product-stock-qty');
    
    if (hasStock) {
        stockStatus.textContent = "Disponible (Inmediato)";
        stockStatus.className = "spec-val available";
        stockQty.textContent = `${p.stock} unidades en local`;
    } else {
        stockStatus.textContent = "Sin stock físico";
        stockStatus.className = "spec-val out";
        stockQty.textContent = "Consultar tiempo de entrega por WhatsApp";
    }
    
    // Set up modal action button
    const actionRow = document.getElementById('modal-action-row');
    if (hasStock) {
        actionRow.innerHTML = `
            <button class="btn btn-primary btn-full-width btn-large" onclick="addToCart('${p.id}'); closeProductModal();">
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

window.closeProductModal = function(e) {
    document.getElementById('modal-product-detail').classList.remove('active');
};

/* ==========================================================================
   CART OPERATIONS
   ========================================================================== */
window.addToCart = function(productId, event) {
    if (event) {
        event.stopPropagation(); // Prevent opening modal when clicking plus button
    }
    
    const product = state.products.find(p => p.id === productId);
    if (!product || product.stock <= 0) return;
    
    const existing = state.cart.find(item => item.product.id === productId);
    
    if (existing) {
        if (existing.qty < product.stock) {
            existing.qty++;
        } else {
            alert(`Lo sentimos, el stock disponible para este repuesto es de ${product.stock} unidades.`);
        }
    } else {
        state.cart.push({
            product: product,
            qty: 1
        });
    }
    
    saveCartToSession();
    updateCartUI();
    
    // Optional micro-animation trigger: briefly bounce cart icon in header
    const cartToggle = document.getElementById('cart-toggle');
    cartToggle.style.transform = 'scale(1.2)';
    setTimeout(() => {
        cartToggle.style.transform = 'scale(1)';
    }, 200);
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
        ? 'Pago con QR / Transferencia (Comprobante adjunto)' 
        : 'Efectivo / Retiro en local';
        
    message += `----------------------------------------\n\n`;
    message += `💳 *Método de Pago:* ${payText}\n`;
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
