/**
 * WorkPilot Team & Membership Controller (team.js)
 * Implements Section 14.1 (Available users search & pagination),
 * Section 14.2 (List project members), Section 14.3 (Add members array payload/response),
 * Section 14.4 (Retrieve member by User ID), and Section 14.5 (Remove member by User ID).
 */
(function () {
    let currentProjectId = null;
    let membersNextUrl = null;
    let membersPrevUrl = null;
    let availableNextUrl = null;
    let availablePrevUrl = null;
    let selectedAvailableUserIds = new Set();

    function resolveProjectId(explicitId) {
        if (explicitId) return Number(explicitId);
        if (currentProjectId) return Number(currentProjectId);
        const root = document.getElementById("wpProjectDetailRoot");
        if (root && root.dataset.projectId) {
            return Number(root.dataset.projectId);
        }
        const match = window.location.pathname.match(/\/projects\/(\d+)\//);
        return match ? Number(match[1]) : null;
    }

    /**
     * Load project members from GET /api/v1/projects/{project_id}/members/
     * Note (Section 14.2 & 22.1): Endpoint is currently restricted to global MANAGER group.
     * Falls back gracefully to project.users / statistics.team for global MEMBER viewers.
     */
    async function loadProjectMembers(projectId, customUrl = null, fallbackUsers = [], fallbackTeam = null) {
        currentProjectId = resolveProjectId(projectId);
        const auth = window.WorkPilotAPI.getAuthState();
        const loadingEl = document.getElementById("wpTeamLoading");
        const tbodyEl = document.getElementById("wpTeamMembersBody");
        const emptyEl = document.getElementById("wpTeamEmpty");
        const paginationEl = document.getElementById("wpTeamPagination");
        const prevBtn = document.getElementById("wpTeamPrevBtn");
        const nextBtn = document.getElementById("wpTeamNextBtn");

        if (!auth.isGlobalManager) {
            // Render fallback team list from project/statistics data for non-global-managers
            if (loadingEl) loadingEl.classList.add("d-none");
            const combined = buildFallbackMembers(fallbackUsers, fallbackTeam);
            renderMembersList(combined, tbodyEl, emptyEl, false, null);
            return combined;
        }

        if (loadingEl) loadingEl.classList.remove("d-none");

        try {
            const url = customUrl || `/projects/${currentProjectId}/members/`;
            const data = await window.WorkPilotAPI.get(url);
            const results = Array.isArray(data) ? data : (data && data.results) || [];
            membersNextUrl = data && data.next ? data.next : null;
            membersPrevUrl = data && data.previous ? data.previous : null;

            if (loadingEl) loadingEl.classList.add("d-none");

            // Check if current authenticated user holds project-specific MANAGER role
            const myRecord = results.find((m) => Number(m.id) === Number(auth.userId));
            const myProjectRole = myRecord ? myRecord.role : null;

            renderMembersList(results, tbodyEl, emptyEl, auth.isGlobalManager, myProjectRole);

            if (paginationEl) {
                if (membersNextUrl || membersPrevUrl) {
                    paginationEl.classList.remove("d-none");
                    if (prevBtn) prevBtn.disabled = !membersPrevUrl;
                    if (nextBtn) nextBtn.disabled = !membersNextUrl;
                } else {
                    paginationEl.classList.add("d-none");
                }
            }

            return results;
        } catch (err) {
            if (loadingEl) loadingEl.classList.add("d-none");
            // If 403, gracefully fallback to project.users
            const combined = buildFallbackMembers(fallbackUsers, fallbackTeam);
            renderMembersList(combined, tbodyEl, emptyEl, false, null);
            return combined;
        }
    }

    function buildFallbackMembers(fallbackUsers, fallbackTeam) {
        const map = new Map();
        if (fallbackTeam && fallbackTeam.manager && fallbackTeam.manager.id) {
            map.set(Number(fallbackTeam.manager.id), {
                id: fallbackTeam.manager.id,
                name: fallbackTeam.manager.username || fallbackTeam.manager.name,
                email: fallbackTeam.manager.email || "",
                role: "MANAGER",
            });
        }
        if (fallbackTeam && Array.isArray(fallbackTeam.members)) {
            fallbackTeam.members.forEach((m) => {
                if (!map.has(Number(m.id))) {
                    map.set(Number(m.id), {
                        id: m.id,
                        name: m.username || m.name,
                        email: m.email || "",
                        role: "MEMBER",
                    });
                }
            });
        }
        if (Array.isArray(fallbackUsers)) {
            fallbackUsers.forEach((u) => {
                if (!map.has(Number(u.id))) {
                    map.set(Number(u.id), {
                        id: u.id,
                        name: u.username || u.name,
                        email: u.email || "",
                        role: u.role || "MEMBER",
                    });
                }
            });
        }
        return Array.from(map.values());
    }

    function renderMembersList(members, tbody, emptyEl, canManageTeam, myProjectRole) {
        if (!tbody) return;
        const auth = window.WorkPilotAPI.getAuthState();
        const esc = window.WorkPilotAPI.escapeHtml;

        if (!members || members.length === 0) {
            tbody.innerHTML = "";
            if (emptyEl) emptyEl.classList.remove("d-none");
            return;
        }

        if (emptyEl) emptyEl.classList.add("d-none");

        tbody.innerHTML = members
            .map((member) => {
                const displayName = esc(member.name || member.username || `User #${member.id}`);
                const email = esc(member.email || "—");
                const role = esc(member.role || "MEMBER");
                const isSelf = Number(member.id) === Number(auth.userId);
                const isMemberManager = role === "MANAGER";

                // Section 14.5: Backend prevents a Manager from removing themselves
                const showRemoveBtn = canManageTeam && !isSelf && !isMemberManager;
                const showInspectBtn = canManageTeam;

                return `
                <tr>
                    <td>
                        <div class="fw-bold text-wrap-safe">${displayName} ${isSelf ? '<span class="wp-badge wp-badge-soft-orange ms-1">You</span>' : ""}</div>
                        <div class="small text-muted">User ID: #${member.id}</div>
                    </td>
                    <td class="text-wrap-safe">${email}</td>
                    <td><span class="wp-badge wp-badge-${role === "MANAGER" ? "ACTIVE" : "PENDING"}">${role}</span></td>
                    <td class="text-end">
                        <div class="d-inline-flex gap-1">
                            ${
                                showInspectBtn
                                    ? `<button
                                            type="button"
                                            class="btn btn-sm btn-wp-secondary"
                                            data-inspect-member="${member.id}"
                                            data-member-name="${displayName}"
                                            data-member-email="${email}"
                                            data-member-role="${role}"
                                       >Inspect</button>`
                                    : ""
                            }
                            ${
                                showRemoveBtn
                                    ? `<button
                                            type="button"
                                            class="btn btn-sm btn-wp-danger-outline"
                                            data-remove-member="${member.id}"
                                            data-remove-name="${displayName}"
                                       >Remove</button>`
                                    : ""
                            }
                        </div>
                    </td>
                </tr>`;
            })
            .join("");

        // Attach Inspect Member handlers (Section 14.4: GET /api/v1/projects/{project_id}/members/{member_id}/)
        tbody.querySelectorAll("[data-inspect-member]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const memberId = btn.getAttribute("data-inspect-member");
                const fallbackInfo = {
                    id: memberId,
                    username: btn.getAttribute("data-member-name"),
                    email: btn.getAttribute("data-member-email"),
                    role: btn.getAttribute("data-member-role") || "MEMBER",
                };
                inspectMember(resolveProjectId(), memberId, fallbackInfo);
            });
        });

        // Attach Remove Member handlers (Section 14.5: DELETE /api/v1/projects/{project_id}/members/{member_id}/)
        tbody.querySelectorAll("[data-remove-member]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const memberId = btn.getAttribute("data-remove-member");
                const memberName = btn.getAttribute("data-remove-name");
                confirmRemoveMember(resolveProjectId(), memberId, memberName);
            });
        });
    }

    /**
     * Ensure the Inspect Member Bootstrap Modal exists in the page DOM.
     */
    function getOrCreateInspectModal() {
        let modalEl = document.getElementById("wpInspectMemberModal");
        if (!modalEl) {
            const wrapper = document.createElement("div");
            wrapper.innerHTML = `
                <div class="modal fade" id="wpInspectMemberModal" tabindex="-1" aria-labelledby="wpInspectMemberModalLabel" aria-hidden="true">
                    <div class="modal-dialog modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title fw-bold" id="wpInspectMemberModalLabel">Project Member Details</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body" id="wpInspectMemberModalBody"></div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-wp-primary" data-bs-dismiss="modal">Close</button>
                            </div>
                        </div>
                    </div>
                </div>`;
            document.body.appendChild(wrapper.firstElementChild);
            modalEl = document.getElementById("wpInspectMemberModal");
        }
        return modalEl;
    }

    /**
     * Section 14.4: Retrieve member details using User ID as member_id and display in a centered modal.
     */
    async function inspectMember(projectId, memberUserId, fallbackInfo = {}) {
        const activeProjectId = resolveProjectId(projectId);
        const modalEl = getOrCreateInspectModal();
        const bodyEl = document.getElementById("wpInspectMemberModalBody");
        const esc = window.WorkPilotAPI.escapeHtml;

        if (bodyEl) {
            bodyEl.innerHTML = `
                <div class="wp-loading-state py-3">
                    <div class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></div>
                    <span>Loading member #${esc(memberUserId)} details...</span>
                </div>`;
        }

        if (typeof bootstrap !== "undefined" && bootstrap.Modal) {
            bootstrap.Modal.getOrCreateInstance(modalEl).show();
        }

        try {
            const responseData = await window.WorkPilotAPI.get(
                `/projects/${activeProjectId}/members/${memberUserId}/`
            );

            const userObj =
                responseData && responseData.user && typeof responseData.user === "object"
                    ? responseData.user
                    : responseData || {};

            const id = userObj.id || fallbackInfo.id || memberUserId;
            const username =
                userObj.username ||
                userObj.name ||
                fallbackInfo.username ||
                `User #${id}`;
            const email = userObj.email || fallbackInfo.email || "—";
            const role =
                (responseData && responseData.role) ||
                userObj.role ||
                fallbackInfo.role ||
                "MEMBER";

            if (bodyEl) {
                bodyEl.innerHTML = `
                    <div class="small">
                        <div class="d-flex justify-content-between py-2 border-bottom">
                            <span class="text-muted">User ID</span>
                            <span class="fw-bold">#${esc(id)}</span>
                        </div>
                        <div class="d-flex justify-content-between py-2 border-bottom">
                            <span class="text-muted">Username</span>
                            <span class="fw-semibold text-wrap-safe">${esc(username)}</span>
                        </div>
                        <div class="d-flex justify-content-between py-2 border-bottom">
                            <span class="text-muted">Email Address</span>
                            <span class="text-wrap-safe">${esc(email)}</span>
                        </div>
                        <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
                            <span class="text-muted">Project Role</span>
                            <span class="wp-badge wp-badge-${role === "MANAGER" ? "ACTIVE" : "PENDING"}">${esc(role)}</span>
                        </div>
                        <div class="d-flex justify-content-between py-2">
                            <span class="text-muted">Project ID</span>
                            <span class="fw-semibold">#${esc(activeProjectId)}</span>
                        </div>
                    </div>`;
            }
        } catch (err) {
            const parsed = window.WorkPilotAPI.parseError(err);
            if (bodyEl) {
                bodyEl.innerHTML = `
                    <div class="wp-notice mb-3">
                        <div class="text-wrap-safe"><strong>API Notice:</strong> ${esc(parsed.summary)}</div>
                    </div>
                    <div class="small">
                        <div class="d-flex justify-content-between py-2 border-bottom">
                            <span class="text-muted">User ID</span>
                            <span class="fw-bold">#${esc(fallbackInfo.id || memberUserId)}</span>
                        </div>
                        <div class="d-flex justify-content-between py-2 border-bottom">
                            <span class="text-muted">Username</span>
                            <span class="fw-semibold text-wrap-safe">${esc(fallbackInfo.username || "—")}</span>
                        </div>
                        <div class="d-flex justify-content-between py-2 border-bottom">
                            <span class="text-muted">Email Address</span>
                            <span class="text-wrap-safe">${esc(fallbackInfo.email || "—")}</span>
                        </div>
                        <div class="d-flex justify-content-between align-items-center py-2">
                            <span class="text-muted">Project Role</span>
                            <span class="wp-badge wp-badge-${fallbackInfo.role === "MANAGER" ? "ACTIVE" : "PENDING"}">${esc(fallbackInfo.role || "MEMBER")}</span>
                        </div>
                    </div>`;
            }
        }
    }

    /**
     * Section 14.5: Remove member with red destructive confirmation modal.
     * member_id is User ID, not ProjectMembership row ID.
     */
    function confirmRemoveMember(projectId, memberUserId, memberName) {
        const activeProjectId = resolveProjectId(projectId);
        window.WorkPilotAPI.confirmDestructiveAction({
            title: "Remove Project Member",
            message: `Are you sure you want to remove "${memberName}" (User ID #${memberUserId}) from this project? Their User account will remain active.`,
            confirmLabel: "Remove Member",
            onConfirm: async () => {
                try {
                    await window.WorkPilotAPI.delete(
                        `/projects/${activeProjectId}/members/${memberUserId}/`
                    );
                    window.WorkPilotAPI.showNotice(
                        `Removed ${memberName} from project team.`,
                        "success"
                    );
                    window.dispatchEvent(new CustomEvent("wp:team-changed"));
                } catch (err) {
                    const parsed = window.WorkPilotAPI.parseError(err);
                    window.WorkPilotAPI.showNotice(parsed.summary, "error");
                    throw err;
                }
            },
        });
    }

    /**
     * Section 14.1: Search available users (GET /api/v1/users/available/?search=...&page=...)
     */
    async function loadAvailableUsers(customUrl = null) {
        const listEl = document.getElementById("wpAvailableUsersList");
        const loadingEl = document.getElementById("wpAvailableUsersLoading");
        const emptyEl = document.getElementById("wpAvailableUsersEmpty");
        const searchInput = document.getElementById("wpAvailableUsersSearchInput");
        const prevBtn = document.getElementById("wpAvailablePrevBtn");
        const nextBtn = document.getElementById("wpAvailableNextBtn");
        const paginationBar = document.getElementById("wpAvailablePagination");

        if (loadingEl) loadingEl.classList.remove("d-none");
        if (emptyEl) emptyEl.classList.add("d-none");

        try {
            let url = customUrl;
            if (!url) {
                const q = searchInput ? searchInput.value.trim() : "";
                url = q
                    ? `/users/available/?search=${encodeURIComponent(q)}`
                    : "/users/available/";
            }

            const data = await window.WorkPilotAPI.get(url);
            const results = Array.isArray(data) ? data : (data && data.results) || [];
            availableNextUrl = data && data.next ? data.next : null;
            availablePrevUrl = data && data.previous ? data.previous : null;

            if (loadingEl) loadingEl.classList.add("d-none");

            if (results.length === 0) {
                if (listEl) listEl.innerHTML = "";
                if (emptyEl) emptyEl.classList.remove("d-none");
                if (paginationBar) paginationBar.classList.add("d-none");
                return;
            }

            const esc = window.WorkPilotAPI.escapeHtml;
            if (listEl) {
                listEl.innerHTML = results
                    .map((u) => {
                        const isSelected = selectedAvailableUserIds.has(Number(u.id));
                        const checked = isSelected ? "checked" : "";
                        const selectedClass = isSelected ? " wp-item-selected" : "";
                        return `
                        <label class="list-group-item d-flex align-items-center justify-content-between gap-2${selectedClass}" style="background-color: var(--wp-bg-surface); color: var(--wp-text-primary); border-color: var(--wp-border); cursor: pointer;">
                            <div class="d-flex align-items-center gap-2">
                                <input class="form-check-input mt-0" type="checkbox" value="${u.id}" data-available-user-checkbox ${checked}>
                                <div>
                                    <div class="fw-semibold text-wrap-safe">${esc(u.username)}</div>
                                    <div class="small text-muted text-wrap-safe">${esc(u.email)}</div>
                                </div>
                            </div>
                            <span class="small text-muted">ID #${u.id}</span>
                        </label>`;
                    })
                    .join("");

                listEl.querySelectorAll("[data-available-user-checkbox]").forEach((cb) => {
                    cb.addEventListener("change", () => {
                        const id = Number(cb.value);
                        const labelEl = cb.closest(".list-group-item");
                        if (cb.checked) {
                            selectedAvailableUserIds.add(id);
                            if (labelEl) labelEl.classList.add("wp-item-selected");
                        } else {
                            selectedAvailableUserIds.delete(id);
                            if (labelEl) labelEl.classList.remove("wp-item-selected");
                        }
                        updateSelectedCountLabel();
                    });
                });
            }

            if (paginationBar) {
                if (availableNextUrl || availablePrevUrl) {
                    paginationBar.classList.remove("d-none");
                    if (prevBtn) prevBtn.disabled = !availablePrevUrl;
                    if (nextBtn) nextBtn.disabled = !availableNextUrl;
                } else {
                    paginationBar.classList.add("d-none");
                }
            }
        } catch (err) {
            if (loadingEl) loadingEl.classList.add("d-none");
            const parsed = window.WorkPilotAPI.parseError(err);
            window.WorkPilotAPI.showNotice(parsed.summary, "error", "wpAddMembersModalNotice");
        }
    }

    function updateSelectedCountLabel() {
        const badge = document.getElementById("wpSelectedUsersCount");
        if (badge) {
            badge.textContent = `${selectedAvailableUserIds.size} selected`;
        }
    }

    /**
     * Section 14.3: POST /api/v1/projects/{project_id}/members/ with { users: [21, 22] }.
     * Response is a plain array of added users with project-specific role MEMBER.
     */
    async function submitAddMembers(e) {
        if (e) e.preventDefault();
        const activeProjectId = resolveProjectId();
        if (!activeProjectId) return;

        const userIds = Array.from(selectedAvailableUserIds);
        if (userIds.length === 0) {
            window.WorkPilotAPI.showNotice(
                "Please select at least one available user to add.",
                "error",
                "wpAddMembersModalNotice"
            );
            return;
        }

        const submitBtn = document.getElementById("wpAddMembersSubmitBtn");
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Adding...";
        }

        try {
            const addedUsers = await window.WorkPilotAPI.post(
                `/projects/${activeProjectId}/members/`,
                { users: userIds }
            );

            const addedCount = Array.isArray(addedUsers) ? addedUsers.length : userIds.length;
            selectedAvailableUserIds.clear();
            updateSelectedCountLabel();

            const modalEl = document.getElementById("wpAddMembersModal");
            if (modalEl && typeof bootstrap !== "undefined") {
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }

            window.WorkPilotAPI.showNotice(
                `Added ${addedCount} member${addedCount === 1 ? "" : "s"} to the project.`,
                "success"
            );
            window.dispatchEvent(new CustomEvent("wp:team-changed"));
        } catch (err) {
            const parsed = window.WorkPilotAPI.parseError(err);
            window.WorkPilotAPI.showNotice(parsed.summary, "error", "wpAddMembersModalNotice");
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Add Selected Members";
            }
        }
    }

    function initTeamControls() {
        const openAddModalBtn = document.getElementById("wpOpenAddMembersModalBtn");
        const searchBtn = document.getElementById("wpAvailableUsersSearchBtn");
        const searchInput = document.getElementById("wpAvailableUsersSearchInput");
        const addForm = document.getElementById("wpAddMembersForm");
        const availPrevBtn = document.getElementById("wpAvailablePrevBtn");
        const availNextBtn = document.getElementById("wpAvailableNextBtn");
        const teamPrevBtn = document.getElementById("wpTeamPrevBtn");
        const teamNextBtn = document.getElementById("wpTeamNextBtn");

        if (openAddModalBtn) {
            openAddModalBtn.addEventListener("click", () => {
                selectedAvailableUserIds.clear();
                updateSelectedCountLabel();
                if (searchInput) searchInput.value = "";
                loadAvailableUsers();
            });
        }

        if (searchBtn) {
            searchBtn.addEventListener("click", () => loadAvailableUsers());
        }

        if (searchInput) {
            searchInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    loadAvailableUsers();
                }
            });
        }

        if (addForm) {
            addForm.addEventListener("submit", submitAddMembers);
        }

        if (availPrevBtn) {
            availPrevBtn.addEventListener("click", () => {
                if (availablePrevUrl) loadAvailableUsers(availablePrevUrl);
            });
        }
        if (availNextBtn) {
            availNextBtn.addEventListener("click", () => {
                if (availableNextUrl) loadAvailableUsers(availableNextUrl);
            });
        }

        if (teamPrevBtn) {
            teamPrevBtn.addEventListener("click", () => {
                const activeProjectId = resolveProjectId();
                if (membersPrevUrl && activeProjectId) {
                    loadProjectMembers(activeProjectId, membersPrevUrl);
                }
            });
        }
        if (teamNextBtn) {
            teamNextBtn.addEventListener("click", () => {
                const activeProjectId = resolveProjectId();
                if (membersNextUrl && activeProjectId) {
                    loadProjectMembers(activeProjectId, membersNextUrl);
                }
            });
        }
    }

    document.addEventListener("DOMContentLoaded", initTeamControls);

    window.WorkPilotTeam = {
        loadProjectMembers,
        loadAvailableUsers,
        inspectMember,
    };
})();