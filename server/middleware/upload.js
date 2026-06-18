const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const getResourceType = (mimetype) => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/') || mimetype.startsWith('audio/')) return 'video';
  return 'raw';
};

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const resourceType = getResourceType(file.mimetype);
    return {
      folder: `chatapp/${resourceType}s`,
      resource_type: resourceType,
      allowed_formats: [
        'jpg','jpeg','png','gif','webp',
        'mp4','mov','avi','webm',
        'mp3','wav','ogg','m4a',
        'pdf','doc','docx','xls','xlsx','txt','zip',
      ],
      transformation: resourceType === 'image'
        ? [{ quality: 'auto', fetch_format: 'auto' }]
        : undefined,
    };
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const blocked = ['.exe','.sh','.bat','.cmd','.msi','.dmg'];
    const ext = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
    if (blocked.includes(ext)) return cb(new Error(`Type non autorisé : ${ext}`));
    cb(null, true);
  },
});

module.exports = { upload, cloudinary, getResourceType };