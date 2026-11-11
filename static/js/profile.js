/**
 * WorkPilot User Profile Controller (profile.js)
 * Implements Section 12.5 (GET /api/v1/auth/users/me/),
 * Section 12.6 (PATCH /api/v1/auth/users/me/ with username & email only),
 * and Section 12.7 (DELETE /api/v1/auth/users/me/ account deactivation).
 */
(function () {
    let currentProfile = null;

    async function loadProfile() {
        const loadingEl = document.getElementById("wpProfileLoading");
        const contentEl = document.getElementById("wpProfileContent");

        try {
            const auth = await window.WorkPilotAuthGuard.ensureAuthenticated();
            const profile = await window.WorkPilotAPI.get("/auth/users/me/");
            currentProfile = profile;

            if (profile && profile.id) {
                localStorage.setItem(window.WP_CONFIG.STORAGE_KEYS.USER_ID, String(profile.id));
            }

            if (loadingEl) loadingEl.classList.add("d-none");
            if (contentEl) contentEl.classList.remove("d-none");

            renderProfile(profile, auth);
        } catch (err) {
            if (loadingEl) loadingEl.classList.add("d-none");
            const parsed = window.WorkPilotAPI.parseError(err);
            window.WorkPilotAPI.showNotice(parsed.summary, "error");
        }
    }

    function renderProfile(profile, auth) {
        const fmtDateTime = window.WorkPilotAPI.formatDateTime;

        setText("wpProfileIdText", `#${profile.id}`);
        setText("wpProfileUsernameDisplay", profile.username);
        setText("wpProfileEmailDisplay", profile.email || "—");
        setText("wpProfileRoleDisplay", auth.role || "MEMBER");
        setText("wpProfileDateJoinedText", fmtDateTime(profile.date_joined));
        setText("wpProfileActiveText", profile.is_active ? "Active" : "Inactive");

        const form = document.getElementById("wpProfileEditForm");
        if (form) {
            const usernameInput = form.querySelector('[name="username"]');
            const emailInput = form.querySelector('[name="email"]');
            if (usernameInput) usernameInput.value = profile.username || "";
            if (emailInput) emailInput.value = profile.email || "";
        }
    }

    function setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val !== undefined && val !== null ? String(val) : "—";
    }

    /**
     * Section 12.6: PATCH /api/v1/auth/users/me/
     * Editable fields: username and email ONLY.
     * id, is_superuser, is_staff, is_active and date_joined are read-only.
     */
    function initProfileEditForm() {
        const form = document.getElementById("wpProfileEditForm");
        if (!form) return;

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            window.WorkPilotAPI.clearFormErrors(form);

            const username = form.querySelector('[name="username"]')?.value.trim() || "";
            const email = form.querySelector('[name="email"]')?.value.trim() || "";
            const submitBtn = document.getElementById("wpProfileSaveBtn");

            if (!username || !email) {
                window.WorkPilotAPI.showNotice(
                    "Username and email are required.",
                    "error"
                );
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Saving...";
            }

            try {
                const updated = await window.WorkPilotAPI.patch("/auth/users/me/", {
                    username,
                    email,
                });

                currentProfile = updated;

                // Refresh tokens so the latest username claim is carried in a newly rotated JWT pair (Section 12.6)
                try {
                    await window.WorkPilotAPI.refreshTokens();
                } catch (refreshErr) {
                    // Fallback to updating cached username in localStorage
                    localStorage.setItem(window.WP_CONFIG.STORAGE_KEYS.USERNAME, updated.username);
                    window.dispatchEvent(new CustomEvent("wp:auth-updated"));
                }

                const auth = window.WorkPilotAPI.getAuthState();
                renderProfile(updated, auth);
                window.WorkPilotAPI.showNotice("Profile updated.", "success");
            } catch (err) {
                const parsed = window.WorkPilotAPI.parseError(err);
                window.WorkPilotAPI.applyFormErrors(form, parsed.fieldErrors);
                window.WorkPilotAPI.showNotice(parsed.summary, "error");
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Save Profile Changes";
                }
            }
        });
    }

    /**
     * Section 12.7: DELETE /api/v1/auth/users/me/
     * Deactivates account (returns 204 No Content). Clear auth state and redirect to login.
     */
    function initDeactivateAccountButton() {
        const btn = document.getElementById("wpDeactivateAccountBtn");
        if (!btn) return;

        btn.addEventListener("click", () => {
            window.WorkPilotAPI.confirmDestructiveAction({
                title: "Deactivate Account",
                message:
                    "Are you sure you want to deactivate your WorkPilot account? You will be signed out immediately and will not be able to log in or refresh tokens unless reactivated by an administrator.",
                confirmLabel: "Deactivate Account",
                onConfirm: async () => {
                    try {
                        await window.WorkPilotAPI.delete("/auth/users/me/");
                        window.WorkPilotAPI.clearAuthState();
                        window.location.href = window.WP_CONFIG.ROUTES.LOGIN;
                    } catch (err) {
                        const parsed = window.WorkPilotAPI.parseError(err);
                        window.WorkPilotAPI.showNotice(parsed.summary, "error");
                        throw err;
                    }
                },
            });
        });
    }

    document.addEventListener("DOMContentLoaded", () => {
        initProfileEditForm();
        initDeactivateAccountButton();
        loadProfile();
    });
})();
