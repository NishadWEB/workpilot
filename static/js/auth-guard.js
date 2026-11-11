/**
 * WorkPilot Authentication Guard & Shell Controller (auth-guard.js)
 * Implements Section 5.7, 5.9, and 9.3:
 * - Restores saved tokens on page load and decodes role & username claims.
 * - Prevents browser Back-button (bfcache) access after logout via pageshow & location.replace.
 * - Refreshes proactively if access token is expired or close to expiry.
 * - Updates role-dependent navigation and header user badges automatically.
 * - Handles POST /api/v1/auth/logout/ and responsive sidebar drawer toggle.
 */
(function () {
    let authReadyPromise = null;

    /**
     * Instantly check if tokens exist; if missing, replace current history entry with login.
     */
    function verifySessionOrRedirect() {
        const keys = window.WP_CONFIG
            ? window.WP_CONFIG.STORAGE_KEYS
            : { ACCESS: "access", REFRESH: "refresh" };
        const loginRoute =
            window.WP_CONFIG && window.WP_CONFIG.ROUTES
                ? window.WP_CONFIG.ROUTES.LOGIN
                : "/login/";

        const access = localStorage.getItem(keys.ACCESS);
        const refresh = localStorage.getItem(keys.REFRESH);
        if (!access && !refresh) {
            window.location.replace(loginRoute);
            return false;
        }
        return true;
    }

    function updateShellUserInterface() {
        const auth = window.WorkPilotAPI.getAuthState();

        // Populate username & role badges in header/sidebar
        document.querySelectorAll("[data-wp-username]").forEach((el) => {
            el.textContent = auth.username || "User";
        });

        document.querySelectorAll("[data-wp-role]").forEach((el) => {
            el.textContent = auth.role || "MEMBER";
        });

        // Show/hide elements tagged for global MANAGER role
        document.querySelectorAll("[data-wp-manager-only]").forEach((el) => {
            if (auth.isGlobalManager) {
                el.classList.remove("d-none");
            } else {
                el.classList.add("d-none");
            }
        });
    }

    function highlightActiveNav() {
        const path = window.location.pathname;
        document.querySelectorAll(".wp-nav-link[data-nav-section]").forEach((link) => {
            const section = link.getAttribute("data-nav-section");
            if (
                (section === "dashboard" && path.startsWith("/dashboard")) ||
                (section === "projects" && path.startsWith("/projects")) ||
                (section === "tasks" && path.startsWith("/tasks")) ||
                (section === "profile" && path.startsWith("/profile"))
            ) {
                link.classList.add("active");
            } else {
                link.classList.remove("active");
            }
        });
    }

    function setupResponsiveSidebar() {
        const sidebar = document.getElementById("wpSidebar");
        const backdrop = document.getElementById("wpSidebarBackdrop");
        const openBtn = document.getElementById("wpSidebarToggleBtn");
        const closeBtn = document.getElementById("wpSidebarCloseBtn");

        function closeSidebar() {
            if (sidebar) sidebar.classList.remove("open");
            if (backdrop) backdrop.classList.remove("show");
        }

        function toggleSidebar() {
            if (!sidebar) return;
            const isOpen = sidebar.classList.toggle("open");
            if (backdrop) {
                backdrop.classList.toggle("show", isOpen);
            }
        }

        if (openBtn) openBtn.addEventListener("click", toggleSidebar);
        if (closeBtn) closeBtn.addEventListener("click", closeSidebar);
        if (backdrop) backdrop.addEventListener("click", closeSidebar);
    }

    /**
     * Section 5.9 & 12.3: Logout
     * POST /api/v1/auth/logout/ with { refresh: CURRENT_REFRESH_TOKEN }
     * Clear access, refresh, role, username, user_id from storage and replace history entry with login.
     */
    async function handleLogout(event) {
        if (event) event.preventDefault();
        const refresh = localStorage.getItem(window.WP_CONFIG.STORAGE_KEYS.REFRESH);

        try {
            if (refresh) {
                await fetch(`${window.WP_CONFIG.AUTH_BASE}/logout/`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ refresh }),
                });
            }
        } catch (err) {
            // Even if network fails, clear client session state
        } finally {
            window.WorkPilotAPI.clearAuthState();
            window.location.replace(window.WP_CONFIG.ROUTES.LOGIN);
        }
    }

    /**
     * Section 9.3: Reload and return journey.
     * Ensures tokens are present and valid (refreshing if needed) before page data fetches run.
     */
    async function ensureAuthenticated() {
        if (!verifySessionOrRedirect()) {
            throw new Error("Unauthenticated");
        }

        if (authReadyPromise) return authReadyPromise;

        authReadyPromise = (async () => {
            const auth = window.WorkPilotAPI.getAuthState();
            if (!auth.access && !auth.refresh) {
                window.WorkPilotAPI.clearAuthState();
                window.location.replace(window.WP_CONFIG.ROUTES.LOGIN);
                throw new Error("Unauthenticated");
            }

            // Render cached claims immediately for fast UI response
            updateShellUserInterface();

            // Check if access token is expired or near expiry
            if (!auth.access || window.WorkPilotAPI.isAccessTokenExpired(auth.access, 30)) {
                await window.WorkPilotAPI.refreshTokens();
                updateShellUserInterface();
            }

            // Ensure we have the database User ID cached (via JWT user_id claim or GET /api/v1/auth/users/me/)
            const updatedAuth = window.WorkPilotAPI.getAuthState();
            if (!updatedAuth.userId) {
                try {
                    const profile = await window.WorkPilotAPI.get("/auth/users/me/");
                    if (profile && profile.id) {
                        localStorage.setItem(
                            window.WP_CONFIG.STORAGE_KEYS.USER_ID,
                            String(profile.id)
                        );
                    }
                } catch (e) {
                    // Profile lookup is optional if user_id is already in JWT
                }
            }

            return window.WorkPilotAPI.getAuthState();
        })();

        return authReadyPromise;
    }

    // Verify immediately when script executes
    verifySessionOrRedirect();

    // Catch browser Back/Forward cache restoration (bfcache)
    window.addEventListener("pageshow", function () {
        if (!verifySessionOrRedirect()) {
            return;
        }
        updateShellUserInterface();
    });

    // Listen for token refresh events to re-render role-dependent UI automatically
    window.addEventListener("wp:auth-updated", updateShellUserInterface);

    document.addEventListener("DOMContentLoaded", () => {
        if (!verifySessionOrRedirect()) return;

        highlightActiveNav();
        setupResponsiveSidebar();
        updateShellUserInterface();

        document.querySelectorAll("[data-wp-logout]").forEach((btn) => {
            btn.addEventListener("click", handleLogout);
        });
    });

    window.WorkPilotAuthGuard = {
        ensureAuthenticated,
        updateShellUserInterface,
        handleLogout,
        verifySessionOrRedirect,
    };
})();