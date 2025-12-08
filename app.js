// ============================================
// LEVO - SISTEMA DE PEDIDOS CON CATEGORÍAS
// ============================================

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxCSdcwutTIa6l8AASdXjKc7aaDOEAp9zU4oULq2v4yyaQjWtGjPu6LOYTsMjUFyIKH/exec';

let currentUser = null;
let sessionTimeout = null;
let selectedProduct = null;
let allProducts = [];
let userSolicitudes = {};
let canAddRequests = true;
let tutorialStep = 0;
let tutorialImages = [];
let currentSort = 'default';
let qrScanner = null;

// ===== INICIALIZACIÓN (CORREGIDO) =====
function checkSession() {
    try {
        const sessionStr = localStorage.getItem('session');
        // Si no hay sesión o es "undefined", salimos
        if (!sessionStr || sessionStr === "undefined") {
            return;
        }

        const session = JSON.parse(sessionStr);
        
        if (session && session.user && session.expiry) {
            const now = new Date().getTime();
            if (now < session.expiry) {
                currentUser = session.user;
                showMainApp();
                resetSessionTimeout();
            } else {
                localStorage.removeItem('session'); // Expiró
            }
        }
    } catch (error) {
        console.error("Error leyendo sesión:", error);
        localStorage.removeItem('session'); // Borramos datos corruptos
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
            const expiry = new Date().getTime() + (4 * 60 * 60 * 1000);
            localStorage.setItem('session', JSON.stringify({ user: username, expiry }));
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
    
//document.getElementById('loginContainer').style.display = 'none';
    //document.getElementById('mainApp').classList.add('active');
    document.getElementById('userDisplay').textContent = currentUser;
    
   // checkSchedule();
    await loadProducts();
    //setupSearch();
    //await loadTutorial();
    //setTimeout(() => showTutorial(), 1000);
}

// ===== VERIFICAR HORARIO =====
function checkSchedule() {
    const now = new Date();
    const hour = now.getHours();
    canAddRequests = hour >= 7 && hour < 19;
    
    const warningDiv = document.getElementById('scheduleWarning');
    if (!canAddRequests) {
        warningDiv.innerHTML = `
            <div class="schedule-warning">
                <span style="font-size:24px;">⏰</span>
                <span>Fuera de horario: Solo puedes consultar. Las solicitudes están disponibles de 7:00 AM a 7:00 PM</span>
            </div>
        `;
    }
}

// ===== CARGAR PRODUCTOS (VERSIÓN SEGURA) =====
async function loadProducts() {
    const container = document.getElementById('productsContainer');
    container.innerHTML = '<div class="loading">Cargando productos...</div>';

    try {
        console.log("Iniciando carga de datos..."); // DIAGNÓSTICO
        
        const [productsRes, solicitudesRes] = await Promise.all([
            fetch(`${APPS_SCRIPT_URL}?action=getProducts`),
            fetch(`${APPS_SCRIPT_URL}?action=getTodaySolicitudes&usuario=${currentUser}`)
        ]);

        const productsData = await productsRes.json();
        const solicitudesData = await solicitudesRes.json();

        console.log("Productos recibidos:", productsData); // DIAGNÓSTICO
        
        // VERIFICACIÓN DE SEGURIDAD 1: ¿Es un error del servidor?
        if (productsData.error || (productsData.result === 'error')) {
            throw new Error(productsData.error || "Error en el servidor");
        }

        // VERIFICACIÓN DE SEGURIDAD 2: ¿Es una lista real?
        if (!Array.isArray(productsData)) {
            console.error("Formato incorrecto:", productsData);
            throw new Error("Los productos no llegaron como una lista válida");
        }

        allProducts = productsData;
        
        // Procesar solicitudes (con seguridad extra)
        userSolicitudes = {};
        if (Array.isArray(solicitudesData)) {
            solicitudesData.forEach(sol => {
                if(sol && sol.codigo) {
                   userSolicitudes[sol.codigo] = sol.cantidad;
                }
            });
        }

        // Llamar al renderizador
        renderProducts(allProducts);

    } catch (error) {
        console.error("Error FATAL en loadProducts:", error);
        container.innerHTML = `
            <div style="text-align:center; padding: 20px; background: rgba(255,255,255,0.9); border-radius: 10px; margin: 20px;">
                <p style="color:red; font-weight:bold;">⚠️ Error al cargar datos</p>
                <p style="font-size:12px; color:#666;">${error.message}</p>
                <button onclick="location.reload()" style="padding:10px 20px; background:#333; color:white; border:none; border-radius:5px; margin-top:10px;">Reintentar</button>
            </div>`;
    }
}


// ===== RENDERIZAR PRODUCTOS (VERSIÓN SEGURA Y RÁPIDA) =====
function renderProducts(products) {
    const container = document.getElementById('productsContainer');
    
    // Seguridad extra: Si products es nulo o indefinido
    if (!products || !Array.isArray(products)) {
        container.innerHTML = '<div class="no-results">Error: Datos de productos inválidos</div>';
        return;
    }

    if (products.length === 0) {
        container.innerHTML = '<div class="no-results">No se encontraron productos en el inventario</div>';
        return;
    }

    // Limpiamos container una sola vez
    container.innerHTML = '';
    
    const BATCH_SIZE = 500; // Lote grande para velocidad
    let currentBatch = 0;

    const renderBatch = () => {
        const start = currentBatch * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, products.length);
        
        let htmlBuffer = ''; // Usamos string plano por rendimiento

        for (let i = start; i < end; i++) {
            const p = products[i];
            // Protección contra productos vacíos
            if (!p) continue;

            const balance = userSolicitudes[p.codigo] || 0;
            const disabledAttr = !canAddRequests ? 'disabled' : '';
            
            // Construcción segura del HTML
            htmlBuffer += `
                <div class="product-card" data-codigo="${p.codigo}">
                    <div class="product-info">
                        <h3>${p.nombre || 'Sin Nombre'}</h3>
                        <p><strong>Código:</strong> ${p.codigo || '---'}</p>
                        <div class="product-badges">
                            <span class="badge badge-stock">Stock: ${p.stock || 0}</span>
                            ${balance !== 0 ? `<span class="badge badge-requested">Disponible: ${parseFloat(balance).toFixed(1)}</span>` : ''}
                        </div>
                    </div>
                    <div class="quantity-control">
                        <button class="btn-minus" onclick="decrementQuantity('${p.codigo}')" ${disabledAttr}>−</button>
                        <input type="number" id="qty-${p.codigo}" class="quantity-input-inline" value="${Math.max(0, balance).toFixed(1)}" step="0.1" min="0" onchange="validateQuantity('${p.codigo}')" ${disabledAttr}>
                        <button class="btn-plus" onclick="incrementQuantity('${p.codigo}')" ${disabledAttr}>+</button>
                        <button class="btn-confirm" onclick="confirmQuantity('${p.codigo}')" ${disabledAttr}>✈️</button>
                    </div>
                     <div class="product-actions">
                        <button class="btn-action btn-history" onclick="showHistory('${p.codigo}')">📋 Historial</button>
                    </div>
                </div>
            `;
        }

        // Inserción al DOM
        container.insertAdjacentHTML('beforeend', htmlBuffer);

        currentBatch++;
        if (end < products.length) {
            setTimeout(renderBatch, 0);
        }
    };

    renderBatch();
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
    
    switch(type) {
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
    const input = document.getElementById(`qty-${codigo}`);
    const newValue = parseFloat(input.value);
    const oldValue = userSolicitudes[codigo] || 0;
    const diff = newValue - oldValue;
    
    if (diff === 0) {
        showToast('ℹ️ No hay cambios para registrar');
        return;
    }
    
    if (!canAddRequests) {
        alert('⏰ Fuera de horario: Solo de 7:00 AM a 7:00 PM');
        return;
    }
    
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=addSolicitud`, {
            method: 'POST',
            body: JSON.stringify({
                codigo: codigo,
                cantidad: diff,
                usuario: currentUser
            })
        });

        const result = await response.json();

        if (result.success) {
            userSolicitudes[codigo] = newValue;
            updateProductCard(codigo);
            
            // Mover foco a barra de búsqueda
            document.getElementById('searchInput').focus();
            
            // Notificación
            showToast(diff > 0 ? `✓ +${diff.toFixed(1)} agregado` : `✓ ${diff.toFixed(1)} restado`);
        } else {
            alert('✗ ' + (result.error || 'Error al registrar'));
        }
    } catch (error) {
        alert('✗ Error de conexión');
        console.error(error);
    }
}

function updateProductCard(codigo) {
    const card = document.querySelector(`[data-codigo="${codigo}"]`);
    if (!card) return;

    const balance = userSolicitudes[codigo] || 0;
    const badgesContainer = card.querySelector('.product-badges');
    
    let requestedBadge = badgesContainer.querySelector('.badge-requested');
    if (balance !== 0) {
        if (requestedBadge) {
            requestedBadge.textContent = `Disponible: ${balance.toFixed(1)}`;
        } else {
            const newBadge = document.createElement('span');
            newBadge.className = 'badge badge-requested';
            newBadge.textContent = `Disponible: ${balance.toFixed(1)}`;
            badgesContainer.appendChild(newBadge);
        }
    } else if (requestedBadge) {
        requestedBadge.remove();
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
    
    body.innerHTML = '<div class="loading">Cargando historial...</div>';
    modal.classList.add('active');

    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getHistory&codigo=${codigo}&usuario=${currentUser}`);
        const history = await response.json();

        if (history.length === 0) {
            body.innerHTML = '<p class="no-results">No hay solicitudes registradas</p>';
            return;
        }

        const today = new Date().toLocaleDateString('es-PE');
        
        body.innerHTML = history.map(h => {
            const itemDate = formatDate(h.fecha);
            const dateOnly = itemDate.split(' ')[0];
            const isToday = dateOnly === today;
            
            return `
                <div class="history-item ${isToday ? 'history-today' : 'history-past'}">
                    <p><strong>Cantidad:</strong> ${h.cantidad}</p>
                    <p><strong>Fecha:</strong> ${itemDate}</p>
                    ${isToday ? '<p style="color:#27ae60;font-weight:600;">📅 Hoy</p>' : ''}
                </div>
            `;
        }).join('');
    } catch (error) {
        body.innerHTML = '<p class="no-results">Error al cargar historial</p>';
        console.error(error);
    }
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

