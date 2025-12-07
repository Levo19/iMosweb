// ============================================
// LEVO - SISTEMA DE PEDIDOS
// ============================================

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxCSdcwutTIa6l8AASdXjKc7aaDOEAp9zU4oULq2v4yyaQjWtGjPu6LOYTsMjUFyIKH/exec';

let currentUser = null;
let sessionTimeout = null;
let selectedProduct = null;
let allProducts = [];
let userSolicitudes = {};
let canAddRequests = true;
let isAdding = true; // true = agregar, false = restar
let tutorialStep = 0;
let tutorialImages = [];

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
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('mainApp').classList.add('active');
    document.getElementById('userDisplay').textContent = currentUser;
    
    checkSchedule();
    await loadProducts();
    setupSearch();
    await loadTutorial();
    setTimeout(() => showTutorial(), 1000);
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

// ===== CARGAR PRODUCTOS =====
async function loadProducts() {
    const container = document.getElementById('productsContainer');
    container.innerHTML = '<div class="loading">Cargando productos...</div>';

    try {
        const [productsRes, solicitudesRes] = await Promise.all([
            fetch(`${APPS_SCRIPT_URL}?action=getProducts`),
            fetch(`${APPS_SCRIPT_URL}?action=getTodaySolicitudes&usuario=${currentUser}`)
        ]);
        
        allProducts = await productsRes.json();
        const solicitudes = await solicitudesRes.json();
        
        // Calcular totales solicitados HOY
        userSolicitudes = {};
        solicitudes.forEach(sol => {
            if (!userSolicitudes[sol.codigo]) userSolicitudes[sol.codigo] = 0;
            userSolicitudes[sol.codigo] += parseFloat(sol.cantidad) || 0;
        });
        
        renderProducts(allProducts);
    } catch (error) {
        container.innerHTML = '<p class="no-results">Error al cargar productos</p>';
        console.error(error);
    }
}

// ===== RENDERIZAR PRODUCTOS =====
function renderProducts(products) {
    const container = document.getElementById('productsContainer');
    
    if (products.length === 0) {
        container.innerHTML = '<div class="no-results">No se encontraron productos</div>';
        return;
    }

    const BATCH_SIZE = 50;
    let currentBatch = 0;
    
    const renderBatch = () => {
        const start = currentBatch * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, products.length);
        const html = [];
        
        for (let i = start; i < end; i++) {
            const p = products[i];
            const solicitado = userSolicitudes[p.codigo] || 0;
            const disabled = !canAddRequests ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : '';
            
            html.push(`
                <div class="product-card" data-codigo="${p.codigo}">
                    <img src="${p.imagen || 'https://via.placeholder.com/300x200?text=Sin+Imagen'}" 
                         alt="${p.nombre}" class="product-image" 
                         onerror="this.src='https://via.placeholder.com/300x200?text=Sin+Imagen'">
                    <div class="product-info">
                        <h3>${p.nombre}</h3>
                        <p><strong>Código:</strong> ${p.codigo}</p>
                        <p>${p.descripcion || ''}</p>
                        <div class="product-badges">
                            <span class="badge badge-stock">Stock: ${p.stock}</span>
                            ${solicitado !== 0 ? `<span class="badge badge-requested">Solicitado Hoy: ${solicitado}</span>` : ''}
                        </div>
                    </div>
                    <div class="product-actions">
                        <button class="btn-action btn-add" onclick='openQuantityModal(${JSON.stringify(p).replace(/'/g, "&#39;")}, true)' ${disabled}>
                            ➕ Agregar
                        </button>
                        <button class="btn-action btn-subtract" onclick='openQuantityModal(${JSON.stringify(p).replace(/'/g, "&#39;")}, false)' ${disabled}>
                            ➖ Restar
                        </button>
                        <button class="btn-action btn-history" onclick="showHistory('${p.codigo}')">
                            📋 Historial
                        </button>
                    </div>
                </div>
            `);
        }
        
        if (currentBatch === 0) {
            container.innerHTML = html.join('');
        } else {
            container.innerHTML += html.join('');
        }
        
        currentBatch++;
        if (end < products.length) {
            setTimeout(renderBatch, 10);
        }
    };
    
    currentBatch = 0;
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

