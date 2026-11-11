/**
 * WorkPilot Projects Page Controller (projects.js)
 * Implements Section 13.1 (List/search/filter/order projects), Section 13.2 (Create project),
 * and Section 18 (Pagination envelope with next/previous links).
 */
(function () {
    let currentNextUrl = null;
    let currentPrevUrl = null;
    let currentPage = 1;

    function buildProjectsQueryUrl(page = 1) {
        const params = new URLSearchParams();
        const searchVal = document.getElementById("wpProjectSearchInput")?.value.trim() || "";
        const statusVal = document.getElementById("wpProjectStatusFilter")?.value || "";
        const deadlineVal = document.getElementById("wpProjectDeadlineFilter")?.value || "";
        const orderingVal = document.getElementById("wpProjectOrderingSelect")?.value || "";

        if (searchVal) params.set("search", searchVal);
        if (statusVal) params.set("status", statusVal);
        if (deadlineVal) params.set("deadline", deadlineVal);
        if (orderingVal) params.set("ordering", orderingVal);
        if (page > 1) params.set("page", String(page));

        const qs = params.toString();
        return qs ? `/projects/?${qs}` : "/projects/";
    }

    async function loadProjects(customUrl = null) {
        const loadingEl = document.getElementById("wpProjectsLoading");
        const emptyEl = document.getElementById("wpProjectsEmpty");
        const tableWrapperEl = document.getElementById("wpProjectsTableWrapper");
        const tbodyEl = document.getElementById("wpProjectsTableBody");
        const paginationBar = document.getElementById("wpProjectsPagination");
        const countLabel = document.getElementById("wpProjectsCountLabel");
        const prevBtn = document.getElementById("wpProjectsPrevBtn");
        const nextBtn = document.getElementById("wpProjectsNextBtn");

        if (loadingEl) loadingEl.classList.remove("d-none");
        if (emptyEl) emptyEl.classList.add("d-none");

        try {
            await window.WorkPilotAuthGuard.ensureAuthenticated();
            const targetUrl = customUrl || buildProjectsQueryUrl(currentPage);
            const data = await window.WorkPilotAPI.get(targetUrl);

            const results = Array.isArray(data) ? data : (data && data.results) || [];
            const totalCount = data && typeof data.count === "number" ? data.count : results.length;
            currentNextUrl = data && data.next ? data.next : null;
            currentPrevUrl = data && data.previous ? data.previous : null;

            if (loadingEl) loadingEl.classList.add("d-none");

            if (countLabel) {
                countLabel.textContent = `Showing ${results.length} of ${totalCount} project${totalCount === 1 ? "" : "s"}`;
            }

            if (results.length === 0) {
                if (tableWrapperEl) tableWrapperEl.classList.add("d-none");
                if (emptyEl) emptyEl.classList.remove("d-none");
                if (paginationBar) paginationBar.classList.add("d-none");
                return;
            }

            if (tableWrapperEl) tableWrapperEl.classList.remove("d-none");
            renderProjectRows(results, tbodyEl);

            if (paginationBar) {
                if (currentNextUrl || currentPrevUrl) {
                    paginationBar.classList.remove("d-none");
                    if (prevBtn) prevBtn.disabled = !currentPrevUrl;
                    if (nextBtn) nextBtn.disabled = !currentNextUrl;
                } else {
                    paginationBar.classList.add("d-none");
                }
            }
        } catch (err) {
            if (loadingEl) loadingEl.classList.add("d-none");
            const parsed = window.WorkPilotAPI.parseError(err);
            window.WorkPilotAPI.showNotice(parsed.summary, "error");
        }
    }

    function renderProjectRows(projects, tbody) {
        if (!tbody) return;
        const esc = window.WorkPilotAPI.escapeHtml;
        const fmtDate = window.WorkPilotAPI.formatDate;
        const fmtDateTime = window.WorkPilotAPI.formatDateTime;

        tbody.innerHTML = projects
            .map((proj) => {
                const status = esc(proj.status || "ACTIVE");
                const memberCount = Array.isArray(proj.users) ? proj.users.length : 0;
                const memberNames = Array.isArray(proj.users)
                    ? proj.users.map((u) => esc(u.username || u.name || `User #${u.id}`)).join(", ")
                    : "—";

                return `
                <tr>
                    <td>
                        <a href="/projects/${proj.id}/" class="fw-bold text-wrap-safe">${esc(proj.name)}</a>
                        <div class="small text-muted">ID: #${proj.id}</div>
                    </td>
                    <td class="text-wrap-safe" style="max-width: 320px;">${esc(proj.description || "—")}</td>
                    <td><span class="wp-badge wp-badge-${status}">${status}</span></td>
                    <td>${fmtDate(proj.deadline)}</td>
                    <td>
                        <span class="fw-semibold">${memberCount}</span>
                        <div class="small text-muted text-wrap-safe" style="max-width: 200px;">${memberNames || "—"}</div>
                    </td>
                    <td class="small text-muted">${fmtDateTime(proj.created_at)}</td>
                    <td class="text-end">
                        <div class="d-inline-flex gap-1">
                            <a href="/projects/${proj.id}/" class="btn btn-sm btn-wp-primary">View Details</a>
                            <a href="/tasks/?project_id=${proj.id}" class="btn btn-sm btn-wp-secondary">Tasks</a>
                        </div>
                    </td>
                </tr>`;
            })
            .join("");
    }

    function initCreateProjectForm() {
        const form = document.getElementById("wpCreateProjectForm");
        if (!form) return;

        // Set minimum date hint to today's local date (YYYY-MM-DD)
        const deadlineInput = form.querySelector('[name="deadline"]');
        if (deadlineInput) {
            const todayStr = new Date().toISOString().split("T")[0];
            deadlineInput.setAttribute("min", todayStr);
        }

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            window.WorkPilotAPI.clearFormErrors(form);

            const name = form.querySelector('[name="name"]')?.value.trim() || "";
            const description = form.querySelector('[name="description"]')?.value.trim() || "";
            const deadline = form.querySelector('[name="deadline"]')?.value || "";
            const status = form.querySelector('[name="status"]')?.value || "ACTIVE";
            const submitBtn = document.getElementById("wpCreateProjectSubmitBtn");

            if (!name || !description || !deadline) {
                window.WorkPilotAPI.showNotice(
                    "Name, description, and deadline are required.",
                    "error",
                    "wpCreateProjectModalNotice"
                );
                return;
            }

            if (name.length > 30) {
                window.WorkPilotAPI.applyFormErrors(form, {
                    name: "Project name must be at most 30 characters.",
                });
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Creating...";
            }

            try {
                // Section 13.2 & Appendix B: Send ONLY name, description, deadline, status.
                // Do NOT send users (read-only; backend creates creator MANAGER membership).
                const created = await window.WorkPilotAPI.post("/projects/", {
                    name,
                    description,
                    deadline,
                    status,
                });

                form.reset();
                const modalEl = document.getElementById("wpCreateProjectModal");
                if (modalEl && typeof bootstrap !== "undefined") {
                    const modal = bootstrap.Modal.getInstance(modalEl);
                    if (modal) modal.hide();
                }

                window.WorkPilotAPI.showNotice(
                    `Project "${created && created.name ? created.name : name}" created successfully.`,
                    "success"
                );
                currentPage = 1;
                await loadProjects();
            } catch (err) {
                const parsed = window.WorkPilotAPI.parseError(err);
                window.WorkPilotAPI.applyFormErrors(form, parsed.fieldErrors);
                window.WorkPilotAPI.showNotice(
                    parsed.summary,
                    "error",
                    "wpCreateProjectModalNotice"
                );
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Create Project";
                }
            }
        });
    }

    function initFilterControls() {
        const filterForm = document.getElementById("wpProjectFilterForm");
        const resetBtn = document.getElementById("wpProjectFilterResetBtn");
        const prevBtn = document.getElementById("wpProjectsPrevBtn");
        const nextBtn = document.getElementById("wpProjectsNextBtn");

        if (filterForm) {
            filterForm.addEventListener("submit", (e) => {
                e.preventDefault();
                currentPage = 1;
                loadProjects();
            });
        }

        ["wpProjectStatusFilter", "wpProjectDeadlineFilter", "wpProjectOrderingSelect"].forEach(
            (id) => {
                const el = document.getElementById(id);
                if (el) {
                    el.addEventListener("change", () => {
                        currentPage = 1;
                        loadProjects();
                    });
                }
            }
        );

        if (resetBtn) {
            resetBtn.addEventListener("click", () => {
                if (filterForm) filterForm.reset();
                currentPage = 1;
                loadProjects();
            });
        }

        // Section 18.2: Prefer returned next/previous URLs
        if (prevBtn) {
            prevBtn.addEventListener("click", () => {
                if (currentPrevUrl) loadProjects(currentPrevUrl);
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener("click", () => {
                if (currentNextUrl) loadProjects(currentNextUrl);
            });
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        initFilterControls();
        initCreateProjectForm();
        loadProjects();
    });
})();
