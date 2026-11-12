/**
 * WorkPilot Dashboard Controller (dashboard.js)
 * Implements Section 13.6 and Section 17:
 * - Fetches accessible projects via GET /api/v1/projects/.
 * - Fetches project, team, and task_statistics from GET /api/v1/projects/{id}/statistics/.
 * - Does not download all task pages to recalculate statistics.
 */
(function () {
    async function loadDashboard() {
        const loadingEl = document.getElementById("wpDashboardLoading");
        const contentEl = document.getElementById("wpDashboardContent");
        const emptyEl = document.getElementById("wpDashboardEmpty");
        const projectsBodyEl = document.getElementById("wpDashboardProjectsBody");

        try {
            const auth = await window.WorkPilotAuthGuard.ensureAuthenticated();

            // Set welcome banner info
            const welcomeUserEl = document.getElementById("wpDashboardWelcomeUser");
            const welcomeRoleEl = document.getElementById("wpDashboardWelcomeRole");
            if (welcomeUserEl) welcomeUserEl.textContent = auth.username || "User";
            if (welcomeRoleEl) welcomeRoleEl.textContent = auth.role || "MEMBER";

            // 1. Fetch accessible projects
            const projectsResponse = await window.WorkPilotAPI.get("/projects/");
            const projects = Array.isArray(projectsResponse)
                ? projectsResponse
                : (projectsResponse && projectsResponse.results) || [];
            const totalProjectsCount =
                projectsResponse && typeof projectsResponse.count === "number"
                    ? projectsResponse.count
                    : projects.length;

            // 2. Fetch statistics for each accessible project on current overview
            const statsEntries = await Promise.all(
                projects.map(async (proj) => {
                    try {
                        const stat = await window.WorkPilotAPI.get(`/projects/${proj.id}/statistics/`);
                        return { project: proj, stats: stat };
                    } catch (err) {
                        return { project: proj, stats: null };
                    }
                })
            );

            // Aggregate task statistics from statistics endpoint responses
            let aggTotalTasks = 0;
            let aggPendingTasks = 0;
            let aggInProgressTasks = 0;
            let aggCompletedTasks = 0;
            let aggOverdueTasks = 0;

            statsEntries.forEach(({ stats }) => {
                if (stats && stats.task_statistics) {
                    const ts = stats.task_statistics;
                    aggTotalTasks += Number(ts.total_tasks || 0);
                    aggPendingTasks += Number(ts.pending_tasks || 0);
                    aggInProgressTasks += Number(ts.in_progress_tasks || 0);
                    aggCompletedTasks += Number(ts.completed_tasks || 0);
                    aggOverdueTasks += Number(ts.overdue_tasks || 0);
                }
            });

            // Populate summary metric cards
            setMetric("wpStatTotalProjects", totalProjectsCount);
            setMetric("wpStatTotalTasks", aggTotalTasks);
            setMetric("wpStatPendingTasks", aggPendingTasks);
            setMetric("wpStatInProgressTasks", aggInProgressTasks);
            setMetric("wpStatCompletedTasks", aggCompletedTasks);
            setMetric("wpStatOverdueTasks", aggOverdueTasks);

            // Update overall completion progress bar
            const overallPct =
                aggTotalTasks > 0 ? Math.round((aggCompletedTasks / aggTotalTasks) * 100) : 0;
            const progressBarEl = document.getElementById("wpDashboardProgressBar");
            const progressPctEl = document.getElementById("wpDashboardProgressPct");
            if (progressBarEl) progressBarEl.style.width = `${overallPct}%`;
            if (progressPctEl) progressPctEl.textContent = `${overallPct}% Completed`;

            if (loadingEl) loadingEl.classList.add("d-none");
            if (contentEl) contentEl.classList.remove("d-none");

            if (projects.length === 0) {
                if (emptyEl) emptyEl.classList.remove("d-none");
                if (projectsBodyEl) projectsBodyEl.innerHTML = "";
                return;
            }

            if (emptyEl) emptyEl.classList.add("d-none");
            renderProjectStatsRows(statsEntries, projectsBodyEl);
        } catch (err) {
            if (loadingEl) loadingEl.classList.add("d-none");
            const parsed = window.WorkPilotAPI.parseError(err);
            window.WorkPilotAPI.showNotice(parsed.summary, "error");
        }
    }

    function setMetric(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value !== undefined && value !== null ? String(value) : "0";
    }

    function renderProjectStatsRows(entries, container) {
        if (!container) return;
        const esc = window.WorkPilotAPI.escapeHtml;
        const fmtDate = window.WorkPilotAPI.formatDate;

        container.innerHTML = entries
            .map(({ project, stats }) => {
                const projData = (stats && stats.project) || project;
                const team = (stats && stats.team) || {};
                const ts = (stats && stats.task_statistics) || {};

                const managerName =
                    team.manager && team.manager.username
                        ? esc(team.manager.username)
                        : "—";
                const totalMembers =
                    team.total_members !== undefined
                        ? Number(team.total_members)
                        : Array.isArray(project.users)
                        ? project.users.length
                        : 0;

                const status = esc(projData.status || "ACTIVE");
                const totalTasks = Number(ts.total_tasks || 0);
                const completedTasks = Number(ts.completed_tasks || 0);
                const overdueTasks = Number(ts.overdue_tasks || 0);
                const projPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

                return `
                <tr>
                    <td>
                        <a href="/projects/${projData.id}/" class="fw-bold text-wrap-safe">${esc(projData.name)}</a>
                        <div class="small text-muted text-wrap-safe mb-1">${esc(projData.description || "")}</div>
                        <div class="wp-progress" style="max-width: 140px; height: 5px;" title="${projPct}% completed">
                            <div class="wp-progress-bar" style="width: ${projPct}%;"></div>
                        </div>
                    </td>
                    <td><span class="wp-badge wp-badge-${status}">${status}</span></td>
                    <td>${fmtDate(projData.deadline)}</td>
                    <td>
                        <div class="fw-semibold text-wrap-safe">${managerName}</div>
                        <div class="small text-muted">${totalMembers} member${totalMembers === 1 ? "" : "s"}</div>
                    </td>
                    <td class="text-center fw-bold">${totalTasks}</td>
                    <td class="text-center">${Number(ts.pending_tasks || 0)}</td>
                    <td class="text-center">${Number(ts.in_progress_tasks || 0)}</td>
                    <td class="text-center">${completedTasks}</td>
                    <td class="text-center fw-semibold">${
                        overdueTasks > 0
                            ? `<span class="wp-badge wp-badge-soft-orange">${overdueTasks}</span>`
                            : overdueTasks
                    }</td>
                    <td class="text-end">
                        <div class="d-inline-flex gap-1">
                            <a href="/projects/${projData.id}/" class="btn btn-sm btn-wp-secondary">Overview</a>
                            <a href="/tasks/?project_id=${projData.id}" class="btn btn-sm btn-wp-primary">Tasks</a>
                        </div>
                    </td>
                </tr>`;
            })
            .join("");
    }

    document.addEventListener("DOMContentLoaded", () => {
        const refreshBtn = document.getElementById("wpDashboardRefreshBtn");
        if (refreshBtn) {
            refreshBtn.addEventListener("click", loadDashboard);
        }
        loadDashboard();
    });
})();