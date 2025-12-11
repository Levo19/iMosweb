// CONFIGURACIÓN
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyAYQCnmQs8Yg4TYMkdJRFDwpg_daow_60q8v0EwheLTynZU7NEC0n9aJ4J7xrAWBmy/exec';
const DEFAULT_IMAGE = 'https://raw.githubusercontent.com/Levo19/iMosweb/main/recursos/defaultImageProduct.png';

let currentUser = null;          // Usuario logueado (Jefe o Tienda)
let currentViewUser = null;      // Usuario/Zona que se está visualizando
let userRole = 'tienda';         // 'tienda' o 'jefe'
let availableZones = [];         // Lista de zonas disponibles para el jefe
let sessionTimeout = null;
let selectedProduct = null;
let allProducts = [];
let userSolicitudes = {};
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
                lastViewUser: currentViewUser
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

    await loadProducts();
    setupSearch();
    await loadTutorial();
    setTimeout(() => showTutorial(), 1000);
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

    // Actualizar sesión para recordar selección
    const session = JSON.parse(localStorage.getItem('session'));
    if (session) {
        session.lastViewUser = zone;
        localStorage.setItem('session', JSON.stringify(session));
    }

    // Actualizar UI botones
    renderZoneSelector();

    // Recargar datos (Optimización: loadProducts solo descargará solicitudes si ya tiene productos)
    document.getElementById('searchInput').value = ''; // Limpiar búsqueda al cambiar
    await loadProducts();
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
        // Ejecutamos ambas peticiones en paralelo para máxima velocidad
        const [solicitudesRes, historyRes] = await Promise.all([
            fetch(`${APPS_SCRIPT_URL}?action=getTodaySolicitudes&usuario=${currentViewUser}`),
            fetch(`${APPS_SCRIPT_URL}?action=getAllHistory&usuario=${currentViewUser}`)
        ]);

        const solicitudes = await solicitudesRes.json();
        const fullHistory = await historyRes.json();

        // Actualizar caché de hoy
        userSolicitudes = {};
        solicitudes.forEach(sol => {
            userSolicitudes[sol.codigo] = sol.solicitado || 0;
            updateProductCard(sol.codigo);
        });

        // Actualizar caché de historial (Precarga masiva)
        if (fullHistory && typeof fullHistory === 'object') {
            historyCache = fullHistory;
            console.log("Historial completo precargado:", Object.keys(historyCache).length, "productos");
        }

    } catch (error) {
        console.error("Error cargando datos de usuario:", error);
    }
}

