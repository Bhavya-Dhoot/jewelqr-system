const Item = require('../models/Item');
const { cache, CACHE_KEYS, TTL } = require('../services/cache.service');

/**
 * Get dashboard statistics
 * GET /api/dashboard/stats
 * OPTIMIZED: Uses caching, lean(), and single aggregation pipeline
 */
exports.getStats = async (req, res, next) => {
    try {
        // Check cache first
        const cached = cache.get(CACHE_KEYS.DASHBOARD_STATS);
        if (cached) {
            return res.status(200).json({
                success: true,
                data: cached,
                cached: true
            });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // OPTIMIZED: Single aggregation pipeline for all stats
        const [stats] = await Item.aggregate([
            { $match: { deletedAt: null } },
            {
                $facet: {
                    // Total items
                    totalItems: [{ $count: 'count' }],
                    // Today's items
                    todayItems: [
                        { $match: { createdAt: { $gte: today } } },
                        { $count: 'count' }
                    ],
                    // Category breakdown (top 10)
                    categoryBreakdown: [
                        { $group: { _id: '$category.name', count: { $sum: 1 } } },
                        { $sort: { count: -1 } },
                        { $limit: 10 }
                    ],
                    // Total gold weight
                    totalGold: [
                        { $group: { _id: null, total: { $sum: '$gold.weight_g' } } }
                    ]
                }
            }
        ]).option({ maxTimeMS: 5000 });

        const result = {
            totalItems: stats.totalItems[0]?.count || 0,
            todayItems: stats.todayItems[0]?.count || 0,
            totalGoldWeight: stats.totalGold[0]?.total || 0,
            categoryBreakdown: stats.categoryBreakdown || []
        };

        // Cache for 30 seconds
        cache.set(CACHE_KEYS.DASHBOARD_STATS, result, TTL.DASHBOARD_STATS);

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get recent items for dashboard
 * GET /api/dashboard/recent
 * OPTIMIZED: Uses caching and lean()
 */
exports.getRecentItems = async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const cacheKey = `${CACHE_KEYS.RECENT_ITEMS}:${limit}`;

        // Check cache first
        const cached = cache.get(cacheKey);
        if (cached) {
            return res.status(200).json({
                success: true,
                data: cached,
                cached: true
            });
        }

        // OPTIMIZED: Use lean() for faster read, minimal projection
        // Include ALL items (active + deleted) so dashboard can show restore UI
        const items = await Item.find({})
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('sku name category.name gold.purity gold.weight_g diamonds createdAt deletedAt')
            .lean();

        // Cache for 15 seconds
        cache.set(cacheKey, items, TTL.RECENT_ITEMS);

        res.status(200).json({
            success: true,
            data: items
        });
    } catch (error) {
        next(error);
    }
};