// ===== MODAL CANTIDAD =====
function openQuantityModal(product, adding) {
    if (!canAddRequests) {
        alert('⏰ Fuera de horario: Las solicitudes solo están disponibles de 7:00 AM a 7:00 PM');
        return;
    }
    
    selectedProduct = product;
    isAdding = adding;
    
    document.getElementById('modalTitle').textContent = adding ? 'Agregar Solicitud' : 'Restar Solicitud';
    document.getElementById('modalProductName').textContent = product.nombre;
    document.getElementById('modalProductCode').textContent = product.codigo;
    document.getElementById('quantityInput').value = '1';
    document.getElementById('quantityMessage').innerHTML = '';
    document.getElementById('quantityModal').classList.add('active');
    
    setTimeout(() => document.getElementById('quantityInput').focus(), 100);
}

function closeQuantityModal() {
    document.getElementById('quantityModal').classList.remove('active');
    selectedProduct = null;
}

async function submitQuantity() {
    const quantity = parseFloat(document.getElementById('quantityInput').value);
    const msg = document.getElementById('quantityMessage');

    if (!quantity || quantity <= 0) {
        msg.innerHTML = '<p class="error">Ingrese una cantidad válida</p>';
        return;
    }

    msg.innerHTML = '<p style="text-align:center;color:#667eea;">Enviando...</p>';

    try {
        // Si es restar, enviar como negativo
        const finalQuantity = isAdding ? quantity : -quantity;
        
        const response = await fetch(`${APPS_SCRIPT_URL}?action=addSolicitud`, {
            method: 'POST',
            body: JSON.stringify({
                codigo: selectedProduct.codigo,
                cantidad: finalQuantity,
                usuario: currentUser
            })
        });

        const result = await response.json();

        if (result.success) {
            msg.innerHTML = '<p class="success">✓ Registrado correctamente</p>';
            
            // Actualizar contador local
            if (!userSolicitudes[selectedProduct.codigo]) {
                userSolicitudes[selectedProduct.codigo] = 0;
            }
            userSolicitudes[selectedProduct.codigo] += finalQuantity;
            
            // Actualizar solo el card
            updateProductCard(selectedProduct.codigo);
            
            setTimeout(() => closeQuantityModal(), 800);
        } else {
            msg.innerHTML = '<p class="error">✗ ' + (result.error || 'Error al registrar') + '</p>';
        }
    } catch (error) {
        msg.innerHTML = '<p class="error">✗ Error de conexión</p>';
        console.error(error);
    }
}

function updateProductCard(codigo) {
    const card = document.querySelector(`[data-codigo="${codigo}"]`);
    if (!card) return;

    const solicitado = userSolicitudes[codigo] || 0;
    const badgesContainer = card.querySelector('.product-badges');
    
    let requestedBadge = badgesContainer.querySelector('.badge-requested');
    if (solicitado !== 0) {
        if (requestedBadge) {
            requestedBadge.textContent = `Solicitado Hoy: ${solicitado}`;
        } else {
            const newBadge = document.createElement('span');
            newBadge.className = 'badge badge-requested';
            newBadge.textContent = `Solicitado Hoy: ${solicitado}`;
            badgesContainer.appendChild(newBadge);
        }
    } else if (requestedBadge) {
        requestedBadge.remove();
    }
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
            const itemDate = new Date(h.fecha).toLocaleDateString('es-PE');
            const isToday = itemDate === today;
            const formattedDate = formatDate(h.fecha);
            
            return `
                <div class="history-item ${isToday ? 'history-today' : 'history-past'}">
                    <p><strong>Cantidad:</strong> ${h.cantidad}</p>
                    <p><strong>Fecha:</strong> ${formattedDate}</p>
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
    
    // No mostrar si ya se vio hoy
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
    
    // Dots
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
    if (sessionTimeout) clearTimeout(sessionTimeout);
    location.reload();
}

// ===== CERRAR MODALES CON CLICK FUERA =====
window.onclick = (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
};
