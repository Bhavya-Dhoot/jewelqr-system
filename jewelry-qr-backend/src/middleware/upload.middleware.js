const multer = require('multer');

/**
 * Upload Middleware
 * Configures multer for image uploads with memory storage
 * Images are processed by sharp before saving to disk
 */

// Memory storage - files stored in buffer for sharp processing
const storage = multer.memoryStorage();

// File filter - only accept images
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed'), false);
    }
};

// Configure multer
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max per file
        files: 7 // Max 7 files (1 primary + 6 gallery)
    }
});

// Export upload configurations
module.exports = {
    // Single primary image
    uploadPrimary: upload.single('primary'),

    // Multiple images (primary + gallery)
    uploadMultiple: upload.fields([
        { name: 'primary', maxCount: 1 },
        { name: 'gallery', maxCount: 6 }
    ]),

    // Single image for replacement
    uploadSingle: upload.single('image')
};