// ===== SESIÓN (CORREGIDO) =====
function resetSessionTimeout() {
    return; // <--- AGREGA ESTO EN LA PRIMERA LÍNEA DE LA FUNCIÓN
    
    // ... el resto del código quedará ignorado ...


    if (sessionTimeout) clearTimeout(sessionTimeout);
    
    sessionTimeout = setTimeout(() => {
        logout();
        alert('Tu sesión ha expirado por inactividad');
        window.location.reload(); // Recargamos para mostrar el login limpio
    }, 4 * 60 * 60 * 1000);

    // Eliminamos escuchadores previos para no acumular basura
    document.removeEventListener('click', extendSession);
    document.removeEventListener('keypress', extendSession);

    // Agregamos los nuevos
    document.addEventListener('click', extendSession, { passive: true });
    document.addEventListener('keypress', extendSession, { passive: true });
}

// Función auxiliar para no redefinirla dentro de resetSessionTimeout
function extendSession() {
    if (currentUser) {
        const sessionStr = localStorage.getItem('session');
        if (sessionStr) {
            try {
                const session = JSON.parse(sessionStr);
                session.expiry = new Date().getTime() + (4 * 60 * 60 * 1000);
                localStorage.setItem('session', JSON.stringify(session));
            } catch (e) {
                // Ignorar errores silenciosamente en eventos frecuentes
            }
        }
    }
}

// ===== CERRAR MODALES Y MENUS =====
window.onclick = (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
};

document.addEventListener('click', (e) => {
    const sortMenu = document.getElementById('sortMenu');
    if (sortMenu && !e.target.closest('.sort-dropdown')) {
        sortMenu.classList.remove('active');
    }
});
