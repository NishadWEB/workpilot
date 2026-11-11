/**
 * WorkPilot Frontend Configuration (config.js)
 * Single source of truth for API base path, storage keys, and route paths.
 */
const WP_CONFIG = {
    API_BASE: "/api/v1",
    AUTH_BASE: "/api/v1/auth",
    STORAGE_KEYS: {
        ACCESS: "access",
        REFRESH: "refresh",
        ROLE: "role",
        USERNAME: "username",
        USER_ID: "user_id",
        THEME: "theme",
    },
    ROUTES: {
        LOGIN: "/login/",
        REGISTER: "/register/",
        DASHBOARD: "/dashboard/",
        PROJECTS: "/projects/",
        TASKS: "/tasks/",
        PROFILE: "/profile/",
    },
    TOKEN_EXPIRY_BUFFER_SECONDS: 30,
};

window.WP_CONFIG = WP_CONFIG;
