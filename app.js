// CONFIGURACIÓN
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyAYQCnmQs8Yg4TYMkdJRFDwpg_daow_60q8v0EwheLTynZU7NEC0n9aJ4J7xrAWBmy/exec';
const DEFAULT_IMAGE = 'https://raw.githubusercontent.com/Levo19/iMosweb/main/recursos/defaultImageProduct.png';

let currentUser = null;          // Usuario logueado (Jefe o Tienda)
let currentViewUser = null;      // Usuario/Zona que se está visualizando
let currentSeller = null;        // VENDEDOR ACTIVO (e.g., 'Luis')
let currentModule = 'pedidos';   // 'pedidos' | 'pos'
let userRole = 'tienda';         // 'tienda' o 'jefe'
let availableZones = [];         // Lista de zonas disponibles para el jefe
let sessionTimeout = null;
let selectedProduct = null;
let allProducts = [];
let userSolicitudes = {};
let userStats = {}; // { coding: { solicitado, separado, despachado, pendiente } }
let tutorialStep = 0;
let tutorialImages = [];
let currentSort = 'default';
let qrScanner = null;
let isRendering = false; // CRÍTICO: Prevenir renders múltiples
let historyCache = {}; // Cache para historiales por código

// --- OPTIMIZACIÓN: Pre-carga de productos ---
// Iniciamos la carga de productos apenas carga el script (en paralelo al login)
let productsPromise = fetch(`${APPS_SCRIPT_URL}?action=getProducts`)
    .then(r => r.json())
    .catch(err => {
        console.error("Error pre-cargando productos:", err);
        return [];
    });

// ===== INICIALIZACIÓN =====
window.addEventListener('load', () => {
    checkSession();
});

function checkSession() {
    const session = JSON.parse(localStorage.getItem('session') || 'null');
    if (session && session.user && session.expiry) {
        const now = new Date().getTime();
        if (now < session.expiry) {
            currentUser = session.user;

            // RECUPERAR DATOS DE ROL Y ZONA
            userRole = session.role || 'tienda';
            availableZones = session.zones || [currentUser];

            // Si hay un 'viewUser' guardado (la zona que estaba viendo), usarlo. 
            // Si no, usar la primera zona disponible.
            currentViewUser = session.lastViewUser || availableZones[0] || currentUser;

            // POS: Recuperar vendedor si existe en local
            currentSeller = session.seller || null;

            showMainApp();
            resetSessionTimeout();
        } else {
            localStorage.removeItem('session');
        }
    }
}

