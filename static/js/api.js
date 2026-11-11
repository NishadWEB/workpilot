/**
 * WorkPilot Shared API & UI Helper Utility (api.js)
 * Implements Section 5 (JWT & role refresh), Section 11 (API conventions),
 * Section 19 (Error parsing & 204 handling), and Section 20 (Date formatting).
 */
(function () {
    let inFlightRefreshPromise = null;

    /**
     * Decode a JWT access token payload for UI state (role, username, user_id, exp).
     * Section 5.4: Browser decoding is for display/UI state; backend verifies signatures.
     */
    function decodeAccessToken(token) {
        if (!token || typeof token !== "string") return null;
        try {
            const parts = token.split(".");
            if (parts.length < 2) return null;
            const payloadPart = parts[1];
            const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
            const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
            const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
            return JSON.parse(new TextDecoder().decode(bytes));
        } catch (err) {
            return null;
        }
    }

    /**
     * Save access & refresh tokens and update cached role/username/user_id from decoded JWT claims.
     */
    function saveAuthTokens(access, refresh) {
        const keys = window.WP_CONFIG.STORAGE_KEYS;
        if (access) {
            localStorage.setItem(keys.ACCESS, access);
            const claims = decodeAccessToken(access);
            if (claims) {
                if (claims.role) localStorage.setItem(keys.ROLE, claims.role);
                if (claims.username) localStorage.setItem(keys.USERNAME, claims.username);
                if (claims.user_id !== undefined && claims.user_id !== null) {
                    localStorage.setItem(keys.USER_ID, String(claims.user_id));
                }
            }
        }
        if (refresh) {
            localStorage.setItem(keys.REFRESH, refresh);
        }
        window.dispatchEvent(new CustomEvent("wp:auth-updated"));
    }

    /**
     * Clear all authentication keys from localStorage (preserves theme preference).
     */
    function clearAuthState() {
        const keys = window.WP_CONFIG.STORAGE_KEYS;
        localStorage.removeItem(keys.ACCESS);
        localStorage.removeItem(keys.REFRESH);
        localStorage.removeItem(keys.ROLE);
        localStorage.removeItem(keys.USERNAME);
        localStorage.removeItem(keys.USER_ID);
    }

    /**
     * Read current auth state from localStorage + decoded access token.
     */
    function getAuthState() {
        const keys = window.WP_CONFIG.STORAGE_KEYS;
        const access = localStorage.getItem(keys.ACCESS);
        const refresh = localStorage.getItem(keys.REFRESH);
        const claims = decodeAccessToken(access);

        const role = (claims && claims.role) || localStorage.getItem(keys.ROLE) || null;
        const username = (claims && claims.username) || localStorage.getItem(keys.USERNAME) || null;
        const rawUserId =
            (claims && claims.user_id !== undefined ? claims.user_id : null) ??
            localStorage.getItem(keys.USER_ID);
        const userId = rawUserId !== null && rawUserId !== "" ? Number(rawUserId) : null;

        return {
            access,
            refresh,
            role,
            username,
            userId,
            claims,
            isGlobalManager: role === "MANAGER",
        };
    }

    /**
     * Check whether the given access token is missing, malformed, expired, or close to expiry.
     */
    function isAccessTokenExpired(token, bufferSeconds) {
        const claims = decodeAccessToken(token);
        if (!claims || typeof claims.exp !== "number") return true;
        const buffer =
            typeof bufferSeconds === "number"
                ? bufferSeconds
                : window.WP_CONFIG.TOKEN_EXPIRY_BUFFER_SECONDS;
        const nowSeconds = Math.floor(Date.now() / 1000);
        return claims.exp <= nowSeconds + buffer;
    }

    /**
     * Section 5.5 & 5.8: Single shared in-flight token refresh operation.
     * Sends POST /api/v1/auth/refresh/ with { refresh } only.
     * Stores BOTH returned access and rotated refresh tokens and updates role/username claims.
     */
    async function refreshTokens() {
        if (inFlightRefreshPromise) {
            return inFlightRefreshPromise;
        }

        const keys = window.WP_CONFIG.STORAGE_KEYS;
        const currentRefresh = localStorage.getItem(keys.REFRESH);

        if (!currentRefresh) {
            clearAuthState();
            throw { status: 401, detail: "Session expired. Please log in again." };
        }

        inFlightRefreshPromise = (async () => {
            try {
                const response = await fetch(`${window.WP_CONFIG.AUTH_BASE}/refresh/`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ refresh: currentRefresh }),
                });

                let data = null;
                const text = await response.text();
                if (text) {
                    try {
                        data = JSON.parse(text);
                    } catch (e) {
                        data = null;
                    }
                }

                if (!response.ok || !data || !data.access) {
                    clearAuthState();
                    redirectToLogin();
                    throw data || { status: response.status, detail: "Token refresh failed." };
                }

                // Store both newly issued access token and rotated refresh token
                saveAuthTokens(data.access, data.refresh || currentRefresh);
                return data.access;
            } catch (err) {
                clearAuthState();
                redirectToLogin();
                throw err;
            } finally {
                inFlightRefreshPromise = null;
            }
        })();

        return inFlightRefreshPromise;
    }

    function redirectToLogin() {
        const path = window.location.pathname;
        if (
            path !== window.WP_CONFIG.ROUTES.LOGIN &&
            path !== window.WP_CONFIG.ROUTES.REGISTER
        ) {
            window.location.href = window.WP_CONFIG.ROUTES.LOGIN;
        }
    }

    /**
     * Normalize an endpoint path or full pagination URL into a fetchable same-origin path.
     */
    function resolveUrl(endpointOrUrl) {
        if (!endpointOrUrl) return window.WP_CONFIG.API_BASE + "/";
        if (endpointOrUrl.startsWith("http://") || endpointOrUrl.startsWith("https://")) {
            try {
                const parsed = new URL(endpointOrUrl);
                return parsed.pathname + parsed.search;
            } catch (e) {
                return endpointOrUrl;
            }
        }
        if (endpointOrUrl.startsWith("/api/")) {
            return endpointOrUrl;
        }
        const cleanPath = endpointOrUrl.startsWith("/") ? endpointOrUrl : `/${endpointOrUrl}`;
        return `${window.WP_CONFIG.API_BASE}${cleanPath}`;
    }

    /**
     * Core Fetch wrapper (Section 11.3 - 11.5).
     * - Attaches Authorization: Bearer ACCESS_TOKEN for protected requests.
     * - Never parses 204 No Content as JSON.
     * - Handles 401 with single shared refresh operation and retries original request once.
     * - Does not retry 400 validation or 403 permission errors.
     */
    async function request(endpointOrUrl, options = {}) {
        const isProtected = options.auth !== false;
        const method = (options.method || "GET").toUpperCase();
        const url = resolveUrl(endpointOrUrl);

        let access = localStorage.getItem(window.WP_CONFIG.STORAGE_KEYS.ACCESS);

        if (isProtected) {
            if (!access || isAccessTokenExpired(access, 10)) {
                access = await refreshTokens();
            }
        }

        const headers = Object.assign(
            {
                "Content-Type": "application/json",
            },
            options.headers || {}
        );

        if (isProtected && access) {
            headers["Authorization"] = `Bearer ${access}`;
        }

        const fetchOptions = {
            method,
            headers,
        };

        if (options.body !== undefined && options.body !== null && method !== "GET") {
            fetchOptions.body =
                typeof options.body === "string" ? options.body : JSON.stringify(options.body);
        }

        let response;
        try {
            response = await fetch(url, fetchOptions);
        } catch (networkErr) {
            throw {
                status: 0,
                isNetworkError: true,
                detail: "Network error: Unable to reach the WorkPilot server. Please verify the Django server is running.",
            };
        }

        // Section 11.3 & 19: On 401 for a protected endpoint, attempt refresh once and retry once
        if (response.status === 401 && isProtected && !options._retried) {
            const newAccess = await refreshTokens();
            if (newAccess) {
                return request(endpointOrUrl, Object.assign({}, options, { _retried: true }));
            }
        }

        // Section 11.5: Never parse 204 No Content as JSON
        if (response.status === 204) {
            return null;
        }

        const rawText = await response.text();
        let data = null;
        if (rawText) {
            try {
                data = JSON.parse(rawText);
            } catch (parseErr) {
                if (!response.ok) {
                    throw {
                        status: response.status,
                        detail:
                            response.status >= 500
                                ? "A server error occurred (HTTP " + response.status + ")."
                                : "Unexpected non-JSON response from server (HTTP " + response.status + ").",
                    };
                }
            }
        }

        if (!response.ok) {
            const errorObj =
                data && typeof data === "object"
                    ? Object.assign({ status: response.status }, data)
                    : { status: response.status, detail: rawText || `Request failed (${response.status})` };
            throw errorObj;
        }

        return data;
    }

    /**
     * Section 19.1: Unified readable error parser for DRF serializer errors, detail, message, and non_field_errors.
     */
    function parseError(error) {
        const result = {
            status: error && error.status ? error.status : null,
            summary: "An unexpected error occurred.",
            fieldErrors: {},
        };

        if (!error) return result;

        if (typeof error === "string") {
            result.summary = error;
            return result;
        }

        const messages = [];

        if (typeof error.detail === "string") {
            messages.push(error.detail);
        } else if (Array.isArray(error.detail)) {
            messages.push(error.detail.join(" "));
        }

        if (typeof error.message === "string") {
            messages.push(error.message);
        }

        if (Array.isArray(error.non_field_errors)) {
            messages.push(error.non_field_errors.join(" "));
        } else if (typeof error.non_field_errors === "string") {
            messages.push(error.non_field_errors);
        }

        const ignoredKeys = new Set(["status", "detail", "message", "non_field_errors", "isNetworkError"]);
        Object.keys(error).forEach((key) => {
            if (ignoredKeys.has(key)) return;
            const val = error[key];
            if (Array.isArray(val)) {
                const text = val.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join(" ");
                result.fieldErrors[key] = text;
                messages.push(`${formatFieldName(key)}: ${text}`);
            } else if (typeof val === "string") {
                result.fieldErrors[key] = val;
                messages.push(`${formatFieldName(key)}: ${val}`);
            }
        });

        if (messages.length > 0) {
            result.summary = messages.join(" | ");
        } else if (error.status === 403) {
            result.summary = "Access denied: You do not have permission to perform this action.";
        } else if (error.status === 404) {
            result.summary = "The requested record was not found or is outside your accessible scope.";
        } else if (error.status >= 500) {
            result.summary = "Server error. Please try again later.";
        }

        return result;
    }

    function formatFieldName(field) {
        return String(field)
            .replace(/_/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase());
    }

    /**
     * Render field-level validation messages inside a form and clear old ones.
     */
    function clearFormErrors(formEl) {
        if (!formEl) return;
        formEl.querySelectorAll(".wp-field-error").forEach((el) => el.remove());
        formEl.querySelectorAll(".is-invalid").forEach((el) => el.classList.remove("is-invalid"));
    }

    function applyFormErrors(formEl, fieldErrors) {
        if (!formEl || !fieldErrors) return;
        Object.keys(fieldErrors).forEach((fieldName) => {
            const input = formEl.querySelector(`[name="${fieldName}"]`);
            if (input) {
                input.classList.add("is-invalid");
                const errDiv = document.createElement("div");
                errDiv.className = "wp-field-error";
                errDiv.textContent = fieldErrors[fieldName];
                input.insertAdjacentElement("afterend", errDiv);
            }
        });
    }

    /**
     * Global banner notice helper.
     */
    function showNotice(message, type = "info", containerId = "wpGlobalNoticeContainer") {
        console.log('ShowNotice function called');
        const container = document.getElementById(containerId);
        if (!container) return;

        const wrapper = document.createElement("div");
        wrapper.className = "wp-notice";
        wrapper.setAttribute("role", "alert");

        const textSpan = document.createElement("div");
        textSpan.className = "text-wrap-safe";
        textSpan.innerHTML = `<strong>${type === "success" ? "Success:" : type === "error" ? "Notice:" : "Info:"}</strong> `;
        console.log('textSpan innerHTML: ', textSpan.innerHTML);
        const msgNode = document.createTextNode(message);
        console.log('msgNode: ', msgNode);
        textSpan.appendChild(msgNode);

        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "btn-close btn-sm";
        closeBtn.setAttribute("aria-label", "Close");
        closeBtn.addEventListener("click", () => wrapper.remove());

        wrapper.appendChild(textSpan);
        wrapper.appendChild(closeBtn);

        container.innerHTML = "";
        container.appendChild(wrapper);

        if (type === "success") {
            setTimeout(() => {
                if (wrapper.parentNode) wrapper.remove();
            }, 8000);
        }
    }

    /**
     * Section 20: Date & Timestamp formatting helpers.
     * Does not manually append +05:30 to timestamps that already include an offset.
     */
    function formatDate(dateStr) {
        if (!dateStr) return "—";
        try {
            const parts = String(dateStr).split("-");
            if (parts.length === 3) {
                const year = Number(parts[0]);
                const month = Number(parts[1]) - 1;
                const day = Number(parts[2]);
                const d = new Date(year, month, day);
                if (!isNaN(d.getTime())) {
                    return d.toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "2-digit",
                    });
                }
            }
            const parsed = new Date(dateStr);
            return isNaN(parsed.getTime()) ? String(dateStr) : parsed.toLocaleDateString();
        } catch (e) {
            return String(dateStr);
        }
    }

    function formatDateTime(isoStr) {
        if (!isoStr) return "—";
        try {
            const d = new Date(isoStr);
            if (isNaN(d.getTime())) return String(isoStr);
            return d.toLocaleString(undefined, {
                year: "numeric",
                month: "short",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
            });
        } catch (e) {
            return String(isoStr);
        }
    }

    /**
     * Section 7.4 & 19.2: Reusable Destructive Action Confirmation Modal.
     * Reserves red styling strictly for destructive confirmations.
     * Does not remove record from UI until backend confirms success.
     */
    function confirmDestructiveAction({ title, message, confirmLabel = "Delete", onConfirm }) {
        const modalEl = document.getElementById("wpDestructiveConfirmModal");
        if (!modalEl || typeof bootstrap === "undefined") {
            if (window.confirm(message || "Are you sure you want to proceed?")) {
                onConfirm();
            }
            return;
        }

        const titleEl = document.getElementById("wpDestructiveModalTitle");
        const bodyEl = document.getElementById("wpDestructiveModalBody");
        const confirmBtn = document.getElementById("wpDestructiveModalConfirmBtn");

        if (titleEl) titleEl.textContent = title || "Confirm Action";
        if (bodyEl) bodyEl.textContent = message || "Are you sure you want to proceed with this action?";
        if (confirmBtn) {
            confirmBtn.textContent = confirmLabel;
            confirmBtn.disabled = false;
        }

        const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);

        // Replace button listener cleanly
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

        newConfirmBtn.addEventListener("click", async () => {
            newConfirmBtn.disabled = true;
            const originalText = newConfirmBtn.textContent;
            newConfirmBtn.textContent = "Processing...";
            try {
                await onConfirm();
                modalInstance.hide();
            } catch (err) {
                newConfirmBtn.disabled = false;
                newConfirmBtn.textContent = originalText;
            }
        });

        modalInstance.show();
    }

    /**
     * Escape HTML special characters to prevent XSS when rendering user content.
     */
    function escapeHtml(value) {
        if (value === null || value === undefined) return "";
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    window.WorkPilotAPI = {
        decodeAccessToken,
        saveAuthTokens,
        clearAuthState,
        getAuthState,
        isAccessTokenExpired,
        refreshTokens,
        request,
        get: (url, opts) => request(url, Object.assign({}, opts, { method: "GET" })),
        post: (url, body, opts) => request(url, Object.assign({}, opts, { method: "POST", body })),
        patch: (url, body, opts) => request(url, Object.assign({}, opts, { method: "PATCH", body })),
        delete: (url, opts) => request(url, Object.assign({}, opts, { method: "DELETE" })),
        parseError,
        clearFormErrors,
        applyFormErrors,
        showNotice,
        formatDate,
        formatDateTime,
        confirmDestructiveAction,
        escapeHtml,
    };
})();
