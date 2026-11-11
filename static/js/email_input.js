/**
 * WorkPilot Login & Registration Controller (auth.js)
 * Implements Section 5.4, 9.2, 12.1 (Register) and 12.2 (Login).
 */
(function () {
    function initEmailSendingForm() {
        const form = document.getElementById("wpRegisterForm");
        if (!form) return;

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            window.WorkPilotAPI.clearFormErrors(form);

            const email = form.querySelector('[name="email"]')?.value.trim() || "";
            const submitBtn = document.getElementById("wpEmailInputSubmitBtn");

            if (!email) {
                window.WorkPilotAPI.showNotice(
                    "Email field is required.",
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
                // Section 12.1: POST /api/v1/auth/email/
                const response = await window.WorkPilotAPI.post(
                    "/auth/email/",
                    {
                        email,
                    },
                    { auth: false }
                );

                const successMsg =
                    (response && response.message) ||
                    "Reset link sent to your email.";
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
        initEmailSendingForm();
    });
})();
