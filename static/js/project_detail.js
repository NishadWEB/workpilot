/**
 * WorkPilot Project Detail Controller (project_detail.js)
 * Implements Section 13.3 (Retrieve project), Section 13.4 (Update project),
 * Section 13.5 (Soft-delete project), Section 13.6 (Project statistics),
 * and related project tasks list/creation.
 */
(function () {
    let projectId = null;
    let currentProject = null;
    let currentStats = null;
    let currentTeamMembers = [];
    let isProjectSpecificManager = false;

    function getProjectIdFromPage() {
        const container = document.getElementById("wpProjectDetailRoot");
        if (container && container.dataset.projectId) {
            return Number(container.dataset.projectId);
        }
        const match = window.location.pathname.match(/\/projects\/(\d+)\//);
        return match ? Number(match[1]) : null;
    }

    async function loadProjectDetail() {
        projectId = getProjectIdFromPage();
        if (!projectId) return;

        const loadingEl = document.getElementById("wpProjectDetailLoading");
        const contentEl = document.getElementById("wpProjectDetailContent");
        const notFoundEl = document.getElementById("wpProjectDetailNotFound");

        try {
            const auth = await window.WorkPilotAuthGuard.ensureAuthenticated();

            // Fetch project details and statistics in parallel
            const [project, stats] = await Promise.all([
                window.WorkPilotAPI.get(`/projects/${projectId}/`),
                window.WorkPilotAPI.get(`/projects/${projectId}/statistics/`).catch(() => null),
            ]);

            currentProject = project;
            currentStats = stats;

            if (loadingEl) loadingEl.classList.add("d-none");
            if (contentEl) contentEl.classList.remove("d-none");

            renderProjectInfo(project, stats);

            // Load team members via WorkPilotTeam and determine project-specific MANAGER status
            currentTeamMembers = await window.WorkPilotTeam.loadProjectMembers(
                projectId,
                null,
                project.users || [],
                stats ? stats.team : null
            );

            determineProjectManagerAccess(auth, currentTeamMembers, stats);

            // Load related tasks for this project
            await loadProjectTasks();
        } catch (err) {
            if (loadingEl) loadingEl.classList.add("d-none");
            if (err && err.status === 404) {
                if (notFoundEl) notFoundEl.classList.remove("d-none");
            } else {
                const parsed = window.WorkPilotAPI.parseError(err);
                window.WorkPilotAPI.showNotice(parsed.summary, "error");
            }
        }
    }

    /**
     * Section 4.3 & 14: Determine whether current user is project-specific MANAGER.
     * Uses project-specific membership role when available, or team.manager from statistics.
     */
    function determineProjectManagerAccess(auth, members, stats) {
        isProjectSpecificManager = false;

        if (Array.isArray(members)) {
            const myMember = members.find((m) => Number(m.id) === Number(auth.userId));
            if (myMember && myMember.role === "MANAGER") {
                isProjectSpecificManager = true;
            }
        }

        if (
            !isProjectSpecificManager &&
            stats &&
            stats.team &&
            stats.team.manager &&
            Number(stats.team.manager.id) === Number(auth.userId)
        ) {
            isProjectSpecificManager = true;
        }

        // Toggle project-manager-specific edit/delete controls
        document.querySelectorAll("[data-wp-project-manager-only]").forEach((el) => {
            if (isProjectSpecificManager) {
                el.classList.remove("d-none");
            } else {
                el.classList.add("d-none");
            }
        });

        const roleIndicatorEl = document.getElementById("wpProjectUserRoleHint");
        if (roleIndicatorEl) {
            roleIndicatorEl.textContent = isProjectSpecificManager
                ? "Project Manager"
                : "Project Member";
        }
    }

    function renderProjectInfo(project, stats) {
        const fmtDate = window.WorkPilotAPI.formatDate;
        const fmtDateTime = window.WorkPilotAPI.formatDateTime;

        setText("wpProjectNameHeading", project.name);
        setText("wpProjectDescriptionText", project.description || "No description provided.");
        setText("wpProjectDeadlineText", fmtDate(project.deadline));
        setText("wpProjectCreatedAtText", fmtDateTime(project.created_at));
        setText("wpProjectUpdatedAtText", fmtDateTime(project.updated_at));

        const statusBadge = document.getElementById("wpProjectStatusBadge");
        if (statusBadge) {
            const st = project.status || "ACTIVE";
            statusBadge.className = `wp-badge wp-badge-${st}`;
            statusBadge.textContent = st;
        }

        // Populate statistics cards from GET /api/v1/projects/{id}/statistics/
        const ts = (stats && stats.task_statistics) || {};
        const team = (stats && stats.team) || {};

        setText("wpProjStatTotalTasks", ts.total_tasks ?? 0);
        setText("wpProjStatPendingTasks", ts.pending_tasks ?? 0);
        setText("wpProjStatInProgressTasks", ts.in_progress_tasks ?? 0);
        setText("wpProjStatCompletedTasks", ts.completed_tasks ?? 0);
        setText("wpProjStatOverdueTasks", ts.overdue_tasks ?? 0);
        setText(
            "wpProjStatTeamCount",
            team.total_members ?? (Array.isArray(project.users) ? project.users.length : 0)
        );
        setText(
            "wpProjStatManagerName",
            team.manager && team.manager.username ? team.manager.username : "—"
        );

        // Pre-fill edit form fields
        const editForm = document.getElementById("wpEditProjectForm");
        if (editForm) {
            const nameInput = editForm.querySelector('[name="name"]');
            const descInput = editForm.querySelector('[name="description"]');
            const statusInput = editForm.querySelector('[name="status"]');
            const deadlineInput = editForm.querySelector('[name="deadline"]');

            if (nameInput) nameInput.value = project.name || "";
            if (descInput) descInput.value = project.description || "";
            if (statusInput) statusInput.value = project.status || "ACTIVE";
            if (deadlineInput) deadlineInput.value = project.deadline || "";
        }
    }

    function setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val !== undefined && val !== null ? String(val) : "—";
    }

    async function loadProjectTasks() {
        const tbody = document.getElementById("wpProjectTasksBody");
        const emptyEl = document.getElementById("wpProjectTasksEmpty");
        if (!tbody || !projectId) return;

        try {
            const data = await window.WorkPilotAPI.get(`/tasks/?project_id=${projectId}`);
            const tasks = Array.isArray(data) ? data : (data && data.results) || [];

            if (tasks.length === 0) {
                tbody.innerHTML = "";
                if (emptyEl) emptyEl.classList.remove("d-none");
                return;
            }

            if (emptyEl) emptyEl.classList.add("d-none");

            // Build User ID -> Name lookup map from project team
            const userMap = new Map();
            if (currentProject && Array.isArray(currentProject.users)) {
                currentProject.users.forEach((u) =>
                    userMap.set(Number(u.id), u.username || u.name)
                );
            }
            if (Array.isArray(currentTeamMembers)) {
                currentTeamMembers.forEach((m) =>
                    userMap.set(Number(m.id), m.name || m.username)
                );
            }

            const esc = window.WorkPilotAPI.escapeHtml;
            const fmtDate = window.WorkPilotAPI.formatDate;

            tbody.innerHTML = tasks
                .map((t) => {
                    const assigneeName =
                        userMap.get(Number(t.assignee)) || `User #${t.assignee}`;
                    const status = esc(t.status || "PENDING");
                    const priority = esc(t.priority || "MEDIUM");

                    return `
                    <tr>
                        <td>
                            <a href="/tasks/${t.id}/" class="fw-bold text-wrap-safe">${esc(t.title)}</a>
                            <div class="small text-muted text-wrap-safe">${esc(t.description || "")}</div>
                        </td>
                        <td><span class="wp-badge wp-badge-${status}">${status}</span></td>
                        <td><span class="wp-badge wp-badge-${priority}">${priority}</span></td>
                        <td class="text-wrap-safe">${esc(assigneeName)}</td>
                        <td>${fmtDate(t.due_date)}</td>
                        <td class="text-end">
                            <a href="/tasks/${t.id}/" class="btn btn-sm btn-wp-secondary">Open Task</a>
                        </td>
                    </tr>`;
                })
                .join("");
        } catch (err) {
            // Ignore task fetch errors if user has no visible tasks in this project
        }
    }

    /**
     * Section 13.4: PATCH /api/v1/projects/{id}/
     * Editable fields: name, description, status, deadline.
     * Do NOT send users, id, is_available or timestamps.
     */
    function initEditProjectForm() {
        const form = document.getElementById("wpEditProjectForm");
        if (!form) return;

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!projectId) return;
            window.WorkPilotAPI.clearFormErrors(form);

            const name = form.querySelector('[name="name"]')?.value.trim() || "";
            const description = form.querySelector('[name="description"]')?.value.trim() || "";
            const status = form.querySelector('[name="status"]')?.value || "ACTIVE";
            const deadline = form.querySelector('[name="deadline"]')?.value || "";
            const submitBtn = document.getElementById("wpEditProjectSubmitBtn");

            if (name.length > 30) {
                window.WorkPilotAPI.applyFormErrors(form, {
                    name: "Project name must be at most 30 characters.",
                });
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Saving...";
            }

            try {
                const updated = await window.WorkPilotAPI.patch(`/projects/${projectId}/`, {
                    name,
                    description,
                    status,
                    deadline,
                });

                currentProject = updated;
                const modalEl = document.getElementById("wpEditProjectModal");
                if (modalEl && typeof bootstrap !== "undefined") {
                    const modal = bootstrap.Modal.getInstance(modalEl);
                    if (modal) modal.hide();
                }

                window.WorkPilotAPI.showNotice("Project updated.", "success");
                await loadProjectDetail();
            } catch (err) {
                const parsed = window.WorkPilotAPI.parseError(err);
                window.WorkPilotAPI.applyFormErrors(form, parsed.fieldErrors);
                window.WorkPilotAPI.showNotice(
                    parsed.summary,
                    "error",
                    "wpEditProjectModalNotice"
                );
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Save Changes";
                }
            }
        });
    }

    /**
     * Section 13.5: DELETE /api/v1/projects/{id}/
     * Soft-deletes project (sets is_available=false). Returns 204 No Content.
     * Requests red destructive confirmation before sending DELETE request.
     */
    function initDeleteProjectButton() {
        const deleteBtn = document.getElementById("wpDeleteProjectBtn");
        if (!deleteBtn) return;

        deleteBtn.addEventListener("click", () => {
            if (!projectId || !currentProject) return;
            window.WorkPilotAPI.confirmDestructiveAction({
                title: "Delete Project",
                message: `Are you sure you want to delete project "${currentProject.name}"? This soft-deletes the project (is_available=false) and removes it from active listings. No restore endpoint is available.`,
                confirmLabel: "Delete Project",
                onConfirm: async () => {
                    try {
                        await window.WorkPilotAPI.delete(`/projects/${projectId}/`);
                        window.location.href = window.WP_CONFIG.ROUTES.PROJECTS;
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
        initEditProjectForm();
        initDeleteProjectButton();
        loadProjectDetail();

        window.addEventListener("wp:team-changed", () => {
            loadProjectDetail();
        });
    });
})();
