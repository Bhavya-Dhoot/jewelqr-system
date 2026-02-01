const authRoutes = require('./auth.routes');
const itemsRoutes = require('./items.routes');
const settingsRoutes = require('./settings.routes');
const dashboardRoutes = require('./dashboard.routes');

// RBAC v1.4.0: Public and admin routes
const publicRoutes = require('./public.routes');
const adminRoutes = require('./admin.routes');

// Modular architecture routes (v1.4.0)
const itemMastersRoutes = require('./itemMasters.routes');
const modularRoutes = require('./modular.routes');

module.exports = {
    authRoutes,
    itemsRoutes,
    settingsRoutes,
    dashboardRoutes,
    // RBAC routes
    publicRoutes,
    adminRoutes,
    // Modular routes
    itemMastersRoutes,
    modularRoutes
};
