const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const path = require('path');
const fs = require('fs');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const getResourceType = (mimetype) => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/') || mimetype.startsWith('audio/'))
    return 'video';
  return 'raw';
};

// Dossier local pour les fichiers raw (PDF, Word, Excel...) — Cloudinary gratuit les bloque
const LOCAL_UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(LOCAL_UPLOADS_DIR))
  fs.mkdirSync(LOCAL_UPLOADS_DIR, { recursive: true });

// Storage Cloudinary — pour images, vidéos et audio uniquement
const cloudinaryStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const resourceType = getResourceType(file.mimetype);
    return {
      folder: `chatapp/${resourceType}s`,
      resource_type: resourceType,
      allowed_formats: [
        'jpg',
        'jpeg',
        'png',
        'gif',
        'webp',
        'mp4',
        'mov',
        'avi',
        'webm',
        'mp3',
        'wav',
        'ogg',
        'm4a',
      ],
      use_filename: true,
      unique_filename: true,
      ...(resourceType === 'image'
        ? { transformation: [{ quality: 'auto', fetch_format: 'auto' }] }
        : {}),
    };
  },
});

// Storage local — pour les fichiers raw (PDF, doc, xls, txt, zip...)
const localDiskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, LOCAL_UPLOADS_DIR),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}-${safeName}`);
  },
});

// Multer intelligent : choisit le storage selon le type MIME
const upload = multer({
  storage: {
    _handleFile(req, file, cb) {
      const resourceType = getResourceType(file.mimetype);
      if (resourceType === 'raw') {
        localDiskStorage._handleFile(req, file, cb);
      } else {
        cloudinaryStorage._handleFile(req, file, cb);
      }
    },
    _removeFile(req, file, cb) {
      const resourceType = getResourceType(file.mimetype);
      if (resourceType === 'raw') {
        localDiskStorage._removeFile(req, file, cb);
      } else {
        cloudinaryStorage._removeFile(req, file, cb);
      }
    },
  },
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const blocked = ['.exe', '.sh', '.bat', '.cmd', '.msi', '.dmg'];
    const ext = file.originalname
      .slice(file.originalname.lastIndexOf('.'))
      .toLowerCase();
    if (blocked.includes(ext))
      return cb(new Error(`Type non autorisé : ${ext}`));
    cb(null, true);
  },
});

module.exports = { upload, cloudinary, getResourceType, LOCAL_UPLOADS_DIR };
