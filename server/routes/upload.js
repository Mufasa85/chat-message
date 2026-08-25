const express = require("express");
const { authMiddleware } = require("../middleware/auth");
const { upload, cloudinary, getResourceType } = require("../middleware/upload");
const Message = require("../models/Message");

const router = express.Router();

// Construit l'URL publique d'un fichier selon son storage
// - Cloudinary : f.path contient déjà l'URL https://res.cloudinary.com/...
// - Local (raw) : on déduit l'URL depuis la requête HTTP (host + protocole)
const buildFileUrl = (f, resourceType, req) => {
  if (resourceType === "raw") {
    // Priorité : SERVER_URL env > déduction automatique depuis les headers HTTP
    const base =
      process.env.SERVER_URL || `${req.protocol}://${req.get("host")}`;
    return `${base}/uploads/${f.filename}`;
  }
  return f.path; // URL Cloudinary déjà complète
};

// POST /api/upload — envoyer un fichier (image/audio/vidéo → Cloudinary, raw → local)
router.post("/", authMiddleware, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu" });
    const { roomId } = req.body;

    const f = req.file;
    const mime = f.mimetype || "";
    const resourceType = getResourceType(mime);

    let msgType = "file";
    if (mime.startsWith("image/")) msgType = "image";
    else if (mime.startsWith("video/")) msgType = "video";
    else if (mime.startsWith("audio/")) msgType = "audio";

    const fileUrl = buildFileUrl(f, resourceType, req);

    const attachment = {
      url: fileUrl,
      secureUrl: fileUrl,
      publicId: f.filename,
      resourceType,
      format: f.originalname.split(".").pop().toLowerCase(),
      bytes: f.size,
      width: f.width,
      height: f.height,
      filename: f.originalname,
      storedLocally: resourceType === "raw", // indique si c'est un fichier local
    };

    // Mode DM : pas de roomId valide, on retourne juste l'attachment
    if (!roomId || roomId === "dm") {
      return res.status(201).json({ type: msgType, attachment });
    }

    const message = await Message.create({
      room: roomId,
      author: req.user._id,
      content: req.body.caption || "",
      type: msgType,
      attachment,
    });
    await message.populate("author", "username avatar");
    res.status(201).json(message);
  } catch (err) {
    console.error("[UPLOAD]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/upload/:publicId — supprimer un fichier Cloudinary
router.delete("/:publicId", authMiddleware, async (req, res) => {
  try {
    await cloudinary.uploader.destroy(decodeURIComponent(req.params.publicId));
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/upload/giphy?q=cat — recherche ou trending Giphy
router.get("/giphy", authMiddleware, async (req, res) => {
  try {
    const { q, limit = 20, offset = 0 } = req.query;
    const apiKey = process.env.GIPHY_API_KEY;
    if (!apiKey)
      return res.status(500).json({ error: "GIPHY_API_KEY manquante" });

    const endpoint = q
      ? `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}&lang=fr`
      : `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=${limit}&offset=${offset}`;

    const giphyRes = await fetch(endpoint);
    const data = await giphyRes.json();
    const gifs = data.data.map((g) => ({
      id: g.id,
      title: g.title,
      url: g.images.fixed_height.url,
      original: g.images.original.url,
      preview: g.images.fixed_height_small.url,
      width: parseInt(g.images.fixed_height.width),
      height: parseInt(g.images.fixed_height.height),
    }));
    res.json({ gifs, pagination: data.pagination });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