// ===== LOGIN =====
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const msg = document.getElementById('loginMessage');

    msg.innerHTML = '<p style="text-align:center;color:#667eea;">Verificando...</p>';

    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=login`, {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });

        const result = await response.json();

        if (result.success) {
            currentUser = username;

            // DATOS NUEVOS DEL BACKEND
            userRole = result.role || 'tienda';
            // Si viene vacío o null, usar el usuario como fallback
            availableZones = (result.zonas && result.zonas.length > 0) ? result.zonas : [result.user || username];
            currentViewUser = availableZones[0] || username; // Por defecto la primera zona

            const expiry = new Date().getTime() + (4 * 60 * 60 * 1000);
            localStorage.setItem('session', JSON.stringify({
                user: username,
                expiry: expiry,
                role: userRole,
                zones: availableZones,
                lastViewUser: currentViewUser,
                seller: null // Reset seller on fresh login
            }));

            msg.innerHTML = '<p class="success">✓ Acceso concedido</p>';
            setTimeout(() => {
                document.getElementById('loginContainer').classList.add('slide-out');
                setTimeout(() => {
                    showMainApp();
                    resetSessionTimeout();
                }, 800);
            }, 500);
        } else {
            msg.innerHTML = '<p class="error">✗ Usuario o contraseña incorrectos</p>';
        }
    } catch (error) {
        msg.innerHTML = '<p class="error">✗ Error de conexión</p>';
        console.error(error);
    }
});

// ===== MOSTRAR APP =====
async function showMainApp() {
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('mainApp').classList.add('active');
    document.getElementById('userDisplay').textContent = currentUser;

    // MOSTRAR SELECTOR DE ZONAS SI ES JEFE
    renderZoneSelector();

    // Default to 'pedidos' initially
    switchModule('pedidos');

    // Remove Seller Check from initial load - it belongs to POS module switch
    updateUserDisplay();

    await loadProducts();
    setupSearch();
    await loadTutorial();

    // Auto-Refresh Every 60s (To catch deletions/updates)
    setInterval(() => loadProducts(true), 60000); // true = silent release
}

// ===== MODULO SWITCHING =====
async function switchModule(moduleName) {
    currentModule = moduleName;

    // Update Sidebar UI
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
    document.getElementById(`menu-${moduleName}`).classList.add('active');

    // Update Header Title
    const title = moduleName === 'pos' ? '🏪 Punto de Venta' : '📦 Pedidos a Almacen';
    document.querySelector('.header-title').textContent = title;

    // Module Specific Logic
    if (moduleName === 'pos') {
        // POS: Requires Seller
        if (!currentSeller) {
            await handleSellerCheck();
        }
    } else {
        // PEDIDOS: No seller needed, but we keep session if exists? 
        // Or hide it? Let's hide seller display if in Pedidos to avoid confusion?
        // User asked for "Separados". Let's keep seller in session but maybe UI focus changes.
    }

    // Re-render products to reflect new mode (prices vs no prices)
    renderProducts(allProducts);
}

// ===== POS: SELLER LOGIC =====
async function handleSellerCheck() {
    const modal = document.getElementById('sellerModal');
    const container = document.getElementById('sellerList');

    modal.classList.add('active');
    container.innerHTML = '<div class="loading">Cargando vendedores...</div>';

    try {
        const res = await fetch(`${APPS_SCRIPT_URL}?action=getActiveSellers&zone=${currentViewUser}`);
        const sellers = await res.json();

        if (sellers.length === 0) {
            container.innerHTML = '<p style="width:100%;color:#999;">No hay vendedores activos. Ingresa tu nombre abajo.</p>';
        } else {
            container.innerHTML = sellers.map(name => `
                <div class="seller-btn" onclick="selectSeller('${name}')">
                    <span class="icon">👤</span>
                    <span>${name}</span>
                </div>
            `).join('');
        }
    } catch (e) {
        console.error("Error fetching sellers:", e);
        container.innerHTML = '<p class="error">Error de conexión</p>';
    }
}

function selectSeller(name) {
    currentSeller = name;
    updateSessionSeller(name);
    document.getElementById('sellerModal').classList.remove('active');
    updateUserDisplay();
    showToast(`Hola, ${name} 👋`);
}

async function startNewSellerSession() {
    const input = document.getElementById('newSellerName');
    const name = input.value.trim();
    if (!name) return alert('Por favor ingresa un nombre');

    // Optimist
    selectSeller(name);

    // Register in backend
    fetch(`${APPS_SCRIPT_URL}?action=registerSeller`, {
        method: 'POST',
        body: JSON.stringify({ zone: currentViewUser, name: name })
    });
}

function updateSessionSeller(name) {
    const session = JSON.parse(localStorage.getItem('session'));
    if (session) {
        session.seller = name;
        localStorage.setItem('session', JSON.stringify(session));
    }
}

function updateUserDisplay() {
    const disp = document.getElementById('userDisplay');
    if (currentSeller) {
        disp.innerHTML = `<span>👤</span> ${currentSeller} <small style="opacity:0.7">(${currentViewUser})</small>`;
        // Add Close Register Button nearby if not exists?
        // Actually we can reuse 'Logout' text or add a sub-option.
        // For now, let's keep it simple.
        const headerRight = document.querySelector('.header-right');
        if (!document.getElementById('btnCloseReg')) {
            const btn = document.createElement('button');
            btn.id = 'btnCloseReg';
            btn.className = 'btn-search secondary';
            btn.style.padding = '8px 12px';
            btn.style.fontSize = '12px';
            btn.innerText = 'Cerrar Caja';
            btn.onclick = closeRegister;
            headerRight.insertBefore(btn, headerRight.firstChild);
        }
    } else {
        disp.textContent = currentUser;
    }
}

function closeRegister() {
    if (!confirm('¿Cerrar caja y sesión de vendedor?')) return;

    const oldSeller = currentSeller;
    currentSeller = null;
    updateSessionSeller(null);

    // Remove from backend list
    fetch(`${APPS_SCRIPT_URL}?action=removeSeller`, {
        method: 'POST',
        body: JSON.stringify({ zone: currentViewUser, name: oldSeller })
    });

    location.reload(); // Reload to force seller check again
}


function renderZoneSelector() {
    const container = document.getElementById('zoneSelectorContainer');
    if (!container) return; // Si no existe el contenedor en HTML, salir

    if (userRole === 'jefe' && availableZones.length > 1) {
        container.style.display = 'flex';
        container.innerHTML = availableZones.map(zone => `
            <button class="zone-btn ${zone === currentViewUser ? 'active' : ''}" 
                    onclick="switchZone('${zone}')">
                ${zone}
            </button>
        `).join('');
    } else {
        container.style.display = 'none';
        // Si solo tiene una zona (o es tienda), mostrarla como título informativo o nada
        if (availableZones.length === 1 && userRole === 'jefe') {
            // Opcional: mostrar un indicador de que está viendo esa zona
            container.style.display = 'flex';
            container.innerHTML = `<span class="zone-label">Viendo: ${availableZones[0]}</span>`;
        }
    }
}

async function switchZone(zone) {
    if (zone === currentViewUser) return;

    currentViewUser = zone;
    currentSeller = null; // Reset seller when switching zones
    updateSessionSeller(null);

    // Actualizar sesión para recordar selección
    const session = JSON.parse(localStorage.getItem('session'));
    if (session) {
        session.lastViewUser = zone;
        localStorage.setItem('session', JSON.stringify(session));
    }

    // Actualizar UI botones
    renderZoneSelector();

    // Force Reload to trigger seller check for new zone
    location.reload();
}

// ===== CARGAR PRODUCTOS =====
async function loadProducts() {
    const container = document.getElementById('productsContainer');

    // 1. OBTENER Y MOSTRAR CATÁLOGO (Inmediato)
    if (allProducts.length === 0) {
        container.innerHTML = '<div class="loading">Cargando catálogo...</div>';
        try {
            allProducts = await productsPromise;
            // Retry automático si falló la precarga verificado por longitud
            if (!allProducts || allProducts.length === 0) {
                console.warn("Precarga vacía, reintentando fetch...");
                const res = await fetch(`${APPS_SCRIPT_URL}?action=getProducts`);
                allProducts = await res.json();
            }
        } catch (e) {
            console.error("Error crítico cargando productos:", e);
            container.innerHTML = '<p class="error">Error cargando catálogo.</p>';
            return;
        }
    }

    // Renderizar catálogo base (cantidades en 0 visualmente por ahora)
    renderProducts(allProducts);

    // 2. OBTENER SOLICITUDES Y PRECARGAR HISTORIAL (Segundo plano)
    try {
        const [solicitudesRes, historyRes] = await Promise.all([
            fetch(`${APPS_SCRIPT_URL}?action=getTodaySolicitudes&usuario=${currentViewUser}`),
            fetch(`${APPS_SCRIPT_URL}?action=getAllHistory&usuario=${currentViewUser}`)
        ]);

        const solicitudesData = await solicitudesRes.json();
        const fullHistory = await historyRes.json();

        // Actualizar caché de hoy con estadísticas completas
        userSolicitudes = {};
        userStats = {};

        solicitudesData.forEach(item => {
            // "pendiente" calculated in backend or we calc here
            const pendiente = item.pendiente !== undefined ? item.pendiente : item.solicitado;
            userSolicitudes[item.codigo] = pendiente; // Keep using this for "En carro" / "Solicitado" badge main view

            // Store full stats for Flip View
            userStats[item.codigo] = {
                solicitado: item.solicitado,
                separado: item.separado,
                despachado: item.despachado,
                pendiente: pendiente
            };

            updateProductCard(item.codigo);
        });

        // Clean up zero entries if needed (backend does this mostly)

        // Actualizar caché de historial (Precarga masiva)
        if (fullHistory && typeof fullHistory === 'object') {
            historyCache = fullHistory;
        }

    } catch (error) {
        console.error("Error cargando datos de usuario:", error);
    }
}

// ===== RENDERIZAR PRODUCTOS - MULTI-MODULE =====
function renderProducts(products) {
    if (isRendering) return;
    isRendering = true;

    const container = document.getElementById('productsContainer');

    if (products.length === 0) {
        container.innerHTML = '<div class="no-results">No se encontraron productos</div>';
        isRendering = false;
        return;
    }

    // FILTER LOGIC FOR 'PEDIDOS' MODULE
    /*
      Requisito: 
      - Stock > 0
      - Nombre no puede ser 'zz' o 'ZZ'
    */
    let displayProducts = products;
    if (currentModule === 'pedidos') { // apply only to Pedidos? User said "el modulo de pedido... muestran solo..."
        displayProducts = products.filter(p => {
            const nameBad = p.nombre.trim().toUpperCase() === 'ZZ';
            const hasStock = p.stock > 0;
            return !nameBad && hasStock;
        });
    }

    if (displayProducts.length === 0) {
        container.innerHTML = '<div class="no-results">No hay productos disponibles (Stock 0 o Ocultos)</div>';
        isRendering = false;
        return;
    }

    const html = displayProducts.map(p => {
        let serverQty = parseFloat(p.solicitado);
        if (isNaN(serverQty)) serverQty = 0;
        let localQty = userSolicitudes[p.codigo];
        const cantidadFinal = (localQty !== undefined) ? parseFloat(localQty) : serverQty;
        const imagenUrl = (p.imagen && p.imagen.trim() !== '') ? optimizeGoogleDriveUrl(p.imagen) : DEFAULT_IMAGE;

        // VISUAL LOGIC BASED ON MODULE
        const isPOS = currentModule === 'pos';

        // Price: Only show in POS
        const priceHtml = isPOS
            ? `<p class="price" style="font-size:1.2em;color:#27ae60;font-weight:bold;">S/ ${p.precioVenta.toFixed(2)}</p>`
            : '';

        // Presentations: Only show in POS if enabled
        const hasPresentations = isPOS && (p.presentaciones && p.presentaciones.length > 0);

        // Buttons logic
        let actionHtml = '';

        if (isPOS) {
            if (hasPresentations) {
                actionHtml = `<button class="btn-primary" style="width:100%" onclick="openProductOptions('${p.codigo}')">Seleccionar Opción</button>`;
            } else {
                actionHtml = `<div class="quantity-control" style="padding:0; width:100%;">
                                    <button class="btn-minus" onclick="decrementQuantity('${p.codigo}')">−</button>
                                    <input type="number" id="qty-${p.codigo}" class="quantity-input-inline" value="${cantidadFinal.toFixed(1)}" step="1" min="0" onchange="validateQuantity('${p.codigo}')">
                                    <button class="btn-plus" onclick="incrementQuantity('${p.codigo}')">+</button>
                                    <button class="btn-confirm" onclick="confirmQuantity('${p.codigo}')">Agregar</button>
                               </div>`;
            }
        } else {
            // PEDIDOS MODE: Standard Request
            actionHtml = `
                <div class="quantity-control">
                    <button class="btn-minus" onclick="decrementQuantity('${p.codigo}')">−</button>
                    
                    <input type="number" 
                           id="qty-${p.codigo}" 
                           class="quantity-input-inline" 
                           value="${cantidadFinal.toFixed(1)}" 
                           step="0.5"
                           min="0"
                           onchange="validateQuantity('${p.codigo}')">
                           
                    <button class="btn-plus" onclick="incrementQuantity('${p.codigo}')">+</button>
                    
                    <button class="btn-confirm" onclick="confirmQuantity('${p.codigo}')" title="Solicitar">
                        Solicitar
                    </button>
                </div>
             `;
        }

        return `
            <div class="product-card" data-codigo="${p.codigo}">
                <img src="${imagenUrl}" 
                     alt="${p.nombre}" 
                     class="product-image" 
                     onerror="this.onerror=null; this.src='${DEFAULT_IMAGE}';">
        `;
    }).join(''); // Wait, the above block is truncated in my thought because I saw double `return` in previous view. Let me fix the logic in this rewrite.

    // I need to be careful. The previous view showed:
    // 473: <div class="product-card" data-codigo="${p.codigo}"> ...
    // 478: const stats = userStats[p.codigo] || { solicitado: 0, separado: 0, despachado: 0 };
    // 481: return ` ...
    // This implies there was a `return` statement that was returning just the image, and then ANOTHER return statement. 
    // This is VERY BROKEN. It should be ONE return statement logic.
    // Ah, lines 473-477 seem to be a leftover fragmet from my previous 'view'.
    // The REAL code should look like what follows line 480.
    // I will unite this into a proper single return.

    const htmlFixed = displayProducts.map(p => {
        let serverQty = parseFloat(p.solicitado);
        if (isNaN(serverQty)) serverQty = 0;
        let localQty = userSolicitudes[p.codigo];
        const cantidadFinal = (localQty !== undefined) ? parseFloat(localQty) : serverQty;
        const imagenUrl = (p.imagen && p.imagen.trim() !== '') ? optimizeGoogleDriveUrl(p.imagen) : DEFAULT_IMAGE;

        const isPOS = currentModule === 'pos';
        const hasPresentations = isPOS && (p.presentaciones && p.presentaciones.length > 0);
        let actionHtml = '';

        if (isPOS) {
            if (hasPresentations) {
                actionHtml = `<button class="btn-primary" style="width:100%" onclick="openProductOptions('${p.codigo}')">Seleccionar Opción</button>`;
            } else {
                actionHtml = `<div class="quantity-control" style="padding:0; width:100%;">
                                    <button class="btn-minus" onclick="decrementQuantity('${p.codigo}')">−</button>
                                    <input type="number" id="qty-${p.codigo}" class="quantity-input-inline" value="${cantidadFinal.toFixed(1)}" step="1" min="0" onchange="validateQuantity('${p.codigo}')">
                                    <button class="btn-plus" onclick="incrementQuantity('${p.codigo}')">+</button>
                                    <button class="btn-confirm" onclick="confirmQuantity('${p.codigo}')">Agregar</button>
                               </div>`;
            }
        } else {
            actionHtml = `
                <div class="quantity-control">
                    <button class="btn-minus" onclick="decrementQuantity('${p.codigo}')">−</button>
                    <input type="number" id="qty-${p.codigo}" class="quantity-input-inline" value="${cantidadFinal.toFixed(1)}" step="0.5" min="0" onchange="validateQuantity('${p.codigo}')">
                    <button class="btn-plus" onclick="incrementQuantity('${p.codigo}')">+</button>
                    <button class="btn-confirm" onclick="confirmQuantity('${p.codigo}')" title="Solicitar">Solicitar</button>
                </div>
             `;
        }

        const stats = userStats[p.codigo] || { solicitado: 0, separado: 0, despachado: 0 };

        return `
            <div class="product-card flip-card" data-codigo="${p.codigo}" onclick="flipCard(this)">
                <div class="flip-card-inner">
                    <!-- FRONT FACE -->
                    <div class="flip-card-front">
                        <img src="${imagenUrl}" alt="${p.nombre}" class="product-image" onerror="this.onerror=null; this.src='${DEFAULT_IMAGE}';">
                        <div class="product-info">
                            <h3>${p.nombre}</h3>
                            <p><strong>Código:</strong> ${p.codigo}</p>
                            ${isPOS ? `<p class="price" style="font-size:1.2em;color:#27ae60;font-weight:bold;">S/ ${p.precioVenta.toFixed(2)}</p>` : `<p>${p.descripcion || ''}</p>`}
                            ${hasPresentations ? '<span class="badge badge-requested">Varias opciones</span>' : ''}

                            <div class="product-badges">
                                <span class="badge badge-stock">Stock: ${p.stock}</span>
                                ${cantidadFinal > 0 ? `<span class="badge badge-requested">${isPOS ? 'En carro' : 'Solicitado'}: ${cantidadFinal.toFixed(1)}</span>` : ''}
                            </div>
                        </div>

                        <div class="product-actions" style="padding: 10px 20px;" onclick="event.stopPropagation()">
                            ${actionHtml}
                        </div>
                    </div>

                    <!-- BACK FACE (STATS) -->
                    <div class="flip-card-back">
                        <h3>Estadísticas de Hoy</h3>
                        <div class="stats-grid">
                            <div class="stat-item"><span class="stat-label">Solicitado</span><span class="stat-value">${stats.solicitado.toFixed(1)}</span></div>
                            <div class="stat-item"><span class="stat-label">Separado</span><span class="stat-value">${stats.separado.toFixed(1)}</span></div>
                            <div class="stat-item"><span class="stat-label">Despachado</span><span class="stat-value">${stats.despachado.toFixed(1)}</span></div>
                        </div>

                        <!-- BOTÓN IMPRIMIR TICKET (80mm) -->
                        <button class="btn-primary" 
                                style="margin-top:20px; background:#333; font-size:12px; z-index: 10;" 
                                onclick="event.stopPropagation(); printHistory('${p.codigo}')">
                            🖨️ Imprimir Ticket
                        </button>

                        <p style="margin-top:15px; font-size:0.8em; opacity:0.8;">Click para volver</p>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = htmlFixed;
    isRendering = false;
}

function flipCard(cardElement) {
    cardElement.classList.toggle('flipped');
}

// ===== PRODUCT OPTIONS MODAL =====
function openProductOptions(codigo) {
    const product = allProducts.find(p => p.codigo === codigo);
    if (!product) return;

    selectedProduct = product;

    document.getElementById('modalProductName').textContent = product.nombre;
    const imgUrl = (product.imagen && product.imagen.trim() !== '') ? optimizeGoogleDriveUrl(product.imagen) : DEFAULT_IMAGE;
    document.getElementById('modalProductImage').src = imgUrl;

    const container = document.getElementById('modalPresentations');

    // Default Option (Unidad/Base)
    let html = `
        <div class="presentation-option" onclick="selectPresentation('${codigo}', 'UNIDAD', ${product.precioVenta}, 1)">
            <div class="pres-info">
                <h4>UNIDAD (Base)</h4>
                <p>Precio regular</p>
            </div>
            <div class="pres-price">S/ ${product.precioVenta.toFixed(2)}</div>
        </div>
        `;

    // Extra Presentations
    if (product.presentaciones) {
        html += product.presentaciones.map(pres => `
        <div class="presentation-option" onclick="selectPresentation('${codigo}', '${pres.nombre}', ${pres.precio}, ${pres.factor})">
                <div class="pres-info">
                    <h4>${pres.nombre}</h4>
                    <p>Factor: ${pres.factor}</p>
                </div>
                <div class="pres-price">S/ ${pres.precio.toFixed(2)}</div>
            </div>
        `).join('');
    }

    container.innerHTML = html;
    document.getElementById('productOptionsModal').classList.add('active');
}

function closeProductOptions() {
    document.getElementById('productOptionsModal').classList.remove('active');
    selectedProduct = null;
}

function selectPresentation(codigo, presName, price, factor) {
    // Logic to add to cart directly or ask quantity?
    // User requirement: "pueda añadirle la cantidad" (editable).
    // Let's ask quantity via a simple prompt or overlay in this modal.
    // For MVP/Speed: simple prompt. Better: replace list with qty input for selected option.

    // Let's modify logic to just add 1 unit (factor equivalent) or ask.
    // Assuming adding "1 presentation unit" = "factor * 1" base units?
    // Or do we treat it as a sales line item?
    // The backend `addSolicitud` takes `cantidad`. If we sell "1 Box of 12", do we deduct 12 from stock?
    // ERP usually tracks base units. So Quantity = 1 * Factor.

    const qty = prompt(`¿Cuántas ${presName} deseas agregar?`, "1");
    if (!qty) return;

    const qtyNum = parseFloat(qty);
    if (isNaN(qtyNum) || qtyNum <= 0) return alert('Cantidad inválida');

    const totalUnits = qtyNum * factor;

    // Add to backend
    confirmQuantity(codigo, totalUnits, presName); // Modified confirmQuantity to accept args
    closeProductOptions();
}


// ===== BÚSQUEDA =====
function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    let typingTimer;

    searchInput.addEventListener('input', (e) => {
        clearTimeout(typingTimer);
        const query = e.target.value.trim();

        if (!query) {
            renderProducts(allProducts);
            return;
        }

        typingTimer = setTimeout(() => filterProducts(query), 300);
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            clearTimeout(typingTimer);
            filterProducts(e.target.value.trim());
        }
    });
}

function manualSearch() {
    const query = document.getElementById('searchInput').value.trim();
    filterProducts(query);
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    renderProducts(allProducts);
    document.getElementById('searchInput').focus();
}

function filterProducts(query) {
    if (!query) {
        renderProducts(allProducts);
        return;
    }

    const queryLower = query.toLowerCase();
    const queryNorm = queryLower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const filtered = [];

    for (let i = 0; i < allProducts.length; i++) {
        const p = allProducts[i];

        if (p.nombre.toLowerCase().indexOf(queryLower) !== -1 ||
            p.codigo.toLowerCase().indexOf(queryLower) !== -1 ||
            (p.descripcion && p.descripcion.toLowerCase().indexOf(queryLower) !== -1)) {
            filtered.push(p);
            continue;
        }

        const nombreNorm = p.nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        if (nombreNorm.indexOf(queryNorm) !== -1) {
            filtered.push(p);
        }
    }

    renderProducts(filtered);
}

// ===== ORDENAMIENTO =====
function toggleSortMenu() {
    const menu = document.getElementById('sortMenu');
    menu.classList.toggle('active');
}

function sortProducts(type) {
    currentSort = type;
    let sorted = [...allProducts];

    switch (type) {
        case 'az':
            sorted.sort((a, b) => a.nombre.localeCompare(b.nombre));
            // document.getElementById('sortIcon').textContent = '🔤';
            break;
        case 'za':
            sorted.sort((a, b) => b.nombre.localeCompare(a.nombre));
            // document.getElementById('sortIcon').textContent = '🔤';
            break;
        case 'requested':
            sorted.sort((a, b) => {
                const aReq = userSolicitudes[a.codigo] || 0;
                const bReq = userSolicitudes[b.codigo] || 0;
                return bReq - aReq;
            });
            // document.getElementById('sortIcon').textContent = '📊';
            break;
        case 'stock':
            sorted.sort((a, b) => b.stock - a.stock);
            // document.getElementById('sortIcon').textContent = '📦';
            break;
    }

    renderProducts(sorted);
    document.getElementById('sortMenu').classList.remove('active');
}

// ===== SCANNER QR =====
function openQRScanner() {
    document.getElementById('qrModal').classList.add('active');

    qrScanner = new Html5Qrcode("qrReader");

    qrScanner.start(
        { facingMode: "environment" },
        {
            fps: 10,
            qrbox: { width: 250, height: 250 }
        },
        (decodedText) => {
            document.getElementById('searchInput').value = decodedText;
            filterProducts(decodedText);
            closeQRScanner();
        }
    ).catch(err => {
        console.error("Error al iniciar cámara:", err);
        alert("No se pudo acceder a la cámara. Verifica los permisos.");
        closeQRScanner();
    });
}

function closeQRScanner() {
    if (qrScanner) {
        qrScanner.stop().then(() => {
            qrScanner.clear();
            qrScanner = null;
        }).catch(err => console.error(err));
    }
    document.getElementById('qrModal').classList.remove('active');
}

// ===== CONTROLES DE CANTIDAD =====
function incrementQuantity(codigo) {
    const input = document.getElementById(`qty-${codigo}`);
    const current = parseFloat(input.value) || 0;
    input.value = (current + 1).toFixed(1);
}

function decrementQuantity(codigo) {
    const input = document.getElementById(`qty-${codigo}`);
    const current = parseFloat(input.value) || 0;
    if (current > 0) {
        input.value = (current - 1).toFixed(1);
    }
}

function validateQuantity(codigo) {
    const input = document.getElementById(`qty-${codigo}`);
    let value = parseFloat(input.value);
    if (isNaN(value) || value < 0) value = 0;
    input.value = value.toFixed(1);
}

async function confirmQuantity(codigo, manualQty = null, presentation = null) {
    // 1. PREPARACIÓN DE DATOS
    let diff = 0;
    let newValue = 0;
    let oldValue = userSolicitudes[codigo] || 0;

    if (manualQty !== null) {
        // Mode: Adding specific amount (from Presentation Modal)
        // We add to existing.
        newValue = oldValue + manualQty;
        diff = manualQty;
    } else {
        // Mode: Explicit Set (from Inline Controls)
        const input = document.getElementById(`qty-${codigo}`);
        newValue = parseFloat(input.value);
        diff = newValue - oldValue;
    }

    if (diff === 0) {
        showToast('ℹ️ No hay cambios para registrar');
        return;
    }

    // 4. ACTUALIZACIÓN OPTIMISTA DEL CACHÉ DE HISTORIAL
    // En lugar de borrar el caché (que obliga a recargar), agregamos el item manualmente
    if (historyCache[codigo]) {
        const now = new Date();
        // Simulamos la entrada que el servidor creará
        historyCache[codigo].unshift({
            codigo: codigo,
            cantidad: diff,
            fecha: now.toISOString(), // Formato ISO para que el sort funcione si fuera necesario
            id: 'temp-' + now.getTime(),
            categoria: 'solicitado' // Asumimos solicitado por defecto al crear
        });
    }

    // 2. ACTUALIZACIÓN VISUAL INMEDIATA (OPTIMISTA)
    // Asumimos éxito y actualizamos todo ya para que se sienta rápido
    userSolicitudes[codigo] = newValue;
    updateProductCard(codigo);

    // Feedback instantáneo
    showToast(diff > 0 ? `✓ +${diff.toFixed(1)} agregado` : `✓ ${Math.abs(diff).toFixed(1)} restado`);
    if (!manualQty) document.getElementById('searchInput').focus();

    // 3. ENVÍO AL SERVIDOR EN SEGUNDO PLANO
    try {
        // Module Logic: 
        // POS -> addSale (with seller)
        // Pedidos -> addSolicitud (standard)

        let action = 'addSolicitud';
        let payload = {
            codigo: codigo,
            cantidad: diff,
            usuario: currentViewUser // Zone
        };

        if (currentModule === 'pos') {
            action = 'addSale';
            payload.vendedor = currentSeller;
            payload.presentacion = presentation;
            // Note: addSale expects 'usuario' too, which is set above
        }

        const response = await fetch(`${APPS_SCRIPT_URL}?action=${action}`, {
            method: 'POST',
            keepalive: true, // Intenta guardar aunque cierres la pestaña
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        // Si el servidor dice que NO (error de script o lógica)
        if (!result.success) {
            throw new Error(result.error || 'El servidor rechazó la solicitud');
        }

        // ÉXITO SILENCIOSO: Si llegamos aquí, todo coincidió. No hacemos nada más.

    } catch (error) {
        // 4. ROLLBACK (SI ALGO FALLÓ)
        console.error("Error guardando:", error);

        // Revertimos la memoria local al valor antiguo
        userSolicitudes[codigo] = oldValue;

        // Actualizamos la tarjeta para que el usuario vea que el número volvió atrás
        updateProductCard(codigo);

        // Alerta intrusiva para que el usuario sepa que su último clic no valió
        alert('⚠ Error de conexión: No se pudieron guardar los cambios. Se ha restaurado el valor anterior.');
    }
}
function updateProductCard(codigo) {
    // Only update if rendered
    const card = document.querySelector(`[data-codigo="${codigo}"]`);
    if (!card) return;

    const solicitado = userSolicitudes[codigo] || 0;
    const badgesContainer = card.querySelector('.product-badges');

    // Actualizar o crear badge de solicitado
    let requestedBadge = badgesContainer.querySelector('.badge-requested');
    if (solicitado !== 0) {
        if (requestedBadge) {
            requestedBadge.textContent = `En carro: ${solicitado.toFixed(1)}`;
        } else {
            const newBadge = document.createElement('span');
            newBadge.className = 'badge badge-requested';
            newBadge.textContent = `En carro: ${solicitado.toFixed(1)}`;
            badgesContainer.appendChild(newBadge);
        }
    } else if (requestedBadge) {
        requestedBadge.remove();
    }

    // Actualizar el input (si existe, puede no existir si es modo presentación)
    const input = document.getElementById(`qty-${codigo}`);
    if (input) {
        input.value = solicitado.toFixed(1);
    }
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
    position: fixed;
    bottom: 100px;
    right: 30px;
    background: #27ae60;
    color: white;
    padding: 15px 25px;
    border-radius: 10px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    z-index: 10000;
    font-weight: 600;
    animation: slideInRight 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// ===== HISTORIAL =====
async function showHistory(codigo) {
    const modal = document.getElementById('historyModal');
    const body = document.getElementById('historyModalBody');

    // Header con botón de imprimir (alineado a la derecha, sin título duplicado)
    const headerHtml = `
        <div style="display:flex;justify-content:flex-end;align-items:center;margin-bottom:15px;">
            <button onclick="printHistory('${codigo}')" class="btn-primary">
                🖨️ Imprimir / PDF
            </button>
        </div>
        `;

    body.innerHTML = '<div class="loading">Cargando historial...</div>';
    modal.classList.add('active');

    try {
        let history;

        // 1. Intentar desde Caché
        if (historyCache[codigo]) {
            history = historyCache[codigo];
            console.log("Historial cargado desde caché");
        } else {
            // 2. Si no está en caché, buscar en servidor
            const response = await fetch(`${APPS_SCRIPT_URL}?action=getHistory&codigo=${codigo}&usuario=${currentViewUser}`);
            history = await response.json();
            historyCache[codigo] = history;
        }

        if (history.length === 0) {
            body.innerHTML = headerHtml + '<p class="no-results">No hay movimientos registrados</p>';
            return;
        }

        const today = new Date().toLocaleDateString('es-PE');

        const listHtml = history.map(h => {
            let itemDate;
            // Manejo robusto de fechas (ISO vs String Apps Script)
            if (h.fecha.includes('T')) {
                const d = new Date(h.fecha);
                itemDate = d.toLocaleString('es-PE'); // Formato local simple
            } else {
                itemDate = formatDate(h.fecha);
            }

            const dateOnly = itemDate.split(' ')[0].replace(',', '');
            const isToday = dateOnly === today;

            const categoria = h.categoria || 'solicitado';
            const statusClass = `status-${categoria}`;

            let labelCategoria = '';
            if (categoria === 'separado') labelCategoria = '<span style="color:#e67e22;font-weight:bold;">⏳ Separado</span>';
            else if (categoria === 'despachado') labelCategoria = '<span style="color:#c0392b;font-weight:bold;">🚀 Despachado</span>';
            else labelCategoria = '<span style="color:#27ae60;font-weight:bold;">✅ Solicitado</span>';

            return `
        <div class="history-item ${statusClass}">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
                        <span style="font-size:18px;font-weight:bold;color:#333;">${h.cantidad} un.</span>
                        ${labelCategoria}
                    </div>
                    <p style="font-size:12px;color:#666;">Fecha: ${itemDate}</p>
                    ${isToday ? '<p style="font-size:11px;color:#27ae60;font-weight:600;margin-top:2px;">📅 Hoy</p>' : ''}
                </div>
        `;
        }).join('');

        body.innerHTML = headerHtml + '<div class="history-list">' + listHtml + '</div>';

    } catch (error) {
        body.innerHTML = '<p class="no-results">Error al cargar historial</p>';
        console.error(error);
    }
}

async function printHistory(codigo) {
    let history = historyCache[codigo];

    // 1. Si no hay cache, descargar
    if (!history) {
        showToast('⏳ Cargando historial para imprimir...');
        try {
            const response = await fetch(`${APPS_SCRIPT_URL}?action=getHistory&codigo=${codigo}&usuario=${currentViewUser}`);
            history = await response.json();
            historyCache[codigo] = history;
        } catch (e) {
            console.error("Error fetching history:", e);
            alert("Error al cargar historial. Intente nuevamente.");
            return;
        }
    }

    // 2. Validar si hay registros
    if (!history || history.length === 0) {
        alert("No hay registros de historial para este producto hoy (o nunca).");
        return;
    }

    const product = allProducts.find(p => p.codigo === codigo);
    const productName = product ? product.nombre : codigo;
    const now = new Date();

    const printWindow = window.open('', '', 'height=600,width=400');
    if (!printWindow) {
        alert("El navegador bloqueó la ventana emergente. Por favor permite pop-ups.");
        return;
    }

    let rows = history.map(h => {
        let dateObj = h.fecha.includes('T') ? new Date(h.fecha) : new Date();
        let displayDate = dateObj.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' }) + ' ' +
            dateObj.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

        let label = h.categoria ? h.categoria.substring(0, 3).toUpperCase() : 'SOL';
        if (h.categoria === 'separado') label = 'SEP';
        if (h.categoria === 'despachado') label = 'DES';

        return `
        <tr>
            <td>${displayDate}</td>
            <td style="text-align:center; font-weight:900; font-size:14px;">${h.cantidad}</td>
            <td style="text-align:right;">${label}</td>
        </tr>
        `;
    }).join('');

    printWindow.document.write(`
        <html>
            <head>
                <title>Ticket - ${codigo}</title>
                <style>
                    @page { size: 80mm auto; margin: 0; }
                    body { 
                        width: 76mm; /* Margen seguridad 80mm - 4mm */
                        font-family: 'Arial', sans-serif; 
                        font-weight: 700; 
                        font-size: 13px;
                        color: #000;
                        margin: 0 auto;
                        padding: 2mm;
                    }
                    h1 { font-size: 15px; text-align: center; margin: 5px 0; text-transform: uppercase; }
                    .meta { font-size: 11px; margin-bottom: 10px; border-bottom: 2px dashed #000; padding-bottom: 5px; }
                    table { width: 100%; border-collapse: collapse; }
                    th { border-bottom: 2px solid #000; text-align: left; font-size: 11px; }
                    td { border-bottom: 1px dashed #666; padding: 4px 0; font-family: 'Courier New', monospace; }
                    .footer { margin-top: 15px; text-align: center; font-size: 10px; border-top: 2px dashed #000; padding-top: 5px;}
                </style>
            </head>
            <body>
                <h1>Historial ${currentViewUser}</h1>
                <div class="meta">
                    <strong>${productName}</strong><br>
                    COD: ${codigo}<br>
                    IMPRESO: ${now.toLocaleString('es-PE')}
                </div>
                
                <table>
                    <thead>
                        <tr>
                            <th>FECHA</th>
                            <th style="text-align:center">CANT</th>
                            <th style="text-align:right">EST</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
                
                <div class="footer">
                    *** FIN DEL TICKET ***
                </div>
                <script>
                    window.onload = function() { window.print(); setTimeout(() => window.close(), 500); }
                </script>
            </body>
        </html>
    `);
    printWindow.document.close();
}

function closeHistoryModal() {
    document.getElementById('historyModal').classList.remove('active');
}

function formatDate(dateString) {
    try {
        if (dateString.includes('T')) {
            const date = new Date(dateString);
            return date.toLocaleString('es-PE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        const parts = dateString.split(' ');
        if (parts.length >= 2) {
            return `${parts[0]} ${parts[1].substring(0, 5)}`;
        }

        return dateString;
    } catch (error) {
        return dateString;
    }
}

// ===== TUTORIAL =====
async function loadTutorial() {
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getTutorial`);
        tutorialImages = await response.json();
    } catch (error) {
        console.error('Error cargando tutorial:', error);
        tutorialImages = [];
    }
}

function showTutorial() {
    if (tutorialImages.length === 0) return;

    const lastSeen = localStorage.getItem('tutorialLastSeen');
    const today = new Date().toDateString();
    if (lastSeen === today) return;

    tutorialStep = 0;
    renderTutorialStep();
    document.getElementById('tutorialOverlay').classList.add('active');
    document.getElementById('tutorialModal').classList.add('active');
}

function renderTutorialStep() {
    if (tutorialImages.length === 0) return;

    const step = tutorialImages[tutorialStep];
    document.getElementById('tutorialContent').innerHTML = `
            <h3>${step.titulo}</h3>
            <img src="${step.imagen}" alt="${step.titulo}">
            <p>${step.descripcion}</p>
        `;

    const dots = tutorialImages.map((_, i) =>
        `<span class="dot ${i === tutorialStep ? 'active' : ''}"></span>`
    ).join('');
    document.getElementById('tutorialDots').innerHTML = dots;
}

function nextTutorial() {
    if (tutorialStep < tutorialImages.length - 1) {
        tutorialStep++;
        renderTutorialStep();
    } else {
        closeTutorial();
    }
}

function prevTutorial() {
    if (tutorialStep > 0) {
        tutorialStep--;
        renderTutorialStep();
    }
}

function closeTutorial() {
    document.getElementById('tutorialOverlay').classList.remove('active');
    document.getElementById('tutorialModal').classList.remove('active');
    localStorage.setItem('tutorialLastSeen', new Date().toDateString());
}

// ===== SESIÓN =====
function resetSessionTimeout() {
    if (sessionTimeout) clearTimeout(sessionTimeout);

    sessionTimeout = setTimeout(() => {
        logout();
        alert('Tu sesión ha expirado por inactividad');
    }, 4 * 60 * 60 * 1000);

    ['click', 'keypress'].forEach(event => {
        document.addEventListener(event, () => {
            if (currentUser) {
                const session = JSON.parse(localStorage.getItem('session'));
                if (session) {
                    session.expiry = new Date().getTime() + (4 * 60 * 60 * 1000);
                    localStorage.setItem('session', JSON.stringify(session));
                }
            }
        }, { passive: true });
    });
}

function logout() {
    localStorage.removeItem('session');
    currentUser = null;
    currentViewUser = null;
    currentSeller = null;
    userRole = 'tienda';
    availableZones = [];
    if (sessionTimeout) clearTimeout(sessionTimeout);
    location.reload();
}

// ===== HELPER IMÁGENES =====
function optimizeGoogleDriveUrl(url) {
    if (!url) return url;
    if (url.includes('lh3.googleusercontent.com')) return url;
    if (url.includes('drive.google.com') || url.includes('docs.google.com')) {
        let id = null;
        const matchId = url.match(/[?&]id=([^&]+)/);
        if (matchId) {
            id = matchId[1];
        } else {
            const matchD = url.match(/\/d\/([^\/]+)/);
            if (matchD) id = matchD[1];
        }
        if (id) return `https://lh3.googleusercontent.com/d/${id}`;
    }
    return url;
}
