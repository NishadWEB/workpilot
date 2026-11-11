/**
 * WorkPilot Theme Controller (theme.js)
 * Persists Light Mode ("light") or Dark Mode ("dark") in localStorage under key "theme".
 * Applies theme immediately to document.documentElement to prevent flash of wrong theme.
 */
(function () {
    const THEME_STORAGE_KEY = "theme";

    function getSavedTheme() {
        try {
            const saved = localStorage.getItem(THEME_STORAGE_KEY);
            return saved === "dark" ? "dark" : "light";
        } catch (e) {
            return "light";
        }
    }

    function applyTheme(theme) {
        const normalized = theme === "dark" ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", normalized);
        try {
            localStorage.setItem(THEME_STORAGE_KEY, normalized);
        } catch (e) {
            // Ignore storage errors in restricted environments
        }
        updateToggleLabels(normalized);
    }

    function updateToggleLabels(theme) {
        const toggles = document.querySelectorAll("[data-theme-toggle]");
        toggles.forEach((btn) => {
            const labelEl = btn.querySelector(".wp-theme-label");
            const iconEl = btn.querySelector(".wp-theme-icon");
            if (theme === "dark") {
                if (iconEl) iconEl.textContent = "☀";
                if (labelEl) labelEl.textContent = "Light Mode";
                btn.setAttribute("aria-label", "Switch to Light Mode");
            } else {
                if (iconEl) iconEl.textContent = "☾";
                if (labelEl) labelEl.textContent = "Dark Mode";
                btn.setAttribute("aria-label", "Switch to Dark Mode");
            }
        });
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute("data-theme") || getSavedTheme();
        const next = current === "dark" ? "light" : "dark";
        applyTheme(next);
    }

    // Apply immediately when script loads
    applyTheme(getSavedTheme());

    document.addEventListener("DOMContentLoaded", () => {
        applyTheme(getSavedTheme());
        document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
            btn.addEventListener("click", toggleTheme);
        });
    });

    window.WorkPilotTheme = {
        getSavedTheme,
        applyTheme,
        toggleTheme,
    };
})();
