/**
 * WorkPilot Login & Registration Controller (auth.js)
 * Implements Section 5.4, 9.2, 12.1 (Register) and 12.2 (Login).
 */
(function () {
    function redirectIfAlreadyLoggedIn() {
        const auth = window.WorkPilotAPI.getAuthState();
        if (auth.access && !window.WorkPilotAPI.isAccessTokenExpired(auth.access, 10)) {
            window.location.href = window.WP_CONFIG.ROUTES.DASHBOARD;
        }
    }

    function initLoginForm() {
        const form = document.getElementById("wpLoginForm");
        if (!form) return;

        // Check if user just registered
        const params = new URLSearchParams(window.location.search);
        if (params.get("registered") === "1") {
            window.WorkPilotAPI.showNotice(
                "Account registered! Please log in with your username and password.",
                "success",
                "wpAuthNoticeContainer"
            );
        }

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            window.WorkPilotAPI.clearFormErrors(form);

            const usernameInput = form.querySelector('[name="username"]');
            const passwordInput = form.querySelector('[name="password"]');
            const submitBtn = document.getElementById("wpLoginSubmitBtn");

            const username = usernameInput ? usernameInput.value.trim() : "";
            const password = passwordInput ? passwordInput.value : "";

            if (!username || !password) {
                window.WorkPilotAPI.showNotice(
                    "Please enter both your username and password.",
                    "error",
                    "wpAuthNoticeContainer"
                );
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Signing in...";
            }

            try {
                // Section 12.2: POST /api/v1/auth/login/ with { username, password }
                const data = await window.WorkPilotAPI.post(
                    "/auth/login/",
                    { username, password },
                    { auth: false }
                );

                if (!data || !data.access || !data.refresh) {
                    throw { detail: "Invalid login response from server." };
                }

                // Store access & refresh tokens and decode role & username claims
                window.WorkPilotAPI.saveAuthTokens(data.access, data.refresh);

                // Fetch current user profile if user_id was not present in token claims
                const authState = window.WorkPilotAPI.getAuthState();
                if (!authState.userId) {
                    try {
                        const me = await window.WorkPilotAPI.get("/auth/users/me/");
                        if (me && me.id) {
                            localStorage.setItem(
                                window.WP_CONFIG.STORAGE_KEYS.USER_ID,
                                String(me.id)
                            );
                        }
                    } catch (profileErr) {
                        // Continue to dashboard even if optional profile call fails
                    }
                }

                window.location.href = window.WP_CONFIG.ROUTES.DASHBOARD;
            } catch (err) {
                const parsed = window.WorkPilotAPI.parseError(err);
                window.WorkPilotAPI.applyFormErrors(form, parsed.fieldErrors);
                window.WorkPilotAPI.showNotice(parsed.summary, "error", "wpAuthNoticeContainer");
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Sign In";
                }
            }
        });
    }

    function initRegisterForm() {
        const form = document.getElementById("wpRegisterForm");
        if (!form) return;

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            window.WorkPilotAPI.clearFormErrors(form);

            const username = form.querySelector('[name="username"]')?.value.trim() || "";
            const email = form.querySelector('[name="email"]')?.value.trim() || "";
            const password = form.querySelector('[name="password"]')?.value || "";
            const confirm_password = form.querySelector('[name="confirm_password"]')?.value || "";
            const submitBtn = document.getElementById("wpRegisterSubmitBtn");

            if (!username || !email || !password || !confirm_password) {
                window.WorkPilotAPI.showNotice(
                    "All four registration fields are required.",
                    "error",
                    "wpAuthNoticeContainer"
                );
                return;
            }

            if (password !== confirm_password) {
                window.WorkPilotAPI.applyFormErrors(form, {
                    confirm_password: "Passwords do not match.",
                });
                window.WorkPilotAPI.showNotice(
                    "Password and Confirm Password must match.",
                    "error",
                    "wpAuthNoticeContainer"
                );
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Creating account...";
            }

            try {
                // Section 12.1: POST /api/v1/auth/register/
                // Sends ONLY username, email, password, confirm_password.
                // Does not auto-login; shows success and navigates to login.
                const response = await window.WorkPilotAPI.post(
                    "/auth/register/",
                    {
                        username,
                        email,
                        password,
                        confirm_password,
                    },
                    { auth: false }
                );
                console.log('before extracting "response" object');
                const successMsg = (response && response.message) || "Registered successfully. Redirecting to login...";
                console.log('in try block');
                console.log('success message is : ', successMsg);
                window.WorkPilotAPI.showNotice(successMsg, "success", "wpAuthNoticeContainer");
                form.reset();

                setTimeout(() => {
                    window.location.href = `${window.WP_CONFIG.ROUTES.LOGIN}?registered=1`;
                }, 900);
            } catch (err) {
                console.log('in catch block');
                console.log(err)
                const parsed = window.WorkPilotAPI.parseError(err);
                // window.WorkPilotAPI.applyFormErrors(form, parsed.fieldErrors);
                window.WorkPilotAPI.showNotice(parsed.summary, "error", "wpAuthNoticeContainer");
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Create Account";
                }
            }
        });
    }

    document.addEventListener("DOMContentLoaded", () => {
        redirectIfAlreadyLoggedIn();
        initLoginForm();
        initRegisterForm();
    });
})();
