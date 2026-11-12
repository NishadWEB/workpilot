/**
 * WorkPilot Task Detail & Chat-Style Comments Controller (task_detail.js)
 * Implements:
 * - Section 15.4: Retrieve task (GET /api/v1/tasks/{id}/)
 * - Section 15.5: Update task (PATCH /api/v1/tasks/{id}/ sending project_id + assignee together, no status/created_by)
 * - Section 15.6: Delete task (DELETE /api/v1/tasks/{id}/ with red confirmation dialog)
 * - Section 15.7: Update task status as assignee only (PATCH /api/v1/tasks/{task_id}/status/ with { status } only)
 * - Section 6 & 16: Chat-style task comments (left/right bubbles, oldest-first chronology, pagination, author-only edit/delete)
 */
(function () {
    let taskId = null;
    let currentTask = null;
    let userLookupMap = new Map();
    let projectsLookupMap = new Map();
    let loadedComments = [];
    let loadedCommentIds = new Set();
    let commentsNextUrl = null;

    function getTaskIdFromPage() {
        const root = document.getElementById("wpTaskDetailRoot");
        if (root && root.dataset.taskId) {
            return Number(root.dataset.taskId);
        }
        const match = window.location.pathname.match(/\/tasks\/(\d+)\//);
        return match ? Number(match[1]) : null;
    }

    async function loadTaskDetail() {
        taskId = getTaskIdFromPage();
        if (!taskId) return;

        const loadingEl = document.getElementById("wpTaskDetailLoading");
        const contentEl = document.getElementById("wpTaskDetailContent");
        const notFoundEl = document.getElementById("wpTaskDetailNotFound");

        try {
            const auth = await window.WorkPilotAuthGuard.ensureAuthenticated();
            if (auth.userId && auth.username) {
                userLookupMap.set(Number(auth.userId), auth.username);
            }

            // 1. Fetch task details
            const task = await window.WorkPilotAPI.get(`/tasks/${taskId}/`);
            currentTask = task;

            // 2. Load parent project & accessible projects to resolve names and populate manager edit modal
            await loadProjectAndUserContext(task.project_id, auth);

            if (loadingEl) loadingEl.classList.add("d-none");
            if (contentEl) contentEl.classList.remove("d-none");

            renderTaskDetails(task, auth);

            // 3. Load chat-style comments (only accessible to task creator or assignee per Section 16.1)
            await loadInitialComments();
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

    async function loadProjectAndUserContext(projectId, auth) {
        try {
            const projectsData = await window.WorkPilotAPI.get("/projects/");
            const projects = Array.isArray(projectsData)
                ? projectsData
                : (projectsData && projectsData.results) || [];

            projects.forEach((p) => {
                projectsLookupMap.set(Number(p.id), p);
                if (Array.isArray(p.users)) {
                    p.users.forEach((u) => {
                        userLookupMap.set(Number(u.id), u.username || u.name);
                    });
                }
            });

            if (projectId && !projectsLookupMap.has(Number(projectId))) {
                const singleProj = await window.WorkPilotAPI.get(`/projects/${projectId}/`).catch(
                    () => null
                );
                if (singleProj) {
                    projectsLookupMap.set(Number(singleProj.id), singleProj);
                    if (Array.isArray(singleProj.users)) {
                        singleProj.users.forEach((u) => {
                            userLookupMap.set(Number(u.id), u.username || u.name);
                        });
                    }
                }
            }

            if (auth.isGlobalManager && projectId) {
                const membersData = await window.WorkPilotAPI.get(
                    `/projects/${projectId}/members/`
                ).catch(() => null);
                const members = Array.isArray(membersData)
                    ? membersData
                    : (membersData && membersData.results) || [];
                members.forEach((m) => {
                    userLookupMap.set(Number(m.id), m.name || m.username);
                });
            }
        } catch (e) {
            // Non-blocking context resolution
        }
    }

    /**
     * Resolve user ID to username without inventing names (Section 6.2).
     */
    function resolveUserLabel(userId) {
        if (userId === null || userId === undefined) return "—";
        const auth = window.WorkPilotAPI.getAuthState();
        if (Number(userId) === Number(auth.userId) && auth.username) {
            return auth.username;
        }
        if (userLookupMap.has(Number(userId))) {
            return userLookupMap.get(Number(userId));
        }
        return `User ID #${userId}`;
    }

    function renderTaskDetails(task, auth) {
        const fmtDate = window.WorkPilotAPI.formatDate;
        const proj = projectsLookupMap.get(Number(task.project_id));
        const projLabel = proj ? `${proj.name} (#${proj.id})` : `Project #${task.project_id}`;

        setText("wpTaskTitleHeading", task.title);
        setText("wpTaskDescriptionText", task.description || "No description provided.");
        setText("wpTaskDueDateText", fmtDate(task.due_date));
        setText("wpTaskCreatorText", resolveUserLabel(task.created_by));
        setText("wpTaskAssigneeText", resolveUserLabel(task.assignee));

        const projLink = document.getElementById("wpTaskProjectLink");
        if (projLink) {
            projLink.textContent = projLabel;
            projLink.href = `/projects/${task.project_id}/`;
        }

        const statusBadge = document.getElementById("wpTaskStatusBadge");
        if (statusBadge) {
            const st = task.status || "PENDING";
            statusBadge.className = `wp-badge wp-badge-${st}`;
            statusBadge.textContent = st;
        }

        const priorityBadge = document.getElementById("wpTaskPriorityBadge");
        if (priorityBadge) {
            const pr = task.priority || "MEDIUM";
            priorityBadge.className = `wp-badge wp-badge-${pr}`;
            priorityBadge.textContent = pr;
        }

        // Section 15.7: Assignee-only status update card
        const assigneeStatusPanel = document.getElementById("wpAssigneeStatusPanel");
        const nonAssigneeNote = document.getElementById("wpNonAssigneeStatusNote");
        const statusSelect = document.getElementById("wpAssigneeStatusSelect");

        const isAssignee = Number(task.assignee) === Number(auth.userId);
        if (isAssignee) {
            if (assigneeStatusPanel) assigneeStatusPanel.classList.remove("d-none");
            if (nonAssigneeNote) nonAssigneeNote.classList.add("d-none");
            if (statusSelect) statusSelect.value = task.status || "PENDING";
        } else {
            if (assigneeStatusPanel) assigneeStatusPanel.classList.add("d-none");
            if (nonAssigneeNote) nonAssigneeNote.classList.remove("d-none");
        }

        // Populate Manager Edit Task Modal fields
        if (auth.isGlobalManager) {
            populateEditTaskModal(task);
        }
    }

    async function populateEditTaskModal(task) {
        const form = document.getElementById("wpEditTaskForm");
        const projSelect = document.getElementById("wpEditTaskProjectSelect");
        if (!form) return;

        const esc = window.WorkPilotAPI.escapeHtml;
        if (projSelect) {
            const projects = Array.from(projectsLookupMap.values());
            projSelect.innerHTML = projects
                .map((p) => `<option value="${p.id}">${esc(p.name)} (#${p.id})</option>`)
                .join("");
            projSelect.value = String(task.project_id);
        }

        await populateEditModalAssignees(task.project_id, task.assignee);

        const titleInput = form.querySelector('[name="title"]');
        const descInput = form.querySelector('[name="description"]');
        const priorityInput = form.querySelector('[name="priority"]');
        const dueInput = form.querySelector('[name="due_date"]');

        if (titleInput) titleInput.value = task.title || "";
        if (descInput) descInput.value = task.description || "";
        if (priorityInput) priorityInput.value = task.priority || "MEDIUM";
        if (dueInput) dueInput.value = task.due_date || "";
    }

    async function populateEditModalAssignees(projectId, selectedAssigneeId = null) {
        const assigneeSelect = document.getElementById("wpEditTaskAssigneeSelect");
        if (!assigneeSelect || !projectId) return;
        const esc = window.WorkPilotAPI.escapeHtml;

        try {
            const data = await window.WorkPilotAPI.get(`/projects/${projectId}/members/`);
            const allMembers = Array.isArray(data) ? data : (data && data.results) || [];
            allMembers.forEach((m) => userLookupMap.set(Number(m.id), m.name || m.username));

            const eligible = allMembers.filter((m) => m.role === "MEMBER");
            if (eligible.length === 0) {
                assigneeSelect.innerHTML = `<option value="">No project MEMBERs available</option>`;
                return;
            }
            assigneeSelect.innerHTML = eligible
                .map(
                    (m) =>
                        `<option value="${m.id}">${esc(m.name || m.username)} (#${m.id})</option>`
                )
                .join("");
            if (selectedAssigneeId) {
                assigneeSelect.value = String(selectedAssigneeId);
            }
        } catch (err) {
            const proj = projectsLookupMap.get(Number(projectId));
            const users = (proj && proj.users) || [];
            assigneeSelect.innerHTML = users
                .map((u) => `<option value="${u.id}">${esc(u.username || u.name)} (#${u.id})</option>`)
                .join("");
            if (selectedAssigneeId) {
                assigneeSelect.value = String(selectedAssigneeId);
            }
        }
    }

    function setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val !== undefined && val !== null ? String(val) : "—";
    }

    /**
     * Section 15.7: Assignee-only status update
     * PATCH /api/v1/tasks/{task_id}/status/ with { "status": "IN_PROGRESS" } ONLY.
     */
    function initAssigneeStatusForm() {
        const form = document.getElementById("wpAssigneeStatusForm");
        if (!form) return;

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!taskId) return;

            const statusSelect = document.getElementById("wpAssigneeStatusSelect");
            const submitBtn = document.getElementById("wpAssigneeStatusSubmitBtn");
            const newStatus = statusSelect ? statusSelect.value : "";

            if (!newStatus) return;

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Updating...";
            }

            try {
                // Send ONLY { status } per Section 15.7 & Appendix B
                await window.WorkPilotAPI.patch(`/tasks/${taskId}/status/`, {
                    status: newStatus,
                });

                window.WorkPilotAPI.showNotice(
                    `Task status updated to ${newStatus}.`,
                    "success"
                );
                await loadTaskDetail();
            } catch (err) {
                const parsed = window.WorkPilotAPI.parseError(err);
                window.WorkPilotAPI.showNotice(parsed.summary, "error");
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Update Status";
                }
            }
        });
    }

    /**
     * Section 15.5: Manager task update
     * PATCH /api/v1/tasks/{id}/
     * Editable: title, description, project_id, assignee, priority, due_date.
     * MUST send project_id and assignee together when changing either.
     * MUST NOT send status or created_by.
     */
    function initEditTaskForm() {
        const form = document.getElementById("wpEditTaskForm");
        const projSelect = document.getElementById("wpEditTaskProjectSelect");
        if (!form) return;

        if (projSelect) {
            projSelect.addEventListener("change", () => {
                populateEditModalAssignees(projSelect.value);
            });
        }

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!taskId) return;
            window.WorkPilotAPI.clearFormErrors(form);

            const title = form.querySelector('[name="title"]')?.value.trim() || "";
            const description = form.querySelector('[name="description"]')?.value.trim() || "";
            const project_id = Number(form.querySelector('[name="project_id"]')?.value || 0);
            const assignee = Number(form.querySelector('[name="assignee"]')?.value || 0);
            const priority = form.querySelector('[name="priority"]')?.value || "MEDIUM";
            const due_date = form.querySelector('[name="due_date"]')?.value || "";
            const submitBtn = document.getElementById("wpEditTaskSubmitBtn");

            if (!title || !description || !project_id || !assignee || !due_date) {
                window.WorkPilotAPI.showNotice(
                    "All editable task fields (including both project and assignee) are required.",
                    "error",
                    "wpEditTaskModalNotice"
                );
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Saving...";
            }

            try {
                // Section 15.5 & Appendix B: Send project_id + assignee together; never send status or created_by
                await window.WorkPilotAPI.patch(`/tasks/${taskId}/`, {
                    title,
                    description,
                    project_id,
                    assignee,
                    priority,
                    due_date,
                });

                const modalEl = document.getElementById("wpEditTaskModal");
                if (modalEl && typeof bootstrap !== "undefined") {
                    const modal = bootstrap.Modal.getInstance(modalEl);
                    if (modal) modal.hide();
                }

                window.WorkPilotAPI.showNotice("Task updated.", "success");
                await loadTaskDetail();
            } catch (err) {
                const parsed = window.WorkPilotAPI.parseError(err);
                window.WorkPilotAPI.applyFormErrors(form, parsed.fieldErrors);
                window.WorkPilotAPI.showNotice(
                    parsed.summary,
                    "error",
                    "wpEditTaskModalNotice"
                );
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Save Task Changes";
                }
            }
        });
    }

    /**
     * Section 15.6: Physical task deletion (cascades to comments).
     */
    function initDeleteTaskButton() {
        const btn = document.getElementById("wpDeleteTaskBtn");
        if (!btn) return;

        btn.addEventListener("click", () => {
            if (!taskId || !currentTask) return;
            window.WorkPilotAPI.confirmDestructiveAction({
                title: "Delete Task",
                message: `Are you sure you want to permanently delete task "${currentTask.title}"? This physical deletion also cascade-deletes all associated task comments.`,
                confirmLabel: "Delete Task",
                onConfirm: async () => {
                    try {
                        await window.WorkPilotAPI.delete(`/tasks/${taskId}/`);
                        window.location.href = window.WP_CONFIG.ROUTES.TASKS;
                    } catch (err) {
                        const parsed = window.WorkPilotAPI.parseError(err);
                        window.WorkPilotAPI.showNotice(parsed.summary, "error");
                        throw err;
                    }
                },
            });
        });
    }

    /* ==========================================================================
       Section 6 & 16: Chat-Style Task Comments
       ========================================================================== */

    async function loadInitialComments() {
        loadedComments = [];
        loadedCommentIds.clear();
        commentsNextUrl = null;
        await fetchCommentsPage(`/tasks/${taskId}/comments/`, false);
    }

    async function fetchCommentsPage(url, isAdditionalPage = false) {
        const loadingEl = document.getElementById("wpCommentsLoading");
        const chatBoxEl = document.getElementById("wpChatMessagesContainer");
        const loadMoreBar = document.getElementById("wpChatPaginationBar");
        const loadMoreBtn = document.getElementById("wpChatLoadMoreBtn");
        const restrictedNote = document.getElementById("wpCommentsRestrictedNote");
        const composerForm = document.getElementById("wpCommentComposerForm");

        if (loadingEl && !isAdditionalPage) loadingEl.classList.remove("d-none");

        try {
            const data = await window.WorkPilotAPI.get(url);
            const results = Array.isArray(data) ? data : (data && data.results) || [];
            commentsNextUrl = data && data.next ? data.next : null;

            if (loadingEl) loadingEl.classList.add("d-none");
            if (restrictedNote) restrictedNote.classList.add("d-none");
            if (composerForm) composerForm.classList.remove("d-none");

            // Deduplicate and maintain strict chronological ascending order (oldest first by created_at)
            results.forEach((c) => {
                if (!loadedCommentIds.has(Number(c.id))) {
                    loadedCommentIds.add(Number(c.id));
                    loadedComments.push(c);
                }
            });

            loadedComments.sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );

            renderChatMessages(chatBoxEl, !isAdditionalPage);

            if (loadMoreBar && loadMoreBtn) {
                if (commentsNextUrl) {
                    loadMoreBar.classList.remove("d-none");
                    loadMoreBtn.disabled = false;
                } else {
                    loadMoreBar.classList.add("d-none");
                }
            }
        } catch (err) {
            if (loadingEl) loadingEl.classList.add("d-none");
            // Section 16.1 & 16.2: Users who are neither task creator nor assignee receive 403/404
            if (err && (err.status === 403 || err.status === 404)) {
                if (restrictedNote) restrictedNote.classList.remove("d-none");
                if (composerForm) composerForm.classList.add("d-none");
                if (chatBoxEl) chatBoxEl.innerHTML = "";
            } else {
                const parsed = window.WorkPilotAPI.parseError(err);
                window.WorkPilotAPI.showNotice(parsed.summary, "error");
            }
        }
    }

    function renderChatMessages(container, scrollToBottom = true) {
        if (!container) return;
        const auth = window.WorkPilotAPI.getAuthState();
        const esc = window.WorkPilotAPI.escapeHtml;
        const fmtDateTime = window.WorkPilotAPI.formatDateTime;

        if (loadedComments.length === 0) {
            container.innerHTML = `
                <div class="wp-empty-state my-auto">
                    <div class="fw-semibold mb-1">No comments yet</div>
                    <div class="small">Start the task discussion by sending a message below.</div>
                </div>`;
            return;
        }

        container.innerHTML = loadedComments
            .map((comment) => {
                const isOwn = Number(comment.author_id) === Number(auth.userId);
                const alignClass = isOwn ? "chat-right" : "chat-left";
                const authorLabel = isOwn
                    ? esc(auth.username || "You")
                    : esc(resolveUserLabel(comment.author_id));
                const timestamp = fmtDateTime(comment.created_at);
                const isEdited =
                    comment.updated_at &&
                    comment.created_at &&
                    comment.updated_at !== comment.created_at;

                return `
                <div class="wp-chat-row ${alignClass}" data-comment-id="${comment.id}">
                    <div class="wp-chat-bubble">
                        <div class="wp-chat-header">
                            <span>${authorLabel}</span>
                        </div>
                        <div class="wp-chat-content">${esc(comment.content)}</div>
                    </div>
                    <div class="wp-chat-footer">
                        <span>${timestamp}${isEdited ? " (edited)" : ""}</span>
                        ${
                            isOwn
                                ? `<button type="button" class="wp-chat-action-btn" data-edit-comment="${comment.id}">Edit</button>
                                   <button type="button" class="wp-chat-action-btn wp-chat-delete-btn" data-delete-comment="${comment.id}">Delete</button>`
                                : ""
                        }
                    </div>
                </div>`;
            })
            .join("");

        // Wire Edit and Delete controls on own messages
        container.querySelectorAll("[data-edit-comment]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const cId = Number(btn.getAttribute("data-edit-comment"));
                openEditCommentModal(cId);
            });
        });

        container.querySelectorAll("[data-delete-comment]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const cId = Number(btn.getAttribute("data-delete-comment"));
                confirmDeleteComment(cId);
            });
        });

        if (scrollToBottom) {
            container.scrollTop = container.scrollHeight;
        }
    }

    /**
     * Section 6.5 & 16.3: Send new comment
     * POST /api/v1/tasks/{task_id}/comments/ with { content } ONLY.
     * Prevent duplicate submissions; clear input ONLY after success.
     */
    function initCommentComposer() {
        const form = document.getElementById("wpCommentComposerForm");
        const input = document.getElementById("wpCommentContentInput");
        const sendBtn = document.getElementById("wpCommentSendBtn");
        const loadMoreBtn = document.getElementById("wpChatLoadMoreBtn");

        if (loadMoreBtn) {
            loadMoreBtn.addEventListener("click", async () => {
                if (!commentsNextUrl) return;
                loadMoreBtn.disabled = true;
                await fetchCommentsPage(commentsNextUrl, true);
            });
        }

        if (!form || !input) return;

        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                form.requestSubmit();
            }
        });

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!taskId) return;

            const content = input.value.trim();
            if (!content) return;

            if (sendBtn) {
                sendBtn.disabled = true;
                sendBtn.textContent = "Sending...";
            }
            input.disabled = true;

            try {
                // Send ONLY { content } per Section 16.3 & Appendix B
                const createdComment = await window.WorkPilotAPI.post(
                    `/tasks/${taskId}/comments/`,
                    { content }
                );

                // Clear input ONLY after success (Section 6.1 & 24.5)
                input.value = "";

                if (createdComment && createdComment.id) {
                    if (!loadedCommentIds.has(Number(createdComment.id))) {
                        loadedCommentIds.add(Number(createdComment.id));
                        loadedComments.push(createdComment);
                    }
                    const chatBoxEl = document.getElementById("wpChatMessagesContainer");
                    renderChatMessages(chatBoxEl, true);
                } else {
                    await loadInitialComments();
                }
            } catch (err) {
                const parsed = window.WorkPilotAPI.parseError(err);
                window.WorkPilotAPI.showNotice(parsed.summary, "error");
            } finally {
                input.disabled = false;
                if (sendBtn) {
                    sendBtn.disabled = false;
                    sendBtn.textContent = "Send";
                }
                input.focus();
            }
        });
    }

    /**
     * Section 6.5 & 16.4: Edit own comment
     * PATCH /api/v1/tasks/{task_id}/comments/{comment_id}/ with { content } ONLY.
     */
    function openEditCommentModal(commentId) {
        const target = loadedComments.find((c) => Number(c.id) === Number(commentId));
        if (!target) return;

        const modalEl = document.getElementById("wpEditCommentModal");
        const input = document.getElementById("wpEditCommentContentInput");
        const idInput = document.getElementById("wpEditCommentIdInput");

        if (input) input.value = target.content || "";
        if (idInput) idInput.value = String(commentId);

        if (modalEl && typeof bootstrap !== "undefined") {
            bootstrap.Modal.getOrCreateInstance(modalEl).show();
        }
    }

    function initEditCommentForm() {
        const form = document.getElementById("wpEditCommentForm");
        if (!form) return;

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const commentId = document.getElementById("wpEditCommentIdInput")?.value;
            const content =
                document.getElementById("wpEditCommentContentInput")?.value.trim() || "";
            const submitBtn = document.getElementById("wpEditCommentSubmitBtn");

            if (!commentId || !content) return;

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Updating...";
            }

            try {
                // Send ONLY { content } per Section 16.4 & Appendix B
                const updated = await window.WorkPilotAPI.patch(
                    `/tasks/${taskId}/comments/${commentId}/`,
                    { content }
                );

                const idx = loadedComments.findIndex((c) => Number(c.id) === Number(commentId));
                if (idx !== -1 && updated) {
                    loadedComments[idx] = updated;
                }

                const modalEl = document.getElementById("wpEditCommentModal");
                if (modalEl && typeof bootstrap !== "undefined") {
                    const modal = bootstrap.Modal.getInstance(modalEl);
                    if (modal) modal.hide();
                }

                const chatBoxEl = document.getElementById("wpChatMessagesContainer");
                renderChatMessages(chatBoxEl, false);
            } catch (err) {
                const parsed = window.WorkPilotAPI.parseError(err);
                window.WorkPilotAPI.showNotice(
                    parsed.summary,
                    "error",
                    "wpEditCommentModalNotice"
                );
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Save Comment";
                }
            }
        });
    }

    /**
     * Section 6.5 & 16.5: Delete own comment
     * Ask for confirmation first, then DELETE /api/v1/tasks/{task_id}/comments/{comment_id}/.
     * Handle 204 No Content without response.json() and remove bubble only after success.
     */
    function confirmDeleteComment(commentId) {
        window.WorkPilotAPI.confirmDestructiveAction({
            title: "Delete Comment",
            message: "Are you sure you want to delete this comment? This action cannot be undone.",
            confirmLabel: "Delete Comment",
            onConfirm: async () => {
                try {
                    await window.WorkPilotAPI.delete(`/tasks/${taskId}/comments/${commentId}/`);
                    loadedComments = loadedComments.filter(
                        (c) => Number(c.id) !== Number(commentId)
                    );
                    loadedCommentIds.delete(Number(commentId));
                    const chatBoxEl = document.getElementById("wpChatMessagesContainer");
                    renderChatMessages(chatBoxEl, false);
                } catch (err) {
                    const parsed = window.WorkPilotAPI.parseError(err);
                    window.WorkPilotAPI.showNotice(parsed.summary, "error");
                    throw err;
                }
            },
        });
    }

    document.addEventListener("DOMContentLoaded", () => {
        initAssigneeStatusForm();
        initEditTaskForm();
        initDeleteTaskButton();
        initCommentComposer();
        initEditCommentForm();
        loadTaskDetail();
    });
})();
