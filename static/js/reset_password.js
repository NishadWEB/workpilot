/**
 * WorkPilot Login & Registration Controller (auth.js)
 * Implements Section 5.4, 9.2, 12.1 (Register) and 12.2 (Login).
 */
(function () {
      function initResetPasswordForm() {
        const form = document.getElementById("wpResetPasswordForm");
        if (!form) return;

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            window.WorkPilotAPI.clearFormErrors(form);

            const urlParams = new URLSearchParams(window.location.search);

            const uid = urlParams.get("uid");
            const token = urlParams.get("token");

            const new_password = form.querySelector('[name="new_password"]')?.value || "";
            const confirm_password = form.querySelector('[name="confirm_password"]')?.value || "";
            const submitBtn = document.getElementById("wpResetPasswordSubmitBtn");

            if (!new_password || !confirm_password) {
                window.WorkPilotAPI.showNotice(
                    "Both password fields are required.",
                    "error",
                    "wpAuthNoticeContainer"
                );
                return;
            }

            if (new_password !== confirm_password) {
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
                submitBtn.textContent = "Submiting...";
            }

            try {
                // Section 12.1: POST /api/v1/auth/password/
                // Sends ONLY new_password, confirm_password.
                // Does not auto-login; shows success and navigates to login.
                const response = await window.WorkPilotAPI.post(
                    `/auth/password/?uid=${uid}&token=${token}`,
                    {
                        new_password,
                        confirm_password,
                    },
                    { auth: false }
                );
                const successMsg = (response && response.message) || "Password reset successfull.";
                console.log('success message is : ', successMsg);
                window.WorkPilotAPI.showNotice(successMsg, "success", "wpAuthNoticeContainer");
                form.reset();
                
            } catch (err) {
                const parsed = window.WorkPilotAPI.parseError(err);
                window.WorkPilotAPI.applyFormErrors(form, parsed.fieldErrors);
                window.WorkPilotAPI.showNotice(parsed.summary, "error", "wpAuthNoticeContainer");
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Submit";
                }
            }
        });
    }

    document.addEventListener("DOMContentLoaded", () => {
        initResetPasswordForm();
    });
})();