// ===== RENDERIZAR PRODUCTOS - CORREGIDO (SIN PARPADEO) =====
function renderProducts(products) {
    if (isRendering) return;
    isRendering = true;

    const container = document.getElementById('productsContainer');

    // DEBUG: Verificamos en la consola qué está llegando realmente
    console.log("Datos recibidos del servidor:", products);

    if (products.length === 0) {
        container.innerHTML = '<div class="no-results">No se encontraron productos</div>';
        isRendering = false;
        return;
    }

    const html = products.map(p => {
        // --- LÓGICA CORREGIDA ---

        // 1. Obtenemos el valor del servidor (asegurando que sea número)
        // Nota: Si en tu Google Script la variable se llama diferente (ej: 'cantidad'), cambia 'p.solicitado'
        let serverQty = parseFloat(p.solicitado);
        if (isNaN(serverQty)) serverQty = 0;

        // 2. Obtenemos el valor local (si el usuario lo está editando ahora mismo)
        let localQty = userSolicitudes[p.codigo];

        // 3. DECISIÓN FINAL: ¿Cuál mostramos?
        // Si existe un valor local (aunque sea 0), usamos ese. Si no, usamos el del servidor.
        const cantidadFinal = (localQty !== undefined) ? parseFloat(localQty) : serverQty;

        const imagenUrl = (p.imagen && p.imagen.trim() !== '') ? optimizeGoogleDriveUrl(p.imagen) : DEFAULT_IMAGE;

        return `
            <div class="product-card" data-codigo="${p.codigo}">
                <img src="${imagenUrl}" 
                     alt="${p.nombre}" 
                     class="product-image" 
                     onerror="this.onerror=null; this.src='${DEFAULT_IMAGE}';">
                <div class="product-info">
                    <h3>${p.nombre}</h3>
                    <p><strong>Código:</strong> ${p.codigo}</p>
                    <p>${p.descripcion || ''}</p>
                    
                    <div class="product-badges">
                        <span class="badge badge-stock">Stock: ${p.stock}</span>
                        
                        ${cantidadFinal > 0 ? `<span class="badge badge-requested">Solicitado: ${cantidadFinal.toFixed(1)}</span>` : ''}
                    </div>
                </div>

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

                <div class="product-actions">
                    <button class="btn-action btn-history" onclick="showHistory('${p.codigo}')">
                        📋 Historial
                    </button>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
    isRendering = false;
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
            document.getElementById('sortIcon').textContent = '🔤';
            break;
        case 'za':
            sorted.sort((a, b) => b.nombre.localeCompare(a.nombre));
            document.getElementById('sortIcon').textContent = '🔤';
            break;
        case 'requested':
            sorted.sort((a, b) => {
                const aReq = userSolicitudes[a.codigo] || 0;
                const bReq = userSolicitudes[b.codigo] || 0;
                return bReq - aReq;
            });
            document.getElementById('sortIcon').textContent = '📊';
            break;
        case 'stock':
            sorted.sort((a, b) => b.stock - a.stock);
            document.getElementById('sortIcon').textContent = '📦';
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

async function confirmQuantity(codigo) {
    // 1. PREPARACIÓN DE DATOS
    const input = document.getElementById(`qty-${codigo}`);
    const newValue = parseFloat(input.value);
    // Guardamos el valor antiguo por si hay que deshacer (Rollback)
    const oldValue = userSolicitudes[codigo] || 0;
    const diff = newValue - oldValue;

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
    showToast(diff > 0 ? `✓ +${diff.toFixed(1)} agregado` : `✓ ${diff.toFixed(1)} restado`);
    document.getElementById('searchInput').focus();

    // 3. ENVÍO AL SERVIDOR EN SEGUNDO PLANO
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=addSolicitud`, {
            method: 'POST',
            keepalive: true, // Intenta guardar aunque cierres la pestaña
            body: JSON.stringify({
                codigo: codigo,
                cantidad: diff,
                usuario: currentViewUser // IMPORTANTE: Enviamos la zona que se está viendo
            })
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
    const card = document.querySelector(`[data-codigo="${codigo}"]`);
    if (!card) return;

    const solicitado = userSolicitudes[codigo] || 0;
    const badgesContainer = card.querySelector('.product-badges');

    // Actualizar o crear badge de solicitado
    let requestedBadge = badgesContainer.querySelector('.badge-requested');
    if (solicitado !== 0) {
        if (requestedBadge) {
            requestedBadge.textContent = `Solicitado: ${solicitado.toFixed(1)}`;
        } else {
            const newBadge = document.createElement('span');
            newBadge.className = 'badge badge-requested';
            newBadge.textContent = `Solicitado: ${solicitado.toFixed(1)}`;
            badgesContainer.appendChild(newBadge);
        }
    } else if (requestedBadge) {
        requestedBadge.remove();
    }

    // Actualizar el input
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
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
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

function printHistory(codigo) {
    if (!historyCache[codigo]) return;

    const history = historyCache[codigo];
    const product = allProducts.find(p => p.codigo === codigo);
    const productName = product ? product.nombre : codigo;

    // Crear ventana de impresión
    const printWindow = window.open('', '', 'height=600,width=800');

    let rows = history.map(h => {
        let dateStr = h.fecha.includes('T') ? new Date(h.fecha).toLocaleString('es-PE') : h.fecha;
        return `
            <tr>
                <td>${dateStr}</td>
                <td style="text-align:center;font-weight:bold;">${h.cantidad}</td>
                <td>${h.categoria || 'solicitado'}</td>
            </tr>
        `;
    }).join('');

    printWindow.document.write(`
        <html>
            <head>
                <title>Historial - ${productName}</title>
                <style>
                    body { font-family: sans-serif; padding: 20px; }
                    h1 { font-size: 18px; margin-bottom: 5px; }
                    h2 { font-size: 14px; color: #666; margin-bottom: 20px; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; }
                    .footer { margin-top: 30px; font-size: 12px; color: #999; text-align: center; }
                </style>
            </head>
            <body>
                <h1>Historial de Movimientos</h1>
                <h2>Producto: ${productName} (${codigo})</h2>
                <h2>Zona: ${currentViewUser}</h2>
                
                <table>
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Cantidad</th>
                            <th>Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
                
                <div class="footer">Generado el ${new Date().toLocaleString('es-PE')}</div>
                <script>
                    window.onload = function() { window.print(); window.close(); }
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
