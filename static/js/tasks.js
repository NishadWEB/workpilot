/**
 * WorkPilot Tasks Page Controller (tasks.js)
 * Implements Section 15.1 (Scoped task visibility), Section 15.2 (List/search/filter tasks),
 * Section 15.3 (Create task without sending status or created_by), and Section 18 (Pagination).
 */
(function () {
    let tasksNextUrl = null;
    let tasksPrevUrl = null;
    let currentPage = 1;
    let projectsMap = new Map();
    let usersMap = new Map();

    function applyInitialQueryParams() {
        const params = new URLSearchParams(window.location.search);
        const projParam = params.get("project_id");
        const statusParam = params.get("status");
        const priorityParam = params.get("priority");
        const searchParam = params.get("search");

        if (projParam) {
            const projSelect = document.getElementById("wpTaskProjectFilter");
            if (projSelect) projSelect.dataset.initialValue = projParam;
        }
        if (statusParam) {
            const stSelect = document.getElementById("wpTaskStatusFilter");
            if (stSelect) stSelect.value = statusParam;
        }
        if (priorityParam) {
            const prSelect = document.getElementById("wpTaskPriorityFilter");
            if (prSelect) prSelect.value = priorityParam;
        }
        if (searchParam) {
            const searchInput = document.getElementById("wpTaskSearchInput");
            if (searchInput) searchInput.value = searchParam;
        }
    }

    async function loadProjectsForDropdowns() {
        try {
            const data = await window.WorkPilotAPI.get("/projects/");
            const projects = Array.isArray(data) ? data : (data && data.results) || [];

            projects.forEach((p) => {
                projectsMap.set(Number(p.id), p);
                if (Array.isArray(p.users)) {
                    p.users.forEach((u) => {
                        usersMap.set(Number(u.id), u.username || u.name || `User #${u.id}`);
                    });
                }
            });

            const filterSelect = document.getElementById("wpTaskProjectFilter");
            const createSelect = document.getElementById("wpCreateTaskProjectSelect");
            const esc = window.WorkPilotAPI.escapeHtml;

            if (filterSelect) {
                const initVal = filterSelect.dataset.initialValue || filterSelect.value || "";
                filterSelect.innerHTML =
                    `<option value="">All Projects</option>` +
                    projects
                        .map((p) => `<option value="${p.id}">${esc(p.name)} (#${p.id})</option>`)
                        .join("");
                if (initVal) filterSelect.value = initVal;
            }

            if (createSelect) {
                createSelect.innerHTML =
                    `<option value="">Select a project...</option>` +
                    projects
                        .map((p) => `<option value="${p.id}">${esc(p.name)} (#${p.id})</option>`)
                        .join("");
            }
        } catch (err) {
            // Projects dropdown fallback
        }
    }

    /**
     * Section 15.3: The assignee must have project-specific MEMBER membership in the selected project.
     * When a project is chosen in Create Task modal, fetch GET /api/v1/projects/{project_id}/members/
     * and filter for role === "MEMBER".
     */
    async function populateEligibleAssignees(projectId) {
        const assigneeSelect = document.getElementById("wpCreateTaskAssigneeSelect");
        if (!assigneeSelect) return;

        if (!projectId) {
            assigneeSelect.innerHTML = `<option value="">Select a project first...</option>`;
            return;
        }

        assigneeSelect.innerHTML = `<option value="">Loading project members...</option>`;
        const esc = window.WorkPilotAPI.escapeHtml;

        try {
            const data = await window.WorkPilotAPI.get(`/projects/${projectId}/members/`);
            const allMembers = Array.isArray(data) ? data : (data && data.results) || [];
            allMembers.forEach((m) => {
                usersMap.set(Number(m.id), m.name || m.username || `User #${m.id}`);
            });

            // Filter to members with project-specific role MEMBER
            const eligibleMembers = allMembers.filter((m) => m.role === "MEMBER");

            if (eligibleMembers.length === 0) {
                assigneeSelect.innerHTML = `<option value="">No project MEMBERs found (add members in Project Detail first)</option>`;
                return;
            }

            assigneeSelect.innerHTML =
                `<option value="">Select assignee (MEMBER)...</option>` +
                eligibleMembers
                    .map(
                        (m) =>
                            `<option value="${m.id}">${esc(m.name || m.username)} (${esc(m.email || "ID #" + m.id)})</option>`
                    )
                    .join("");
        } catch (err) {
            // Fallback to project.users if members endpoint fails
            const proj = projectsMap.get(Number(projectId));
            const fallbackUsers = (proj && proj.users) || [];
            if (fallbackUsers.length === 0) {
                assigneeSelect.innerHTML = `<option value="">No members available</option>`;
                return;
            }
            assigneeSelect.innerHTML =
                `<option value="">Select assignee...</option>` +
                fallbackUsers
                    .map((u) => `<option value="${u.id}">${esc(u.username || u.name)} (#${u.id})</option>`)
                    .join("");
        }
    }

    function buildTasksQueryUrl(page = 1) {
        const params = new URLSearchParams();
        const searchVal = document.getElementById("wpTaskSearchInput")?.value.trim() || "";
        const projEl = document.getElementById("wpTaskProjectFilter");
        const projectVal = projEl?.value || projEl?.dataset.initialValue || "";
        const statusVal = document.getElementById("wpTaskStatusFilter")?.value || "";
        const priorityVal = document.getElementById("wpTaskPriorityFilter")?.value || "";

        if (searchVal) params.set("search", searchVal);
        if (projectVal) params.set("project_id", projectVal);
        if (statusVal) params.set("status", statusVal);
        if (priorityVal) params.set("priority", priorityVal);
        if (page > 1) params.set("page", String(page));

        const qs = params.toString();
        return qs ? `/tasks/?${qs}` : "/tasks/";
    }

    async function loadTasks(customUrl = null) {
        const loadingEl = document.getElementById("wpTasksLoading");
        const emptyEl = document.getElementById("wpTasksEmpty");
        const tableWrapper = document.getElementById("wpTasksTableWrapper");
        const tbody = document.getElementById("wpTasksTableBody");
        const paginationBar = document.getElementById("wpTasksPagination");
        const countLabel = document.getElementById("wpTasksCountLabel");
        const prevBtn = document.getElementById("wpTasksPrevBtn");
        const nextBtn = document.getElementById("wpTasksNextBtn");

        if (loadingEl) loadingEl.classList.remove("d-none");
        if (emptyEl) emptyEl.classList.add("d-none");

        try {
            await window.WorkPilotAuthGuard.ensureAuthenticated();
            if (projectsMap.size === 0) {
                await loadProjectsForDropdowns();
            }

            const projEl = document.getElementById("wpTaskProjectFilter");
            if (projEl && projEl.dataset.initialValue) {
                projEl.value = projEl.dataset.initialValue;
                delete projEl.dataset.initialValue;
            }

            const targetUrl = customUrl || buildTasksQueryUrl(currentPage);
            const data = await window.WorkPilotAPI.get(targetUrl);

            const results = Array.isArray(data) ? data : (data && data.results) || [];
            const totalCount = data && typeof data.count === "number" ? data.count : results.length;
            tasksNextUrl = data && data.next ? data.next : null;
            tasksPrevUrl = data && data.previous ? data.previous : null;

            if (loadingEl) loadingEl.classList.add("d-none");

            if (countLabel) {
                countLabel.textContent = `Showing ${results.length} of ${totalCount} task${totalCount === 1 ? "" : "s"}`;
            }

            if (results.length === 0) {
                if (tableWrapper) tableWrapper.classList.add("d-none");
                if (emptyEl) emptyEl.classList.remove("d-none");
                if (paginationBar) paginationBar.classList.add("d-none");
                return;
            }

            if (tableWrapper) tableWrapper.classList.remove("d-none");
            renderTaskRows(results, tbody);

            if (paginationBar) {
                if (tasksNextUrl || tasksPrevUrl) {
                    paginationBar.classList.remove("d-none");
                    if (prevBtn) prevBtn.disabled = !tasksPrevUrl;
                    if (nextBtn) nextBtn.disabled = !tasksNextUrl;
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

    function renderTaskRows(tasks, tbody) {
        if (!tbody) return;
        const esc = window.WorkPilotAPI.escapeHtml;
        const fmtDate = window.WorkPilotAPI.formatDate;
        const auth = window.WorkPilotAPI.getAuthState();

        tbody.innerHTML = tasks
            .map((task) => {
                const proj = projectsMap.get(Number(task.project_id));
                const projName = proj ? esc(proj.name) : `Project #${task.project_id}`;
                const assigneeName =
                    usersMap.get(Number(task.assignee)) || `User #${task.assignee}`;
                const isAssignee = Number(task.assignee) === Number(auth.userId);
                const status = esc(task.status || "PENDING");
                const priority = esc(task.priority || "MEDIUM");

                return `
                <tr>
                    <td>
                        <a href="/tasks/${task.id}/" class="fw-bold text-wrap-safe">${esc(task.title)}</a>
                        <div class="small text-muted text-wrap-safe" style="max-width: 300px;">${esc(task.description || "")}</div>
                    </td>
                    <td>
                        <a href="/projects/${task.project_id}/" class="text-wrap-safe">${projName}</a>
                    </td>
                    <td><span class="wp-badge wp-badge-${status}">${status}</span></td>
                    <td><span class="wp-badge wp-badge-${priority}">${priority}</span></td>
                    <td class="text-wrap-safe">
                        ${esc(assigneeName)}
                        ${isAssignee ? '<span class="wp-badge wp-badge-soft-orange ms-1">You</span>' : ""}
                    </td>
                    <td>${fmtDate(task.due_date)}</td>
                    <td class="text-end">
                        <a href="/tasks/${task.id}/" class="btn btn-sm btn-wp-primary">View / Discuss</a>
                    </td>
                </tr>`;
            })
            .join("");
    }

    /**
     * Section 15.3 & Appendix B: Create task
     * Required: title (max 100), description (max 250), project_id, assignee, due_date.
     * Optional: priority (LOW, MEDIUM, HIGH; default MEDIUM).
     * Do NOT send status or created_by!
     */
    function initCreateTaskForm() {
        const form = document.getElementById("wpCreateTaskForm");
        const projectSelect = document.getElementById("wpCreateTaskProjectSelect");
        if (!form) return;

        if (projectSelect) {
            projectSelect.addEventListener("change", () => {
                populateEligibleAssignees(projectSelect.value);
            });
        }

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            window.WorkPilotAPI.clearFormErrors(form);

            const title = form.querySelector('[name="title"]')?.value.trim() || "";
            const description = form.querySelector('[name="description"]')?.value.trim() || "";
            const project_id = Number(form.querySelector('[name="project_id"]')?.value || 0);
            const assignee = Number(form.querySelector('[name="assignee"]')?.value || 0);
            const priority = form.querySelector('[name="priority"]')?.value || "MEDIUM";
            const due_date = form.querySelector('[name="due_date"]')?.value || "";
            const submitBtn = document.getElementById("wpCreateTaskSubmitBtn");

            if (!title || !description || !project_id || !assignee || !due_date) {
                window.WorkPilotAPI.showNotice(
                    "Title, description, project, assignee, and due date are required.",
                    "error",
                    "wpCreateTaskModalNotice"
                );
                return;
            }

            if (title.length > 100) {
                window.WorkPilotAPI.applyFormErrors(form, {
                    title: "Title cannot exceed 100 characters.",
                });
                return;
            }

            if (description.length > 250) {
                window.WorkPilotAPI.applyFormErrors(form, {
                    description: "Description cannot exceed 250 characters.",
                });
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Creating...";
            }

            try {
                // Strictly omit status and created_by per Section 15.3 & Appendix B
                const payload = {
                    title,
                    description,
                    project_id,
                    assignee,
                    priority,
                    due_date,
                };

                const created = await window.WorkPilotAPI.post("/tasks/", payload);
                form.reset();

                const modalEl = document.getElementById("wpCreateTaskModal");
                if (modalEl && typeof bootstrap !== "undefined") {
                    const modal = bootstrap.Modal.getInstance(modalEl);
                    if (modal) modal.hide();
                }

                window.WorkPilotAPI.showNotice(
                    `Task "${created && created.title ? created.title : title}" created.`,
                    "success"
                );
                currentPage = 1;
                await loadTasks();
            } catch (err) {
                const parsed = window.WorkPilotAPI.parseError(err);
                window.WorkPilotAPI.applyFormErrors(form, parsed.fieldErrors);
                window.WorkPilotAPI.showNotice(
                    parsed.summary,
                    "error",
                    "wpCreateTaskModalNotice"
                );
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Create Task";
                }
            }
        });
    }

    function initTaskFilters() {
        const filterForm = document.getElementById("wpTaskFilterForm");
        const resetBtn = document.getElementById("wpTaskFilterResetBtn");
        const prevBtn = document.getElementById("wpTasksPrevBtn");
        const nextBtn = document.getElementById("wpTasksNextBtn");

        if (filterForm) {
            filterForm.addEventListener("submit", (e) => {
                e.preventDefault();
                currentPage = 1;
                loadTasks();
            });
        }

        ["wpTaskProjectFilter", "wpTaskStatusFilter", "wpTaskPriorityFilter"].forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener("change", () => {
                    currentPage = 1;
                    loadTasks();
                });
            }
        });

        if (resetBtn) {
            resetBtn.addEventListener("click", () => {
                if (filterForm) filterForm.reset();
                currentPage = 1;
                loadTasks();
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener("click", () => {
                if (tasksPrevUrl) loadTasks(tasksPrevUrl);
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener("click", () => {
                if (tasksNextUrl) loadTasks(tasksNextUrl);
            });
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        applyInitialQueryParams();
        initTaskFilters();
        initCreateTaskForm();
        loadTasks();
    });
})();
