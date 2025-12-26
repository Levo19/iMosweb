/**
 * LEVO ERP - Main Application Script
 * Handles Navigation, State, and API communication.
 */

const API_URL = 'https://script.google.com/macros/s/AKfycbyYJvrOdT1zKukBfBPzl9K9C0R2UEQa-VXlzzrR7KwlxQAqFuo-WtSekJH7rhg2nMMg/exec';

class App {
    constructor() {
        this.currentUser = null;
        this.state = {
            currentView: 'login',
            currentModule: null,
            notificationsClearedCount: 0 // Track cleared count to prevent re-badging
        };
        this.data = {
            products: {}, // Map: Code -> Desc
            requests: [], // Array if all requests
            lastFetch: 0
        };

        this.init();
    }

    init() {
        console.log("🚀 APP VERSION 78 - FEATURE: SMART NOTIFICATIONS");
        this.cacheDOM();
        this.bindEvents();
        this.checkSession();
        // Load data if logged in
        // Load data if logged in
        // Load data if logged in
        // NOTE: checkSession might trigger setUser later, so init check is unreliable
        console.log("👤 INIT CHECK:", this.currentUser);
        if (this.currentUser) {
            this.preloadAllData();
        }

        // Background Auto-Refresh (Every 45s)
        // Background Auto-Refresh (Disabled per user request)
        // ...

        // MOBILE SIDEBAR LOGIC
        const mobileBtn = document.getElementById('mobile-menu-btn');
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        const navLinks = document.querySelectorAll('.nav-link');

        function toggleSidebar() {
            if (sidebar) sidebar.classList.toggle('active');
            if (overlay) overlay.classList.toggle('active');
        }

        if (mobileBtn) {
            mobileBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleSidebar();
            });
        }

        if (overlay) {
            overlay.addEventListener('click', toggleSidebar);
        }

        // Close sidebar when clicking a link on mobile
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 1024) { // Updated to match CSS breakpoint
                    if (sidebar) sidebar.classList.remove('active');
                    if (overlay) overlay.classList.remove('active');
                }
            });
        });

        // SAFETY: Handle Resize
        window.addEventListener('resize', () => {
            if (window.innerWidth > 1024) {
                if (sidebar) sidebar.classList.remove('active');
                if (overlay) overlay.classList.remove('active');
            }
        });
    }

    cacheDOM() {
        // Views
        this.loginView = document.getElementById('login-view');
        this.mainApp = document.getElementById('main-app');
        this.subViews = document.querySelectorAll('.sub-view');

        // Forms
        this.loginForm = document.getElementById('login-form');

        // Navigation
        this.navLinks = document.querySelectorAll('.nav-link');
        this.logoutBtn = document.getElementById('logout-btn');

        // Content
        this.pageTitle = document.getElementById('page-title');
        this.userInitials = document.getElementById('user-initials');
        this.userName = document.getElementById('user-name');
        this.userRole = document.getElementById('user-role');
        this.navUsers = document.getElementById('nav-users'); // Admin only

        // Modules
        this.dispatchContent = document.getElementById('dispatch-content');

        // Modal
        this.modalContainer = document.getElementById('modal-container');
    }

    bindEvents() {
        // Login Submit
        this.loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Logout
        this.logoutBtn.addEventListener('click', () => {
            this.handleLogout();
        });

        // Navigation
        this.navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                const targetId = link.dataset.target;
                console.log(`🖱️ CLICK DETECTED on Nav Link: ${targetId}`);
                e.preventDefault();

                // Force Overlay Hide (Defensive)
                const overlay = document.getElementById('sidebar-overlay');
                if (overlay) {
                    overlay.style.display = 'none';
                    overlay.classList.remove('active');
                }

                // Cleanup Dispatch Header (Restore Default)
                this.restoreDefaultHeader();

                this.navigateTo(targetId);
            });
        });
    }

    /**
     * Session Management
     */
    checkSession() {
        const storedUser = localStorage.getItem('levo_user');
        if (storedUser) {
            this.setUser(JSON.parse(storedUser));
        } else {
            this.showLogin();
        }
    }

    /**
     * LOGIN - Call Backend
     */
    async handleLogin() {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const submitBtn = this.loginForm.querySelector('button[type="submit"]');

        const originalBtnText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Conectando...';
        submitBtn.disabled = true;

        // PRELOAD START (Fire and Forget)
        // Starts fetching data while login is processing
        this.preloadAllData();

        try {
            // IMPORTANT: Request as text/plain to avoid CORS Preflight (OPTIONS) which GAS doesn't handle.
            const response = await fetch(API_URL, {
                method: 'POST',
                redirect: 'follow', // FIXED: Required for GAS
                headers: {
                    "Content-Type": "text/plain;charset=utf-8"
                },
                body: JSON.stringify({
                    action: 'login',
                    username: username,
                    password: password
                })
            });

            if (!response.ok) throw new Error('Error de red al conectar con el servidor');

            const result = await response.json();

            if (result.status === 'success') {
                this.setUser(result.user);
            } else {
                alert(result.message || 'Error al iniciar sesión');
            }

        } catch (error) {
            console.error(error);
            alert('Error : ' + error.message);
        } finally {
            submitBtn.innerHTML = originalBtnText;
            submitBtn.disabled = false;
        }
    }

    async setUser(user) {
        this.currentUser = user;
        localStorage.setItem('levo_user', JSON.stringify(user));

        // Update UI
        this.userName.textContent = user.name;
        this.userRole.textContent = user.role;

        // Setup Permissions
        this.setupPermissions();

        // Show App
        this.showApp();

        // Show Global Loading State (SAFE APPEND)
        const mainApp = document.getElementById('main-app');
        let loader = document.getElementById('initial-loader');

        if (mainApp && !loader) {
            loader = document.createElement('div');
            loader.id = 'initial-loader';
            loader.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; background:#f1f5f9; z-index:9999;';
            loader.innerHTML = `
                 <i class="fa-solid fa-circle-notch fa-spin" style="font-size:3rem; color:var(--primary-color);"></i>
                 <h3 style="margin-top:1rem; color:#64748b;">Cargando datos del sistema...</h3>
            `;
            // Prepend relative to mainApp to ensure it covers content but doesn't wipe events
            mainApp.style.position = 'relative';
            mainApp.appendChild(loader);
        }

        console.log("✅ USER STARTUP COMPLETE (v80 - Safe Loader)");

        // Setup Notifications System
        this.renderNotificationIcon();

        // CRITICAL FIX: AWAIT DATA BEFORE DASHBOARD
        // This ensures dashboard has data to calculate alerts/widgets
        try {
            await this.preloadAllData();
        } catch (e) {
            console.error("Initial Load Error", e);
        }

        // Remove Loader
        if (loader) loader.remove();

        // AUTO-REFRESH (Every 60s)
        if (this.refreshInterval) clearInterval(this.refreshInterval);
        this.refreshInterval = setInterval(() => {
            console.log('Background Refresh...');
            this.loadMovimientosData(true);
        }, 60000);

        this.navigateTo('dashboard');
    }

    renderNotificationIcon() {
        const bellBtn = document.getElementById('header-notification-bell');
        if (!bellBtn) return;

        // FIXED: Create BADGE if missing (v72)
        if (!document.getElementById('notification-badge')) {
            console.log("✅ BADGE CREATED (v72) - FORCE INJECT");
            const badge = document.createElement('span');
            badge.id = 'notification-badge';
            badge.style.cssText = `position: absolute; top: -5px; right: -5px; background: #ef4444; color: white; border-radius: 50%; padding: 2px 5px; font-size: 10px; display: none;`;
            bellBtn.appendChild(badge);
            bellBtn.style.position = 'relative';
        }

        if (!document.getElementById('notification-dropdown')) {
            const dropdown = document.createElement('div');
            dropdown.id = 'notification-dropdown';
            dropdown.style.cssText = `
                display: none;
                position: absolute;
                top: 60px; /* Below header */
                right: 20px;
                width: 340px;
                background: white;
                box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                border-radius: 16px;
                z-index: 2000;
                overflow: hidden;
                border: 1px solid #e2e8f0;
                animation: slideDown 0.2s ease-out;
            `;
            dropdown.innerHTML = `
                <div style="padding:16px; border-bottom:1px solid #f1f5f9; background:#fff; display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:700; font-size:1.1rem; color:#1e293b;">Notificaciones</span>
                    <span id="notif-count-header" style="font-size:0.75rem; background:#eff6ff; color:#3b82f6; padding:4px 10px; border-radius:20px; font-weight:600;">0 nuevas</span>
                </div>
                <div id="notification-list" style="max-height:400px; overflow-y:auto; background:#f8fafc;">
                    <div style="padding:30px; color:#94a3b8; font-size:0.95rem; text-align:center;">
                        <i class="fa-regular fa-bell-slash" style="font-size:2rem; margin-bottom:1rem; display:block; opacity:0.5;"></i>
                        Sin notificaciones nuevas
                    </div>
                </div>
                <div style="padding:10px; text-align:center; border-top:1px solid #eee; background:#fff;">
                     <button style="font-size:0.85rem; color:#3b82f6; background:none; border:none; cursor:pointer; font-weight:600;" onclick="app.clearNotifications()">
                        <i class="fa-solid fa-check-double"></i> Marcar todo como leído
                    </button>
                </div>
                <style>
                    @keyframes slideDown {
                        from { opacity: 0; transform: translateY(-10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                </style>
            `;
            document.body.appendChild(dropdown);

            // Toggle Logic (Robust)
            bellBtn.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                console.log("🔔 Bell Clicked - Toggling Dropdown");
                const isVisible = dropdown.style.display === 'block';
                dropdown.style.display = isVisible ? 'none' : 'block';
            };

            // Close when clicking outside
            document.addEventListener('click', (e) => {
                if (!dropdown.contains(e.target) && !bellBtn.contains(e.target)) {
                    dropdown.style.display = 'none';
                }
            });
        }

        // Re-attach listener if element was replaced (Safety)
        bellBtn.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            const dropdown = document.getElementById('notification-dropdown');
            if (dropdown) {
                const isVisible = dropdown.style.display === 'block';
                dropdown.style.display = isVisible ? 'none' : 'block';
            }
        };
    }

    showToast(message, type = 'info') {
        console.error("🔔 TOAST CALLED (ERROR LEVEL):", message, type);
        const toast = document.createElement('div');
        // Inline styles for reliability
        const bg = type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6';
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${bg};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
            z-index: 9999;
            display: flex;
            align-items: center;
            gap: 1rem;
            font-weight: 600;
            font-size: 1rem;
            transform: translateY(-100px);
            opacity: 0;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        `;

        toast.innerHTML = `
            <i class="${type === 'success' ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-info'}"></i>
            <span>${message}</span>
        `;

        document.body.appendChild(toast);

        // Trigger Animation
        requestAnimationFrame(() => {
            toast.style.transform = 'translateY(0)';
            toast.style.opacity = '1';
        });

        setTimeout(() => {
            toast.style.transform = 'translateY(20px)';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    updateNotifications(forceAlert = false) {
        console.log("🔔 UPDATE NOTIFICATIONS ENTERED");

        let badge = document.getElementById('notification-badge');
        let bell = document.getElementById('header-notification-bell');

        // ROBUST FINDER: If ID lookup failed, find by Icon Class
        if (!bell) {
            console.warn("⚠️ Bell ID missing - searching by Icon...");
            const bellIcon = document.querySelector('.fa-bell');
            if (bellIcon) {
                bell = bellIcon.closest('button');
                if (bell) {
                    console.log("✅ Found Bell Button via Icon! Assigning ID...");
                    bell.id = 'header-notification-bell'; // Fix the DOM
                    bell.style.position = 'relative';

                    // CRITICAL v76: Now that bell exists, run the creator to make the Dropdown & List
                    this.renderNotificationIcon();
                }
            }
        }

        // Re-query list in case it was just created
        const list = document.getElementById('notification-list');

        // SELF-HEALING: If bell exists but badge doesn't, create it NOW.
        if (bell && !badge) {
            console.warn("⚠️ BADGE MISSING IN UPDATE - CREATING IT NOW");
            const newBadge = document.createElement('span');
            newBadge.id = 'notification-badge';
            newBadge.style.cssText = `position: absolute; top: -5px; right: -5px; background: #ef4444; color: white; border-radius: 50%; padding: 2px 5px; font-size: 10px; display: none;`;
            bell.appendChild(newBadge);
            bell.style.position = 'relative';
            badge = newBadge; // Update reference
        }

        console.log("🔔 DOM CHECK v75:", {
            foundBadge: !!badge,
            foundBell: !!bell,
            foundList: !!list
        });

        if (!bell) {
            console.error("❌ CRITICAL: BELL BUTTON NOT FOUND EVEN BY ICON");
            return;
        }

        if (!badge || !list) {
            console.error("❌ STILL MISSING ELEMENTS - ABORTING");
            return;
        }

        // Sidebar Badge Logic
        const dashboardLink = document.querySelector('.nav-link[data-target="dashboard"]');
        let sidebarBadge = document.getElementById('sidebar-dashboard-badge');

        // Create Sidebar Badge if missing
        if (dashboardLink && !sidebarBadge) {
            sidebarBadge = document.createElement('span');
            sidebarBadge.id = 'sidebar-dashboard-badge';
            sidebarBadge.style.cssText = `
                position: absolute;
                top: 10px;
                right: 15px;
                width: 8px;
                height: 8px;
                background: #ef4444;
                border-radius: 50%;
                display: none;
                box-shadow: 0 0 5px #ef4444;
            `;
            dashboardLink.style.position = 'relative'; // Ensure relative
            dashboardLink.appendChild(sidebarBadge);
        }

        if (!badge || !list) {
            console.error("❌ MISSING NOTIFICATION DOM ELEMENTS - RETURNING");
            return;
        }

        // Filter: PROCESADO products
        const prods = this.data.nuevosProductos
            ? this.data.nuevosProductos.filter(p => p.estado === 'PROCESADO')
            : [];

        const count = prods.length;
        const lastCount = this.lastNotificationCount || 0;

        // Check Notifications Logic
        console.log(`🔔 CHECK LOGIC: Total=${count}, Cleared=${this.state.notificationsClearedCount}, LastFetch=${lastCount}`);

        // Effective New Count = Total - Cleared (But never less than 0)
        let effectiveCount = Math.max(0, count - this.state.notificationsClearedCount);

        // TOAST ALERT for NEW notifications
        // Trigger only if effective count INCREASED from what we last saw (accounting for cleared)
        // AND if it's > 0
        if (effectiveCount > 0 && count > lastCount) {
            const diff = count - lastCount;
            // Only toast if meaningful increase
            if (diff > 0) this.showToast(`¡${diff} Nuevo(s) Producto(s) Listo(s)!`, 'success');
        }

        // Always update this for the "Next" delta check
        this.lastNotificationCount = count;

        if (effectiveCount > 0) {
            badge.style.display = 'block';
            badge.textContent = effectiveCount > 99 ? '99+' : effectiveCount;

            if (bell) {
                bell.classList.remove('fa-regular');
                bell.classList.add('fa-solid'); // Filled bell
                bell.style.color = '#f59e0b'; // Amber color
                bell.classList.add('fa-shake'); // Animation
            }

            // Show Sidebar Badge
            if (sidebarBadge) sidebarBadge.style.display = 'block';

            list.innerHTML = `
                <div style="padding:8px; border-bottom:1px solid #eee; text-align:right;">
                    <button style="font-size:0.75rem; color:#3b82f6; background:none; border:none; cursor:pointer;" onclick="app.clearNotifications()">
                        Marcar todo como leído
                    </button>
                </div>
                ${prods.map(p => `
                <div style="padding:10px; border-bottom:1px solid #f1f5f9; cursor:pointer;"
                     onclick="app.handleNotificationClick('${p.id}')"
                     onmouseover="this.style.backgroundColor='#f8fafc'"
                     onmouseout="this.style.backgroundColor='white'">
                    <div style="font-size:0.85rem; font-weight:bold; color:#1e293b;">
                        <i class="fa-solid fa-check-circle" style="color:#16a34a; margin-right:4px;"></i> ¡Producto Listo!
                    </div>
                    <div style="font-size:0.8rem; color:#475569; padding-left:1.2rem;">
                        <strong>${p.descripcion}</strong> (${p.cantidad} un.)<br>
                        <span style="font-size:0.75rem; color:#16a34a;">Validado. Toca para ver.</span>
                    </div>
                </div>
                `).join('')}
            `;

        } else {
            badge.style.display = 'none';

            if (bell) {
                bell.classList.add('fa-regular');
                bell.classList.remove('fa-solid');
                bell.classList.remove('fa-shake');
                bell.style.color = ''; // Reset
            }

            // Hide Sidebar Badge
            if (sidebarBadge) sidebarBadge.style.display = 'none';

            list.innerHTML = '<div style="padding:10px; color:#999; font-size:0.85rem; text-align:center;">Sin notificaciones nuevas</div>';
        }
    }

    handleNotificationClick(productId) {
        console.log("🔔 Notification Clicked:", productId);
        this.navigateTo('dashboard');
        // The navigateTo call will trigger clearNotifications via logic below, but we enforce it here too
    }

    clearNotifications() {
        console.log("🔔 Clearing Notifications (Mark as Read)");

        // 1. STATEFUL UPDATE: Mark current total as "Cleared"
        const prods = this.data.nuevosProductos
            ? this.data.nuevosProductos.filter(p => p.estado === 'PROCESADO')
            : [];
        this.state.notificationsClearedCount = prods.length; // All current are now cleared


        const badge = document.getElementById('notification-badge');
        if (badge) badge.style.display = 'none';

        const sidebarBadge = document.getElementById('sidebar-dashboard-badge');
        if (sidebarBadge) sidebarBadge.style.display = 'none';

        const bell = document.getElementById('header-notification-bell');
        if (bell) {
            bell.classList.remove('fa-solid', 'fa-shake');
            bell.classList.add('fa-regular');
            bell.style.color = '';
        }

        // Update list to show "Cleared" state immediately
        const list = document.getElementById('notification-list');
        if (list) list.innerHTML = '<div style="padding:10px; color:#999; font-size:0.85rem; text-align:center;">Leído. Sin nuevas alertas.</div>';
    }



    setupPermissions() {
        // Check permissions based on the 'modulos' list from Sheet
        const perms = this.currentUser.permissions || [];

        // Show/Hide Users Link
        if (perms.includes('users') || this.currentUser.username === 'levo' || this.currentUser.role === 'Master') {
            this.navUsers.style.display = 'flex';
        } else {
            this.navUsers.style.display = 'none';
        }
    }

    handleLogout() {
        this.currentUser = null;
        localStorage.removeItem('levo_user');
        this.showLogin();
    }

    /**
     * View Management
     */
    showLogin() {
        this.loginView.classList.add('active');
        this.mainApp.classList.remove('active');
    }

    showApp() {
        this.loginView.classList.remove('active');
        this.mainApp.classList.add('active');
    }

    /**
     * Dispatch Module Functions
     */
    switchDispatchTab(tabName) {
        // Legacy Support or Redirection
        // Now we render the Module Entry point (Zone Selection)
    }

    // New Entry point for navigation
    navigateTo(viewName) {
        // Update Sidebar UI
        this.navLinks.forEach(link => {
            if (link.getAttribute('data-target') === viewName) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });

        // Update Title
        const titles = {
            'dashboard': 'Dashboard',
            'movements': 'Movimientos',
            'dispatch': 'Despachos',
            'prepedidos': 'Prepedidos - Proveedores',
            'users': 'Gestión de Usuarios'
        };
        this.pageTitle.textContent = titles[viewName] || 'LEVO ERP';

        // Switch View
        this.subViews.forEach(view => view.classList.remove('active'));
        const targetView = document.getElementById(`view-${viewName}`);
        if (targetView) targetView.classList.add('active');

        // Restore Default Header Layout (Clears Dynamic Actions)
        this.restoreDefaultHeader();

        // Specific Module Init
        if (viewName === 'dispatch') {
            this.state.currentModule = 'dispatch';
            this.renderDispatchModule();
        } else if (viewName === 'dashboard') {
            // Auto-Read Notifications when viewing Dashboard
            this.clearNotifications();
            this.state.currentModule = 'dashboard';
            this.renderDashboard();
        } else if (viewName === 'prepedidos') {
            this.state.currentModule = 'prepedidos';
            this.loadPrepedidos();
        } else if (viewName === 'envasador') {
            this.state.currentModule = 'envasador';
            this.loadPackingModule();
        } else if (viewName === 'movements') {
            this.state.currentModule = 'movements';
            if (this.closeGuiaDetails) this.closeGuiaDetails(); // Reset Panel
            this.loadMovimientosData();
            this.renderMovimientosHeader(); // Inject Header Buttons
            this.switchMovTab('guias'); // Force Reset to Guias Tab

            // Auto-refresh every 60s
            setInterval(() => {
                if (this.state.currentModule === 'movements') {
                    this.loadMovimientosData(true); // background = true
                }
            }, 60000);

        } else {
            this.state.currentModule = null;
        }
    }

    async renderDispatchRequests(container) {
        container.innerHTML = '<div style="text-align:center; padding: 2rem;"><i class="fa-solid fa-circle-notch fa-spin"></i> Cargando solicitudes...</div>';

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: {
                    "Content-Type": "text/plain;charset=utf-8"
                },
                body: JSON.stringify({ action: 'getDispatchRequests' })
            });
            const result = await response.json();

            if (result.status === 'success') {
                const rows = result.data.map(req => `
            < tr >
                        <td style="padding: 1rem;">${req.codigo}</td>
                        <td style="padding: 1rem;">${req.cantidad}</td>
                        <td style="padding: 1rem;">${req.fecha}</td>
                        <td style="padding: 1rem;">${req.usuario}</td>
                        <td style="padding: 1rem;"><span style="color: orange; font-weight:bold;">${req.categoria.toUpperCase()}</span></td>
                    </tr >
            `).join('');

                container.innerHTML = `
            < h4 > Solicitudes de Despacho</h4 >
                    <div style="margin-top: 1rem; padding: 2rem; background: #f9fafb; border-radius: 8px; text-align: center;">
                        <button class="btn-primary" onclick="app.openNewRequestModal()">
                            <i class="fa-solid fa-plus"></i> Nueva Solicitud
                        </button>
                    </div>
                    <div style="margin-top: 2rem; overflow-x: auto;">
                        <table style="width: 100%; text-align: left; border-collapse: collapse;">
                            <thead>
                                <tr style="border-bottom: 2px solid #eee; color: #666;">
                                    <th style="padding: 1rem;">CÓDIGO</th>
                                    <th style="padding: 1rem;">CANTIDAD</th>
                                    <th style="padding: 1rem;">FECHA</th>
                                    <th style="padding: 1rem;">USUARIO</th>
                                    <th style="padding: 1rem;">ESTADO</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rows.length > 0 ? rows : '<tr><td colspan="5" style="padding:1rem; text-align:center;">No hay solicitudes pendientes</td></tr>'}
                            </tbody>
                        </table>
                    </div>
        `;
            } else {
                container.innerHTML = `< p style = "color:red;" > Error al cargar: ${result.message}</p > `;
            }
        } catch (error) {
            container.innerHTML = `< p style = "color:red;" > Error de conexión: ${error.message}</p > `;
        }
    }

    /**
     * DATA LOADING
     */
    async preloadAllData() {
        console.log("🚀 Preloading Data for All Modules...");

        // Parallel requests (Fire & Forget style where appropriate)
        const p1 = this.fetchProducts({ isBackground: true });
        const p2 = this.fetchRequests({ isBackground: true }); // Dispatch
        const p3 = this.fetchPackingList(true); // Envasador (Cache enabled)
        const p4 = this.fetchProvidersBackground(); // Prepedidos
        const p5 = this.loadMovimientosData(true); // Guias / History

        // We do not await here to block UI, but we track them
        Promise.allSettled([p1, p2, p3, p4, p5]).then(() => {
            console.log("✅ All Modules Preloaded & Cached");
        });
    }

    /**
     * DATA LOADING (Legacy Wrapper)
     */
    async loadInitialData() {
        this.preloadAllData();
    }

    startBackgroundSync() {
        // Run every 60 seconds
        setInterval(async () => {
            // Only sync if tab is visible (Browser optimization)
            if (document.hidden) return;

            console.log('Background Sync...');
            await this.fetchProducts({ isBackground: true });
            await this.fetchRequests({ isBackground: true });
            await this.fetchPackingList(true);

            // Trigger Smart View Update
            this.updateCurrentView();
        }, 60000);
    }

    updateCurrentView() {
        // Only valid for Dispatch for now
        if (this.state.currentModule !== 'dispatch') return;

        // Check if user is interacting with an input
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
            console.log('Skipping view update due to user interaction.');
            return;
        }

        const workspace = document.getElementById('zone-workspace');
        if (!workspace) return;

        // DETECT CURRENT VIEW STATE
        const activeBtn = document.querySelector('.client-buttons-group .btn-zone.active');

        // CASE A: MASTER LIST (No Zone Selected)
        if (!activeBtn) {
            // Restore Scroll for Window (Main Scrollbar)
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

            workspace.innerHTML = this.renderProductMasterList();

            // Restore Scroll
            window.scrollTo(0, scrollTop);
        }
        // CASE B: ZONE VIEW
        else {
            const zone = activeBtn.dataset.client;
            // We can re-render zone content safely if no input is focused
            const zoneContent = document.getElementById('zone-content');
            if (zoneContent) {
                this.renderZonePickup(zone, zoneContent);
            }
        }
    }

    async fetchProducts(options = { isBackground: false }) {
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                redirect: 'follow', // FIXED: Required for GAS
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: 'getProducts' })
            });
            const result = await response.json();

            if (result.status === 'success') {
                // Update to store full product object
                this.products = result.data; // Store raw array for array-based lookups (Envasador)
                this.clients = result.clients || ['ZONA1', 'ZONA2', 'TIENDA', 'PERSONAL']; // Store Dynamic Clients

                result.data.forEach(p => {
                    // Optimize the image URL immediately upon storage
                    const stableImg = this.getOptimizedImageUrl(p.imagen);
                    this.data.products[p.codigo] = { codigo: p.codigo, desc: p.descripcion, stock: p.stock, img: stableImg, min: p.min };
                });

                // DATA DEBUG
                if (!options.isBackground) {
                    console.log('Products Loaded:', Object.keys(this.data.products).length);
                    if (Object.keys(this.data.products).length === 0) {
                        alert('Alerta: Se descargaron 0 productos. Revise la hoja de Google.');
                    }
                }

                // Auto-refresh view if active (Dispatch Module)
                if (this.state.currentModule === 'dispatch') {
                    const workspace = document.getElementById('zone-workspace');
                    if (workspace && (!workspace.querySelector('.pickup-layout') || workspace.innerText.includes('Cargando'))) {
                        const activeBtn = document.querySelector('.client-buttons-group .btn-zone.active');
                        if (!activeBtn) {
                            workspace.innerHTML = this.renderProductMasterList();
                        } else {
                            // If in zone view, we might want to refresh renderZonePickup? 
                            // updateCurrentView handles both cases.
                            this.updateCurrentView();
                        }
                    } else if (workspace) {
                        // General update (e.g. stock changes)
                        this.updateCurrentView();
                    }
                }
            } else {
                console.error('API Error:', result);
                if (!options.isBackground) alert('Error del servidor: ' + (result.message || 'Desconocido'));
            }
        } catch (e) {
            console.error('Error fetching products', e);
            if (!options.isBackground) {
                const container = document.getElementById('zone-workspace');
                if (container) {
                    container.innerHTML = `
            < div style = "text-align:center; padding:2rem; color:red;" >
                <i class="fa-solid fa-triangle-exclamation"></i> Error al cargar inventario.
                            < br > <br>
                        <button class="btn-sm" onclick="app.fetchProducts()">
                            <i class="fa-solid fa-rotate-right"></i> Reintentar
                        </button>
                    </div>
        `;
                }
            }
        }
    }

    async fetchRequests(options = { isBackground: false }) {
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                redirect: 'follow', // FIXED
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: 'getDispatchRequests' })
            });
            const result = await response.json();
            if (result.status === 'success') {
                this.data.requests = result.data;
                this.data.lastFetch = Date.now();
                if (!options.isBackground) console.log('Requests loaded:', this.data.requests.length);

                // Auto-Update View if Active (even for background fetch)
                if (this.state.currentModule === 'dispatch') {
                    this.updateCurrentView();
                }
            }
        } catch (e) {
            console.error('Error fetching requests', e);
        }
    }

    getProductDescription(code) {
        return this.data.products[code]?.desc || 'Producto Desconocido';
    }

    getProductStock(code) {
        return this.data.products[code]?.stock || 0;
    }

    handleImageError(imgElement, originalUrl) {
        imgElement.onerror = null; // Reset first to avoid rapid fires

        // If we were using the optimized lh3 link and it failed, try the original link
        // We know it's lh3 if it contains 'lh3.googleusercontent.com'
        if (imgElement.src.includes('lh3.googleusercontent.com') && originalUrl && originalUrl !== 'undefined') {
            // Define a NEW onerror for the second attempt
            imgElement.onerror = function () {
                this.src = 'recursos/defaultImageProduct.png';
            };
            // Try original
            imgElement.src = originalUrl;
        } else {
            // Fallback to default immediately
            imgElement.src = 'recursos/defaultImageProduct.png';
        }
    }

    // New Helper to stabilize Drive URLs
    getOptimizedImageUrl(url) {
        if (!url) return '';
        try {
            // Check if it's a Drive URL
            if (url.includes('drive.google.com')) {
                // Try to extract ID using flexible Regex or URL params
                let id = null;

                // Case 1: Standard id parameter
                if (url.includes('id=')) {
                    const idMatch = url.match(/id=([^&]+)/);
                    if (idMatch) id = idMatch[1];
                }
                // Case 2: /d/ID/view format
                else if (url.includes('/d/')) {
                    const idMatch = url.match(/\/d\/([^\/]+)/);
                    if (idMatch) id = idMatch[1];
                }

                if (id) {
                    // Return Thumbnail version (more reliable)
                    // sz=w500 requests a width of 500px, w1000 for high quality
                    return `https://drive.google.com/thumbnail?id=${id}&sz=w500`;
                }
            }
            return url;
        } catch (e) {
            console.error('Error parsing image URL', e);
            return url;
        }
    }

    triggerBarcodeScan() {
        // Feature: Focus search input for External Scanner or Mobile Keyboard Camera
        const searchInput = document.getElementById('dispatch-search-input');
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
            // Optional: visual feedback
            const icon = document.querySelector('.search-bar-header .barcode-icon');
            if (icon) {
                icon.style.color = 'var(--primary-color)';
                setTimeout(() => icon.style.color = '#333', 500);
            }
            // If we had a scanning library (QuaggaJS/Html5Qrcode), we would launch that overlay here.
            // For now, we rely on Native Mobile Keyboard "Scan Text" or Hardware Scanners.
            console.log('Barcode Scan Triggered - Input Focused');
        }
    }

    /* --- DASHBOARD LOGIC --- */

    renderDashboard() {
        // Check container
        const container = document.getElementById('view-dashboard'); // Fixed: Target the correct sub-view
        if (!container) return;

        // Reset Header
        this.restoreDefaultHeader();

        // Dashboard HTML Structure
        container.innerHTML = `
            <div style="padding: 1.5rem;">
                <!-- Header -->
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                   <div>
                        <h2 style="font-size:1.5rem; font-weight:700; color:#1e293b;">Dashboard</h2>
                        <p style="color:#64748b; font-size:0.9rem;">Resumen de actividad e inventario</p>
                   </div>
                   <button class="btn-primary" onclick="app.updateCurrentView()">
                        <i class="fa-solid fa-rotate-right"></i> Actualizar
                   </button>
                </div>

                <div class="dashboard-grid">
                    <!-- Widget 1: Random Audit -->
                    <div id="widget-audit" class="widget-card">
                        <div style="text-align:center; padding:2rem; color:#999;">
                            <i class="fa-solid fa-spinner fa-spin"></i> Cargando Auditoría...
                        </div>
                    </div>

                    <!-- Widget 2: Expiration Alerts -->
                    <div id="widget-expiration" class="widget-card">
                        <div style="text-align:center; padding:2rem; color:#999;">
                            <i class="fa-solid fa-spinner fa-spin"></i> Buscando vencimientos...
                        </div>
                    </div>
                </div>
                </div>

                <!-- WIDGET: Processed Products -->
                <div id="widget-processed-products" style="margin-top:1.5rem;"></div>

            </div>
        `;

        // Load Widgets
        this.renderRandomAuditWidget();
        this.renderExpirationWidget();
        this.renderProcessedProductsWidget();
    }

    renderProcessedProductsWidget() {
        const container = document.getElementById('widget-processed-products');
        if (!container) return;

        const prods = this.data.nuevosProductos
            ? this.data.nuevosProductos.filter(p => p.estado === 'PROCESADO')
            : [];

        const pending = this.data.nuevosProductos
            ? this.data.nuevosProductos.filter(p => p.estado === 'PENDIENTE')
            : [];

        if (prods.length === 0 && (!pending || pending.length === 0)) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = `
                <div style="background:white; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,0.1); padding:1.5rem; border-left:5px solid #16a34a; margin-top:1.5rem;">
                <h3 style="margin:0 0 1rem 0; font-size:1.1rem; color:#1e293b; display:flex; align-items:center; gap:0.5rem;">
                    <i class="fa-solid fa-check-circle" style="color:#16a34a;"></i> Nuevos Productos Listos para Despacho
                </h3>
                            </tr>
                        </thead>
                        <tbody>
                            ${prods.map(p => `
                                <tr style="border-bottom:1px solid #f1f5f9;">
                                    <td style="padding:0.75rem; font-weight:bold;">${p.descripcion}</td>
                                    <td style="padding:0.75rem;">${p.marca}</td>
                                    <td style="padding:0.75rem; text-align:right;">${p.cantidad}</td>
                                    <td style="padding:0.75rem;">
                                        <button class="btn-sm" style="background:#3b82f6; color:white; border:none; padding:4px 8px; border-radius:4px;"
                                            onclick="alert('Por favor, busca la Guía original para incluir este item o crea una nueva.')">
                                            Ver Guía
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    async renderRandomAuditWidget() {
        const container = document.getElementById('widget-audit');
        if (!container) return;

        // Fetch Data from Backend
        // We use a small cache or just fetch? Let's fetch to be accurate on page load.
        // To avoid await issues in synchronous render chain, we render a placeholder then fetch.

        container.innerHTML = `
            <div style="text-align:center; padding:2rem; color:#999;">
                <i class="fa-solid fa-spinner fa-spin"></i> Cargando Auditoría...
            </div>
        `;

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: 'getDailyAuditList' })
            });
            const result = await response.json();

            if (result.status !== 'success') throw new Error(result.message);

            this.auditList = result.data || []; // Store globally for Modal

            // RENDER WIDGET SUMMARY
            const pendingCount = this.auditList.length;
            const completedToday = 0; // TODO: Maybe fetch completed count too? For now just show pending.

            if (pendingCount === 0) {
                container.innerHTML = `
                    <div class="widget-header">
                        <div class="widget-title"><i class="fa-solid fa-clipboard-check"></i> Auditoría Diaria</div>
                    </div>
                    <div style="padding:1.5rem; text-align:center; color:#22c55e;">
                         <i class="fa-solid fa-check-double" style="font-size:2rem; margin-bottom:0.5rem;"></i>
                         <p>¡Todo al día!</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = `
                <div class="widget-header">
                    <div class="widget-title"><i class="fa-solid fa-clipboard-check"></i> Auditoría Diaria</div>
                    <div style="font-size:0.8rem; color:#888;">${new Date().toLocaleDateString()}</div>
                </div>
                <div style="padding:1rem; text-align:center;">
                    <div style="font-size:2.5rem; font-weight:800; color:var(--primary-color);">${pendingCount}</div>
                    <div style="color:#666; font-size:0.9rem; margin-bottom:1rem;">Productos Pendientes</div>
                    
                    <button class="btn-primary" style="width:100%;" onclick="app.openAuditModal()">
                        <i class="fa-solid fa-magnifying-glass"></i> Auditar Ahora
                    </button>
                </div>
            `;


        } catch (e) {
            console.error(e);
            container.innerHTML = '<div style="padding:1rem; color:red;">Error al cargar auditoría</div>';
        }
    }

    renderExpirationWidget() {
        const container = document.getElementById('widget-expiration');
        if (!container) return;

        // Logic: Find closest expirations from MOVIMIENTOS DETALLES (Ingresos only)
        // We need 'detalles' which contains { fechaVencimiento, codigo, idGuia ... }
        // We assume loadMovimientosData populates this.data.movimientos.detalles

        const detalles = this.data.movimientos?.detalles || [];

        // Filter valid dates and sorted
        const validItems = detalles
            .filter(d => d.fechaVencimiento && d.fechaVencimiento.length > 5) // Simple check for "YYYY-MM-DD" or "DD/MM/YYYY" content
            .map(d => {
                // Parse Date. Formats could be "2025-12-31" or "31/12/2025" depending on input
                // Input type="date" returns YYYY-MM-DD
                let dateObj = new Date(d.fechaVencimiento);

                // Fallback for different formats if needed?
                // Assuming standard ISO from input type="date" or stored formatted string.

                return {
                    ...d,
                    dateObj: dateObj,
                    daysLeft: Math.ceil((dateObj - new Date()) / (1000 * 60 * 60 * 24))
                };
            })
            .sort((a, b) => a.dateObj - b.dateObj)
            .slice(0, 10); // Check top 10 closest

        if (validItems.length === 0) {
            container.innerHTML = `
                <div class="widget-header">
                    <div class="widget-title"><i class="fa-solid fa-calendar-xmark"></i> Próximos Vencimientos</div>
                </div>
                <div style="padding:1rem; text-align:center; color:#22c55e;">
                    <i class="fa-solid fa-check-circle" style="font-size:2rem; margin-bottom:0.5rem; display:block;"></i>
                    Todo en orden
                </div>
            `;
            return;
        }

        const listHtml = validItems.map(item => {
            const product = this.data.products[item.codigo] || { desc: 'Desconocido' };
            const days = item.daysLeft;

            let alertClass = 'alert-info';
            let icon = 'fa-clock';
            let label = `${days} días`;

            if (days < 0) {
                alertClass = 'alert-critical';
                icon = 'fa-triangle-exclamation';
                label = `Vencido (${Math.abs(days)}d)`;
            } else if (days <= 7) {
                alertClass = 'alert-critical';
                icon = 'fa-triangle-exclamation';
            } else if (days <= 30) {
                alertClass = 'alert-warning';
                icon = 'fa-circle-exclamation';
            }

            return `
                <div class="expiration-item ${alertClass}">
                    <div style="overflow:hidden;">
                        <div style="font-size:0.9rem; font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${product.desc}</div>
                        <div style="font-size:0.8rem; opacity:0.8;">Code: ${item.codigo}</div>
                    </div>
                    <div style="text-align:right; min-width:80px;">
                        <div style="font-size:0.85rem; font-weight:bold;"><i class="fa-solid ${icon}"></i> ${label}</div>
                        <div style="font-size:0.75rem;">${item.fechaVencimiento}</div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="widget-header">
                <div class="widget-title"><i class="fa-solid fa-calendar-xmark"></i> Próximos Vencimientos</div>
            </div>
            <div class="expiration-list">
                ${listHtml}
            </div>
        `;
    }

    /**
     * DISPATCH MODULE - NEW HIERARCHY
     * Zone Selection -> Tabs (Requests | Pickup)
     */
    /**
     * DISPATCH MODULE - NEW HIERARCHY
     * Header: [Title] [Search] [Dynamic Client Buttons] [Bell]
     */
    renderDispatchModule() {
        const container = document.getElementById('dispatch-content');
        container.innerHTML = `<div id="zone-workspace" style="margin-top:1rem;"></div>`;

        // 1. Calculate Unique Clients
        const clients = this.getUniqueClients();

        // 2. Render Custom Header
        this.updateHeaderForDispatch(clients);

        // 3. Initial render: show Master List
        document.getElementById('zone-workspace').innerHTML = this.renderProductMasterList();
    }

    getUniqueClients() {
        if (!this.data.requests) return ['zona1', 'zona2']; // Default fallback
        const clients = new Set(this.data.requests.map(r => r.usuario.toLowerCase()));

        // Ensure default zones always exist if they have no requests? 
        // User said "clients are born from requests". So strictly from requests.
        // But let's keep 'zona1' and 'zona2' as seeded if empty for demo.
        if (clients.size === 0) return ['zona1', 'zona2'];

        return Array.from(clients).sort();
    }

    updateHeaderForDispatch(clients) {
        const headerTitle = document.getElementById('page-title');
        const headerActions = document.querySelector('.top-actions');

        if (headerTitle) headerTitle.innerText = 'Despachos';

        if (headerActions) {
            // Generate Buttons HTML
            const buttonsHtml = clients.map(client =>
                `<button class="btn-zone" data-client="${client}" onclick="app.selectZone('${client}')">${client.toUpperCase()}</button>`
            ).join('');

            // Inject Search + Buttons + Bell (Remove Gear)
            headerActions.innerHTML = `
                <div class="header-dispatch-toolbar">
                    <div class="search-bar-header">
                        <i class="fa-solid fa-magnifying-glass search-icon"></i>
                        <input type="text" id="dispatch-search-input" placeholder="Buscar producto..." onkeyup="app.filterDispatchView(this.value)" inputmode="search" enterkeyhint="search">
                        <i class="fa-solid fa-barcode barcode-icon" title="Escanear con Cámara" onclick="app.triggerBarcodeScan()"></i>
                    </div>
                    <div class="client-buttons-group">
                        ${buttonsHtml}
                    </div>
                </div>
                <!-- Bell Only, No Gear -->
                <button class="icon-btn"><i class="fa-regular fa-bell"></i></button>
            `;

            // Auto-Focus Search Bar
            setTimeout(() => {
                const searchInput = document.getElementById('dispatch-search-input');
                if (searchInput) searchInput.focus();
            }, 100);
        }
    }

    restoreDefaultHeader() {
        const headerTitle = document.getElementById('page-title');
        const headerActions = document.querySelector('.top-actions');

        if (headerTitle) headerTitle.innerText = 'Dashboard'; // Or dynamic based on page

        // Restore Default Actions
        if (headerActions) {
            headerActions.innerHTML = `
                <div id="header-dynamic-actions"></div>
                <button class="icon-btn"><i class="fa-regular fa-bell"></i></button>
                <button class="icon-btn"><i class="fa-solid fa-gear"></i></button>
            `;

            // RE-INITIALIZE NOTIFICATIONS
            // Because we just wiped the header, we must re-attach the bell logic.
            this.renderNotificationIcon();
            this.updateNotifications();
        }
    }

    filterDispatchView(query) {
        // Clear previous timeout (Debounce)
        if (this.searchTimeout) clearTimeout(this.searchTimeout);

        this.searchTimeout = setTimeout(() => {
            const term = query.toLowerCase().trim();
            const container = document.getElementById('zone-workspace');

            if (!container) return;

            if (!term) {
                // RESET: Show Paginated Default List
                this.productLimit = 50; // Reset limit
                container.innerHTML = this.renderProductMasterList();
            } else {
                // FILTER: Search in Data
                const allEntries = Object.entries(this.data.products);
                const filtered = allEntries.filter(([code, p]) => {
                    const searchStr = `${p.desc} ${code} ${p.marca || ''}`.toLowerCase();
                    return searchStr.includes(term);
                });

                // Render Filtered Results (Full List of Matches)
                container.innerHTML = this.renderProductMasterList(filtered);
            }
        }, 300); // 300ms Debounce
    }

    async selectZone(zone) {
        // Toggle Logic
        const container = document.getElementById('zone-workspace');

        // Find buttons using robust data attribute
        const buttons = document.querySelectorAll('.client-buttons-group .btn-zone');
        // Use attribute selector that works regardless of container
        const clickedBtn = document.querySelector(`.client-buttons-group .btn-zone[data-client="${zone}"]`);
        const searchBar = document.querySelector('.search-bar-header');

        // Check if already active (DESELECT)
        if (clickedBtn && clickedBtn.classList.contains('active')) {
            // DESELECT: Remove active class from ALL buttons
            buttons.forEach(b => b.classList.remove('active'));

            // Show Search Bar
            if (searchBar) searchBar.classList.remove('hidden');

            // Animate Exit Right -> Enter Left (Back to Inventory)
            if (container.firstElementChild) {
                container.firstElementChild.classList.add('slide-out-right');

                setTimeout(() => {
                    container.innerHTML = this.renderProductMasterList();
                    // Add Entrance Animation
                    if (container.firstElementChild) {
                        container.firstElementChild.classList.add('slide-in-left');
                    }
                }, 250); // Wait for exit animation
            } else {
                container.innerHTML = this.renderProductMasterList();
            }
            return; // Exit
        }

        // SELECT NEW ZONE: TRIGGER REFRESH
        // --------------------------------
        // Visual Feedback on Button
        if (clickedBtn) {
            const originalText = clickedBtn.innerText;
            clickedBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
            clickedBtn.disabled = true;

            // Fetch Data
            await this.fetchRequests({ isBackground: false });

            // Restore Button
            clickedBtn.innerHTML = originalText;
            clickedBtn.disabled = false;
        }

        // Highlight active zone logic
        buttons.forEach(b => {
            if (b === clickedBtn) {
                b.classList.add('active');
                console.log('Activating button:', b.innerText);
            } else {
                b.classList.remove('active');
            }
        });

        // Hide Search Bar
        if (searchBar) searchBar.classList.add('hidden');

        // Animate Exit Left -> Enter Right (Go to Detail)
        if (container.firstElementChild) {
            container.firstElementChild.classList.add('slide-out-left');

            setTimeout(() => {
                this.renderZoneContent(zone, container);
            }, 250);
        } else {
            this.renderZoneContent(zone, container);
        }
    }

    renderZoneContent(zone, container) {
        // Directly Render Pickup/Pending View (No Tabs)
        container.innerHTML = `
            <div class="slide-in-right" style="border-top:1px solid #eee; margin-top:1rem; padding-top:1rem;">
                 <!-- Content Area -->
                 <div id="zone-content"></div>
            </div>
        `;

        this.renderZonePickup(zone, document.getElementById('zone-content'));
    }

    renderProductMasterList() {
        if (!this.data.products || Object.keys(this.data.products).length === 0) {
            return `
                <div style="text-align:center; padding:2rem; color:#666;">
                    <i class="fa-solid fa-spinner fa-spin"></i> Cargando inventario...
                    <div style="margin-top:1rem;">
                        <small>¿Tarda demasiado?</small><br>
                        <button class="btn-sm" style="margin-top:0.5rem;" onclick="app.fetchProducts()">
                            <i class="fa-solid fa-rotate"></i> Forzar Recarga
                        </button>
                    </div>
                </div>
            `;
        }

        // Generate Cards HTML (Alphabetical Sort) - ALL PRODUCTS (No Pagination)
        const productEntries = Object.entries(this.data.products).sort(([, a], [, b]) => {
            return a.desc.localeCompare(b.desc);
        });

        const productCards = productEntries.map(([code, product]) => {
            // Image Logic (Optimized for Drive)
            let imgSrc = product.img ? product.img : 'recursos/defaultImageProduct.png';

            // Optimization: Convert Drive links to direct lh3 links to avoid Rate Limits/HTTP2 errors on thumbnails
            if (imgSrc.includes('drive.google.com') || imgSrc.includes('docs.google.com')) {
                const idMatch = imgSrc.match(/[-\w]{25,}/);
                if (idMatch) {
                    // Use lh3.googleusercontent.com/d/{ID}=s300 (size 300px)
                    imgSrc = `https://lh3.googleusercontent.com/d/${idMatch[0]}=s300`;
                }
            }

            // Stock Color Logic
            let stockColor = '#10b981'; // Green
            if (product.stock <= 5) stockColor = '#ef4444'; // Red
            else if (product.stock <= 20) stockColor = '#f59e0b'; // Amber

            const searchString = `${product.desc} ${code} ${product.marca || ''}`.toLowerCase();
            const isNegative = product.stock < 0;

            return `
            <div class="product-card ${isNegative ? 'negative-stock' : ''}" data-search="${searchString}" onclick="this.classList.toggle('flipped')">
                <div class="product-card-inner">
                    ${isNegative ? '<i class="fa-solid fa-bomb stock-bomb-icon"></i>' : ''}
                    
                    <!-- FRONT -->
                    <div class="card-front">
                        <!-- Header: Historial Button (Top Right) removed, now on back -->
                        
                        <div style="position:absolute; top:10px; right:10px; background:rgba(255,255,255,0.9); padding:2px 8px; border-radius:12px; font-size:0.7rem; color:#64748b; font-weight:600; border:1px solid #e2e8f0;">
                            ${product.marca || 'GENERICO'}
                        </div>

                        <!-- Add to Dispatch Button (Top Left) -->
                        <button onclick="event.stopPropagation(); app.addProductToDispatch('${code}')" 
                                style="position:absolute; top:10px; left:10px; background:var(--primary-color); color:white; border:none; width:32px; height:32px; border-radius:50%; box-shadow:0 4px 6px -1px rgba(79, 70, 229, 0.4); cursor:pointer; display:flex; align-items:center; justify-content:center; transition:transform 0.2s;"
                                onmouseover="this.style.transform='scale(1.1)'"
                                onmouseout="this.style.transform='scale(1)'"
                                title="Agregar al Despacho">
                            <i class="fa-solid fa-cart-shopping"></i>
                        </button>

                        <div class="card-img-container">
                            ${this.renderProductImage(imgSrc)}
                        </div>
                        <div class="card-content">
                             <div>
                                <div class="card-desc" style="font-weight:800; font-size:1.05rem; color:#1a1a1a; margin-bottom:0.3rem; line-height:1.2;">${product.desc}</div>
                                <div class="card-code" style="font-size:0.9rem; color:#6b7280; font-family:monospace;">${code}</div>
                            </div>
                             <div style="margin-top:0.5rem; font-weight:bold; color:${stockColor}; display:flex; align-items:center; gap:0.5rem;">
                                <i class="fa-solid fa-cubes"></i> Stock: <span class="stock-display-${code}">${product.stock}</span>
                            </div>
                        </div>
                    </div>

                    <!-- BACK -->
                    <div class="card-back">
                        <div style="display:flex; justify-content:space-between; align-items:start; border-bottom:1px solid #ddd; padding-bottom:0.5rem; margin-bottom:1rem;">
                            <h5 style="margin:0;">Detalles</h5>
                            <button onclick="event.stopPropagation(); app.showProductHistory('${code}', '${product.desc.replace(/'/g, "")}')" 
                                    style="
                                        background: rgba(79, 70, 229, 0.1); 
                                        color: var(--primary-color); 
                                        border: none; 
                                        border-radius: 20px; 
                                        padding: 4px 10px; 
                                        font-size: 0.75rem; 
                                        cursor: pointer; 
                                        font-weight: 600;
                                        transition: all 0.3s ease;
                                    "
                                    onmouseover="this.style.background='var(--primary-color)'; this.style.color='white'; this.style.boxShadow='0 0 10px rgba(79, 70, 229, 0.4)';"
                                    onmouseout="this.style.background='rgba(79, 70, 229, 0.1)'; this.style.color='var(--primary-color)'; this.style.boxShadow='none';"
                                    title="Ver Historial">
                                <i class="fa-solid fa-clock-rotate-left"></i> Historial
                            </button>
                        </div>
                        
                        <div class="back-label">Descripción Completa</div>
                        <div class="back-value">${product.desc}</div>

                        <div class="back-label">Código de Sistema</div>
                        <div class="back-value">${code}</div>

                        <div class="back-label">Stock Disponible</div>
                        <div class="back-value" style="font-size:1.2rem; color:var(--primary-color);"><span class="stock-display-${code}">${product.stock}</span></div>

                        <div style="margin-top:auto; text-align:center; color:#999; font-size:0.8rem;">
                            <i class="fa-solid fa-rotate"></i> Click para voltear
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');

        // Check for duplicates during mapping (debug)
        console.log(`Rendering ${productEntries.length} products (Review Mode).`);

        return `
            <div style="margin-top:1rem; padding-bottom: 3rem;">
                <!-- Full Page Grid -->
                <div id="product-grid-container" style="
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                    gap: 1rem;
                ">
                    ${productCards}
                </div>
            </div>
        `;
    }

    // Restore HELPER
    renderProductImage(src) {
        if (!src) return '<img src="recursos/defaultImageProduct.png" class="card-img" loading="lazy">';
        return `<img src="${src}" class="card-img" loading="lazy" onerror="this.src='recursos/defaultImageProduct.png'">`;
    }


    /**
     * MOVIMIENTOS MODULE
     */

    // MOVIMIENTOS HEADER LOGIC
    renderMovimientosHeader() {
        const headerActions = document.getElementById('header-dynamic-actions');
        if (!headerActions) return;

        // Check if already rendered to avoid duplicates/flicker
        if (document.getElementById('btn-mov-guias')) return;

        headerActions.innerHTML = `
            < div class="header-tab-group" >
                <button id="btn-mov-guias" class="btn-header-tab active" onclick="app.switchMovTab('guias')">Guías</button>
                <button id="btn-mov-preingresos" class="btn-header-tab" onclick="app.switchMovTab('preingresos')">Preingresos</button>
            </div >
            `;
    }

    // Switch Tabs (Guias vs Preingresos)
    switchMovTab(tab) {
        // Toggle Active Class on Header Buttons
        const guiasBtn = document.getElementById('btn-mov-guias');
        const preBtn = document.getElementById('btn-mov-preingresos');

        if (guiasBtn && preBtn) {
            guiasBtn.classList.remove('active');
            preBtn.classList.remove('active');

            if (tab === 'guias') guiasBtn.classList.add('active');
            else preBtn.classList.add('active');
        }

        // Toggle Content Views
        document.querySelectorAll('.mov-tab-content').forEach(c => c.classList.remove('active'));
        const target = document.getElementById(`tab - ${tab} `);
        if (target) target.classList.add('active');

        // Close Detail Panels for Fresh Start
        this.closeGuiaDetails();
        this.closePreingresoDetails();

        // Refresh Data on Switch
        if (tab === 'guias') this.renderGuiasList();
        if (tab === 'preingresos') this.renderPreingresos();
    }

    // Load Data
    // Load Data
    async loadMovimientosData(isBackground = false) {
        const container = document.getElementById('guias-list-scroll');
        const CACHE_KEY = 'warehouse_movimientos_data';

        console.log(`🔄 LOAD DATASOURCE START(Background = ${isBackground})`);

        // 1. Try Cache First (Fast Load)
        if (!isBackground) {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    this.data.movimientos = parsed;
                    this.renderGuiasList();
                    this.renderPreingresos();
                    console.log('Loaded from Cache');
                } catch (e) { console.error('Cache error', e); }
            }

            if (container) {
                // Show spinner only if no cache or empty
                if (!this.data.movimientos || !this.data.movimientos.guias) {
                    container.innerHTML = '<div style="text-align:center; padding:2rem; color:#999;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando datos...</div>';
                }
            }
        }

        // RETRY LOGIC for Connection Stability
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            try {
                const response = await fetch(API_URL, {
                    method: 'POST',
                    redirect: 'follow',
                    headers: { "Content-Type": "text/plain;charset=utf-8" },
                    body: JSON.stringify({ action: 'getMovimientosData' })
                });

                if (!response.ok) throw new Error(`HTTP ${response.status} `);

                const result = await response.json();

                if (result.status === 'success') {
                    // Update Cache
                    localStorage.setItem(CACHE_KEY, JSON.stringify(result.data));

                    this.data.movimientos = result.data; // { guias, preingresos, detalles, proveedores, nuevosProductos }
                    this.data.nuevosProductos = result.data.nuevosProductos || [];

                    // !! CRITICAL FIX: Update global providers list !!
                    if (result.data.proveedores) {
                        this.data.providers = result.data.proveedores;
                    }

                    // Update Notifications (CRITICAL for User Alert)
                    console.log("🌍 FETCH SUCCESS - CALLING UPDATE NOTIFICATIONS");
                    this.updateNotifications();

                    // DASHBOARD SYNC FIX: If on dashboard, force re-render to show new data immediately
                    if (this.state.currentView === 'dashboard') {
                        this.renderDashboard();
                    }

                    // Only Render if active module is movements
                    if (this.state.currentModule === 'movements' || !isBackground) {
                        this.renderGuiasList();
                        this.renderPreingresos();

                        // Refresh open panel if exists
                        const activeRow = document.querySelector('.guia-row-card.active');
                        if (activeRow) {
                            const id = activeRow.id.replace('guia-row-', '');
                            this.toggleGuiaDetail(id); // Re-open to update
                        }
                    }
                    return; // SUCCESS - Exit function
                } else {
                    throw new Error(result.message || 'Error desconocido del servidor');
                }

            } catch (e) {
                attempts++;
                console.warn(`Attempt ${attempts} failed: ${e.message} `);

                if (attempts >= maxAttempts) {
                    console.error('All fetch attempts failed', e);
                    if (!isBackground && container && (!this.data.movimientos || !this.data.movimientos.guias)) {
                        container.innerHTML = `< div style = "text-align:center; padding:1rem; color:red;" >
            <i class="fa-solid fa-triangle-exclamation"></i> Error de conexión.Reintentando... (${e.message})
                        </div > `;
                    }
                } else {
                    // Wait 2s before retry
                    await new Promise(res => setTimeout(res, 2000));
                }
            }
        }
    }

    /* --- GUIAS LIST REDESIGN --- */

    renderGuiasList() {
        // Wrapper is now STATIC in index.html, no need to inject it.
        // Just trigger filter/render which populates the list.
        this.filterGuiasList();
    }

    clearGuiaFilters() {
        if (document.getElementById('guia-filter-text')) document.getElementById('guia-filter-text').value = '';
        if (document.getElementById('guia-filter-date')) document.getElementById('guia-filter-date').value = '';
        this.filterGuiasList();
    }

    filterGuiasList() {
        const text = document.getElementById('guia-filter-text')?.value.toLowerCase() || '';
        const dateInput = document.getElementById('guia-filter-date')?.value; // YYYY-MM-DD

        let filtered = this.data.movimientos?.guias || [];

        // Filter Text
        if (text) {
            filtered = filtered.filter(g =>
                (g.proveedor && g.proveedor.toLowerCase().includes(text)) ||
                (g.id && g.id.toLowerCase().includes(text)) ||
                (g.usuario && g.usuario.toLowerCase().includes(text))
            );
        }

        // Filter Date
        if (dateInput) {
            // g.fecha is usually "DD/MM/YYYY HH:mm:ss"
            // Let's normalize. 
            filtered = filtered.filter(g => {
                const parts = g.fecha.split(' ')[0].split('/'); // ["16", "12", "2025"]
                // Date input is YYYY-MM-DD
                const gDateISO = `${parts[2]} -${parts[1]} -${parts[0]} `;
                return gDateISO === dateInput;
            });
        }

        this.renderGuiasGrouped(filtered);
    }

    renderGuiasGrouped(list) {
        const container = document.getElementById('guias-list-scroll');
        if (list.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:#999; padding:2rem;">No se encontraron guías</div>';
            return;
        }

        // Group by Date
        // Helper to extract date part
        const getDate = (str) => str.split(' ')[0]; // "16/12/2025"

        const groups = {};
        list.forEach(g => {
            const d = getDate(g.fecha);
            if (!groups[d]) groups[d] = [];
            groups[d].push(g);
        });

        // Sort Dates Descending (assuming DD/MM/YYYY format)
        // We convert to timestamp for sorting
        const sortedDates = Object.keys(groups).sort((a, b) => {
            const da = a.split('/').reverse().join('');
            const db = b.split('/').reverse().join('');
            return db.localeCompare(da);
        });

        let html = '';
        sortedDates.forEach(date => {
            html += `< h4 style = "margin: 1rem 0 0.5rem 0; color:var(--primary-color); border-bottom:2px solid #f3f4f6; padding-bottom:0.25rem;" > ${date}</h4 > `;
            html += `< div class="guias-group-list" > `;

            console.log('Rendering Grouped Guias:', list);

            groups[date].forEach(g => {
                const shortId = g.id ? g.id.slice(-6) : '???';
                html += `
            < div id = "guia-row-${g.id}" class="guia-row-card" onclick = "app.toggleGuiaDetail('${g.id}')" >
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <span class="badge ${g.tipo.toLowerCase()}">${g.tipo}</span>
                                <span style="font-weight:bold; color:#333; margin-left:0.5rem;">${g.proveedor || 'Sin Nombre'}</span>
                            </div>
                            <div style="font-size:0.8rem; color:#666;">${g.fecha.split(' ')[1] || ''}</div>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.5rem;">
                            <div style="font-size:0.85rem; color:#555;">Author: ${g.usuario}</div>
                            <div style="display:flex; align-items:center; gap:0.5rem;">
                                ${g.foto ? '<i class="fa-solid fa-camera" style="color:var(--primary-color);" title="Tiene Foto"></i>' : ''}
                                <div style="font-size:0.85rem; color:#999;">ID: ...${shortId}</div>
                            </div>
                        </div>
                        ${g.comentario ? `<div style="font-size:0.8rem; color:#888; font-style:italic; margin-top:0.25rem;">"${g.comentario}"</div>` : ''}
                    </div >
            `;
            });

            html += `</div > `;
        });

        container.innerHTML = html;
    }

    async toggleGuiaDetail(id) {
        const panel = document.getElementById('guia-detail-panel');
        const listContainer = document.getElementById('guias-left-col');
        const currentActiveInfo = document.querySelector('.guia-row-card.active');

        // Remove active class from all
        document.querySelectorAll('.guia-row-card').forEach(d => d.classList.remove('active'));

        // If clicking same, CLOSE
        if (currentActiveInfo && currentActiveInfo.id === `guia - row - ${id} `) {
            panel.style.width = '0';
            panel.style.opacity = '0';
            panel.innerHTML = '';
            // Close Image Modal if open
            const modal = document.getElementById('image-modal-overlay');
            if (modal) modal.remove();
            return;
        }

        // OPEN logic
        const row = document.getElementById(`guia - row - ${id} `);
        if (row) row.classList.add('active'); // Highlight

        panel.style.width = '400px'; // Fixed width for detail
        panel.style.opacity = '1';

        // Use Preloaded Data
        const guiaInfo = this.data.movimientos.guias.find(g => g.id === id);

        // Filter details locally
        const details = this.data.movimientos.detalles
            ? this.data.movimientos.detalles.filter(d => d.idGuia === id)
            : [];

        // Enrich details with description from Products list
        const enrichedDetails = details.map(d => {
            // Fix: products is an Object (Map), not Array. Use Object.values or direct lookup.
            // Direct lookup is faster: this.data.products[d.codigo]
            // But to match loose logic:
            const pCode = String(d.codigo).trim();
            const product = this.data.products[pCode] || Object.values(this.data.products).find(p => String(p.codigo).trim() === pCode);

            return {
                ...d,
                descripcion: product ? product.desc : 'Producto Desconocido'
            };
        });

        this.renderGuiaDetailContent(guiaInfo, enrichedDetails);
    }

    handleGuiaPhotoUpload(id, input) {
        if (!input.files || !input.files[0]) return;

        const file = input.files[0];
        this.showToast("Procesando imagen...", "info");

        // Use existing resize helper
        this.resizeImage(file, 1000).then(base64 => {
            this.showToast("Subiendo foto...", "info");

            const payload = {
                idGuia: id,
                foto: base64
            };

            fetch(API_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: 'uploadGuiaPhoto', payload: payload })
            })
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success') {
                        this.showToast("Foto actualizada correctamente", "success");
                        // Update local data
                        const guia = this.data.movimientos.guias.find(g => g.id === id);
                        if (guia) {
                            guia.foto = res.data.url;
                        }
                        // Refresh Views
                        this.filterGuiasList(); // Update icon in list
                        this.toggleGuiaDetail(id); // Reload detail panel to show image
                    } else {
                        alert("Error subiendo foto: " + res.message);
                    }
                    input.value = ''; // Reset
                })
                .catch(e => {
                    console.error(e);
                    alert("Error de red al subir foto");
                    input.value = '';
                });
        });
    }

    renderGuiaDetailContent(info, products) {
        const panel = document.getElementById('guia-detail-panel');

        // CHECK DATE FOR EDITING
        // info.fecha is "dd/MM/yyyy HH:mm:ss"
        // Get Today "dd/MM/yyyy"
        const now = new Date();
        const todayStr = `${String(now.getDate()).padStart(2, '0')} /${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} `;
        const guideDateStr = info.fecha.split(' ')[0];
        const canEdit = (todayStr === guideDateStr);

        const productsHtml = products.length > 0 ? products.map(p => `
            < div style = "display:flex; justify-content:space-between; align-items:center; padding:0.75rem 0; border-bottom:1px solid #f9f9f9;" >
                <div style="flex:1;">
                    <div style="font-weight:bold; font-size:0.9rem;">${p.descripcion}</div>
                    <div style="font-size:0.8rem; color:#666;">Code: ${p.codigo}</div>
                </div>
                ${p.fechaVencimiento ? `<div style="font-size:0.8rem; color:#d97706; margin-right:1rem;"><i class="fa-regular fa-calendar"></i> ${p.fechaVencimiento}</div>` : ''}
        <div style="font-weight:bold;">x${p.cantidad}</div>
            </div >
            `).join('') : '<div style="padding:1rem; text-align:center; color:#999;">Sin productos registrados</div>';

        // Helper for enriched details logic inside template
        const enrichedDetails = products;

        // NEW PRODUCTS (PENDING) - EXCLUDE PROCESSED
        const pendingProducts = this.data.nuevosProductos
            ? this.data.nuevosProductos.filter(p => p.idGuia === info.id && p.estado !== 'PROCESADO')
            : [];
        const pendingHtml = pendingProducts.length > 0 ? pendingProducts.map(p => `
            < div style = "display:flex; justify-content:space-between; align-items:center; padding:0.75rem 0; border-bottom:1px solid #fcd34d; background:#fffbeb;" >
                <div style="flex:1; padding-left:0.5rem;">
                    <div style="font-weight:bold; font-size:0.9rem; color:#92400e;">${p.descripcion} <span style="font-size:0.7rem; background:#fcd34d; padding:2px 4px; border-radius:4px;">NUEVO</span></div>
                    <div style="font-size:0.8rem; color:#b45309;">Marca: ${p.marca} | Venc: ${p.fechaVencimiento || '-'}</div>
                </div>
                <div style="font-weight:bold; color:#92400e; padding-right:0.5rem;">x${p.cantidad}</div>
            </div >
            `).join('') : '';

        const totalItems = products.length + pendingProducts.length;

        panel.innerHTML = `
            < div style = "padding:1.5rem; background:#f9fafb; min-height:100%; display:flex; flex-direction:column;" >
                <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:1rem;">
                    <div>
                        <h3 style="color:var(--primary-color); margin:0;">Detalle de Guía</h3>
                        <div style="font-size:0.9rem; color:#666;">
                            <span style="font-weight:bold; color:#333;">${info.tipo}</span> | ${info.fecha}
                        </div>
                        <div style="margin-top:0.25rem;">
                            <strong>Proveedor:</strong> ${info.proveedor || info.destino || '-'}
                        </div>
                        <div>
                            <strong>Usuario:</strong> ${info.usuario}
                        </div>
                    </div>
                     <div style="display:flex; flex-direction:column; gap:0.5rem; align-items:flex-end;">
                        ${canEdit ? `<button onclick="app.showGuiaEditMode('${info.id}')" class="btn-sm primary"><i class="fa-solid fa-pen-to-square"></i> Editar</button>` : ''}
                        
                        <!-- Photo Upload Button -->
                        <div style="position:relative;">
                             <input type="file" id="guia-photo-upload-${info.id}" accept="image/*" style="display:none;" onchange="app.handleGuiaPhotoUpload('${info.id}', this)">
                             <button onclick="document.getElementById('guia-photo-upload-${info.id}').click()" 
                                     style="background:white; border:1px solid #ddd; padding:0.25rem 0.5rem; border-radius:4px; cursor:pointer; font-size:0.8rem; color:#666;">
                                <i class="fa-solid fa-camera"></i> ${info.foto ? 'Cambiar Foto' : 'Agregar Foto'}
                             </button>
                        </div>
                    </div>
                </div>

                <!--Photo Display Section-- >
            ${info.foto ? `
                <div style="margin-bottom:1rem; border-radius:8px; overflow:hidden; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
                    <img src="${this.getOptimizedImageUrl(info.foto)}" 
                         onclick="app.openImageModal('${this.getOptimizedImageUrl(info.foto)}')"
                         style="width:100%; height:auto; display:block; cursor:pointer;" 
                         alt="Evidencia Guía">
                </div>
                ` : ''
            }
                
                ${info.comentario ? `<div style="margin-bottom:1rem; background:#fff; padding:0.5rem; border-radius:4px; border:1px solid #eee; font-style:italic; color:#555;">"${info.comentario}"</div>` : ''}

                <div style="background:white; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.05); overflow:hidden; margin-bottom:1rem; flex:1;">
                    <div style="padding:0.75rem 1rem; border-bottom:1px solid #eee; background:#fff; font-weight:bold; color:#444;">
                        Productos (${totalItems})
                    </div>
                    <div style="padding:0.5rem;">
                        ${pendingHtml}
                        ${productsHtml}
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; margin-top:auto;">
                    <button onclick="app.printGuiaTicket('${info.id}')" class="btn-secondary" style="background:#333; color:white;">
                        <i class="fa-solid fa-print"></i> Imprimir
                    </button>
                    <button onclick="app.closeGuiaDetails()" class="btn-secondary">Cerrar Panel</button>
                </div>
            </div >
            `;
    }

    printGuiaTicket(id) {
        const guiaInfo = this.data.movimientos.guias.find(g => g.id === id);
        if (!guiaInfo) return alert('Guía no encontrada');

        // Normal Details
        const details = this.data.movimientos.detalles
            ? this.data.movimientos.detalles.filter(d => d.idGuia === id)
            : [];

        const enriched = details.map(d => {
            const pCode = String(d.codigo).trim();
            const product = this.data.products[pCode] || Object.values(this.data.products).find(p => String(p.codigo).trim() === pCode);
            return { ...d, descripcion: product ? product.desc : 'Desconocido' };
        });

        // New Products (Pending) - EXCLUDE PROCESSED from Ticket
        const newProds = this.data.nuevosProductos
            ? this.data.nuevosProductos.filter(np => np.idGuia === id && np.estado !== 'PROCESADO')
            : [];

        const printWindow = window.open('', '_blank', 'width=450,height=600');
        if (!printWindow) return alert('Bloqueo de ventanas emergentes activado.');

        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${id}`;

        // Title Logic
        const tipoTitulo = guiaInfo.tipo === 'INGRESO' ? 'GUÍA DE INGRESO' :
            guiaInfo.tipo === 'SALIDA' ? 'GUÍA DE SALIDA' : guiaInfo.tipo;

        let rowsHtml = '';

        // 1. Existing Products
        enriched.forEach(p => {
            rowsHtml += `
            <tr style="border-bottom:1px dashed #000;">
                <td style="padding:4px 0;">
                    <div style="font-weight:900; font-size:15px; line-height:1.1; margin-bottom:3px; text-transform:uppercase;">${p.descripcion}</div>
                    <div style="font-size:13px; font-weight:600; color:#000;">${p.codigo} ${p.fechaVencimiento ? ` | Venc: ${p.fechaVencimiento}` : ''}</div>
                </td>
                <td style="padding:4px 0; text-align:right; font-weight:900; font-size:18px; vertical-align:top;">${p.cantidad}</td>
            </tr>
            `;
        });

        // 2. New (Pending) Products
        newProds.forEach(p => {
            rowsHtml += `
            <tr style="border-bottom:1px dashed #000;">
                <td style="padding:4px 0;">
                     <div style="font-weight:900; font-size:15px; line-height:1.1; margin-bottom:3px; text-transform:uppercase;">
                        ${p.descripcion} 
                        <span style="font-size:11px; border:2px solid #000; padding:1px 3px; font-weight:800; display:inline-block; transform:translateY(-1px);">NUEVO</span>
                     </div>
                     <div style="font-size:13px; font-weight:600; color:#000;">Marca: ${p.marca} ${p.fechaVencimiento ? ` | Venc: ${p.fechaVencimiento}` : ''}</div>
                </td>
                <td style="padding:4px 0; text-align:right; font-weight:900; font-size:18px; vertical-align:top;">${p.cantidad}</td>
            </tr>
            `;
        });

        printWindow.document.write(`
            <html>
                <head>
                    <title>Ticket ${tipoTitulo}</title>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@500;700;900&display=swap');
                        @page { margin: 0; size: 80mm auto; }
                        body { 
                            font-family: 'Roboto', Helvetica, Arial, sans-serif; 
                            width: 79mm; 
                            margin: 0; 
                            padding: 1mm 2mm; 
                            box-sizing: border-box; 
                            color: #000;
                        }
                        .header { 
                            text-align: center; 
                            margin-bottom: 5px; 
                            border-bottom: 3px solid #000; 
                            padding-bottom: 5px; 
                        }
                        h2 { 
                            margin: 0 0 2px 0; 
                            font-size: 24px; 
                            font-weight: 900; 
                            text-transform: uppercase;
                            letter-spacing: -0.5px;
                        }
                        .provider {
                            font-size: 20px;
                            font-weight: 900;
                            margin-bottom: 5px;
                        }
                        .meta { 
                            font-size: 14px; 
                            margin-bottom: 2px; 
                            font-weight: 700;
                        }
                        
                        table { width: 100%; border-collapse: collapse; margin-top: 5px; }
                        th { 
                            text-transform: uppercase; 
                            font-size: 13px; 
                            font-weight: 900;
                            border-bottom: 3px solid #000; 
                            padding-bottom: 4px; 
                        }
                        
                        .footer { 
                            text-align: center; 
                            margin-top: 10px; 
                            font-size: 14px; 
                            font-weight: 900;
                            border-top: 3px solid #000; 
                            padding-top: 10px; 
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h2>${tipoTitulo}</h2>
                        <div class="provider">${guiaInfo.proveedor || guiaInfo.destino || '-'}</div>
                        <div class="meta">${guiaInfo.fecha}</div>
                        <div class="meta">USER: ${guiaInfo.usuario.toUpperCase()}</div>
                    </div>
                    
                    <table>
                        <thead>
                            <tr>
                                <th style="text-align:left;">DESCRIPCIÓN</th>
                                <th style="text-align:right;">CANT.</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>

                     ${guiaInfo.comentario ? `<div style="margin-top:10px; font-size:14px; font-weight:500; border:2px dashed #000; padding:5px;"><strong>NOTA:</strong> ${guiaInfo.comentario}</div>` : ''}

                    <div class="footer">
                        <img src="${qrUrl}" width="120" style="display:block; margin:0 auto 10px auto;">
                        <div>LEVO ERP</div>
                        <div style="font-size:10px; font-weight:500; margin-top:5px;">${new Date().toLocaleString()}</div>
                    </div>
                    <script>
                        window.onload = function() { window.print(); window.close(); }
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    }


    /* --- NEW PRODUCT REGISTRATION --- */

    showNewProductModal(idGuia) {
        // Simple manual modal injection
        const modalHtml = `
            <div id="new-prod-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:flex; justify-content:center; align-items:center; z-index:10000;">
                <div style="background:white; padding:1.5rem; border-radius:8px; width:90%; max-width:400px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                    <h3 style="margin-top:0; color:var(--primary-color);">Registrar Nuevo Producto</h3>
                    <div style="font-size:0.85rem; color:#666; margin-bottom:1rem;">
                        Este producto se guardará como <strong>PENDIENTE</strong> hasta que sea validado por administración.
                    </div>
                    
                    <div style="display:flex; flex-direction:column; gap:0.75rem;">
                        <input type="text" id="np-marca" placeholder="Marca" style="padding:0.5rem; border:1px solid #ddd; border-radius:4px;">
                        <input type="text" id="np-desc" placeholder="Descripción del Producto *" style="padding:0.5rem; border:1px solid #ddd; border-radius:4px;">
                        <input type="text" id="np-code" placeholder="Código de Barra (Opcional)" style="padding:0.5rem; border:1px solid #ddd; border-radius:4px;">
                        <div style="display:flex; gap:0.5rem;">
                             <input type="number" id="np-qty" placeholder="Cant. *" style="flex:1; padding:0.5rem; border:1px solid #ddd; border-radius:4px;">
                             <input type="date" id="np-date" style="flex:1; padding:0.5rem; border:1px solid #ddd; border-radius:4px;">
                        </div>
                    </div>

                    <div style="margin-top:1.5rem; display:flex; justify-content:flex-end; gap:0.5rem;">
                        <button onclick="document.getElementById('new-prod-modal').remove()" style="padding:0.5rem 1rem; border:1px solid #ddd; background:white; border-radius:4px; cursor:pointer;">Cancelar</button>
                        <button onclick="app.saveNewProduct('${idGuia}')" style="padding:0.5rem 1rem; background:var(--primary-color); color:white; border:none; border-radius:4px; cursor:pointer;">Guardar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    saveNewProduct(idGuia) {
        const marca = document.getElementById('np-marca').value;
        const desc = document.getElementById('np-desc').value;
        const code = document.getElementById('np-code').value;
        const qty = document.getElementById('np-qty').value;
        const date = document.getElementById('np-date').value;

        if (!desc || !qty) return alert('Descripción y Cantidad son obligatorios');

        const payload = {
            idGuia: idGuia,
            marca: marca,
            descripcion: desc,
            codigo: code,
            cantidad: qty,
            fechaVencimiento: date,
            usuario: this.data.currentUser || 'unknown'
        };

        const btn = document.querySelector('#new-prod-modal button[onclick^="app.saveNewProduct"]');
        if (btn) { btn.disabled = true; btn.innerText = "Guardando..."; }

        fetch(API_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: 'saveProductoNuevo', payload: payload })
        })
            .then(r => r.json())
            .then(res => {
                if (res.status === 'success') {
                    alert('Producto registrado correctamente como Pendiente');
                    document.getElementById('new-prod-modal').remove();
                    // Reload Data to see it immediately
                    this.loadMovimientosData().then(() => {
                        // If we are in edit mode or detail mode, refresh?
                        // Currently loadMovimientosData refreshes Views.
                        // But we might need to re-open the edit mode if we were there?
                        // Actually showGuiaEditMode is static until saved. 
                        // But we want to show it in the LIST. 
                        this.showGuiaEditMode(idGuia); // Re-render edit mode to show new list
                    });
                } else {
                    alert('Error: ' + res.message);
                    if (btn) { btn.disabled = false; btn.innerText = "Guardar"; }
                }
            })
            .catch(e => {
                console.error(e);
                alert('Error de red');
                if (btn) { btn.disabled = false; btn.innerText = "Guardar"; }
            });
    }


    openImageModal(url) {
        const modal = document.createElement('div');
        modal.id = 'image-modal-overlay';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100vw';
        modal.style.height = '100vh';
        modal.style.backgroundColor = 'rgba(0,0,0,0.85)';
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.zIndex = '9999';
        modal.style.cursor = 'zoom-out';

        modal.innerHTML = `<img src="${url}" style="max-width:90%; max-height:90vh; border-radius:8px; box-shadow:0 0 20px rgba(0,0,0,0.5);">`;

        modal.onclick = () => modal.remove();
        document.body.appendChild(modal);
    }

    closeGuiaDetails() {
        const panel = document.getElementById('guia-detail-panel');
        panel.style.width = '0';
        document.querySelectorAll('.guia-row-card').forEach(d => d.classList.remove('active'));
    }

    /* --- EDITING LOGIC --- */

    showGuiaEditMode(id) {
        const panel = document.getElementById('guia-detail-panel');
        const guiaInfo = this.data.movimientos.guias.find(g => g.id === id);

        // Find existing details
        let details = this.data.movimientos.detalles
            ? this.data.movimientos.detalles.filter(d => d.idGuia === id)
            : [];

        // Clone for editing state
        this.editingDetails = details.map(d => ({ ...d })); // Deep copy enough? Yes flat structure.
        this.editingGuiaType = guiaInfo.tipo; // Store type for rendering


        // Enrich for display (FIXED Lookup & Property)
        this.editingDetails = this.editingDetails.map(d => {
            const pCode = String(d.codigo).trim();
            const product = this.data.products[pCode] || Object.values(this.data.products).find(p => String(p.codigo).trim() === pCode);
            // Fix: Use .desc based on data, and default if missing
            return { ...d, descripcion: product ? product.desc : 'Producto Desconocido' };
        });

        // Removed options logic, using search input now

        // SHOW PENDING NEW PRODUCTS IN EDIT MODE (READ ONLY)
        const pendingProducts = this.data.nuevosProductos ? this.data.nuevosProductos.filter(p => p.idGuia === id) : [];
        let pendingHtml = '';
        if (pendingProducts.length > 0) {
            pendingHtml = `
                <div style="margin-top:1.5rem; border:1px dashed #f59e0b; background:#fffbeb; padding:1rem; border-radius:8px;">
                    <h5 style="margin:0 0 0.5rem 0; color:#b45309;"><i class="fa-solid fa-triangle-exclamation"></i> Productos Nuevos (Pendientes)</h5>
                    <div style="font-size:0.8rem; color:#92400e; margin-bottom:0.5rem;">Estos productos están esperando validación administrativa.</div>
                    ${pendingProducts.map(p => `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem 0; border-bottom:1px solid #fcd34d;">
                            <div>
                                <div style="font-weight:bold; color:#78350f;">${p.descripcion} (${p.marca})</div>
                                <div style="font-size:0.75rem;">Cant: ${p.cantidad} | Venc: ${p.fechaVencimiento || '-'}</div>
                            </div>
                            <span class="badge" style="background:#fcd34d; color:#78350f;">PENDIENTE</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        panel.innerHTML = `
            <div style="padding:1.5rem; border-bottom:1px solid #eee; background:#f9fafb; display:flex; flex-direction:column; height:100%;">
                <h3 style="color:var(--primary-color); margin-bottom:1rem;">Editar Guía</h3>
                
                <div style="margin-bottom:0.5rem;">
                    <label style="font-size:0.8rem; font-weight:bold;">Proveedor / Destino</label>
                    <input type="text" id="edit-guia-provider" value="${guiaInfo.proveedor || ''}" style="width:100%; padding:0.5rem; border:1px solid #ddd; border-radius:4px;">
                </div>

                <div style="margin-bottom:1rem;">
                    <label style="font-size:0.8rem; font-weight:bold;">Comentario</label>
                    <textarea id="edit-guia-comment" style="width:100%; height:60px; padding:0.5rem; border:1px solid #ddd; border-radius:4px;">${guiaInfo.comentario || ''}</textarea>
                </div>
                
                 <div style="margin-bottom:1rem; display:flex; justify-content:flex-end;">
                     <button onclick="app.showNewProductModal('${id}')" 
                             style="background:#f59e0b; color:white; border:none; padding:0.5rem 1rem; border-radius:4px; cursor:pointer; font-size:0.85rem; display:flex; align-items:center; gap:0.5rem;">
                         <i class="fa-solid fa-plus-circle"></i> Nuevo Producto (No en Catálogo)
                     </button>
                </div>

                <div style="flex:1; overflow-y:auto; margin-bottom:1rem; border:1px solid #eee; border-radius:4px; background:white;">
                    <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                        <thead style="background:#f3f4f6; position:sticky; top:0;">
                            <tr>
                                <th style="padding:0.5rem; text-align:left;">Producto</th>
                                ${this.editingGuiaType === 'INGRESO' ? '<th style="padding:0.5rem; width:110px;">Vencimiento</th>' : ''}
                                <th style="padding:0.5rem; width:80px;">Cant.</th>
                                <th style="padding:0.5rem; width:40px;"></th>
                            </tr>
                        </thead>
                        <tbody id="edit-guia-products-body">
                            <!-- Rendered by function -->
                        </tbody>
                    </table>
                </div>
                
                ${pendingHtml}


                <!-- Add Product (Spotlight Button) - KEPT FOR NORMAL SEARCH -->
                <div style="margin-bottom:1rem;">
                    <button class="spotlight-btn-add" onclick="app.openSpotlight('${id}')">
                        <i class="fa-solid fa-plus-circle" style="font-size:1.2rem; color:var(--primary-color);"></i>
                        <span>Agregar Producto</span>
                    </button>
                    <div style="text-align:center; font-size:0.8rem; color:#888;">Presiona para buscar productos del catálogo...</div>
                </div>

                <!-- SPOTLIGHT MODAL (Hidden by default) -->
                <div id="spotlight-overlay" class="spotlight-overlay" onclick="if(event.target === this) app.closeSpotlight()">
                    <div class="spotlight-modal">
                        <div class="spotlight-header">
                            <i class="fa-solid fa-magnifying-glass" style="color:#9ca3af; font-size:1.2rem;"></i>
                            <input type="text" id="spotlight-input" class="spotlight-input" placeholder="Buscar producto..." autocomplete="off">
                            <button onclick="app.closeSpotlight()" style="background:none; border:none; color:#9ca3af; cursor:pointer; font-size:0.9rem;">ESC</button>
                        </div>
                        <div id="spotlight-results" class="spotlight-results">
                            <!-- Results here -->
                            <div style="padding:2rem; text-align:center; color:#9ca3af;">
                                Escribe para buscar...
                            </div>
                        </div>
                        <div class="spotlight-footer">
                            <span id="spotlight-count">0 encontrados</span>
                            <button onclick="app.closeSpotlight()" style="padding:0.5rem 1rem; background:var(--primary-color); color:white; border:none; border-radius:6px; cursor:pointer;">Listo</button>
                        </div>
                    </div>
                </div>

                <div style="display:flex; gap:1rem; justify-content:end;">
                    <button onclick="app.toggleGuiaDetail('${id}')" style="padding:0.75rem 1.5rem; background:#eee; border:none; border-radius:8px; cursor:pointer;">Cancelar</button>
                    <button id="btn-save-guia" onclick="app.saveGuiaUpdate('${id}')" style="padding:0.75rem 1.5rem; background:var(--primary-color); color:white; border:none; border-radius:8px; cursor:pointer;">Guardar Cambios</button>
                </div>
            </div>
        `;

        this.renderEditProductsTable();
    }

    /* --- EDIT SEARCH LOGIC --- */
    /* --- EDIT SEARCH LOGIC --- */
    openSpotlight(guiaId) {
        const overlay = document.getElementById('spotlight-overlay');
        const input = document.getElementById('spotlight-input');
        if (!overlay || !input) return;

        overlay.classList.add('active');
        input.value = '';
        input.focus();

        // Clear results
        document.getElementById('spotlight-results').innerHTML = '<div style="padding:2rem; text-align:center; color:#9ca3af;">Escribe para buscar...</div>';

        // Bind generic event for search
        input.onkeyup = (e) => this.searchProductSpotlight(e.target.value);
    }

    closeSpotlight() {
        const overlay = document.getElementById('spotlight-overlay');
        if (overlay) overlay.classList.remove('active');
        // Refresh table just in case
        this.renderEditProductsTable();
    }

    searchProductSpotlight(term) {
        term = term.toLowerCase().trim();
        const resultsDiv = document.getElementById('spotlight-results');
        const countSpan = document.getElementById('spotlight-count');

        if (term.length < 2) {
            resultsDiv.innerHTML = '<div style="padding:2rem; text-align:center; color:#9ca3af;">BSigue escribiendo...</div>';
            countSpan.innerText = '0 encontrados';
            return;
        }

        const matches = Object.entries(this.data.products)
            .filter(([code, p]) => code.toLowerCase().includes(term) || p.desc.toLowerCase().includes(term))
            .slice(0, 50); // increased limit due to better UI

        countSpan.innerText = `${matches.length} encontrados`;

        if (matches.length > 0) {
            resultsDiv.innerHTML = matches.map(([code, p]) => {
                // Check if already in list to highlight or show qty
                const inList = this.editingDetails.find(d => String(d.codigo) === String(code));
                const badge = inList ? `<span class="badge-adj" style="background:#dcfce7; color:#166534;">En lista: ${inList.cantidad}</span>` : '';

                return `
                <div class="spotlight-item ${inList ? 'highlighted' : ''}" 
                     onclick="app.selectProductForSpotlight('${code}', '${p.desc.replace(/'/g, "")}')">
                    <div>
                        <div style="font-weight:bold; color:#333;">${p.desc}</div>
                        <div style="font-size:0.8rem; color:#666;">Code: ${code}</div>
                    </div>
                    <div>
                        ${badge}
                        <i class="fa-solid fa-plus" style="color:#ccc; margin-left:10px;"></i>
                    </div>
                </div>
             `}).join('');
        } else {
            resultsDiv.innerHTML = '<div style="padding:2rem; text-align:center; color:#9ca3af;">No se encontraron productos</div>';
        }
    }

    selectProductForSpotlight(code, desc) {
        // Add to editingDetails logic
        const existingIndex = this.editingDetails.findIndex(p => String(p.codigo).trim() === String(code).trim());
        if (existingIndex >= 0) {
            this.editingDetails[existingIndex].cantidad = Number(this.editingDetails[existingIndex].cantidad) + 1;
        } else {
            this.editingDetails.push({ codigo: code, descripcion: desc, cantidad: 1 });
        }

        // Re-render search results to update badges instantly
        const input = document.getElementById('spotlight-input');
        if (input) this.searchProductSpotlight(input.value);

        // Also update main table in background (optional, but good for context)
        this.renderEditProductsTable();
    }

    selectProductForEdit(code, desc) {
        // Add to editingDetails
        const existingIndex = this.editingDetails.findIndex(p => String(p.codigo).trim() === String(code).trim());
        if (existingIndex >= 0) {
            this.editingDetails[existingIndex].cantidad = Number(this.editingDetails[existingIndex].cantidad) + 1;
        } else {
            this.editingDetails.push({ codigo: code, descripcion: desc, cantidad: 1 });
        }

        this.renderEditProductsTable();

        // Clear Search
        const input = document.getElementById('edit-prod-search');
        input.value = '';
        input.focus();
        document.getElementById('edit-prod-search-results').style.display = 'none';
    }

    renderEditProductsTable() {
        const tbody = document.getElementById('edit-guia-products-body');
        if (!tbody) return;

        tbody.innerHTML = this.editingDetails.map((d, index) => `
            <tr style="border-bottom:1px solid #f9f9f9;">
                <td style="padding:0.5rem;">
                    <div style="font-weight:bold; color:#333; font-size: 0.85rem;">${d.descripcion}</div>
                    <div style="font-size:0.75rem; color:#666;">${d.codigo}</div>
                </td>
                ${this.editingGuiaType === 'INGRESO' ? `
                <td style="padding:0.5rem;">
                    <input type="date" value="${d.fechaVencimiento || ''}" 
                           onchange="app.updateEditExpiration(${index}, this.value)"
                           style="width:100%; padding:0.25rem; border:1px solid #ddd; border-radius:4px; font-size:0.8rem;">
                </td>
                ` : ''}
                <td style="padding:0.5rem;">
                    <input type="number" value="${d.cantidad}" min="1" 
                           onchange="app.updateEditQuantity(${index}, this.value)"
                           style="width:60px; padding:0.25rem; border:1px solid #ddd; border-radius:4px; text-align:center;">
                </td>
                <td style="padding:0.5rem;">
                    <button onclick="app.removeProductFromEdit(${index})" style="color:#ef4444; background:none; border:none; cursor:pointer; font-size:1rem;"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    }

    updateEditExpiration(index, val) {
        this.editingDetails[index].fechaVencimiento = val;
    }

    updateEditQuantity(index, val) {
        this.editingDetails[index].cantidad = Number(val);
    }

    removeProductFromEdit(index) {
        this.editingDetails.splice(index, 1);
        this.renderEditProductsTable();
    }

    addProductToEdit() {
        const select = document.getElementById('edit-guia-add-select');
        const code = select.value;
        if (!code) return;

        const product = this.data.products.find(p => p.codigo === code);

        // Check if already exists
        const exists = this.editingDetails.find(d => String(d.codigo) === String(code));
        if (exists) {
            alert('El producto ya está en la lista.');
            return;
        }

        this.editingDetails.push({
            codigo: code,
            descripcion: product ? product.descripcion : '',
            cantidad: 1
        });

        select.value = '';
        this.renderEditProductsTable();
    }

    async saveGuiaUpdate(id) {
        const comment = document.getElementById('edit-guia-comment').value;
        const provider = document.getElementById('edit-guia-provider').value;
        const btn = document.getElementById('btn-save-guia');

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';

        try {
            // --- OPTIMISTIC UPDATE START ---
            const guiaInfo = this.data.movimientos.guias.find(g => g.id === id);

            if (guiaInfo) { // Should exist
                const oldDetails = this.data.movimientos.detalles
                    ? this.data.movimientos.detalles.filter(d => d.idGuia === id)
                    : [];

                // 1. Revert Old Stock
                oldDetails.forEach(d => {
                    const pCode = String(d.codigo).trim();
                    const product = this.data.products[pCode] || Object.values(this.data.products).find(p => String(p.codigo).trim() === pCode);
                    if (product) {
                        if (guiaInfo.tipo === 'INGRESO') {
                            product.stock -= Number(d.cantidad);
                        } else { // SALIDA
                            product.stock += Number(d.cantidad);
                        }
                    }
                });

                // 2. Apply New Stock
                this.editingDetails.forEach(d => {
                    const pCode = String(d.codigo).trim();
                    const product = this.data.products[pCode] || Object.values(this.data.products).find(p => String(p.codigo).trim() === pCode);
                    if (product) {
                        if (guiaInfo.tipo === 'INGRESO') {
                            product.stock += Number(d.cantidad);
                        } else { // SALIDA
                            product.stock -= Number(d.cantidad);
                        }
                    }
                });

                // 3. Refresh Grid UI Immediately
                if (this.currentView === 'products') {
                    this.renderProductMasterList();
                }
            }
            // --- OPTIMISTIC UPDATE END ---

            const payload = {
                idGuia: id,
                comentario: comment,
                proveedor: provider,
                productos: this.editingDetails.map(d => ({ codigo: d.codigo, cantidad: d.cantidad, fechaVencimiento: d.fechaVencimiento }))
            };

            const response = await fetch(API_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: 'updateGuia', payload: payload })
            });
            const result = await response.json();

            if (result.status === 'success') {
                alert('Guía actualizada correctamente');
                // Reload Data (Will overwrite optimistic stock with server truth, preventing drift)
                await this.loadMovimientosData();
                // Return to view mode (Refresh detail panel with new data)
                this.toggleGuiaDetail(id);
            } else {
                alert('Error: ' + result.message);
                btn.disabled = false;
                btn.innerText = 'Guardar Cambios';
                // ROLLBACK OPTIMISTIC? ideally yes, but for now simple reload is safer if error
                window.location.reload();
            }

        } catch (e) {
            console.error(e);
            alert('Error de red: ' + e.message);
            btn.disabled = false;
            btn.innerText = 'Guardar Cambios';
        }
    }

    // Helper for Drive Images
    getOptimizedImageUrl(url) {
        if (!url) return '';
        if (url.includes('drive.google.com') && (url.includes('export=view') || url.includes('uc?'))) {
            const idMatch = url.match(/id=([^&]+)/);
            if (idMatch && idMatch[1]) {
                return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w1000`;
            }
        }
        return url;
    }

    renderPreingresos() {
        // Initial Render - just trigger filter
        this.filterPreingresosList();
    }

    clearPreingresoFilters() {
        document.getElementById('preingreso-filter-text').value = '';
        document.getElementById('preingreso-filter-date').value = '';
        this.filterPreingresosList();
    }

    filterPreingresosList() {
        const text = document.getElementById('preingreso-filter-text').value.toLowerCase().trim();
        const dateInput = document.getElementById('preingreso-filter-date').value; // YYYY-MM-DD

        let list = this.data.movimientos?.preingresos || [];

        // Filter Text (Proveedor or ID helper although ID is not explicitly stored as simplified string, check content)
        if (text) {
            list = list.filter(p =>
                (p.proveedor || '').toLowerCase().includes(text) ||
                (p.comentario || '').toLowerCase().includes(text) ||
                (p.etiqueta || '').toLowerCase().includes(text)
            );
        }

        // Filter Date
        if (dateInput) {
            // dateInput is YYYY-MM-DD. p.fecha is "DD/MM/YYYY HH:mm:ss"
            const [y, m, d] = dateInput.split('-');
            const searchDate = `${d}/${m}/${y}`;
            list = list.filter(p => p.fecha.startsWith(searchDate));
        }

        this.renderPreingresosGrouped(list);
    }

    renderPreingresosGrouped(list) {
        const container = document.getElementById('preingresos-list-scroll');
        if (!container) return; // Guard if view not ready

        if (list.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:#999; padding:2rem;">No se encontraron preingresos</div>';
            return;
        }

        // Group by Date
        const getDate = (str) => str.split(' ')[0]; // "16/12/2025"
        const groups = {};
        list.forEach(item => {
            const d = getDate(item.fecha);
            if (!groups[d]) groups[d] = [];
            groups[d].push(item);
        });

        // Sort Dates Descending
        const sortedDates = Object.keys(groups).sort((a, b) => {
            const da = a.split('/').reverse().join('');
            const db = b.split('/').reverse().join('');
            return db.localeCompare(da);
        });

        let html = '';
        sortedDates.forEach(date => {
            html += `<h4 style="margin: 1rem 0 0.5rem 0; color:var(--primary-color); border-bottom:2px solid #f3f4f6; padding-bottom:0.25rem;">${date}</h4>`;
            html += `<div class="guias-group-list">`;

            groups[date].forEach(p => {
                // Status Badge Color
                const statusClass = p.estado === 'PENDIENTE' ? 'pendiente' : 'procesado';
                const badgeColor = p.estado === 'PENDIENTE' ? '#f59e0b' : '#10b981';

                // CHECK IF GUIA ALREADY EXISTS
                // We check if any guide has this preingreso ID linked
                const hasGuide = (this.data.movimientos.guias || []).some(g => String(g.idPreingreso) === String(p.id));

                html += `
                    <div id="pre-row-${p.id}" class="guia-row-card" onclick="app.togglePreingresoDetail('${p.id}')">
                         <div style="display:flex; justify-content:space-between; align-items:start;">
                            <div>
                                <span class="badge" style="background:${badgeColor}; color:white;">${p.estado}</span>
                                <span style="font-weight:bold; color:#333; margin-left:0.5rem; display:block; margin-top:0.4rem;">${p.proveedor || 'Sin Nombre'}</span>
                            </div>
                            <div style="font-size:0.8rem; color:#666;">${p.fecha.split(' ')[1] || ''}</div>
                        </div>
                        <div style="margin-top:0.5rem; font-size:0.85rem; color:#666;">
                            ${p.etiqueta ? `<span><i class="fa-solid fa-tag" style="margin-right:4px;"></i>${p.etiqueta}</span>` : ''}
                        </div>
                         ${p.fotos && p.fotos.length > 0 ?
                        `<div style="margin-top:0.5rem; font-size:0.8rem; color:var(--primary-color);"><i class="fa-regular fa-images"></i> ${p.fotos.length} fotos adjuntas</div>`
                        : ''}
                         
                         ${!hasGuide ? `
                            <button onclick="event.stopPropagation(); app.generateGuiaFromPreingreso('${p.id}')" 
                                    class="btn-sm" 
                                    style="margin-top:0.75rem; width:100%; background:var(--primary-color); color:white; border:none; border-radius:15px; padding:4px 0; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:0.4rem; font-size:0.75rem; font-weight:500; height: 28px;">
                                <i class="fa-solid fa-file-import" style="font-size:0.7rem;"></i> Generar Guía
                            </button>
                         ` : ''}
                    </div>
                `;
            });
            html += `</div>`;
        });

        container.innerHTML = html;
    }

    async togglePreingresoDetail(id) {
        const panel = document.getElementById('preingreso-detail-panel');

        // Handle Active Selection Visuals
        const currentActive = document.querySelector('.guia-row-card.active');
        document.querySelectorAll('.guia-row-card').forEach(d => d.classList.remove('active'));

        // If clicking same, Close
        if (currentActive && currentActive.id === `pre-row-${id}`) {
            this.closePreingresoDetails();
            return;
        }

        const row = document.getElementById(`pre-row-${id}`);
        if (row) row.classList.add('active');

        // Open Panel
        panel.style.width = '450px'; // Slightly wider for photos
        panel.style.opacity = '1';

        // Load Data
        const info = this.data.movimientos.preingresos.find(p => p.id === id);
        if (info) {
            this.renderPreingresoDetailContent(info);
        }
    }

    closePreingresoDetails() {
        const panel = document.getElementById('preingreso-detail-panel');
        panel.style.width = '0';
        document.querySelectorAll('.guia-row-card').forEach(d => d.classList.remove('active'));
    }

    renderPreingresoDetailContent(info) {
        const panel = document.getElementById('preingreso-detail-panel');

        // Carousel Logic
        let carouselHtml = '';
        if (info.fotos && info.fotos.length > 0) {
            const slides = info.fotos.map(url => {
                const optUrl = this.getOptimizedImageUrl(url);
                return `
                    <div style="flex:0 0 auto; width:120px; height:120px; border-radius:8px; overflow:hidden; border:1px solid #ddd; position:relative; cursor:zoom-in;"
                onclick = "app.openImageModal('${optUrl}')" >
                    <img src="${optUrl}" style="width:100%; height:100%; object-fit:cover;">
                        <div style="position:absolute; bottom:0; left:0; width:100%; height:25px; background:rgba(0,0,0,0.5); display:flex; 
                                    justify-content:center; align-items:center;">
                            <i class="fa-solid fa-expand" style="color:white; font-size:0.8rem;"></i>
                        </div>
                    </div>
                `;
            }).join('');

            carouselHtml = `
                    <div style="margin-top:1.5rem;">
                    <h5 style="margin-bottom:0.5rem; color:#555;">Evidencias / Fotos</h5>
                    <div style="display:flex; overflow-x:auto; gap:0.75rem; padding-bottom:0.5rem; scrollbar-width:thin;">
                        ${slides}
                    </div>
                </div>
                    `;
        } else {
            carouselHtml = `<div style="margin-top:1.5rem; color:#999; font-style:italic;">No hay imagenes adjuntas.</div>`;
        }

        panel.innerHTML = `
                    <div style="padding:1.5rem; border-bottom:1px solid #eee; background:#f9fafb;">
                <div style="display:flex; justify-content:space-between; align-items:start;">
                    <h3 style="margin:0 0 0.5rem 0; color:var(--primary-color);">Detalle Preingreso</h3>
                    <button onclick="app.closePreingresoDetails()" style="background:none; border:none; font-size:1.2rem; cursor:pointer; color:#666;">&times;</button>
                </div>
                <div style="font-size:0.9rem; color:#555;">${info.fecha}</div>
            </div>
            
            <div style="flex:1; overflow-y:auto; padding:1.5rem;">
                <!-- Main Info -->
                 <div style="margin-bottom:1rem;">
                    <label style="font-size:0.75rem; text-transform:uppercase; color:#888; letter-spacing:0.5px; font-weight:bold;">Proveedor</label>
                    <div style="font-size:1.1rem; font-weight:bold; color:#333;">${info.proveedor}</div>
                </div>

                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-bottom:1rem;">
                     <div>
                        <label style="font-size:0.75rem; text-transform:uppercase; color:#888; font-weight:bold;">Estado</label>
                        <div style="margin-top:0.25rem;">
                            <span class="badge" style="background:${info.estado === 'PENDIENTE' ? '#f59e0b' : '#10b981'}; color:white;">${info.estado}</span>
                        </div>
                    </div>
                    <div>
                        <label style="font-size:0.75rem; text-transform:uppercase; color:#888; font-weight:bold;">Monto</label>
                        <div style="font-size:1rem; color:#333;">${info.monto ? 'S/ ' + info.monto : '-'}</div>
                    </div>
                </div>

                 <div style="margin-bottom:1rem;">
                    <label style="font-size:0.75rem; text-transform:uppercase; color:#888; font-weight:bold;">Etiqueta / Tipo</label>
                    <div style="font-size:0.95rem; color:#333;">${info.etiqueta || 'N/A'}</div>
                </div>

                 <div style="margin-bottom:1rem;">
                    <label style="font-size:0.75rem; text-transform:uppercase; color:#888; font-weight:bold;">Comprobante</label>
                    <div style="font-size:0.95rem; color:#333;">${info.comprobante || 'N/A'}</div>
                </div>

                <div style="margin-bottom:1rem;">
                    <label style="font-size:0.75rem; text-transform:uppercase; color:#888; font-weight:bold;">Observaciones</label>
                    <div style="font-size:0.95rem; color:#333; background:#f9f9f9; padding:0.75rem; border-radius:6px; border:1px solid #eee; margin-top:0.25rem;">
                        ${info.comentario ? `"${info.comentario}"` : '<span style="color:#aaa;">Sin comentarios</span>'}
                    </div>
                </div>

                ${carouselHtml}
            </div>
            
            <div style="padding:1rem; border-top:1px solid #eee; text-align:center;">
                 <button class="btn-primary" style="width:100%; justify-content:center;" onclick="app.closePreingresoDetails()">Cerrar</button>
            </div>
                `;
    }

    async generateGuiaFromPreingreso(id) {
        const pre = this.data.movimientos.preingresos.find(p => p.id === id);
        if (!pre) return;

        if (!confirm(`¿Generar Guía de Ingreso para ${pre.proveedor}?`)) return;

        // Optimistic UI could go here, but let's wait for server
        const payload = {
            tipo: 'INGRESO',
            usuario: this.currentUser.username,
            proveedor: pre.proveedor,
            comentario: pre.comentario || '',
            productos: [],
            idPreingreso: id,
            estado: 'EN PROGRESO',
            foto: null
        };

        try {
            this.showToast('Generando guía...', 'info');
            const response = await fetch(API_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({
                    action: 'saveGuia',
                    payload: payload
                })
            });
            const result = await response.json();

            if (result.status === 'success') {
                this.showToast('Guía generada exitosamente', 'success');
                // Reload to update lists (hide button in preingreso, show in guias)
                await this.loadMovimientosData(false);
                // Switch key tabs
                this.switchMovTab('guias');
            } else {
                alert('Error al generar guía: ' + result.message);
            }
        } catch (e) {
            console.error(e);
            alert('Error de conexión al generar guía');
        }
    }

    // MODALS & FORMS
    // MODALS & FORMS
    openNewGuiaModal(type) {
        const title = type === 'INGRESO' ? 'Nueva Guía de Ingreso' : 'Nueva Guía de Salida';
        // Fix Provider Source: Use mov data or fallback
        let providers = this.data.providers || [];
        if (providers.length === 0 && this.data.movimientos && this.data.movimientos.proveedores) {
            providers = this.data.movimientos.proveedores;
        }
        const providerOptions = providers.map(p => `<option value="${p.nombre}">`).join('');

        const modalHtml = `
            <div class="modal-card" style="width:95%; max-width:800px; height:90vh; display:flex; flex-direction:column; overflow:hidden;">
                <div class="modern-modal-wrapper" style="height:100%; display:flex; flex-direction:column;">
                    <!-- Header -->
                    <div class="modern-header">
                        <button class="close-btn" onclick="app.closeModal()"><i class="fa-solid fa-xmark"></i></button>
                        <h3>${title}</h3>
                        <button class="save-mobile-btn" onclick="app.saveGuia('${type}')" style="z-index:9999;">
                            Guardar <i class="fa-solid fa-check"></i>
                        </button>
                    </div>

                    <div class="modern-body" style="flex:1; overflow-y:auto;">
                        
                        <!-- Section 1: Information -->
                        <div class="form-section">
                            <div class="section-header">
                                <h4>Información General</h4>
                            </div>
                            
                            <div class="input-group floating">
                                <input type="text" id="guia-proveedor" placeholder=" " list="provider-list" required autocomplete="off">
                                <label>${type === 'INGRESO' ? 'Proveedor' : 'Destino'}</label>
                                <datalist id="provider-list">
                                    ${providerOptions}
                                </datalist>
                            </div>

                            <div class="input-group floating">
                                <textarea id="guia-comentario" placeholder=" "></textarea>
                                <label>Comentarios / Observaciones</label>
                            </div>
                        </div>

                        <!-- Section 2: Products -->
                        <div class="form-section">
                            <div class="section-header" style="flex-direction:column; align-items:start; gap:0.5rem;">
                                <h4>Productos</h4>
                                <div style="position:relative; width:100%;">
                                    <input type="text" id="guia-inline-search" class="neon-input" placeholder="Escanear código o buscar..." 
                                           style="width:100%; padding:0.8rem 2.5rem 0.8rem 1rem; border-radius:8px;"
                                           onkeyup="app.handleInlineProdSearch(this, event)" autocomplete="off">
                                    <i class="fa-solid fa-barcode" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); color:#aaa;"></i>
                                    <div id="guia-inline-results" class="spotlight-results" style="position:absolute; top:100%; left:0; right:0; max-height:200px; display:none; border:1px solid #eee; background:white; z-index:1000; box-shadow:0 10px 15px rgba(0,0,0,0.1);"></div>
                                </div>
                            </div>

                            <!-- Empty State or List -->
                            <div id="temp-prods-list" class="cards-list">
                                <div style="text-align:center; padding:1rem; color:#999; font-size:0.9rem;">
                                    No hay productos agregados via modal.
                                </div>
                            </div>
                        </div>

                        <!-- Section 3: Attachments -->
                        <div class="form-section">
                            <div class="section-header">
                                <h4>Adjuntos</h4>
                            </div>
                            <div class="photo-upload-area" onclick="document.getElementById('guia-file-input').click()">
                                <input type="file" id="guia-file-input" accept="image/*" class="file-input-hidden" onchange="app.handlePhotoSelect(this, 'guia-preview-area')" hidden>
                                <div id="guia-preview-area">
                                    <i class="fa-solid fa-camera photo-upload-icon"></i>
                                    <p class="photo-upload-text">Toca para tomar/subir foto</p>
                                </div>
                            </div>
                        </div>

                    </div> 

                    <!-- Desktop Footer -->
                    <div class="modern-footer">
                        <button class="btn-secondary" onclick="app.closeModal()">Cancelar</button>
                        <button class="btn-primary" onclick="app.saveGuia('${type}')">
                            Guardar Guía <i class="fa-solid fa-save"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        this.openModal(modalHtml, 'modern-modal');
        this.tempGuiaProducts = [];
        this.tempGuiaType = type; // STORE TYPE FOR RENDER LOGIC

        // Store Preingreso ID if passed (optional, logic might be elsewhere but safe to init)
        this.tempPreingresoId = null;
    }

    /* --- AUDIT MODAL --- */
    openAuditModal() {
        if (!this.auditList || this.auditList.length === 0) return;

        // Generate Cards Grid
        const cardsHtml = this.auditList.map(item => {
            const p = this.data.products[item.codigo] || { desc: 'Desconocido', stock: 0 };
            const imgSrc = this.getOptimizedImageUrl(p.img || '');

            return `
            <div class="audit-card-large" id="audit-card-${item.id}">
                <div class="audit-img-container">
                    <img src="${imgSrc || 'recursos/defaultImageProduct.png'}" loading="lazy" onerror="this.src='recursos/defaultImageProduct.png'">
                </div>
                <div class="audit-info">
                    <div class="audit-code">${item.codigo}</div>
                    <div class="audit-desc">${p.desc}</div>
                    <div class="audit-stock">
                        Stock Sistema: <span>${p.stock}</span>
                    </div>
                    <div class="audit-actions">
                        ${item.estado === 'PENDIENTE' ? `
                        <button class="btn-audit-reject" onclick="app.handleAuditAction('${item.id}', 'REJECT', ${p.stock}, '${item.codigo}')">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                        <button class="btn-audit-approve" onclick="app.handleAuditAction('${item.id}', 'OK', ${p.stock})">
                            <i class="fa-solid fa-check"></i>
                        </button>
                        ` : `
                        <div style="color:#22c55e; font-weight:bold; font-size:1.1rem; width:100%; text-align:center; padding:0.8rem; background:#dcfce7; border-radius:8px;">
                            <i class="fa-solid fa-check-circle"></i> ${item.estado}
                        </div>
                        `}
                    </div>
                </div>
            </div>
            `;
        }).join('');

        const modalHtml = `
            <div class="modal-card" style="width:95%; max-width:1200px; height:90vh; display:flex; flex-direction:column; overflow:hidden;">
                <div class="modern-header">
                    <button class="close-btn" onclick="app.closeModal()"><i class="fa-solid fa-xmark"></i></button>
                    <h3><i class="fa-solid fa-clipboard-check"></i> Auditoría Diaria</h3>
                    <span style="background:var(--primary-light); color:var(--primary-color); padding:0.2rem 0.6rem; border-radius:12px; font-size:0.8rem; font-weight:bold;">${this.auditList.length} Pendientes</span>
                </div>
                <div class="modern-body" style="background:#f3f4f6; padding:1.5rem;">
                    <div class="audit-grid">
                        ${cardsHtml}
                    </div>
                </div>
            </div>
        `;

        this.openModal(modalHtml, 'audit-modal-wrapper');
    }

    async handleAuditAction(idAudit, action, systemStock, code) {
        const card = document.getElementById(`audit-card-${idAudit}`);

        // 1. UPDATE LOCAL STATE
        const itemIndex = this.auditList.findIndex(i => i.id == idAudit);
        if (itemIndex > -1) {
            this.auditList[itemIndex].estado = action === 'OK' ? 'AUDITADO' : 'AJUSTADO';
        }

        if (action === 'OK') {
            // Optimistic UI
            if (card) {
                card.classList.add('audit-verified');
                card.querySelector('.audit-actions').innerHTML = `
                    <div style="color:#22c55e; font-weight:bold; font-size:1.1rem; width:100%; text-align:center; padding:0.8rem; background:#dcfce7; border-radius:8px;">
                        <i class="fa-solid fa-check-circle"></i> AUDITADO
                    </div>`;
            }

            // Sync with Backend
            this.sendAuditResult(idAudit, 'OK', systemStock)
                .then(() => this.updateDashboardCount()); // Refresh Widget Count

        } else if (action === 'REJECT') {
            // Show Adjustment Input
            // Replace actions with input form
            const actionsDiv = card.querySelector('.audit-actions');
            actionsDiv.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:0.5rem; width:100%;">
                    <label style="font-size:0.8rem; text-align:left;">Stock Real Encontrado:</label>
                    <div style="display:flex; gap:0.5rem;">
                        <input type="number" id="audit-qty-${idAudit}" placeholder="${systemStock}" style="width:80px; padding:0.3rem; border:1px solid #ddd; border-radius:4px;">
                        <button class="btn-sm btn-primary" onclick="app.submitAuditAdjustment('${idAudit}', ${systemStock})">Guardar</button>
                    </div>
                </div>
            `;
        }
    }

    async submitAuditAdjustment(idAudit, systemStock) {
        const input = document.getElementById(`audit-qty-${idAudit}`);
        if (!input || input.value === '') return alert('Ingrese la cantidad real');

        const realQty = parseFloat(input.value);
        if (isNaN(realQty)) return alert('Cantidad inválida');

        // UPDATE LOCAL STATE
        const itemIndex = this.auditList.findIndex(i => i.id == idAudit);
        if (itemIndex > -1) {
            this.auditList[itemIndex].estado = 'AJUSTADO';
        }

        // UI Feedback
        const card = document.getElementById(`audit-card-${idAudit}`);
        if (card) {
            card.classList.add('audit-verified');
            card.querySelector('.audit-actions').innerHTML = `
                    <div style="color:#22c55e; font-weight:bold; font-size:1.1rem; width:100%; text-align:center; padding:0.8rem; background:#dcfce7; border-radius:8px;">
                        <i class="fa-solid fa-file-pen"></i> AJUSTADO
                    </div>`;
        }

        // Sync
        this.sendAuditResult(idAudit, 'ADJUST', realQty, systemStock)
            .then(() => this.updateDashboardCount());
    }

    /* Helper to refresh Widget Count without full reload */
    updateDashboardCount() {
        // Recalculate pending based on local list
        const pendingCount = this.auditList.filter(i => i.estado === 'PENDIENTE').length;
        const widget = document.getElementById('widget-audit');
        if (widget) {
            const countEl = widget.querySelector('div[style*="font-size:2.5rem"]');
            if (countEl) countEl.innerText = pendingCount;

            // If count is 0, we might want to show success message.
            if (pendingCount === 0) {
                this.renderRandomAuditWidget(); // Reload full widget state
            }
        }
    }

    async sendAuditResult(idAudit, status, realQty, systemStock) {
        try {
            await fetch(API_URL, {
                method: 'POST',
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({
                    action: 'processAudit',
                    payload: {
                        idAudit,
                        status,
                        realQty,
                        systemStock
                    }
                })
            });
            // Update local count? 
            // Better to just refresh dashboard if modal closes?
            // For now, let it be.
        } catch (e) {
            console.error('Audit Error', e);
            alert('Error al guardar auditoría');
        }
    }

    // SPOTLIGHT SEARCH LOGIC
    openGuiaSpotlight() {
        const overlay = document.createElement('div');
        overlay.className = 'spotlight-overlay';
        overlay.id = 'guia-spotlight';
        overlay.innerHTML = `
            <div class="spotlight-box">
                <div class="spotlight-search-bar">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input type="text" class="spotlight-input" id="spotlight-input" placeholder="Buscar producto..." autocomplete="off">
                    <button class="icon-btn" onclick="document.getElementById('guia-spotlight').remove()"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="spotlight-results" id="spotlight-results"></div>
            </div>
        `;

        document.body.appendChild(overlay);

        const input = document.getElementById('spotlight-input');
        input.focus();

        input.addEventListener('keyup', (e) => this.handleSpotlightSearch(e));

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        this.renderSpotlightResults(Object.values(this.data.products).slice(0, 20));
    }

    handleSpotlightSearch(e) {
        const term = e.target.value.toLowerCase();
        const products = Object.values(this.data.products);

        if (!term) {
            this.renderSpotlightResults(products.slice(0, 20));
            return;
        }

        const filtered = products.filter(p =>
            (p.desc && p.desc.toLowerCase().includes(term)) ||
            (p.codigo && String(p.codigo).toLowerCase().includes(term))
        ).slice(0, 50);

        this.renderSpotlightResults(filtered);
    }

    renderSpotlightResults(products) {
        const container = document.getElementById('spotlight-results');
        if (!products.length) {
            container.innerHTML = '<div style="padding:1rem; text-align:center; color:#999;">No se encontraron productos</div>';
            return;
        }

        container.innerHTML = products.map(p => `
            <div class="spotlight-item" onclick="app.addSpotlightProduct('${p.codigo}')">
                <div style="flex:1;">
                    <div class="spotlight-item-name">${p.desc}</div>
                    <div class="spotlight-item-code">${p.codigo}</div>
                </div>
                <div class="spotlight-item-stock">Stock: ${p.stock || 0}</div>
            </div>
        `).join('');
    }

    addSpotlightProduct(code) {
        // Find product by code (key or property)
        let product = this.data.products[code];
        // fallback if key mismatch (though it should matches key)
        if (!product) product = Object.values(this.data.products).find(p => p.codigo === code);

        if (!product) return;

        const existing = this.tempGuiaProducts.find(p => p.codigo === code);
        if (existing) {
            existing.cantidad++;
        } else {
            this.tempGuiaProducts.push({
                codigo: product.codigo,
                nombre: product.desc,
                cantidad: 1
            });
        }

        this.renderTempGuiaProducts();
        document.getElementById('guia-spotlight').remove();
    }

    renderTempGuiaProducts() {
        const container = document.getElementById('temp-prods-list');
        if (this.tempGuiaProducts.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:1rem; color:#999;">No hay productos agregados.</div>';
            return;
        }

        container.innerHTML = this.tempGuiaProducts.map((p, index) => `
            <div class="guia-prod-card">
                <div class="guia-prod-icon">
                    <i class="fa-solid fa-box"></i>
                </div>
                <div class="guia-prod-details">
                    <div class="guia-prod-name">${p.nombre}</div>
                    <div class="guia-prod-meta">${p.codigo}</div>
                    ${this.tempGuiaType === 'INGRESO' ? `
                    <div class="guia-prod-meta" style="margin-top:2px;">
                       <i class="fa-regular fa-calendar" style="font-size:0.8rem; margin-right:4px;"></i>
                       <input type="date" value="${p.fechaVencimiento || ''}" 
                              onchange="app.setManualExpiration(${index}, this.value)"
                              style="border:none; background:transparent; font-size:0.8rem; color:#666; font-family:inherit; width:110px;">
                    </div>
                    ` : ''}
                </div>
                <div class="guia-prod-qty">
                    <button class="qty-btn" onclick="app.updateTempGuiaQty(${index}, -1)">-</button>
                    <input type="number" step="0.01" class="qty-input" value="${p.cantidad}" readonly 
                           ondblclick="app.unlockQtyInput(this)" 
                           onchange="app.setManualQty(${index}, this.value)"
                           onblur="app.setManualQty(${index}, this.value)"
                           onkeydown="if(event.key==='Enter') this.blur()">
                    <button class="qty-btn" onclick="app.updateTempGuiaQty(${index}, 1)">+</button>
                </div>
                <button class="guia-prod-remove" onclick="app.removeTempGuiaProduct(${index})">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `).join('');
    }

    setManualExpiration(index, dateVal) {
        if (this.tempGuiaProducts[index]) {
            this.tempGuiaProducts[index].fechaVencimiento = dateVal;
        }
    }

    unlockQtyInput(el) {
        el.removeAttribute('readonly');
        el.focus();
        el.select();
    }

    setManualQty(index, val) {
        // Prevent re-trigger if already readonly
        const input = document.activeElement;

        // Small delay to ensure we capture the value before re-rendering
        // validation
        let qty = parseFloat(val);
        if (isNaN(qty) || qty <= 0) qty = 1;

        if (this.tempGuiaProducts[index]) {
            this.tempGuiaProducts[index].cantidad = qty;
        }
        this.renderTempGuiaProducts();
    }

    // INLINE SEARCH LOGIC (REPLACES SPOTLIGHT)
    handleInlineProdSearch(input, event) {
        const term = input.value.toLowerCase().trim();
        const resultsDiv = document.getElementById('guia-inline-results');

        // SCANNER LOGIC (Enter Key)
        if (event && event.key === 'Enter') {
            event.preventDefault();
            // Find exact match by CODE
            const exactCode = Object.keys(this.data.products).find(k => k.toLowerCase() === term);
            if (exactCode) {
                this.selectInlineProduct(exactCode);
                input.value = ''; // Clear after auto-add
                resultsDiv.style.display = 'none';
                return;
            }
        }

        if (term.length < 2) {
            resultsDiv.style.display = 'none';
            return;
        }

        const products = Object.values(this.data.products);
        const filtered = products.filter(p =>
            (p.desc && p.desc.toLowerCase().includes(term)) ||
            (p.codigo && String(p.codigo).toLowerCase().includes(term))
        ).slice(0, 50);

        if (filtered.length === 0) {
            resultsDiv.innerHTML = '<div style="padding:0.5rem; color:#999; text-align:center;">No encontrado</div>';
            resultsDiv.style.display = 'block';
            return;
        }

        resultsDiv.innerHTML = filtered.map(p => {
            const displayCode = p.codigo || 'N/A';
            const safeDesc = (p.desc || '').replace(/'/g, "\\'"); // Escape quotes for onclick
            return `
            <div class="spotlight-item" onclick="app.selectInlineProduct('${displayCode}')" style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem;">
                <div style="flex:1;">
                    <div class="spotlight-item-name" style="font-weight:bold;">${p.desc}</div>
                    <div class="spotlight-item-code" style="color:#666; font-size:0.85rem;">Code: ${displayCode}</div>
                </div>
                <!-- Stock removed as requested -->
            </div>
            `;
        }).join('');
        resultsDiv.style.display = 'block';
    }

    selectInlineProduct(code) {
        // Reuse addSpotlightProduct logic structure
        let product = this.data.products[code];
        if (!product) product = Object.values(this.data.products).find(p => p.codigo === code);

        if (!product) return;

        const existing = this.tempGuiaProducts.find(p => p.codigo === code);
        if (existing) {
            existing.cantidad++;
            this.showToast(`Cantidad aumentada: ${product.desc}`, 'success');
        } else {
            this.tempGuiaProducts.push({
                codigo: product.codigo,
                nombre: product.desc,
                cantidad: 1
            });
            this.showToast(`Agregado: ${product.desc}`, 'success');
        }

        this.renderTempGuiaProducts();

        // Clear Search
        const input = document.getElementById('guia-inline-search');
        if (input) {
            input.value = '';
            input.focus();
        }
        document.getElementById('guia-inline-results').style.display = 'none';
    }

    updateTempGuiaQty(index, delta) {
        const p = this.tempGuiaProducts[index];
        p.cantidad += delta;
        if (p.cantidad < 1) p.cantidad = 1;
        this.renderTempGuiaProducts();
    }

    removeTempGuiaProduct(index) {
        this.tempGuiaProducts.splice(index, 1);
        this.renderTempGuiaProducts();
    }

    openNewPreingresoModal() {
        const providers = this.data.providers || [];
        const datalistOpts = providers.map(p => `<option value="${p.nombre}">`).join('');

        const modalHtml = `
            <div class="modal-card" style="width:95%; max-width:600px; height:85vh; display:flex; flex-direction:column; overflow:hidden;">
                <div class="modern-modal-wrapper" style="height:100%; display:flex; flex-direction:column;">
                    <!-- Header -->
                    <div class="modern-header">
                        <button class="close-btn" onclick="app.closeModal()"><i class="fa-solid fa-xmark"></i></button>
                        <h3>Nuevo Preingreso</h3>
                        <button class="save-mobile-btn" onclick="app.savePreingreso()" style="z-index:9999;">Guardar</button>
                    </div>

                    <div class="modern-body" style="flex:1; overflow-y:auto;">
                        
                        <!-- Section 1: General -->
                        <div class="form-section">
                            <div class="section-header">
                                <h4>Información General</h4>
                            </div>
                            
                            <div class="input-group floating">
                                <input type="text" id="pre-proveedor" placeholder=" " list="pre-prov-list" autocomplete="off">
                                <label>Proveedor</label>
                                <datalist id="pre-prov-list">${datalistOpts}</datalist>
                            </div>

                            <div class="input-group floating">
                                <textarea id="pre-comentario" placeholder=" " rows="2"></textarea>
                                <label>Observaciones</label>
                            </div>
                        </div>

                        <!-- Section 2: Details -->
                        <div class="form-section">
                            <div class="section-header">
                                <h4>Detalles</h4>
                            </div>

                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem;">
                                <div class="input-group">
                                    <label style="font-size:0.8rem; color:#666; margin-bottom:4px; display:block;">Etiqueta</label>
                                    <select id="pre-etiqueta" class="modern-select" style="width:100%; padding:0.8rem; border-radius:8px; border:1px solid #ddd;" onchange="app.togglePreingresoMonto()">
                                        <option value="Pedido Incompleto">Pedido Incompleto</option>
                                        <option value="Pedido Completo">Pedido Completo</option>
                                    </select>
                                </div>
                                <div class="input-group">
                                    <label style="font-size:0.8rem; color:#666; margin-bottom:4px; display:block;">Comprobante</label>
                                    <select id="pre-comprobante" class="modern-select" style="width:100%; padding:0.8rem; border-radius:8px; border:1px solid #ddd;">
                                        <option value="Sin Comprobante">Sin Comprobante</option>
                                        <option value="Con Comprobante">Con Comprobante</option>
                                    </select>
                                </div>
                            </div>

                            <!-- Monto (Condicional) -->
                            <div class="input-group floating" id="pre-monto-group" style="display:none; margin-top:1rem;">
                                <input type="number" id="pre-monto" placeholder=" " step="0.01">
                                <label>Monto (S/)</label>
                            </div>
                        </div>

                        <!-- Section 3: Attachments -->
                        <div class="form-section">
                            <div class="section-header">
                                <h4>Adjuntos (Máx 4)</h4>
                            </div>
                            
                            <div class="photo-widget">
                                <input type="file" id="pre-file-input" accept="image/*" multiple class="file-input-hidden" onchange="app.handlePreingresoPhotos(this)" hidden>
                                
                                <div class="photo-controls" style="margin-bottom:10px;">
                                     <button type="button" class="btn-secondary" onclick="document.getElementById('pre-file-input').click()" style="width:100%;">
                                        <i class="fa-solid fa-camera"></i> Agregar Fotos
                                     </button>
                                </div>
                                <div id="pre-preview" class="photo-preview-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap:10px;"></div>
                            </div>
                        </div>

                    </div> 

                    <!-- Desktop Footer -->
                    <div class="modern-footer">
                        <button class="btn-secondary" onclick="app.closeModal()">Cancelar</button>
                        <button class="btn-primary" onclick="app.savePreingreso()">
                            Guardar <i class="fa-solid fa-save"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
        this.openModal(modalHtml, 'modern-modal');
    }

    togglePreingresoMonto() {
        const etiqueta = document.getElementById('pre-etiqueta').value;
        const montoGroup = document.getElementById('pre-monto-group');
        montoGroup.style.display = (etiqueta === 'Pedido Completo') ? 'block' : 'none';
        if (etiqueta !== 'Pedido Completo') document.getElementById('pre-monto').value = '';
    }

    handlePreingresoPhotos(input) {
        const files = Array.from(input.files);
        const currentImgs = document.querySelectorAll('#pre-preview img');

        if (files.length + currentImgs.length > 4) {
            alert("Máximo 4 fotos permitidas.");
            input.value = ''; // Reset
            return;
        }
        this.handlePhotoSelect(input, 'pre-preview', true);
    }

    // PHOTO LOGIC
    handlePhotoSelect(input, previewId, multiple = false) {
        const files = input.files;
        const container = document.getElementById(previewId);
        if (!multiple) container.innerHTML = '';

        Array.from(files).forEach(file => {
            // Resize before showing/storing (Max 1000px)
            this.resizeImage(file, 1000).then(base64 => {
                const img = document.createElement('img');
                img.src = base64;
                img.className = 'photo-thumb';
                img.dataset.base64 = base64; // API Expects this
                container.appendChild(img);
            });
        });
    }

    // Helper: Resize Image
    resizeImage(file, maxWidth) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.8)); // 80% Quality
                };
            };
        });
    }

    // PRODUCT ADDER LOGIC
    searchProductForGuia(input, event) {
        const term = input.value.toLowerCase().trim();
        const resultsDiv = document.getElementById('prod-search-results');

        // Handle "Enter" Key (Scanner behavior)
        if (event && event.key === 'Enter') {
            event.preventDefault(); // Stop form submit or other actions

            // 1. Try EXACT MATCH
            const exactProduct = this.data.products[term.toUpperCase()]; // Try upper (keys are usually upper) or exact key
            // Note: keys in this.data.products are the codes. 
            // If "666" matches a key exactly:

            // Actually, keys might be varying case. Let's find distinct key.
            const exactKey = Object.keys(this.data.products).find(k => k.toLowerCase() === term);

            if (exactKey) {
                // Exact code found.
                // Logic: "si tengo un unico producto cuyo codigo es igual '666' entonces se debe agregar automaticamente"
                // The key IS unique in the map. So if we found it, it's the one.

                // However, user said: "si tuviera dos productos 666a y 6667... mostrar lista"
                // This implies if I type "666", I shouldn't auto-pick "666a".
                // My logic matches: if I typed "666" and "666" exists, take it. 
                // If I typed "666" and only "666a" exists, finding exactKey for "666" will fail.

                this.selectProductForGuia(exactKey, this.data.products[exactKey].desc);
                // this.addProductToGuia(); // Handled inside selectProductForGuia now
                return;
            }

            // If not exact match, fall through to search results to show user "Hey, 666 doesn't exist, here is 666a, 666b..."
        }

        if (term.length < 2) {
            resultsDiv.style.display = 'none';
            return;
        }

        const matches = Object.entries(this.data.products)
            .filter(([code, p]) => code.toLowerCase().includes(term) || p.desc.toLowerCase().includes(term))
            .slice(0, 15); // Extended limit for visibility

        if (matches.length > 0) {
            resultsDiv.innerHTML = matches.map(([code, p]) => `
                    <div style="padding:0.5rem; border-bottom:1px solid #eee; cursor:pointer; font-size:0.9rem;"
                onmouseover="this.style.background='#f3f4f6'"
                onmouseout="this.style.background='white'"
                onclick="app.selectProductForGuia('${code}', '${p.desc.replace(/'/g, "")}')">
                    <strong>${code}</strong> - ${p.desc}
                </div>
                    `).join('');
            resultsDiv.style.display = 'block';
        } else {
            resultsDiv.style.display = 'none';
        }
    }

    selectProductForGuia(code, desc) {
        // Auto-Add Logic
        const qty = 1;

        // Add to temp list
        const existingIndex = this.tempGuiaProducts.findIndex(p => p.codigo === code);
        if (existingIndex >= 0) {
            this.tempGuiaProducts[existingIndex].cantidad += 1;
        } else {
            this.tempGuiaProducts.push({ codigo: code, descripcion: desc, cantidad: qty });
        }

        this.renderTempProducts();

        // Clear UI & Keep Focus
        document.getElementById('prod-search').value = '';
        delete document.getElementById('prod-search').dataset.code;
        document.getElementById('prod-search-results').style.display = 'none';
        document.getElementById('prod-search').focus();
    }

    addProductToGuia() {
        const input = document.getElementById('prod-search');
        const code = input.dataset.code;
        const val = input.value;

        // Extract code if manually typed "CODE - DESC"
        const finalCode = code || (val.includes('-') ? val.split('-')[0].trim() : val.trim());
        const qty = 1; // Default to 1

        if (!finalCode) return alert('Seleccione un producto');
        // Validate existence?
        if (!this.data.products[finalCode]) {
            if (!confirm('El código no parece existir en la lista cargada. ¿Agregar igual?')) return;
        }

        const desc = this.data.products[finalCode] ? this.data.products[finalCode].desc : 'Producto Manual';

        // Check if already exists to just add qty?
        const existingIndex = this.tempGuiaProducts.findIndex(p => p.codigo === finalCode);
        if (existingIndex >= 0) {
            this.tempGuiaProducts[existingIndex].cantidad += 1;
        } else {
            this.tempGuiaProducts.push({ codigo: finalCode, descripcion: desc, cantidad: qty });
        }

        this.renderTempProducts();

        // Reset inputs
        input.value = '';
        delete input.dataset.code;
        input.focus();
    }

    renderTempProducts() {
        const container = document.getElementById('temp-prods-list');
        if (this.tempGuiaProducts.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:1.5rem; color:#999; font-size:0.9rem;">Ningún producto agregado</div>';
            return;
        }

        const isIngreso = this.tempGuiaType === 'INGRESO';

        container.innerHTML = this.tempGuiaProducts.map((p, index) => `
            <div class="temp-item" style="padding: 0.75rem; align-items: start; display: flex; flex-wrap: wrap; gap: 1rem; border-bottom: 1px solid #f0f0f0;">
                <div style="flex:1; min-width: 200px;">
                    <div style="font-weight:bold; font-size:1rem; color: #333;">${p.codigo}</div>
                    <div style="font-size:0.85rem; color:#666;">${p.descripcion}</div>
                    
                    ${isIngreso ? `
                        <div style="margin-top: 0.5rem;">
                            <label style="font-size: 0.75rem; color: #888; display: block; margin-bottom: 2px;">Vencimiento</label>
                            <input type="date" value="${p.fechaVencimiento || ''}" 
                                   onchange="app.updateTempProp(${index}, 'fechaVencimiento', this.value)"
                                   style="border: 1px solid #ddd; border-radius: 6px; padding: 4px; font-size: 0.85rem; color: #333;" />
                        </div>
                    ` : ''}
                </div>
                
                <div style="display:flex; align-items:center; gap:0.5rem; background: #f3f4f6; padding: 4px; border-radius: 6px; align-self: center;">
                    <button type="button" onclick="app.updateTempProductQty(${index}, -1)" style="width:30px; height:30px; border:none; background:white; border-radius:4px; font-weight:bold; cursor:pointer; color:#666;">-</button>
                    <span style="font-weight:bold; min-width:30px; text-align:center; font-size:1rem;">${p.cantidad}</span>
                    <button type="button" onclick="app.updateTempProductQty(${index}, 1)" style="width:30px; height:30px; border:none; background:white; border-radius:4px; font-weight:bold; cursor:pointer; color:var(--primary-color);">+</button>
                </div>

                <button onclick="app.removeTempProduct(${index})" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:1.1rem; padding: 0.5rem; align-self: center;">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `).join('');
    }

    updateTempProp(index, prop, value) {
        if (this.tempGuiaProducts[index]) {
            this.tempGuiaProducts[index][prop] = value;
        }
    }

    updateTempProductQty(index, change) {
        const item = this.tempGuiaProducts[index];
        const newQty = item.cantidad + change;

        if (newQty < 1) {
            if (confirm('¿Desea eliminar este producto?')) {
                this.removeTempProduct(index);
            }
        } else {
            item.cantidad = newQty;
            this.renderTempProducts();
        }
    }

    removeTempProduct(index) {
        this.tempGuiaProducts.splice(index, 1);
        this.renderTempProducts();
    }

    // SAVE LOGIC
    // SAVE LOGIC
    async savePreingreso() {
        const provider = document.getElementById('pre-proveedor').value;
        const comment = document.getElementById('pre-comentario').value;
        const etiqueta = document.getElementById('pre-etiqueta').value;
        const comprobante = document.getElementById('pre-comprobante').value;
        const monto = document.getElementById('pre-monto').value;

        const images = Array.from(document.querySelectorAll('#pre-preview img')).map(img => img.dataset.base64);

        if (!provider) return alert('Proveedor requerido');

        // Validation for Monto
        if (etiqueta === 'Pedido Completo' && !monto) {
            return alert('Debe ingresar el Monto para Pedido Completo');
        }

        // Fix: Select correct buttons (Mobile + Desktop)
        const buttons = document.querySelectorAll('.save-mobile-btn, .modern-footer .btn-primary');
        buttons.forEach(b => {
            b.disabled = true;
            b.dataset.originalText = b.innerHTML;
            b.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        });

        // 1. OPTIMISTIC UI: Create Temp Item
        const tempId = 'TEMP-' + Date.now();
        const now = new Date();
        const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        const tempItem = {
            id: tempId,
            fecha: dateStr,
            proveedor: provider,
            etiqueta: etiqueta, // PENDIENTE/PROCESADO typically comes from backend, but we act as PENDIENTE
            estado: 'GUARDANDO...',
            fotos: images || [],
            comentario: comment,
            isTemp: true
        };

        if (!this.data.movimientos) this.data.movimientos = { preingresos: [] };
        if (!this.data.movimientos.preingresos) this.data.movimientos.preingresos = [];

        this.data.movimientos.preingresos.unshift(tempItem);
        this.filterPreingresosList();
        this.closeModal();
        this.showToast("Guardando preingreso en segundo plano...", "info");

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                redirect: 'follow', // FIXED
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({
                    action: 'savePreingreso',
                    payload: {
                        proveedor: provider,
                        comentario: comment,
                        fotos: images,
                        etiqueta: etiqueta,
                        comprobante: comprobante,
                        monto: monto
                    }
                })
            });
            const result = await response.json();

            if (result.status === 'success') {
                // Update Temp Item
                const realId = result.id || result.data?.id; // backend response might vary

                const idx = this.data.movimientos.preingresos.findIndex(p => p.id === tempId);
                if (idx !== -1) {
                    this.data.movimientos.preingresos[idx].id = realId || 'NEW-' + Date.now();
                    this.data.movimientos.preingresos[idx].estado = 'PENDIENTE'; // Default
                    delete this.data.movimientos.preingresos[idx].isTemp;
                }

                this.filterPreingresosList();
                this.showToast("Preingreso guardado.", "success");
                this.loadMovimientosData(true); // Sync
            } else {
                throw new Error(result.message);
            }
        } catch (e) {
            console.error(e);
            alert('Error al guardar: ' + e.message);
            // Revert
            this.data.movimientos.preingresos = this.data.movimientos.preingresos.filter(p => p.id !== tempId);
            this.filterPreingresosList();
        }
    }

    async saveGuia(type) {
        console.log('saveGuia called with type:', type);

        const provider = document.getElementById('guia-proveedor').value;
        const comment = document.getElementById('guia-comentario').value;
        const preingresoId = document.getElementById('guia-preingreso') ? document.getElementById('guia-preingreso').value : null;

        // Photo (Single for Guia)
        const imgEl = document.querySelector('#guia-preview img');
        const photo = imgEl ? imgEl.dataset.base64 : null;

        if (!provider) return alert('Proveedor/Destino requerido');

        // Disable ALL save buttons to prevent double-click
        const buttons = document.querySelectorAll('.save-mobile-btn, .modal-footer .btn-primary');
        buttons.forEach(b => {
            b.disabled = true;
            b.dataset.originalText = b.innerHTML;
            b.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        });

        // 1. OPTIMISTIC UI: Create Temp Item
        const tempId = 'TEMP-' + Date.now();
        const now = new Date();
        const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        const tempGuia = {
            id: tempId,
            fecha: dateStr,
            proveedor: provider,
            usuario: this.currentUser.username,
            tipo: type,
            estado: 'GUARDANDO...', // Special status
            total_items: this.tempGuiaProducts.length, // Approx?
            comentario: comment,
            isTemp: true // Flag
        };

        // Inject into current list
        if (!this.data.movimientos) this.data.movimientos = { guias: [] };
        if (!this.data.movimientos.guias) this.data.movimientos.guias = [];

        this.data.movimientos.guias.unshift(tempGuia);
        this.filterGuiasList(); // Update UI immediately
        this.closeModal();
        this.showToast("Guardando guía en segundo plano...", "info");

        // 2. SEND DATA ONLY (Fast)
        const payload = {
            tipo: type,
            usuario: this.currentUser.username,
            proveedor: provider,
            comentario: comment,
            productos: this.tempGuiaProducts,
            idPreingreso: preingresoId,
            foto: null // We send this LATER
        };

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({
                    action: 'saveGuia',
                    payload: payload
                })
            });
            const result = await response.json();

            if (result.status === 'success') {
                // Success: Update Temp Item with Real Data
                const realId = result.data.idGuia || result.id; // Just in case

                // Find and update in list
                const idx = this.data.movimientos.guias.findIndex(g => g.id === tempId);
                if (idx !== -1) {
                    this.data.movimientos.guias[idx].id = realId;
                    this.data.movimientos.guias[idx].estado = 'EN PROGRESO'; // Or whatever default is
                    delete this.data.movimientos.guias[idx].isTemp; // Remove flag
                }

                // Re-render to show real ID/Status
                this.filterGuiasList();

                this.showToast("Guía guardada exitosamente.", "success");
                // Background refresh to be safe (syncs details etc)
                this.loadMovimientosData(true);

                // 2. UPLOAD PHOTO BACKGROUND
                if (photo && realId) {
                    this.uploadGuiaPhotoBackground(realId, photo);
                }

            } else {
                throw new Error(result.message);
            }
        } catch (e) {
            console.error(e);
            alert('Error al guardar: ' + e.message);

            // Revert Optimistic Change
            this.data.movimientos.guias = this.data.movimientos.guias.filter(g => g.id !== tempId);
            this.filterGuiasList();

            // Re-open modal? Ideally yes, but complex state restore. For now, alert is enough.
        }
    }

    async uploadGuiaPhotoBackground(idGuia, base64) {
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({
                    action: 'uploadGuiaPhoto',
                    payload: { idGuia: idGuia, foto: base64 }
                })
            });
            const result = await response.json();
            if (result.status === 'success') {
                this.showToast("Foto subida correctamente.", "success");
                this.loadMovimientosData(true);
            } else {
                this.showToast("Error subiendo foto: " + result.message, "error");
            }
        } catch (e) {
            console.error("Background Upload Error", e);
            this.showToast("Error de red subiendo foto.", "error");
        }
    }

    showToast(msg, type = 'info') {
        let toast = document.getElementById('app-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'app-toast';
            toast.style.cssText = 'position:fixed; bottom:20px; right:20px; padding:12px 24px; background:#333; color:white; border-radius:8px; z-index:9999; box-shadow:0 4px 6px rgba(0,0,0,0.1); font-size:0.9rem; transition: opacity 0.3s; opacity:0;';
            document.body.appendChild(toast);
        }

        toast.textContent = msg;
        toast.style.background = type === 'error' ? '#e74c3c' : (type === 'success' ? '#2ecc71' : '#333');
        toast.style.opacity = '1';

        setTimeout(() => {
            toast.style.opacity = '0';
        }, 4000);
    }

    toggleEditSeparated(id) {
        const input = document.getElementById(`edit-qty-${id}`);
        const btn = document.getElementById(`btn-edit-${id}`);
        if (!input || !btn) return;

        if (input.disabled) {
            // Enable
            input.disabled = false;
            input.focus();
            btn.innerHTML = '<i class="fa-solid fa-check"></i>'; // Check icon for Save
            btn.style.color = '#2e7d32'; // Green for save
        } else {
            // Save
            const newVal = parseFloat(input.value);
            if (isNaN(newVal) || newVal < 0) {
                alert('Cantidad inválida');
                return;
            }
            this.saveSeparatedEdit(id, newVal, btn, input);
        }
    }



    async saveSeparatedEdit(id, newVal, btn, input) {
        if (newVal < 0.1) {
            alert('La cantidad mínima es 0.1');
            // Find original value to reset input
            const originalReq = this.data.requests.find(r => r.idSolicitud === id);
            if (originalReq) {
                input.value = originalReq.cantidad;
            }
            return;
        }

        // Optimistic Update
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        input.disabled = true; // Disable during save

        try {
            // Update Local Data
            const reqIndex = this.data.requests.findIndex(r => r.idSolicitud === id);
            if (reqIndex !== -1) {
                this.data.requests[reqIndex].cantidad = newVal;
            }

            // Re-render Zone to reflect changes
            const activeBtn = document.querySelector('.client-buttons-group .btn-zone.active');
            if (activeBtn) {
                const zone = activeBtn.dataset.client;
                const zoneContainer = document.getElementById('zone-content');
                if (zoneContainer && zone) this.renderZonePickup(zone, zoneContainer);
            }


            // API Call
            const response = await fetch(API_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({
                    action: 'updateSeparatedQuantity',
                    payload: { id: id, quantity: newVal }
                })
            });
            const result = await response.json();
            if (result.status !== 'success') {
                alert('Error al guardar: ' + result.message);
                // Revert UI to previous state or reload data if error is critical
                // For now, just alert and leave the optimistic update.
                // A full reload (this.fetchRequests()) might be better for robust error handling.
            } else {
                this.showToast(result.message || 'Cantidad actualizada', 'success');
            }

        } catch (e) {
            console.error(e);
            alert('Error de conexión');
            // Revert UI on network error
            input.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-check"></i>';
        }
    }

    async deleteSeparatedRequest(id) {
        if (!confirm('¿Eliminar este ítem separado? Regresará a la lista de pendientes.')) return;

        // Optimistic Delete
        const reqIndex = this.data.requests.findIndex(r => r.idSolicitud === id);
        if (reqIndex !== -1) {
            this.data.requests.splice(reqIndex, 1);
        }

        // Re-render
        const activeBtn = document.querySelector('.client-buttons-group .btn-zone.active');
        if (activeBtn) {
            const zone = activeBtn.dataset.client;
            const zoneContainer = document.getElementById('zone-content');
            if (zoneContainer && zone) this.renderZonePickup(zone, zoneContainer);
        }

        try {
            // API Call with Qty 0 to trigger deletion in backend
            const response = await fetch(API_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({
                    action: 'updateSeparatedQuantity',
                    payload: { id: id, quantity: 0 }
                })
            });
            const result = await response.json();
            if (result.status !== 'success') {
                alert('Error al eliminar: ' + result.message);
                this.fetchRequests(); // Reload on error to ensure data consistency
            } else {
                this.showToast(result.message || 'Ítem eliminado y regresado a pendientes', 'info');
            }
        } catch (e) {
            console.error(e);
            alert('Error al conectar con servidor');
            this.fetchRequests(); // Reload on network error
        }
    }

    async handleDispatchZone(zone) {
        // 1. Filter Items to Dispatch
        // Re-use logic: Same Day + User/Zone + Category 'separado'
        const todayStr = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }); // dd/mm/yyyy

        // We need robust "today" check matching the server format if possible, 
        // but local check is usually fine if we only care about what's visible.
        // Let's assume the user sees what they should dispatch.

        const itemsToDispatch = [];
        const zoneLower = zone.toLowerCase();

        this.data.requests.forEach(req => {
            if (req.usuario.toLowerCase() !== zoneLower) return;
            if (req.categoria !== 'separado') return;
            // Date check passed implicitly if it's in the list? 
            // Better to match what renderZonePickup does, but we can trust 'separado' status for the active view.
            itemsToDispatch.push(req);
        });

        if (itemsToDispatch.length === 0) {
            alert('No hay ítems separados para despachar.');
            return;
        }

        if (!confirm(`¿Confirmar despacho de ${itemsToDispatch.length} ítems para ${zone.toUpperCase()}?`)) return;

        const btn = document.querySelector('.fab-dispatch');
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            btn.disabled = true;
        }

        // PRE-OPEN WINDOW TO AVOID POPUP BLOCKER
        const printWindow = window.open('', '_blank', 'width=450,height=600');
        if (printWindow) {
            printWindow.document.write('<html><body style="font-family:sans-serif; text-align:center; padding-top:50px;"><h3>Procesando Despacho...</h3><p>Por favor espere.</p></body></html>');
        } else {
            console.warn("Popup blocked");
        }

        try {
            // Prepare unique items for receipt (aggregate by code)
            const receiptItems = {};
            itemsToDispatch.forEach(req => {
                const code = req.codigo;
                if (!receiptItems[code]) {
                    const prod = this.data.products[code] || { desc: 'Desconocido' };
                    receiptItems[code] = { code, desc: prod.desc, qty: 0 };
                }
                receiptItems[code].qty += parseFloat(req.cantidad);
            });
            const receiptArray = Object.values(receiptItems);

            // API Call
            const payload = {
                zone: zone,
                usuario: this.currentUser ? this.currentUser.username : 'Admin',
                items: itemsToDispatch.map(r => ({
                    idSolicitud: r.idSolicitud,
                    codigo: String(r.codigo),
                    cantidad: r.cantidad,
                    desc: '' // optional
                }))
            };

            const response = await fetch(API_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({
                    action: 'processZoneDispatch',
                    payload: payload
                })
            });

            const result = await response.json();

            if (result.status === 'success') {
                this.showToast('Despacho Exitoso', 'success');

                // Print Receipt (Using pre-opened window)
                if (printWindow) {
                    this.printDispatchReceipt(printWindow, zone, receiptArray, result.data.idGuia, result.data.date);
                }

                // Update Local Data (Mark as 'despachado')
                itemsToDispatch.forEach(item => {
                    const ref = this.data.requests.find(r => r.idSolicitud === item.idSolicitud);
                    if (ref) ref.categoria = 'despachado';
                });

                // Re-render
                const zoneContainer = document.getElementById('zone-content');
                if (zoneContainer) this.renderZonePickup(zone, zoneContainer);

            } else {
                alert('Error al despachar: ' + result.message);
                if (printWindow) printWindow.close(); // Close empty window
                if (btn) {
                    btn.innerHTML = '<i class="fa-solid fa-truck-fast fab-icon"></i>';
                    btn.disabled = false;
                }
            }

        } catch (e) {
            console.error(e);
            if (printWindow) printWindow.close(); // Close empty window on error
            alert('Error de conexión: ' + e.message);
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-truck-fast fab-icon"></i>';
                btn.disabled = false;
            }
        }
    }

    printDispatchReceipt(printWindow, zone, items, guiaId, date) {
        if (!printWindow) {
            console.error('Print window not provided or blocked');
            return;
        }
        const totalQty = items.reduce((acc, i) => acc + i.qty, 0);

        // printWindow is already opened, just write to it.
        printWindow.document.open();
        printWindow.document.write(`
            <html>
            <head>
                <title>Ticket de Despacho</title>
                <style>
                    @page { margin: 0; size: auto; }
                    body { 
                        font-family: 'Courier New', monospace; 
                        margin: 0; 
                        padding: 5px; 
                        width: 100%; 
                        box-sizing: border-box;
                        font-size: 12px;
                    }
                    .header { 
                        text-align: center; 
                        margin-bottom: 10px; 
                        border-bottom: 2px dashed black; 
                        padding-bottom: 10px; 
                    }
                    .info { 
                        margin-bottom: 15px; 
                        font-size: 13px;
                    }
                    
                    /* Block Layout for Smart Page Breaks */
                    .item-container {
                        display: flex;
                        flex-direction: column;
                    }
                    .item-block {
                        display: flex;
                        flex-direction: column;
                        border-bottom: 1px dotted #ccc;
                        padding: 6px 0;
                        page-break-inside: avoid; /* CRITICAL: Prevent split */
                    }
                    .item-row-top {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        margin-bottom: 4px;
                    }
                    .item-desc {
                        font-weight: bold;
                        font-size: 13px;
                        width: 85%;
                        overflow-wrap: break-word; /* Ensure wrapping */
                    }
                    .item-qty {
                        font-weight: 900;
                        font-size: 16px;
                        width: 15%;
                        text-align: right;
                        white-space: nowrap;
                    }
                    .item-code {
                        font-size: 11px;
                        color: #555;
                    }
                /* 2. QR Code for Guide ID instead of text */
                .qr-code {
                    display: block;
                    margin: 5px auto;
                    width: 100px;
                    height: 100px;
                }
                .header-text { margin-bottom: 5px; }

                /* 3. Product Code Bold */
                .prod-code {
                    font-size: 11px;
                    color: #000;
                    font-weight: 700; /* Bold as requested */
                }

                .footer {
                    margin-top: 20px;
                    text-align: center;
                    border-top: 1px solid #000;
                    padding-top: 5px;
                    font-size: 12px;
                }
                
                .recibido-conforme {
                    font-weight: 600; /* Semi-bold (thicker but not full bold) */
                    font-size: 13px; /* Slightly larger */
                    margin-top: 5px;
                }

                .signature-line {
                    margin-top: 40px;
                    border-bottom: 1px solid #000;
                    width: 80%;
                    margin-left: auto;
                    margin-right: auto;
                }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2 style="margin:5px 0;">LEVO ERP</h2>
                    <div style="font-weight:bold;">GUÍA DE SALIDA</div>
                    <!-- QR Code uses simple API -->
                    <img class="qr-code" src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${guiaId}" alt="QR ID">
                </div>
                
                <div class="info">
                    <div style="font-size:14px; margin-bottom:4px;"><strong>Destino:</strong> ${zone.toUpperCase()}</div>
                    <div><strong>Fecha:</strong> ${date}</div>
                </div>

                <div class="item-container">
                    ${items.map(item => `
                        <div class="item-block">
                            <div class="item-row-top">
                                <div class="item-desc">${item.desc}</div>
                                <div class="item-qty">${item.qty}</div>
                            </div>
                            <div class="prod-code"><strong>COD: ${item.code}</strong></div>
                        </div>
                    `).join('')}
                </div>

                <div class="total">TOTAL: ${totalQty}</div>
                
                <div class="footer">
                    <div class="recibido-conforme">Recibido Conforme</div>
                    <div class="signature-line"></div>
                </div>
                <script>
                    window.onload = function() {
                        window.print();
                        setTimeout(() => window.close(), 500);
                    };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    }

    renderZonePickup(zone, container) {
        // 0. PRESERVE SCROLL POSITION
        const pendingScrollDiv = container.querySelector('.column-pending .scroll-container');
        const prevScrollTop = pendingScrollDiv ? pendingScrollDiv.scrollTop : 0;

        // 1. Get Today's Date for Filtering (Local String Comparison)
        // Manually format to match Server "dd/MM/yyyy" to ensure consistency
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const yyyy = today.getFullYear();
        const localTodayStr = `${dd}/${mm}/${yyyy}`;

        const isSameDay = (dateStr, id) => {
            // ALWAYS SHOW MOCKS (Optimistic Updates)
            if (id && String(id).startsWith('temp-')) return true;

            if (!dateStr) return false;
            // Strictly match "Today" (dd/MM/yyyy)
            return dateStr.startsWith(localTodayStr);
        };

        // Helper to parse "dd/MM/yyyy HH:mm:ss" for Sorting
        const parseDateTime = (str) => {
            if (!str) return 0;
            try {
                const [datePart, timePart] = str.split(' ');
                const [d, m, y] = datePart.split('/').map(Number);
                let h = 0, min = 0, sec = 0;
                if (timePart) { [h, min, sec] = timePart.split(':').map(Number); }
                return new Date(y, m - 1, d, h, min, sec).getTime();
            } catch (e) { return 0; }
        };

        // 2. Aggregate Data Logic
        // Map<ProductCode, { requested: 0, separated: 0, desc, uniqueIds: [] }>
        const aggregator = {};

        // Normalize Zone Name
        const targetZone = zone.toLowerCase(); // 'zona1', 'zona2'

        this.data.requests.forEach(req => {
            // Filter by Zone
            if (req.usuario.toLowerCase() !== targetZone) return;

            // Check Date

            // Check Date
            if (!isSameDay(req.fecha, req.idSolicitud)) {
                return;
            }

            // Normalize Code to String to prevent mismatch
            const codeKey = String(req.codigo).trim();
            const reqTs = parseDateTime(req.fecha);

            // Initialize Aggregator Item
            if (!aggregator[codeKey]) {
                const product = this.data.products[codeKey] || { desc: 'Producto Desconocido - ' + codeKey, img: '' };
                aggregator[codeKey] = {
                    code: codeKey,
                    desc: product.desc,
                    img: product.img, // Pass image
                    requested: 0, // Sum of 'solicitado'
                    separated: 0, // Sum of 'separado'
                    dispatched: 0, // Sum of 'despachado'
                    reqIds: [],    // To track at least one ID for API call
                    lastTs: 0     // Track latest timestamp for sorting
                };
            }
            // Update Last Timestamp (Max) logic
            if (reqTs > aggregator[codeKey].lastTs) {
                aggregator[codeKey].lastTs = reqTs;
            }

            const qty = parseFloat(req.cantidad);
            const cat = String(req.categoria).trim().toLowerCase(); // Normalize Category

            if (cat === 'solicitado') {
                aggregator[codeKey].requested += qty;
                aggregator[codeKey].reqIds.push(req.idSolicitud);
            } else if (cat === 'separado') {
                aggregator[codeKey].separated += qty;
                // Add tracking
                if (!aggregator[codeKey].sepIds) aggregator[codeKey].sepIds = [];
                aggregator[codeKey].sepIds.push(req.idSolicitud);
            } else if (cat === 'despachado') {
                aggregator[codeKey].dispatched += qty;
            }

            // Collect individual request for Detail View
            if (!aggregator[codeKey].allRequests) aggregator[codeKey].allRequests = [];
            aggregator[codeKey].allRequests.push({
                status: cat,
                qty: qty,
                time: req.fecha.split(' ')[1] || '',
                id: req.idSolicitud
            });
        });

        // Split into Lists
        const pendingList = [];
        const separatedList = [];

        Object.values(aggregator).forEach(item => {
            const pendingQty = item.requested - (item.separated + item.dispatched);

            // Logic: What is requested but NOT separated yet?
            // Actually, usually 'solicitado' records convert to 'separado'. 
            // If the logic is "Movement based": 
            // - 'solicitado' = Pending
            // - 'separado' = Done
            // But they might duplicate lines. 
            // Simplified view: Show 'solicitado' items in left, 'separado' items in right.

            // STRICT LOGIC: Mutually Exclusive Columns
            // If ANY amount is separated -> Ends up in Separated Column (Removes from Pending).
            if (item.separated > 0) {
                const sepId = item.sepIds && item.sepIds.length > 0 ? item.sepIds[item.sepIds.length - 1] : null;
                separatedList.push({ ...item, qtyToShow: item.separated, type: 'separated', useId: sepId });
            }
            else if (pendingQty > 0) {
                // Only show in Pending if Not Touched Yet (separated === 0)
                pendingList.push({ ...item, qtyToShow: pendingQty, type: 'pending', useId: item.reqIds[0] });
            }
        });

        // 2b. SORT SEPARATED LIST (Newest First)
        separatedList.sort((a, b) => b.lastTs - a.lastTs);

        const renderCard = (item, isPending) => {
            // Image Logic for Requests
            const imgSrc = item.img ? item.img : 'recursos/defaultImageProduct.png';
            const imgHtml = `<img src="${imgSrc}" class="card-img" alt="${item.desc}" referrerpolicy="no-referrer" loading="lazy" onerror="app.handleImageError(this)">`;

            // Combine code and desc for search, normalized
            const searchTerms = `${item.code} ${item.desc} `.toLowerCase();

            // Generate Request List HTML for Back
            let requestListHtml = '';
            if (isPending && item.allRequests && item.allRequests.length > 0) {
                requestListHtml = item.allRequests.map(r => {
                    let shadowColor = '#ccc';
                    let borderColor = '#ccc';
                    let statusText = r.status;

                    if (r.status === 'solicitado') {
                        shadowColor = 'rgba(46, 204, 113, 0.6)'; // Green
                        borderColor = '#2ecc71';
                    } else if (r.status === 'separado') {
                        shadowColor = 'rgba(243, 156, 18, 0.6)'; // Orange
                        borderColor = '#f39c12';
                    } else if (r.status === 'despachado') {
                        shadowColor = 'rgba(231, 76, 60, 0.6)'; // Red
                        borderColor = '#e74c3c';
                    }

                    return `
                        <div style="
                            padding: 6px 10px; 
                            margin-bottom: 8px; 
                            background: white; 
                            border-radius: 6px; 
                            border-left: 4px solid ${borderColor};
                            box-shadow: 2px 2px 6px ${shadowColor};
                            display: flex; 
                            justify-content: space-between; 
                            align-items: center;
                            font-size: 0.85rem;
                        ">
                            <div>
                                <div style="font-weight: bold; text-transform: capitalize; color:#333;">${statusText}</div>
                                <div style="font-size: 0.75rem; color: #888;">${r.time}</div>
                            </div>
                            <div style="font-weight: bold; font-size: 1rem;">${r.qty}</div>
                        </div>
                     `;
                }).join('');
            }


            return `
                    <div class="product-card request-card" data-search="${searchTerms}" onclick="this.classList.toggle('flipped')">
                        <div class="product-card-inner" style="border-left: 4px solid ${isPending ? 'var(--primary-color)' : '#2e7d32'};">
                            <!-- FRONT -->
                            <div class="card-front">
                                <div class="card-img-container" style="height:140px;">
                                    ${imgHtml}
                                </div>
                                <div class="card-content">
                                    <div class="card-header">
                                        <div>
                                            <div class="card-desc" style="font-weight:700; color:#000;">${item.desc}</div>
                                            <div class="card-code" style="color:#666; font-size:0.85rem;">${item.code}</div>
                                        </div>
                                        <div style="text-align:right;">
                                            <div style="font-weight:bold; font-size:1.2rem;">${item.qtyToShow} <span style="font-size:0.8rem;">un</span></div>
                                        </div>
                                    </div>
                                    ${isPending ? `
                             <div class="card-inputs" style="margin-top:auto; padding-top:1rem; border-top:1px solid #eee; display:flex; gap:0.5rem; justify-content:flex-end;" onclick="event.stopPropagation()">
                                 <div style="display:flex; align-items:center; gap:0.5rem;">
                                    <label style="font-size:0.8rem;">Cant:</label>
                                    <input type="number" id="qty-${item.useId}" value="${item.qtyToShow}" min="1" max="${item.qtyToShow}" style="width:60px; padding:5px; text-align:center; border:1px solid #ddd; border-radius:4px;">
                                 </div>
                                 <button class="btn-primary" onclick="app.moveToSeparated(this, '${item.useId}')">Separar</button>
                               </div>
                            ` : `
                               <div style="margin-top:auto; padding-top:0.5rem; text-align:right;">
                                    <span style="color:#2e7d32; font-weight:600; font-size:0.85rem;"><i class="fa-solid fa-check-circle"></i> Separado</span>
                               </div>
                            `}
                                </div>
                            </div>

                            <!-- BACK -->
                            <div class="card-back">
                                <h5 style="margin-bottom:0.5rem; border-bottom:1px solid #eee; padding-bottom:0.5rem;">
                                    ${isPending ? 'Historial Solicitudes' : 'Ítem Separado'}
                                </h5>
                                
                                ${isPending ? `
                                    <div style="flex:1; overflow-y: auto; padding: 2px; max-height: 250px; scrollbar-width: thin;">
                                        ${requestListHtml}
                                    </div>
                                ` : `
                                    <div class="back-label">Descripción</div>
                                    <div class="back-value">${item.desc}</div>
                                     
                                    <!-- Delete Button (Top Right) -->
                                    <button class="btn-delete-separated" onclick="app.deleteSeparatedRequest('${item.useId}')" 
                                            title="Eliminar Separación (Regresar a Pendientes)">
                                        <i class="fa-solid fa-rectangle-xmark"></i>
                                    </button>
                                    


                                    <div class="edit-qty-section" style="margin-top:auto; padding-top:10px; border-top:1px solid #eee;" onclick="event.stopPropagation()">
                                        <div style="font-size:0.8rem; color:#666; margin-bottom:5px;">Editar Cantidad:</div>
                                        <div style="display:flex; align-items:center; gap:8px; justify-content:center;">
                                            <input type="number" id="edit-qty-${item.useId}"  
                                                   value="${item.qtyToShow}" 
                                                   disabled 
                                                   min="0.1" step="0.1"
                                                   style="width:60px; padding:5px; text-align:center; border:1px solid #ddd; border-radius:4px;">
                                            <button class="btn-icon" id="btn-edit-${item.useId}" onclick="app.toggleEditSeparated('${item.useId}')" style="background:none; border:none; cursor:pointer; font-size:1.2rem; color:#666;">
                                                <i class="fa-solid fa-pencil"></i>
                                            </button>
                                        </div>
                                    </div>
                                `}
                             </div>
                        </div>
                </div>`;
        };

        const hasSeparated = separatedList.length > 0;

        const isCollapsed = separatedList.length === 0;

        container.innerHTML = `
                    <!--Flux Container-->
                        <div style="display: flex; flex-direction: row; flex-wrap: nowrap; gap: 2rem; align-items: start; height: 85vh; overflow: hidden;">

                            <!-- COLUMN 1: PENDING -->
                            <div class="column-pending" style="flex: 1; min-width: 0; background: #f8f9fa; padding: 1rem; border-radius: 8px; display: flex; flex-direction: column; height: 100%; transition: all 0.3s ease;">
                                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #ddd; padding-bottom:0.5rem; margin-bottom: 0.5rem; flex-shrink: 0;">
                                    <h5 style="color: var(--primary-color); margin:0;">
                                        <i class="fa-solid fa-list-ul"></i> Pendientes (${pendingList.length})
                                    </h5>
                                    ${new Date().getHours() >= 16 ?
                `<button class="btn-sm" style="background:#666; color:white; border:none; border-radius:4px;" 
                                                 title="Imprimir Pendientes" onclick="app.printPendingList('${zone}')">
                                            <i class="fa-solid fa-print"></i> Imprimir
                                         </button>` : ''
            }
                                </div>
                                <!-- Search Input Pending -->
                                <div style="margin-bottom: 1rem; position: relative; flex-shrink: 0;">
                                    <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #999;"></i>
                                    <input type="text" placeholder="Filtrar pendientes..." onkeyup="app.filterColumnList(this, 'column-pending')"
                                        style="width: 100%; padding: 8px 10px 8px 32px; border: 1px solid #ddd; border-radius: 20px; outline: none;">
                                </div>
                                <div class="scroll-container" style="flex: 1; overflow-y: auto; padding-right: 5px; display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); grid-auto-rows: max-content; gap: 1rem; align-content: start;">
                                    ${pendingList.length > 0
                ? pendingList.map(i => renderCard(i, true)).join('')
                : '<div style="grid-column: 1 / -1; text-align:center; padding:2rem; color:#999;">Todo al día 🎉</div>'}
                                </div>
                            </div>

                            <!-- COLUMN 2: SEPARATED -->
                            <div class="column-separated" style="${isCollapsed ? 'width: 320px; flex: 0 0 320px;' : 'flex: 1; min-width: 0;'} background: #e8f5e9; padding: 1rem; border-radius: 8px; display: flex; flex-direction: column; height: 100%; transition: all 0.3s ease;">
                                <h5 style="color: #2e7d32; border-bottom:1px solid #a5d6a7; padding-bottom:0.5rem; flex-shrink: 0; margin-bottom: 0.5rem;">
                                    <i class="fa-solid fa-boxes-packing"></i> Separados (${separatedList.length})
                                </h5>
                                <!-- Search Input Separated -->
                                <div style="margin-bottom: 1rem; position: relative; flex-shrink: 0;">
                                    <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #66bb6a;"></i>
                                    <input type="text" placeholder="Filtrar separados..." onkeyup="app.filterColumnList(this, 'column-separated')"
                                        style="width: 100%; padding: 8px 10px 8px 32px; border: 1px solid #a5d6a7; border-radius: 20px; outline: none; background: #fff;">
                                </div>
                                <div class="scroll-container" style="flex: 1; overflow-y: auto; padding-right: 5px; display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); grid-auto-rows: max-content; gap: 1rem; align-content: start;">
                                    ${separatedList.length > 0
                ? separatedList.map(i => renderCard(i, false)).join('')
                : '<div style="grid-column: 1 / -1; text-align:center; padding:2rem; color:#81c784; font-style:italic;">Nada separado aún</div>'}
                                </div>
                            </div>
                        </div>
                        
                        ${separatedList.length > 0 ? `
                        <button class="fab-dispatch" onclick="app.handleDispatchZone('${zone}')" title="Despachar ${separatedList.length} ítems">
                            <i class="fa-solid fa-truck-fast fab-icon"></i>
                        </button>` : ''}
                `;

        // 3. RESTORE SCROLL POSITION
        requestAnimationFrame(() => {
            const newPendingScroll = container.querySelector('.column-pending .scroll-container');
            if (newPendingScroll && prevScrollTop > 0) {
                newPendingScroll.scrollTop = prevScrollTop;
            }
        });
    }
    printPendingList(zone) {
        // 1. Re-aggregate Pending Data
        const today = new Date();
        const isSameDay = (dateStr) => {
            if (!dateStr) return false;
            let d;
            if (typeof dateStr === 'string' && dateStr.includes('/')) {
                const parts = dateStr.split('/');
                if (parts.length === 3) {
                    d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
                }
            } else {
                d = new Date(dateStr);
            }
            if (!d || isNaN(d.getTime())) return false;
            const diffDays = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            return diffDays === 0 || diffDays === 1; // Today/Tomorrow match
        };

        const targetZone = zone.toLowerCase();
        const aggregator = {};

        this.data.requests.forEach(req => {
            if (req.usuario.toLowerCase() !== targetZone) return;
            if (!isSameDay(req.fecha)) return;

            const codeKey = String(req.codigo).trim();
            if (!aggregator[codeKey]) {
                const product = this.data.products[codeKey] || { desc: 'Producto Desconocido - ' + codeKey };
                aggregator[codeKey] = { code: codeKey, desc: product.desc, requested: 0, separated: 0, dispatched: 0 };
            }
            const qty = parseFloat(req.cantidad);
            const cat = String(req.categoria).trim().toLowerCase();
            if (cat === 'solicitado') aggregator[codeKey].requested += qty;
            else if (cat === 'separado') aggregator[codeKey].separated += qty;
            else if (cat === 'despachado') aggregator[codeKey].dispatched += qty;
        });

        const pendingItems = [];
        Object.values(aggregator).forEach(item => {
            const pendingQty = item.requested - (item.separated + item.dispatched);
            if (pendingQty > 0) {
                pendingItems.push({ ...item, qty: pendingQty });
            }
        });

        if (pendingItems.length === 0) return alert('No hay pendientes para imprimir.');

        // 2. Generate Print HTML (POS/Ticket Style)
        // Use named window to avoid caching and force refresh
        const printWindow = window.open('', 'DispatchPrintWindow', 'width=450,height=600,scrollbars=yes');
        printWindow.document.open(); // Reset document content
        printWindow.document.write(`
            <html>
            <head>
                <title>Pendientes ${zone.toUpperCase()}</title>
                <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
                <meta http-equiv="Pragma" content="no-cache">
                <meta http-equiv="Expires" content="0">
                <style>
                    /* POS Ticket Reset */
                    * { box-sizing: border-box; }
                    body { 
                        font-family: 'Courier New', monospace; /* Monospace aligns better on thermal */
                        margin: 0; 
                        padding: 0; 
                        width: 76mm; /* Standard 80mm paper has ~72-76mm printable */
                    }
                    @page { 
                        margin: 0; 
                        size: auto; 
                    }
                    
                    /* Container */
                    .ticket {
                        padding: 5px;
                        width: 100%;
                    }

                    /* Typography */
                    h2 { 
                        font-size: 16px; 
                        text-align: center; 
                        margin: 5px 0 2px 0; 
                        text-transform: uppercase;
                    }
                    .meta {
                        font-size: 12px;
                        text-align: center;
                        margin-bottom: 10px;
                        border-bottom: 2px dashed #000;
                        padding-bottom: 5px;
                    }

                    /* Table */
                    table { width: 100%; border-collapse: collapse; }
                    th { 
                        text-align: left; 
                        border-bottom: 1px solid #000; 
                        font-size: 12px; 
                        padding: 2px 0;
                    }
                    td { 
                        padding: 4px 0; 
                        font-size: 14px; /* Larger font as requested */
                        vertical-align: top;
                        border-bottom: 1px dotted #ccc;
                    }
                    
                    /* Columns */
                    .item-block {
                        border-bottom: 2px dashed #000;
                        padding: 8px 0;
                        page-break-inside: avoid; /* Prevent splitting item across pages */
                    }
                    .item-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: baseline;
                        margin-bottom: 4px;
                    }
                    .item-code {
                        font-weight: bold;
                        font-size: 14px;
                    }
                    .item-qty {
                        font-weight: 800;
                        font-size: 18px;
                    }
                    .item-desc {
                        font-size: 14px;
                        line-height: 1.2;
                    }

                    @media print {
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="ticket">
                    <h2>${zone.toUpperCase()}</h2>
                    <div class="meta">${today.toLocaleString()}</div>
                    
                    <div class="items-container">
                        ${pendingItems.map(item => `
                            <div class="item-block">
                                <div class="item-header">
                                    <span class="item-code">${item.code}</span>
                                    <span class="item-qty">${item.qty}</span>
                                </div>
                                <div class="item-desc">${item.desc}</div>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div style="margin-top:20px; text-align:center; font-size:10px;">
                        --- FIN DE TICKET ---
                    </div>
                </div>
                <script>
                    window.onload = function() { window.print(); window.setTimeout(function(){ window.close(); }, 500); }
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    }

    // Scoped Column Filtering
    filterColumnList(input, columnClass) {
        const term = input.value.toLowerCase().trim();
        // Traverse up to find the closest container if needed, but here filtering by class is safer
        // because we passed 'column-pending' or 'column-separated' specifically.
        // However, we must ensure we only target the visible ones in the current view.

        // Find the specific column container where this input lives would be even better to support multiple zones if ever needed
        // But scoping by class is fine for now as there's only one active zone view at a time.
        const container = input.closest(`.${columnClass} `);

        if (!container) return;

        const cards = container.querySelectorAll('.product-card');

        requestAnimationFrame(() => {
            cards.forEach(card => {
                const searchable = card.dataset.search || "";

                if (!term || searchable.includes(term)) {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    }

    async moveToSeparated(btnElement, id) {
        // Correct signature: btnElement first, then ID
        const qtyInput = document.getElementById(`qty-${id}`);
        // Safety check
        if (!qtyInput) {
            console.error('Input not found for ID:', id);
            return;
        }

        const newQty = qtyInput.value;
        if (newQty <= 0) { alert('Cantidad inválida'); return; }

        // --- ANIMATION START ---
        // 1. Find the card and Data
        const card = btnElement.closest('.request-card');
        const sourceRequest = this.data.requests.find(r => r.idSolicitud == id);

        if (card && sourceRequest) {
            // OPTIMISTIC UPDATE PREPARATION
            // Create a temporary 'separado' item in local data to reflect change instantly
            const tempId = 'temp-' + Date.now();

            // Format Date manually to match Server "dd/MM/yyyy HH:mm:ss" 
            // This ensures isSameDay() validates it correctly (checking dd/MM/yyyy)
            const now = new Date();
            const day = String(now.getDate()).padStart(2, '0');
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const year = now.getFullYear();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            const formattedDate = `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;

            const mockSeparated = {
                ...sourceRequest,
                idSolicitud: tempId,
                categoria: 'separado',
                cantidad: newQty,
                fecha: formattedDate
            };

            // Clone for Animation
            const rect = card.getBoundingClientRect();
            const clone = card.cloneNode(true);

            clone.style.position = 'fixed';
            clone.style.top = rect.top + 'px';
            clone.style.left = rect.left + 'px';
            clone.style.width = rect.width + 'px';
            clone.style.height = rect.height + 'px';
            clone.style.zIndex = '9999';
            clone.style.transition = 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'; // Faster & Bouncy
            clone.style.opacity = '1';
            clone.style.pointerEvents = 'none';

            // Remove IDs from clone to prevent "Duplicate ID" errors
            clone.removeAttribute('id');
            const cloneInputs = clone.querySelectorAll('[id]');
            cloneInputs.forEach(el => el.removeAttribute('id'));

            document.body.appendChild(clone);

            // Hide original card instantly -> Visual Pop
            card.style.visibility = 'hidden'; // Keep layout space for a moment? No, user wants instant move.
            // Actually, if we re-render instantly, the card might disappear from DOM anyway.

            // UI Feedback on button (just in case)
            btnElement.innerHTML = '<i class="fa-solid fa-check"></i>';
            btnElement.disabled = true;

            // 2. Animate to Right
            const targetCol = document.querySelector('.column-separated');
            if (targetCol) {
                const targetRect = targetCol.getBoundingClientRect();
                requestAnimationFrame(() => {
                    clone.style.top = (targetRect.top + 50) + 'px';
                    clone.style.left = (targetRect.left + 50) + 'px';
                    clone.style.transform = 'scale(0.2)';
                    clone.style.opacity = '0.5';
                });
            }

            // 3. APPLY OPTIMISTIC DATA UPDATE (Instant)
            // Push mock data
            this.data.requests.push(mockSeparated);

            // DELAY NEXT REFRESH to prevent overwriting our Mock with stale server data
            if (this.resetAutoRefresh) this.resetAutoRefresh();

            // Re-render immediately (Animation is flying over the top)
            setTimeout(() => {
                // Selector updated to match new Header structure
                const activeBtn = document.querySelector('.client-buttons-group .btn-zone.active');
                if (activeBtn) {
                    const zone = activeBtn.dataset.client; // Use robust data attribute
                    const zoneContainer = document.getElementById('zone-content');
                    if (zoneContainer && zone) this.renderZonePickup(zone, zoneContainer);
                }
                // Remove clone after re-render (it effectively "lands" in the new list)
                clone.remove();
            }, 400); // Sync with animation duration

            // 4. SERVER SYNC (Background)
            fetch(API_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({
                    action: 'separateRequest',
                    payload: {
                        idSolicitud: id,
                        qtyToSeparate: newQty
                    }
                })
            })
                .then(response => response.json())
                .then(result => {
                    if (result.status === 'success' && result.idSolicitud) {
                        console.log('Server synced separation. New ID:', result.idSolicitud);

                        // CRITICAL FIX: Update the Optimistic Item with REAL ID
                        const item = this.data.requests.find(r => r.idSolicitud === tempId);
                        if (item) {
                            item.idSolicitud = result.idSolicitud; // Swap temp for real
                            console.log('Swapped temp ID for Real ID in local state');
                        }
                    } else {
                        console.error("Server synced but no ID returned or error", result);
                    }
                })
                // Check if we need to re-render? No, stick with valid optimistic data.
                .then(() => {
                    // Optional: Re-render one last time to ensure ID consistency (tempId -> realId)
                    // This might cause a slight flicker if IDs change, but usually imperceptible if content is same.
                    // We can skip re-render if we trust the math, but for safety lets do it.
                    const activeBtn = document.querySelector('.zone-carousel .btn-secondary.active');
                    if (activeBtn) {
                        const zone = activeBtn.innerText.toLowerCase().replace('zona ', 'zona');
                        const zoneContainer = document.getElementById('zone-content');
                        if (zoneContainer) this.renderZonePickup(zone, zoneContainer);
                    }
                })
                .catch(err => {
                    console.error("Separation failed:", err);
                    alert("Error guardando en servidor. Verifique conexión.");
                    // Rollback optimistic update? 
                    // Too complex for now, user can refresh.
                });

        } else {
            // Fallback if data missing (shouldn't happen)
            alert('Error identificando solicitud');
        }
    }
    async dispatchAll(zone) {
        if (!confirm('¿Despachar todos los ítems separados?')) return;

        const btn = document.getElementById('fab-dispatch');
        if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        const toDispatch = this.data.requests
            .filter(r => r.usuario === zone && r.categoria === 'separado')
            .map(r => ({ idSolicitud: r.idSolicitud, categoria: 'despachado' }));

        if (toDispatch.length === 0) {
            alert('No hay ítems para despachar');
            if (btn) btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Despachar Todo';
            return;
        }

        try {
            await fetch(API_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: 'updateRequests', payload: toDispatch })
            });

            await this.fetchRequests();

            // Refresh View
            const zoneContainer = document.getElementById('zone-content');
            if (zoneContainer) this.renderZonePickup(zone, zoneContainer);

            alert('Despacho realizado con éxito');

        } catch (e) {
            console.error(e);
            alert('Error al despachar: ' + e.message);
            if (btn) btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Despachar Todo';
        }
    }

    /**
     * MODAL & FORMS
     */
    openNewRequestModal() {
        const modalHtml = `
                    <div class="modal-card">
                <div class="modal-header">
                    <h3>Nueva Solicitud</h3>
                    <button class="modal-close" onclick="app.closeModal()">&times;</button>
                </div>
                <form id="new-request-form">
                    <div class="modal-body">
                        <div class="input-group">
                            <p style="margin-bottom:0.5rem; font-size:0.9rem; color:#666;">Producto (Escanee o Escriba Código)</p>
                            <input type="text" id="req-code" placeholder="Escanee aquí..." required autocomplete="off">
                            <div id="product-preview" style="margin-top:0.5rem; font-size:0.9rem; color:var(--primary-color); font-weight:600; min-height:1.2em;"></div>
                        </div>
                        <div class="input-group">
                            <p style="margin-bottom:0.5rem; font-size:0.9rem; color:#666;">Cantidad</p>
                            <input type="number" id="req-qty" placeholder="0" min="1" required>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancelar</button>
                        <button type="submit" class="btn-primary">Guardar Solicitud</button>
                    </div>
                </form>
            </div>
                    `;

        this.openModal(modalHtml);

        // Bind Form Submit
        document.getElementById('new-request-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSaveRequest();
        });

        // Scanner Logic (Enter triggers lookup)
        const codeInput = document.getElementById('req-code');
        const qtyInput = document.getElementById('req-qty');
        const preview = document.getElementById('product-preview');

        codeInput.focus(); // Auto-focus on open

        codeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Prevent form submit
                const code = codeInput.value.trim();
                const desc = this.getProductDescription(code);

                if (desc !== 'Producto Desconocido') {
                    preview.textContent = `✅ ${desc} `;
                    preview.style.color = 'var(--primary-color)';
                    qtyInput.focus();
                } else {
                    preview.textContent = '❌ Producto no encontrado';
                    preview.style.color = 'red';
                }
            }
        });

        // Also lookup on blur
        codeInput.addEventListener('blur', () => {
            const code = codeInput.value.trim();
            if (code) {
                const desc = this.getProductDescription(code);
                if (desc !== 'Producto Desconocido') {
                    preview.textContent = `✅ ${desc} `;
                    preview.style.color = 'var(--primary-color)';
                }
            }
        });
    }

    async handleSaveRequest() {
        const code = document.getElementById('req-code').value;
        const qty = document.getElementById('req-qty').value;
        const btn = document.querySelector('#new-request-form button[type="submit"]');

        btn.innerHTML = 'Guardando...';
        btn.disabled = true;

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({
                    action: 'saveRequest',
                    payload: {
                        codigo: code,
                        cantidad: qty,
                        usuario: this.currentUser.username
                    }
                })
            });

            const result = await response.json();

            if (result.status === 'success') {
                this.closeModal();
                alert('Solicitud guardada con éxito');
                this.renderDispatchRequests(document.getElementById('dispatch-content')); // Refresh
            } else {
                alert('Error: ' + result.message);
                btn.disabled = false;
                btn.innerHTML = 'Guardar Solicitud';
            }
        } catch (e) {
            console.error(e);
            alert('Error de conexión');
            btn.disabled = false;
            btn.innerHTML = 'Guardar Solicitud';
        }
    }

    openModal(htmlContent) {
        this.modalContainer.innerHTML = htmlContent;
        this.modalContainer.classList.add('active');
    }

    closeModal() {
        this.modalContainer.classList.remove('active');
        this.modalContainer.innerHTML = '';
    }

    // --- PREPEDIDOS LOGIC ---
    async loadPrepedidos() {
        // Change Header Title to 'Prepedidos'
        const titleEl = document.getElementById('page-title');
        if (titleEl) titleEl.textContent = 'Prepedidos';

        const container = document.getElementById('prepedidos-container');

        // 1. Mostrar caché si existe (Instantáneo)
        if (this.providersData) {
            this.renderProviders(this.providersData);
        } else {
            // Solo mostrar spinner si no hay datos previos
            container.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 3rem; color:#666;"><i class="fa-solid fa-circle-notch fa-spin fa-2x"></i><p style="margin-top:1rem;">Cargando lista de proveedores...</p></div>';
        }

        // 2. Fetch actualizado siempre (Background refresh)
        await this.fetchProvidersBackground();

        // 3. Iniciar Auto-Refresh si no está activo
        if (!this.providerRefreshInterval) {
            this.startProviderAutoRefresh();
        }
    }

    startProviderAutoRefresh() {
        // Evitar múltiples intervalos
        if (this.providerRefreshInterval) clearInterval(this.providerRefreshInterval);

        console.log("Iniciando auto-refresh de proveedores (60s)...");
        this.providerRefreshInterval = setInterval(() => {
            // Solo refrescar si la pestaña está activa (opcional, pero buena práctica)
            // O simplemente verificar si estamos en la vista de prepedidos (si tu app es SPA real)
            // Aquí asumimos siempre refrescar.
            this.fetchProvidersBackground();
        }, 60000); // 60 segundos
    }

    async fetchProvidersBackground() {
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: 'getProviders' })
            });
            const result = await response.json();

            if (result.status === 'success') {
                this.providersData = result.data; // Guardar en caché

                // Si estamos viendo la pantalla de prepedidos, actualizar UI silenciosamente
                // (Verificamos si existe el contenedor en el DOM)
                const container = document.getElementById('prepedidos-container');
                if (container) {
                    this.renderProviders(this.providersData);
                }
            } else {
                console.error("Error refresh providers:", result.message);
            }
        } catch (e) {
            console.error("Error background fetch:", e);
        }
    }

    renderProviders(providers) {
        // 1. Setup Container and Search Bar
        const mainContainer = document.getElementById('prepedidos-container'); // This is the GRID container
        if (!mainContainer) return;

        // Verify if we have our Search Wrapper. If not, create it.
        // We need to insert the Search Bar BEFOFE the grid. 
        // Ideally, 'prepedidos-container' should be wrapped or we insert before it. 
        // Let's assume 'prepedidos-container' is the grid itself. We need to inject controls above it.

        // 1. Setup SEARCH BAR in HEADER (Moved from body)
        const headerActions = document.getElementById('header-dynamic-actions');
        if (headerActions) {
            // Only inject if not already there (check by ID)
            if (!document.getElementById('provider-search-input')) {
                headerActions.innerHTML = `
                    <div class="search-bar-header">
                        <i class="fa-solid fa-search search-icon"></i>
                        <input type="text" id="provider-search-input" placeholder="Buscar proveedor...">
                    </div>
                `;
                // Add Event Listener
                document.getElementById('provider-search-input').addEventListener('input', (e) => {
                    this.filterProviders(e.target.value);
                });
            }
        }

        // Remove old controls if they exist in body (cleanup)
        const oldControls = document.getElementById('provider-controls-wrapper');
        if (oldControls) oldControls.remove();

        /* REMOVED
        let controlsContainer = document.getElementById('provider-controls-wrapper');
        if (!controlsContainer) {
            controlsContainer = document.createElement('div');
            controlsContainer.id = 'provider-controls-wrapper';
            controlsContainer.className = 'provider-controls';
            controlsContainer.innerHTML = `
                <div class="provider-search-container">
                    <i class="fa-solid fa-search search-icon"></i>
                    <input type="text" id="provider-search-input" class="provider-search-input" placeholder="Buscar proveedor...">
                </div>
            `;
            // Insert before the grid
            mainContainer.parentNode.insertBefore(controlsContainer, mainContainer);
     
            // Add Event Listener
            document.getElementById('provider-search-input').addEventListener('input', (e) => {
                this.filterProviders(e.target.value);
            });
        } */

        // Ensure Grid Layout
        mainContainer.style.display = 'grid';
        mainContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(280px, 1fr))';
        mainContainer.style.gap = '20px';

        const daysMap = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
        const todayName = daysMap[new Date().getDay()];

        // 2. SORTING: Today's Orders First
        // Clone array to avoid mutating original cache
        const sortedProviders = [...providers].sort((a, b) => {
            const aDay = a.diaPedido ? a.diaPedido.toUpperCase().trim() : '';
            const bDay = b.diaPedido ? b.diaPedido.toUpperCase().trim() : '';

            const aIsToday = (aDay === todayName);
            const bIsToday = (bDay === todayName);

            if (aIsToday && !bIsToday) return -1;
            if (!aIsToday && bIsToday) return 1;
            return a.nombre.localeCompare(b.nombre);
        });

        // 3. RENDER
        mainContainer.innerHTML = sortedProviders.map(p => {
            const imgUrl = (p.imagen && p.imagen.trim() !== '') ? p.imagen : 'recursos/supplierDefault.png';
            const diaPedido = p.diaPedido ? p.diaPedido.toUpperCase() : '-';
            const diaEntrega = p.diaEntrega ? p.diaEntrega.toUpperCase() : '-';

            const isToday = (diaPedido === todayName);

            const orderClass = isToday ? 'pill-today-order' : 'pill-default';
            const deliveryClass = (diaEntrega === todayName) ? 'pill-today-delivery' : 'pill-default';
            const cardClass = isToday ? 'provider-card provider-card-today' : 'provider-card';

            return `
        <div class="${cardClass}" data-name="${p.nombre.toLowerCase()}">
            ${isToday ? '<i class="fa-solid fa-thumbtack provider-clip-icon"></i>' : ''}
            <div class="provider-card-header">
                <img src="${imgUrl}" alt="${p.nombre}" class="provider-img" onerror="this.onerror=null; this.src='recursos/supplierDefault.png'">
            </div>
            <div class="provider-body">
                <div class="provider-name-container">
                     <h3 class="provider-name">${p.nombre}</h3>
                </div>

                <div class="provider-info-row">
                    <span class="provider-label"><i class="fa-regular fa-calendar-check" style="margin-right:5px;"></i> Día Pedido:</span>
                    <span class="provider-pill ${orderClass}">${diaPedido}</span>
                </div>
                <div class="provider-info-row">
                    <span class="provider-label"><i class="fa-solid fa-truck-ramp-box" style="margin-right:5px;"></i> Día Entrega:</span>
                    <span class="provider-pill ${deliveryClass}">${diaEntrega}</span>
                </div>
            </div>
            <div class="provider-footer">
                <button class="btn-primary" style="width: 100%; padding: 10px; font-size: 0.9rem; border-radius: 8px; box-shadow: none;" onclick="app.openProviderOrderModal('${p.nombre}')">
                    <i class="fa-solid fa-cart-plus"></i> Generar Prepedido
                </button>
            </div>
        </div>`;
        }).join('');
    }

    // --- NEW: PROVIDER HISTORY MODAL ---
    filterProviders(searchTerm) {
        const term = searchTerm.toLowerCase().trim();
        const cards = document.querySelectorAll('.provider-card');

        cards.forEach(card => {
            const name = card.getAttribute('data-name');
            if (name && name.includes(term)) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    }

    async openProviderOrderModal(providerName) {
        // Find provider data to get phone - Robust Lookup
        const providerData = this.providersData ? this.providersData.find(p => p.nombre.trim().toUpperCase() === providerName.trim().toUpperCase()) : null;

        console.log(`[WhatsApp Debug] Lookup for "${providerName}":`, providerData ? `Found T: ${providerData.telefono}` : 'Not Found');

        const providerPhone = providerData ? providerData.telefono : '';

        // 1. Show Loading Modal
        const loadingHtml = `
            <div class="modal-card">
                <div class="modal-header">
                    <h3>Historial: ${providerName}</h3>
                    <button class="modal-close" onclick="app.closeModal()">&times;</button>
                </div>
                <div class="modal-body" style="text-align:center; padding: 3rem;">
                    <i class="fa-solid fa-spinner fa-spin fa-2x"></i>
                    <p style="margin-top:1rem;">Cargando historial de compras...</p>
                </div>
            </div>`;
        this.openModal(loadingHtml);

        // 2. Fetch Data
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: 'getProviderPurchases', payload: { provider: providerName } })
            });
            const result = await response.json();

            if (result.status === 'success') {
                this.renderProviderHistoryTable(providerName, result.data, providerPhone);
            } else {
                alert('Error: ' + result.message);
                this.closeModal();
            }
        } catch (e) {
            console.error(e);
            alert('Error de conexión al obtener historial.');
            this.closeModal();
        }
    }

    renderProviderHistoryTable(providerName, products, providerPhone) {
        if (!products || products.length === 0) {
            const emptyHtml = `
            <div class="modal-card">
                <div class="modal-header">
                    <h3>Historial: ${providerName}</h3>
                    <button class="modal-close" onclick="app.closeModal()">&times;</button>
                </div>
                <div class="modal-body" style="text-align:center; padding: 2rem;">
                    <p style="color:#666;">No se encontraron productos comprados anteriormente a este proveedor.</p>
                </div>
                 <div class="modal-footer">
                    <button class="btn-secondary" onclick="app.closeModal()">Cerrar</button>
                </div>
            </div>`;
            this.openModal(emptyHtml);
            return;
        }

        // Sort by Name to ensure substitutes are adjacent (visually helpful)
        products.sort((a, b) => a.nombre.localeCompare(b.nombre));

        // Helper to parse factor from name (e.g. "250GR" -> 0.25, "1KG" -> 1)
        const getApproxFactor = (name) => {
            const n = name.toUpperCase().replace(/\s/g, '');
            // regex for weights
            const matchKg = n.match(/(\d+(?:\.\d+)?)KG/);
            if (matchKg) return parseFloat(matchKg[1]);

            const matchGr = n.match(/(\d+(?:\.\d+)?)GR/);
            if (matchGr) return parseFloat(matchGr[1]) / 1000;

            const matchG = n.match(/(\d+(?:\.\d+)?)G\b/); // 'G' word boundary
            if (matchG) return parseFloat(matchG[1]) / 1000;

            const matchL = n.match(/(\d+(?:\.\d+)?)L\b/);
            if (matchL) return parseFloat(matchL[1]);

            const matchMl = n.match(/(\d+(?:\.\d+)?)ML/);
            if (matchMl) return parseFloat(matchMl[1]) / 1000;

            return 1; // Default
        };

        // 1. Group Substitutes (Same Name, Not Derived)
        const subGroups = {};
        products.forEach(p => {
            if (p.isDerived) return;
            const name = p.nombre.trim().toLowerCase();
            if (!subGroups[name]) subGroups[name] = [];
            subGroups[name].push(p);
        });

        // 2. Aggregate Stock for Substitutes
        Object.values(subGroups).forEach(group => {
            if (group.length > 0) {
                const master = group[0];
                master.isSubstituteLeader = true;
                master._aggregatedStock = group.reduce((sum, item) => sum + (parseFloat(item.stock) || 0), 0);

                for (let i = 1; i < group.length; i++) {
                    group[i].isSubstituteSlave = true;
                }
            }
        });

        // 3. Link Derived Products & Sum Demand
        const origins = products.filter(p => !p.isDerived && p.isSubstituteLeader);
        const derived = products.filter(p => p.isDerived);

        derived.forEach(child => {
            const childNameClean = child.nombre.toUpperCase();
            let bestMatch = null;
            let maxScore = 0;

            origins.forEach(origin => {
                // Remove generic words to find "Root"
                const originName = origin.nombre.toUpperCase().replace(/\b(GRANEL|PREMIUM|SACO|BOLSA|CJA|EXO)\b/g, '').trim();
                const originWords = originName.split(/\s+/).filter(w => w.length > 2);
                let hitCount = 0;

                originWords.forEach(w => {
                    if (childNameClean.includes(w)) hitCount++; // Simple word inclusion
                });

                // Threshold: at least 70% of words match
                if (hitCount > 0 && hitCount >= originWords.length * 0.7) {
                    if (hitCount > maxScore) {
                        maxScore = hitCount;
                        bestMatch = origin;
                    }
                }
            });

            if (bestMatch) {
                if (!bestMatch._childDemand) bestMatch._childDemand = 0;

                // Child Basic Need = (Min - Stock)
                const childBasicNeed = Math.max(0, (parseFloat(child.min) || 0) - (parseFloat(child.stock) || 0));

                // Apply Factor (Parsed from Name)
                const conversionFactor = getApproxFactor(child.nombre);

                // Add to Parent Demand in Parent Units
                bestMatch._childDemand += (childBasicNeed * conversionFactor);
            }
        });

        // 4. Final Calculation per Row
        products.forEach(p => {
            const min = parseFloat(p.min) || 0;
            const stock = parseFloat(p.stock) || 0;
            const factor = parseFloat(p.factorCompras) || 1;

            p._displayPedido = '';
            p._inputAttr = '';
            p._rowStyle = '';

            if (p.isDerived) {
                p._inputAttr = 'disabled readonly';
                p._rowStyle = 'background:#f5f5f5; color:#aaa; border-color:#eee;';
            } else if (p.isSubstituteSlave) {
                p._inputAttr = 'disabled readonly';
                p._rowStyle = 'background:#f5f5f5; color:#aaa; border-color:#eee;';
            } else if (p.isSubstituteLeader) {
                const childDemand = p._childDemand || 0;
                const aggStock = p._aggregatedStock !== undefined ? p._aggregatedStock : stock;

                const numerator = (min + childDemand) - aggStock;
                const pedidoVal = Math.max(0, Math.ceil(numerator / factor));

                p._displayPedido = pedidoVal;
            }
        });

        const rows = products.map(p => {
            let rowClass = '';
            let codeColor = '#666';
            let icon = '';

            // Restore definitions for use in template
            const min = parseFloat(p.min) || 0;
            const stock = parseFloat(p.stock) || 0;

            if (p.isRelated) {
                codeColor = '#d35400';
                icon = '<i class="fa-solid fa-link" title="Producto Relacionado/Sustituto" style="font-size:0.7rem; margin-left:4px;"></i>';
            } else if (p.isDerived) {
                codeColor = '#8e44ad';
                icon = '<i class="fa-solid fa-industry" title="Producto Derivado/Envasado" style="font-size:0.7rem; margin-left:4px;"></i>';
            }

            // Logic for Highlight & Auto-Selection
            const pedidoVal = parseFloat(p._displayPedido);
            let isPositiveOrder = false;
            if (!isNaN(pedidoVal) && pedidoVal > 0) {
                isPositiveOrder = true;
                rowClass += ' row-neon-pulse'; // Custom class for animation
            }

            // Reduced width for input (approx half of 60px -> 35px)
            let pedidoStyle = `width:35px; text-align:center; padding:2px; border:1px solid #ccc; border-radius:4px; ${p._rowStyle || ''}`;

            return `
        <tr class="${rowClass}">
            <td style="text-align:center;">
                <input type="checkbox" class="history-select-check" value="${p.codigo}" 
                    data-desc="${p.nombre}" 
                    data-cost="${p.costo}" 
                    data-pedido="${p._displayPedido}" 
                    data-factor="${p.factorCompras || 1}"
                    ${p._displayPedido === '' ? 'disabled' : ''}
                    ${isPositiveOrder ? 'checked' : ''}>
            </td>
            <td style="font-family:monospace; color:${codeColor}; white-space: nowrap;">
                ${p.codigo} ${icon}
            </td>
            <td style="text-align:center; width:60px;"> <!-- Slight adjustment to cell width -->
                <input type="number" class="qty-input-small" value="${p._displayPedido}" min="0" ${p._inputAttr}
                       style="${pedidoStyle}"
                       onchange="this.closest('tr').querySelector('.history-select-check').dataset.pedido = this.value">
            </td>
            <td style="font-weight:600;">${p.nombre}</td>
             <td style="text-align:center; color:#555;">${min} - ${stock}</td>
            <!-- 'A Comprar' Column Hidden as requested -->
            <td>${p.costo ? 'S/ ' + parseFloat(p.costo).toFixed(2) : '-'}</td>
            <td style="font-size:0.8rem; color:#888;">${p.fecha ? new Date(p.fecha).toLocaleDateString() : '-'}</td>
        </tr>
    `}).join('');

        const modalHtml = `
        <style>
            @keyframes neonGreenPulse {
                0% { background-color: rgba(57, 255, 20, 0.05); box-shadow: inset 0 0 2px rgba(57, 255, 20, 0.2); }
                50% { background-color: rgba(57, 255, 20, 0.2); box-shadow: inset 0 0 8px rgba(57, 255, 20, 0.6); }
                100% { background-color: rgba(57, 255, 20, 0.05); box-shadow: inset 0 0 2px rgba(57, 255, 20, 0.2); }
            }
            .row-neon-pulse {
                animation: neonGreenPulse 2s infinite ease-in-out;
                border: 1px solid #39ff14 !important;
            }
            .row-neon-pulse td {
                color: #000 !important; /* Ensure text is readable */
            }
        </style>
        <div class="modal-card" style="max-width: 900px;">
            <div class="modal-header">
                <h3>Historial: ${providerName}</h3>
                <button class="modal-close" onclick="app.closeModal()">&times;</button>
            </div>
            <div class="modal-body" style="padding: 1rem;">
                <div class="alert-info" style="font-size:0.9rem; color:#666; margin-bottom:1rem;">
                    <i class="fa-solid fa-info-circle"></i> Productos con pedido sugerido están resaltados.
                     <span style="color:#007bff; font-weight:bold; margin-left:10px;">Pedido = Calculado (Origen + Hijos)</span>.
                     <br><i class="fa-solid fa-layer-group" style="margin-right:5px;"></i> Los productos repetidos suman su stock total.
                </div>
                
                <div class="history-table-wrapper">
                    <table class="history-table">
                        <thead>
                            <tr>
                                <th style="width:30px;"><i class="fa-solid fa-check-double"></i></th>
                                <th>Código</th>
                                <th style="width:50px;">Pedido</th> <!-- Reduced width -->
                                <th>Producto</th>
                                <th style="width:80px;">Min - Stock</th>
                                <!-- 'A Comprar' Hidden -->
                                <th>Costo Ref.</th>
                                <th>Últ. Compra</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            </div>
                <div class="modal-footer">
                     <span id="history-selected-count" style="margin-right:auto; font-weight:bold; color:var(--primary-color);">0 seleccionados</span>
                     <button class="btn-success" style="background:#25D366; border:none; margin-right:10px;" onclick="app.sendPrepedidoWhatsApp('${providerPhone || ''}')">
                        <i class="fa-brands fa-whatsapp"></i> Enviar WhatsApp
                     </button>
                     <button class="btn-secondary" onclick="app.closeModal()">Cancelar</button>
                     <button class="btn-primary" onclick="app.generatePrepedidoFromHistory()">Generar Prepedido</button>
                </div>
            </div>`;

        this.openModal(modalHtml);

        // IMMEDIATE UPDATE to set counter based on auto-checked items
        this.updateHistoryCounter();

        // Bind Checkbox events for counter
        setTimeout(() => {
            const checks = document.querySelectorAll('.history-select-check:not([disabled])');
            checks.forEach(c => {
                c.addEventListener('change', () => this.updateHistoryCounter());
            });
        }, 100);
    }

    toggleHistoryAll(source) {
        document.querySelectorAll('.history-select-check').forEach(c => c.checked = source.checked);
        this.updateHistoryCounter();
    }

    updateHistoryCounter() {
        const count = document.querySelectorAll('.history-select-check:checked').length;
        document.getElementById('history-selected-count').innerText = `${count} seleccionados`;
    }

    generatePrepedidoFromHistory() {
        const selected = [];
        document.querySelectorAll('.history-select-check:checked').forEach(c => {
            const qty = parseFloat(c.dataset.pedido);
            if (qty > 0) {
                selected.push({
                    codigo: c.value,
                    desc: c.dataset.desc,
                    cantidad: qty,
                    factor: c.dataset.factor
                });
            }
        });

        if (selected.length === 0) return alert('Seleccione al menos un producto con cantidad válida.');

        // Close History Modal
        this.closeModal();

        // PRINT TICKET LOGIC (80mm)
        this.printPrepedidoTicket(selected);
    }

    sendPrepedidoWhatsApp(phone) {
        if (!phone) {
            return alert('Este proveedor no tiene registrado un número de teléfono para WhatsApp.');
        }

        const selected = [];
        document.querySelectorAll('.history-select-check:checked').forEach(c => {
            const qty = parseFloat(c.dataset.pedido);
            if (qty > 0) {
                selected.push({
                    desc: c.dataset.desc,
                    cantidad: qty
                });
            }
        });

        if (selected.length === 0) return alert('Seleccione al menos un producto con cantidad válida para enviar.');

        // Time-based Greeting
        const hour = new Date().getHours();
        let greeting = 'Buenos días';
        if (hour >= 12 && hour < 19) greeting = 'Buenas tardes';
        else if (hour >= 19) greeting = 'Buenas noches';

        // Format Message
        let msg = `${greeting}, le envío esta lista para que me despache:\n\n`;
        selected.forEach(item => {
            msg += `${item.cantidad} - ${item.desc}\n`;
        });
        msg += `\nSoy de Inversiones MOS por favor me despacha.`;

        // Clean phone (remove spaces, etc) and append prefix
        const cleanPhone = phone.replace(/\D/g, '');
        // Assuming database numbers are local (9 Digits), add +51
        // If they already have 51, handle it? User said "add +51 and the number". 
        // Safer to just add 51 if length is 9.
        let finalPhone = cleanPhone;
        if (cleanPhone.length === 9) finalPhone = '51' + cleanPhone;

        const url = `https://wa.me/${finalPhone}?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
    }

    printPrepedidoTicket(items) {
        const dateStr = new Date().toLocaleString();

        let rowsHtml = items.map(item => `
            <tr>
                <td style="text-align:center; font-weight:bold; font-size:1.1rem;">${item.cantidad}</td>
                <td style="padding-left:5px;">
                    <div style="font-weight:bold; font-size:0.95rem;">${item.desc}</div>
                </td>
                <td style="text-align:center; font-size:0.85rem; color:#555;">${item.factor}</td>
            </tr>
            <tr style="height:5px;"></tr>
        `).join('');

        const printWindow = window.open('', '', 'width=400,height=600');
        printWindow.document.write(`
            <html>
                <head>
                    <title>Ticket Prepedido</title>
                    <style>
                        @page { size: 80mm auto; margin: 0; }
                        body { 
                            width: 72mm; /* Printable width approx */
                            margin: 0 auto;
                            padding: 10px 5px;
                            font-family: 'Courier New', monospace; /* Monospace for ticket feel */
                            background: #fff;
                            color: #000;
                        }
                        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px dashed #000; padding-bottom: 10px; }
                        .title { font-size: 1.2rem; font-weight: bold; text-transform: uppercase; }
                        .meta { font-size: 0.85rem; margin-top: 5px; }
                        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                        th { text-align: left; border-bottom: 1px solid #000; padding-bottom: 5px; font-size: 0.8rem; }
                        td { vertical-align: top; padding-top: 5px; }
                        .footer { margin-top: 20px; text-align: center; font-size: 0.8rem; border-top: 1px dashed #000; padding-top: 10px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="title">PREPEDIDO SUGERIDO</div>
                        <div class="meta">Fecha: ${dateStr}</div>
                    </div>
                    
                    <table>
                        <thead>
                            <tr>
                                <th style="width:15%; text-align:center;">CANT</th>
                                <th style="width:65%;">PRODUCTO</th>
                                <th style="width:20%; text-align:center;">FACTOR</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>

                    <div class="footer">
                        --- FIN DEL TICKET ---
                    </div>
                    <script>
                        setTimeout(() => {
                            window.print();
                            window.close();
                        }, 500);
                    <\/script>
                </body>
            </html>
        `);
        printWindow.document.close();
    }

    filterPrepedidos(input) {
        const term = input.value.toLowerCase().trim();
        const container = document.getElementById('prepedidos-container');
        const cards = container.querySelectorAll('.provider-card');

        requestAnimationFrame(() => {
            cards.forEach(card => {
                // We search in the whole card text content (Name is in h3)
                const text = card.textContent.toLowerCase();
                if (!term || text.includes(term)) {
                    card.style.display = 'flex';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    }

    // --- ENVASADOR MODULE LOGIC ---

    async loadPackingModule() {
        // 1. Set Title
        const title = document.getElementById('page-title');
        if (title) title.innerText = 'Envasador';

        // 2. Inject Search Bar (Neon Style)
        const headerActions = document.getElementById('header-dynamic-actions');
        if (headerActions) {
            // Force flex layout for inline badge and search
            headerActions.style.display = 'flex';
            headerActions.style.alignItems = 'center';
            headerActions.style.gap = '1rem';

            headerActions.innerHTML = `
                 <div class="search-neon-wrapper" style="position: relative; width: 300px;">
                    <i class="fa-solid fa-magnifying-glass" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#999;"></i>
                    <input type="text" id="packing-search" 
                        placeholder="Buscar por Código o Nombre..." 
                        style="width:100%; padding-left:35px; height:40px; border-radius: 20px; border: 1px solid #ddd;"
                        onkeyup="app.filterPackingList(this.value)">
                </div>
            `;
        }

        // 3. Initial Load
        // Start Auto-Refresh (60s) FIRST to ensure it's registered
        if (this.packingRefreshInterval) clearInterval(this.packingRefreshInterval);
        this.packingRefreshInterval = setInterval(() => {
            console.log('Auto-refreshing Packing List...');
            this.fetchPackingList(true);
        }, 60000);

        // 4. Check & Fetch Master Products if Missing logic
        const container = document.getElementById('packing-list-container');
        if (!this.products || this.products.length === 0) {
            console.warn('LoadPackingModule: Master list empty. Fetching now...');
            if (container) container.innerHTML = '<div style="text-align:center; padding:2rem; color:#666;"><i class="fa-solid fa-sync fa-spin"></i> Sincronizando datos maestros...</div>';
            await this.fetchProducts();
        }

        this.fetchPackingList();
    }

    async fetchPackingList(forceRefresh = false) {
        const isBackground = forceRefresh; // If forcing refresh (e.g. preload), treat as background/silent or handle UI accordingly?
        // Actually, if forceRefresh is true, we want to fetch.
        // If false, check cache.

        const container = document.getElementById('packing-list-container');

        // CACHE HIT
        if (!forceRefresh && this.packingList) {
            console.log('Using Cached Packing List');
            if (container && container.innerHTML.includes('loading')) container.innerHTML = '';
            this.renderPackingList(this.packingList);
            // Trigger history calc if needed (should be cached too)
            if (this.envasados) this.calculateDailyTotals();
            else this.fetchEnvasadosHistory();
            return;
        }

        if (!container && !isBackground) return;

        if (!isBackground && container) {
            container.innerHTML = '<div style="text-align:center; padding:2rem; color:#999;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando lista...</div>';
        }

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: 'getPackingList' })
            });
            const result = await response.json();

            if (result.status === 'success') {
                this.packingList = result.data; // Store in memory

                // Fetch History to calculate totals (force if we just refreshed packing list?)
                await this.fetchEnvasadosHistory(forceRefresh);

                this.renderPackingList(this.packingList);
            } else {
                if (container && !isBackground) container.innerHTML = `<div class="error-msg">${result.message}</div>`;
            }

        } catch (e) {
            console.error(e);
            if (container && !isBackground) container.innerHTML = `<div class="error-msg">Error de conexión</div>`;
        }
    }

    async fetchEnvasadosHistory(forceRefresh = false) {
        if (!forceRefresh && this.envasados) {
            this.calculateDailyTotals();
            return;
        }
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: 'getEnvasados' })
            });
            const result = await response.json();
            if (result.status === 'success') {
                this.envasados = result.data;
                this.calculateDailyTotals();
            }
        } catch (e) {
            console.error("Error fetching envasados history:", e);
        }
    }

    calculateDailyTotals() {
        if (!this.envasados) return;

        // Helper to parse "dd/MM/yyyy HH:mm:ss"
        const parseDate = (str) => {
            if (!str) return '';
            const parts = str.toString().split(' ')[0].split('/');
            if (parts.length < 3) return '';
            return `${parseInt(parts[0])}/${parseInt(parts[1])}/${parts[2]}`;
        };

        const currentUser = this.currentUser ? this.currentUser.username : '';
        this.dailyTotals = {};
        this.globalDailyTotal = 0;

        const now = new Date();
        const currentDateStr = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

        console.log('--- Daily Totals Debug ---');
        console.log('Current User:', currentUser);
        console.log('Current Date ID:', currentDateStr);

        this.envasados.forEach(record => {
            const recordDateStr = parseDate(record.fecha);

            // DEBUG: Log first few records
            if (this.envasados.length < 50 || Math.random() < 0.05) {
                console.log(`Checking: User=${record.usuario} (Expected ${currentUser}), Date=${recordDateStr} (Expected ${currentDateStr}), Qty=${record.cantidad}`);
            }

            if (record.usuario !== currentUser) return;
            if (recordDateStr !== currentDateStr) return;

            const qty = Number(record.cantidad) || 0;
            if (!this.dailyTotals[record.idProducto]) this.dailyTotals[record.idProducto] = 0;
            this.dailyTotals[record.idProducto] += qty;
            this.globalDailyTotal += qty;
        });

        console.log('Calculated Totals:', this.dailyTotals);
        console.log('Global Total:', this.globalDailyTotal);
        console.log('--------------------------');

        this.updateHeaderTotal();
    }

    updateHeaderTotal() {
        const headerActions = document.getElementById('header-dynamic-actions');
        // We need to inject the total next to the title or inside the actions area.
        // Let's create a badge if it doesn't exist, or update it.
        // Find existing badge
        let badge = document.getElementById('daily-total-badge');
        if (!badge && headerActions) {
            // Insert before the search wrapper
            const badgeHtml = `
                <div id="daily-total-badge" style="display:flex; align-items:center; gap:0.5rem; margin-right:1rem; color:var(--neon-green); font-weight:bold; font-size:1.1rem;">
                    <i class="fa-solid fa-clipboard-check"></i>
                    <span id="daily-total-value">0</span>
                </div>
            `;
            headerActions.insertAdjacentHTML('afterbegin', badgeHtml);
            badge = document.getElementById('daily-total-badge');
        }

        if (badge) {
            document.getElementById('daily-total-value').innerText = this.globalDailyTotal || 0;
        }
    }


    renderPackingList(list) {
        const container = document.getElementById('packing-list-container');
        if (!container) return;

        if (!list || list.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:2rem; color:#666;">No hay productos en lista de envasado</div>';
            return;
        }

        // --- PRE-PROCESS & SORT ---
        const masterProducts = this.products || []; // Array from fetchProducts

        const processedList = list.map(item => {
            // Find Match (Case-Insensitive & Trimmed)
            const targetCode = String(item.codigo).trim().toLowerCase();
            const master = masterProducts.find(p => String(p.codigo).trim().toLowerCase() === targetCode);

            let stockReal = 0;
            let stockMin = 0;
            let batteryLevel = 0;
            let batteryClass = 'critical'; // Default red
            let missingMin = false;

            if (master) {
                stockReal = Number(master.stock) || 0;
                stockMin = Number(master.min);

                // Check for missing/invalid Min Stock
                if (master.min === undefined || master.min === null || master.min === '' || isNaN(stockMin) || stockMin <= 0) {
                    missingMin = true;
                    stockMin = 100; // Fake base for calc avoids div/0, but marked as missing
                    batteryLevel = 0; // Force low
                } else {
                    batteryLevel = Math.round((stockReal / stockMin) * 100);
                    if (batteryLevel > 100) batteryLevel = 100;
                }

                if (batteryLevel >= 50) batteryClass = 'full';
                else if (batteryLevel >= 25) batteryClass = 'medium';
                else if (batteryLevel >= 10) batteryClass = 'low';
                else batteryClass = 'critical';
            }

            return {
                ...item,
                stockReal,
                stockMin,
                batteryLevel,
                batteryClass,
                missingMin,
                masterDesc: master ? master.descripcion : item.descripcion
            };
        });

        // SORT: Ascending Battery Level (Critical First)
        processedList.sort((a, b) => a.batteryLevel - b.batteryLevel);


        // --- GRID LAYOUT ---
        let html = '<div class="packing-grid">';

        html += processedList.map(item => {

            // Battery Visuals
            const isCritical = item.batteryClass === 'critical';
            // If missing Min, show Alert Icon overlay
            const alertOverlay = item.missingMin ?
                `<div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); color:#ef4444; font-size:1.5rem; text-shadow:0 1px 3px rgba(255,255,255,0.8); z-index:2;" title="Stock Mínimo no definido">
                    <i class="fa-solid fa-triangle-exclamation fa-beat-fade"></i>
                 </div>` : '';

            const percentageText = item.missingMin ? '<span style="color:red; font-size:0.8rem;">Min?</span>' : `${item.batteryLevel}%`;

            return `
            <div class="packing-card" onclick="app.openSideDrawer('${item.codigo}')">
                <div class="packing-card-header">
                    <div class="code-badge">${item.codigo}</div>
                    <button class="btn-sm btn-neon-icon" 
                            onclick="event.stopPropagation(); app.showRegisterModal('${item.codigo}')" 
                            title="Registrar Envasado">
                        ${(this.dailyTotals && this.dailyTotals[item.codigo] > 0) ?
                    `<span style="font-weight:800; font-size:0.85rem;">${this.dailyTotals[item.codigo]}</span>` :
                    `<i class="fa-solid fa-plus"></i>`}
                    </button>
                </div>
                
                <div class="packing-card-body">
                    <div class="title" style="min-height:3.6rem; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;">
                        ${item.masterDesc || item.descripcion}
                    </div>
                    
                    <!-- BATTERY INDICATOR -->
                    <div class="battery-container">
                        ${alertOverlay}
                        <div class="battery-cap"></div>
                        <div class="battery-body">
                            <div class="battery-level ${item.batteryClass}" style="height: ${item.batteryLevel}%">
                                <div class="battery-reflection"></div>
                            </div>
                            <div class="battery-value">${percentageText}</div>
                        </div>
                    </div>

                </div>

                <div class="packing-card-footer">
                   <div style="font-size:0.85rem; color:var(--neon-blue); font-weight:bold;">
                        <i class="fa-solid fa-box"></i> ${item.empaque || 'S/D'}
                   </div>
                </div>
            </div>
            `;
        }).join('');

        html += '</div>';
        container.innerHTML = html;
    }

    filterPackingList(term) {
        if (!this.packingList) return;
        const q = term.toLowerCase().trim();

        const filtered = this.packingList.filter(item =>
            item.codigo.toLowerCase().includes(q) ||
            item.nombre.toLowerCase().includes(q) ||
            item.origen.toLowerCase().includes(q)
        );
        this.renderPackingList(filtered);
    }

    // Alias for click handler compatibility
    openSideDrawer(code) {
        this.openPackingDrawer(code);
    }

    openPackingDrawer(code) {
        const item = this.packingList.find(p => p.codigo === code);
        if (!item) return;

        // Find Master Product for Details (Image, Stock)
        const master = this.products ? this.products.find(p => String(p.codigo).trim().toLowerCase() === String(code).trim().toLowerCase()) : null;
        const stockReal = master ? (Number(master.stock) || 0) : 0;
        const stockMin = master ? (Number(master.min) || 0) : 0;

        const drawer = document.getElementById('packing-drawer');
        const backdrop = document.getElementById('packing-drawer-backdrop');

        // Helper to format Drive Image URL
        const formatDriveImage = (url) => {
            if (!url) return '';
            // If it's already a direct link or not drive, return as is
            if (!url.includes('drive.google.com')) return url;

            // Extract ID from: /file/d/ID/view or /open?id=ID or /uc?id=ID
            let id = '';
            const match1 = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
            const match2 = url.match(/id=([a-zA-Z0-9_-]+)/);

            if (match1) id = match1[1];
            else if (match2) id = match2[1];

            if (id) return `https://drive.google.com/uc?export=view&id=${id}`;
            return url;
        };

        const imageUrl = master && master.imagen ? formatDriveImage(master.imagen) : '';

        // Populate Drawer
        drawer.innerHTML = `
            <div class="drawer-header">
                <h3>${item.nombre}</h3>
                <button class="close-drawer-btn" onclick="app.closePackingDrawer()"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="drawer-body">
                
                <!-- IMAGE SECTION -->
                ${imageUrl ?
                `<div style="text-align:center; margin-bottom:1rem;">
                        <img src="${imageUrl}" alt="${item.nombre}" 
                             referrerpolicy="no-referrer" 
                             style="max-height:150px; border-radius:8px; box-shadow:0 4px 6px rgba(0,0,0,0.3);"
                             onerror="this.style.display='none'; console.warn('Failed to load image:', '${imageUrl}')">
                     </div>` : ''
            }

                <div class="drawer-section">
                    <label>Código</label>
                    <div class="drawer-value main">${item.codigo}</div>
                </div>

                <div class="drawer-grid">
                    <div class="drawer-section">
                        <label>Factor</label>
                        <div class="drawer-value">${item.factor}</div>
                    </div>
                     <div class="drawer-section">
                        <label>Empaque</label>
                        <div class="drawer-value highlight" style="font-size:1.2rem; color:var(--neon-blue);">${item.empaque}</div>
                    </div>
                </div>

                <!-- STOCK INFO from Master -->
                <div class="drawer-grid" style="margin-top:1rem; padding-top:1rem; border-top:1px solid #333;">
                    <div class="drawer-section">
                        <label>Stock Actual</label>
                        <div class="drawer-value" style="color:${stockReal < stockMin ? '#ef4444' : '#22c55e'}">${stockReal}</div>
                    </div>
                    <div class="drawer-section">
                        <label>Stock Mínimo</label>
                        <div class="drawer-value" style="color:#aaa;">${stockMin}</div>
                    </div>
                </div>

                <!-- ACTION: REGISTER PACKING -->
                <div style="margin-top:2rem; padding-top:1rem; border-top:1px solid rgba(255,255,255,0.1); text-align:center;">
                    <button class="btn-neon" style="width:100%; padding: 1rem; font-size:1.1rem;" onclick="app.showRegisterModal('${item.codigo}')">
                        <i class="fa-solid fa-box-open"></i> Registrar Envasado
                    </button>
                </div>

            </div >
            `;

        // Show
        backdrop.classList.add('active');
        drawer.classList.add('active');

        // Close on Backdrop Click
        backdrop.onclick = () => this.closePackingDrawer();
    }

    closePackingDrawer() {
        const drawer = document.getElementById('packing-drawer');
        const backdrop = document.getElementById('packing-drawer-backdrop');
        if (drawer) drawer.classList.remove('active');
        if (backdrop) backdrop.classList.remove('active');
    }

    showRegisterModal(productCode) {
        // Simple Prompt for MVP (User asked for button "+" to input quantity)
        // We can use a custom modal but prompt is safer for quick implementation unless specified.
        // Let's stick to prompt for reliability first, or inject a modal if needed.
        // User said: "al darle click al boton "+" se pueda poner la cantidad"

        const qty = prompt(`Ingrese cantidad envasada para ${productCode}:`);
        if (qty && !isNaN(qty) && Number(qty) > 0) {
            this.registerEnvasado(productCode, Number(qty));
        }
    }

    async registerEnvasado(productCode, quantity) {
        if (!confirm(`¿Confirmar envasado de ${quantity} unidades para ${productCode}?`)) return;

        // Find Item metadata (Origin, Factor)
        const item = this.packingList.find(p => p.codigo === productCode);
        if (!item) return alert('Error: Producto no encontrado en lista local.');

        this.showToast('Registrando envasado...', 'info');

        try {
            const user = this.currentUser ? this.currentUser.username : 'Unknown';
            const payload = {
                idProducto: productCode,
                cantidad: quantity,
                usuario: user,
                factor: item.factor,
                origen: item.origen
            };

            const response = await fetch(API_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: 'saveEnvasado', payload: payload })
            });
            const result = await response.json();

            if (result.status === 'success') {
                this.showToast('Envasado registrado con éxito', 'success');
                this.closePackingDrawer();

                // Refresh Totals & UI immediately
                await this.fetchEnvasadosHistory();
                if (this.state.currentModule === 'envasador') {
                    this.renderPackingList(this.packingList);
                }
            } else {
                alert('Error al guardar: ' + result.message);
            }
        } catch (e) {
            console.error(e);
            alert('Error de conexión al guardar.');
        }
    }
    /* STOCK HISTORY MODAL */
    async showProductHistory(code, desc) {
        // Show Loading Modal
        const loadingHtml = `<div style="text-align:center; padding:3rem;"><i class="fa-solid fa-clock-rotate-left fa-spin fa-2x"></i><br><br>Cargando historial...</div>`;
        this.openModal(loadingHtml);

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({
                    action: 'getProductHistory',
                    payload: { codigo: code }
                })
            });
            const result = await response.json();

            if (result.status === 'success') {
                this.renderHistoryModal(code, desc, result.data);
            } else {
                this.openModal(`<div class="error-msg">Error: ${result.message}</div>`);
            }
        } catch (e) {
            this.openModal(`<div class="error-msg">Error de conexión: ${e.message}</div>`);
        }
    }

    renderHistoryModal(code, desc, data) {
        const { initial, movements } = data;
        let runningBalance = initial;

        // Sort just in case backend didn't
        // movements.sort... (backend does it)

        let rowsHtml = '';

        // Initial Row
        rowsHtml += `
            <tr style="background:#f0f0f0; font-weight:bold;">
                <td>Inicio</td>
                <td>Stock Inicial</td>
                <td>-</td>
                <td>-</td>
                <td>${initial}</td>
            </tr>
        `;

        movements.forEach(mov => {
            let change = mov.qty;
            // Logic:
            // INGRESO: +qty
            // SALIDA: -qty
            // AJUSTE: qty (can be neg or pos)

            let colorClass = '';
            let icon = '';
            let amountDisplay = '';

            if (mov.type === 'INGRESO') {
                runningBalance += change;
                colorClass = 'text-green';
                icon = '<i class="fa-solid fa-arrow-right-to-bracket"></i>';
                amountDisplay = `+${change}`;
            } else if (mov.type === 'SALIDA') {
                runningBalance -= change; // Assuming backend sends positive qty for details
                colorClass = 'text-red';
                icon = '<i class="fa-solid fa-arrow-right-from-bracket"></i>';
                amountDisplay = `-${change}`;
            } else { // AJUSTE
                runningBalance += change;
                colorClass = 'text-orange';
                icon = '<i class="fa-solid fa-wrench"></i>';
                amountDisplay = change > 0 ? `+${change}` : `${change}`;
            }

            // Date Formatting
            let dateStr = mov.date;
            try {
                const dateObj = new Date(mov.date);
                if (!isNaN(dateObj)) {
                    dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }
            } catch (e) { }

            rowsHtml += `
                <tr>
                    <td style="font-size:0.85rem; color:#666;">${dateStr}</td>
                    <td>
                        <span class="${colorClass}">${icon} ${mov.type}</span>
                        <div style="font-size:0.8rem; color:#888;">${mov.ref || '-'}</div>
                    </td>
                    <td style="font-weight:bold; text-align:right;" class="${colorClass}">${amountDisplay}</td>
                    <td style="font-weight:bold; text-align:right;">${runningBalance}</td>
                </tr>
            `;
        });

        const modalHtml = `
            <div class="modal-card" style="max-width: 600px; width: 95%;">
                <div class="modal-header">
                    <h3>${desc}</h3>
                    <button class="modal-close" onclick="app.closeModal()">&times;</button>
                </div>
                <div class="modal-body" style="padding: 1rem; max-height: 70vh; overflow-y: auto;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:1rem; align-items:center;">
                        <span class="code-badge" style="font-size:1rem;">${code}</span>
                        <button class="btn-sm" onclick="document.getElementById('adjust-form').style.display = document.getElementById('adjust-form').style.display === 'none' ? 'block' : 'none'">
                            <i class="fa-solid fa-plus"></i> Nuevo Ajuste
                        </button>
                    </div>

                    <!-- ADJUSTMENT FORM (Hidden by default) -->
                    <div id="adjust-form" style="display:none; background:#f9f9f9; padding:1rem; border-radius:8px; margin-bottom:1rem; border:1px solid #ddd;">
                        <h4 style="margin-top:0;">Registrar Ajuste Manual</h4>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem; margin-bottom:0.5rem;">
                            <div>
                                <label style="font-size:0.8rem;">Cantidad (+/-)</label>
                                <input type="number" id="adj-qty" placeholder="-5 o 10" style="width:100%; padding:5px;">
                            </div>
                            <div>
                                <label style="font-size:0.8rem;">Motivo</label>
                                <input type="text" id="adj-reason" placeholder="Merma, Inventario..." style="width:100%; padding:5px;">
                            </div>
                        </div>
                        <button class="btn-primary" style="width:100%;" onclick="app.saveAdjustment('${code}')">Guardar Ajuste</button>
                    </div>

                    <table style="width:100%; border-collapse: collapse; font-size:0.9rem;">
                        <thead>
                            <tr style="border-bottom:2px solid #ddd;">
                                <th style="text-align:left; padding:8px;">Fecha</th>
                                <th style="text-align:left; padding:8px;">Movimiento</th>
                                <th style="text-align:right; padding:8px;">Cant.</th>
                                <th style="text-align:right; padding:8px;">Saldo</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
            <style>
                .text-green { color: #2ecc71; }
                .text-red { color: #e74c3c; }
                .text-orange { color: #f39c12; }
            </style>
        `;

        this.openModal(modalHtml);
    }

    async saveAdjustment(code) {
        const qtyToSave = parseFloat(document.getElementById('adj-qty').value);
        const reason = document.getElementById('adj-reason').value;

        if (isNaN(qtyToSave) || qtyToSave === 0) return alert('Ingrese una cantidad válida (positiva o negativa).');
        if (!reason) return alert('Ingrese un motivo.');

        const btn = document.querySelector('#adjust-form button');
        btn.disabled = true;
        btn.innerHTML = 'Guardando...';

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({
                    action: 'saveAdjustment',
                    payload: { code, qty: qtyToSave, reason }
                })
            });
            const result = await response.json();
            if (result.status === 'success') {
                this.showToast('Ajuste guardado', 'success');
                // Reload History
                const desc = document.querySelector('.modal-header h3').innerText;
                this.showProductHistory(code, desc);
            } else {
                alert('Error: ' + result.message);
                btn.disabled = false;
                btn.innerHTML = 'Guardar Ajuste';
            }
        } catch (e) {
            console.error(e);
            alert('Error de conexión');
            btn.disabled = false;
            btn.innerHTML = 'Guardar Ajuste';
        }
    }
    // --- QUICK DISPATCH MODULE ---
    openQuickDispatchModal(code, desc) {
        const modalHtml = `
            <div class="modal-card">
                <div class="modal-header">
                    <h3>Despacho Rápido: ${desc}</h3>
                    <button class="modal-close" onclick="app.closeModal()">&times;</button>
                </div>
                <div class="modal-body" style="padding: 1.5rem;">
                     <div style="margin-bottom:1.5rem;">
                        <label style="display:block; font-weight:bold; margin-bottom:0.5rem;">1. Seleccione Cliente / Zona</label>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem;" id="qd-clients">
                            ${(this.clients && this.clients.length > 0 ? this.clients : ['ZONA1', 'ZONA2', 'TIENDA', 'PERSONAL']).map((c, i) =>
            `<button type="button" class="btn-secondary option-btn ${i === 0 ? 'selected' : ''}" onclick="app.selectQuickClient(this, '${c}')">${c}</button>`
        ).join('')}
                        </div>
                     </div>

                     <div style="margin-bottom:1.5rem;">
                        <label style="display:block; font-weight:bold; margin-bottom:0.5rem;">2. Cantidad a Despachar</label>
                        <input type="number" id="qd-qty" class="form-control" value="1" min="1" step="0.01" style="font-size:1.5rem; text-align:center;">
                     </div>

                     <div style="text-align:right;">
                         <button class="btn-primary" onclick="app.handleQuickDispatch('${code}', '${desc}')">
                            <i class="fa-solid fa-paper-plane"></i> Confirmar y Despachar
                         </button>
                     </div>
                </div>
            </div>
            <style>
                .option-btn.selected { background-color: var(--primary-color); color: white; border-color: var(--primary-color); }
            </style>
        `;
        this.openModal(modalHtml);
        setTimeout(() => document.getElementById('qd-qty').focus(), 100);
    }

    selectQuickClient(btn, val) {
        document.querySelectorAll('#qd-clients .option-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
    }

    async handleQuickDispatch(code, desc) {
        const clientBtn = document.querySelector('#qd-clients .selected');
        const client = clientBtn ? clientBtn.innerText : 'ZONA1';
        const qty = parseFloat(document.getElementById('qd-qty').value);

        if (!qty || qty <= 0) return alert('Cantidad inválida');

        const btn = document.querySelector('.modal-body .btn-primary');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
        btn.disabled = true;

        try {
            const response = await fetch(API_URL, {
                method: 'POST', redirect: 'follow',
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({
                    action: 'saveQuickDispatch',
                    payload: { code, desc, client, qty, usuario: this.currentUser.username }
                })
            });
            const result = await response.json();
            if (result.status === 'success') {
                this.closeModal();
                this.showToast('Despacho Guardado (2do Plano)', 'success');

                // OPTIMISTIC UPDATE: Update stock locally for instant feedback
                if (this.data.products[code]) {
                    // Update Local State
                    this.data.products[code].stock = (parseFloat(this.data.products[code].stock) - qty).toFixed(2);

                    // Update DOM (All instances: Front card, Back card, etc.)
                    const stockElements = document.querySelectorAll(`.stock-display-${code}`);
                    stockElements.forEach(el => {
                        el.innerText = this.data.products[code].stock;
                        // Optional: Flash red to indicate change
                        el.style.color = 'red';
                        setTimeout(() => el.style.color = '', 1000);
                    });
                }

                // REMOVED: this.fetchProducts(); // Too slow, relying on optimistic update
            } else {
                alert('Error: ' + result.message);
                btn.disabled = false;
                btn.innerHTML = 'Confirmar y Despachar';
            }
        } catch (e) {
            console.error(e);
            alert('Error de conexión');
            btn.disabled = false;
            btn.innerHTML = 'Confirmar y Despachar';
        }
    }

    printQuickTicket(data, existingWin) {
        let win = existingWin;
        if (!win || win.closed) {
            win = window.open('', 'Imprimir Ticket', 'width=450,height=600');
        }
        if (!win) return alert('Habilite Popups');

        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${data.idGuia}`;

        this.writeReceiptHtml(win, {
            title: 'LEVO ERP',
            subtitle: 'GUÍA DE SALIDA',
            meta: {
                'ID': data.idGuia.substring(0, 13) + '...',
                'Fecha': data.fecha,
                'Destino': data.cliente,
                'Usuario': data.usuario || this.currentUser.username
            },
            items: data.items,
            qr: qrUrl
        });
    }

    // Shared Helper for Receipt HTML
    // Shared Helper for Receipt HTML (Optimized for 80mm Thermal)
    writeReceiptHtml(win, data) {
        // data: { title, subtitle, meta: {}, items: [{desc, code, qty}], qr }

        const itemsHtml = data.items.map(item => `
            <div class="item-row">
                <div class="item-desc">
                    <span class="desc-text">${item.desc}</span>
                    <span class="code-text">${item.code || ''}</span>
                </div>
                <div class="item-qty">x${item.qty}</div>
            </div>
        `).join('');

        // Filter out ID from meta if it exists (user said QR is enough)
        const metaEntries = Object.entries(data.meta).filter(([key]) => key !== 'ID');

        const metaHtml = metaEntries.map(([key, val]) => `
            <div class="meta-row"><span class="label">${key}:</span> <span class="val">${val}</span></div>
        `).join('');

        win.document.open();
        win.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Ticket</title>
                <style>
                    @page { size: 80mm auto; margin: 0; }
                    body { 
                        width: 78mm;
                        margin: 0 auto; 
                        padding: 5px 0;
                        font-family: Arial, Helvetica, sans-serif; /* Thick sans-serif for thermal */
                        color: #000;
                        background: #fff;
                    }
                    .header { text-align: center; margin-bottom: 10px; }
                    .title { font-size: 20px; font-weight: 900; margin: 0; letter-spacing: 1px; }
                    .subtitle { font-size: 16px; font-weight: 800; margin-top: 5px; border-bottom: 3px solid #000; padding-bottom: 8px; }
                    
                    .qr-container { text-align: center; margin: 15px 0; }
                    .qr-img { width: 140px; height: 140px; }
                    
                    .meta-info { font-size: 13px; margin-bottom: 15px; border-bottom: 2px dashed #000; padding-bottom: 15px; }
                    .meta-row { display: flex; margin-bottom: 4px; }
                    .label { font-weight: 800; width: 90px; flex-shrink: 0; }
                    .val { font-weight: 600; white-space: normal; word-break: break-all; }

                    .items-container { margin-top: 10px; }
                    .item-row { display: flex; align-items: center; margin-bottom: 8px; border-bottom: 1px solid #000; padding-bottom: 6px; }
                    .item-desc { flex: 1; padding-right: 5px; overflow: hidden; }
                    .desc-text { display: block; font-weight: 900; font-size: 15px; line-height: 1.2; margin-bottom: 3px; }
                    .code-text { display: block; font-size: 12px; font-weight: 600; color: #000; }
                    .item-qty { font-weight: 900; font-size: 20px; width: 50px; text-align: right; }

                    .footer { margin-top: 25px; text-align: center; font-size: 12px; font-weight: bold; border-top: 3px solid #000; padding-top: 15px; }
                </style>
            </head>
            <body onload="setTimeout(function(){window.print();window.close();}, 800)">
                <div class="header">
                    <div class="title">${data.title || 'LEVO ERP'}</div>
                    <div class="subtitle">${data.subtitle}</div>
                </div>

                <div class="qr-container">
                    <img src="${data.qr}" class="qr-img" alt="QR">
                </div>

                <div class="meta-info">
                    ${metaHtml}
                </div>

                <div class="items-container">
                    ${itemsHtml}
                </div>

                <div class="footer">
                    <div>RECIBIDO CONFORME</div>
                    <br><br><br>
                    <div style="border-top:2px solid #000; width:70%; margin:0 auto; padding-top:4px;">Firma</div>
                </div>
            </body>
            </html>
        `);
        win.document.close();
    }
}
// Initialize App

try {
    window.app = new App();
} catch (err) {
    console.error('Critical Init Error:', err);
    alert('Error crítico al iniciar la aplicación: ' + err.message);
}

