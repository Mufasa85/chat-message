/**
 * Tests unitaires — Authentification
 * Vérifie que le hachage des mots de passe et la vérification JWT
 * fonctionnent correctement sans démarrer le serveur complet.
 */
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Clé secrète de test (jamais la vraie, qui est dans .env)
const TEST_JWT_SECRET = "test_secret_pour_jest_uniquement";

// ── Hachage des mots de passe ────────────────────────────────────
describe("Hachage des mots de passe (bcrypt)", () => {
  test("un mot de passe haché ne doit pas être égal au mot de passe en clair", async () => {
    const motDePasse = "motdepasse123";
    const hash = await bcrypt.hash(motDePasse, 10);
    expect(hash).not.toBe(motDePasse);
  });

  test("bcrypt.compare doit retourner true pour le bon mot de passe", async () => {
    const motDePasse = "motdepasse123";
    const hash = await bcrypt.hash(motDePasse, 10);
    const resultat = await bcrypt.compare(motDePasse, hash);
    expect(resultat).toBe(true);
  });

  test("bcrypt.compare doit retourner false pour un mauvais mot de passe", async () => {
    const motDePasse = "motdepasse123";
    const hash = await bcrypt.hash(motDePasse, 10);
    const resultat = await bcrypt.compare("mauvais_mot_de_passe", hash);
    expect(resultat).toBe(false);
  });

  test("deux hachages du même mot de passe doivent être différents (sel aléatoire)", async () => {
    const motDePasse = "motdepasse123";
    const hash1 = await bcrypt.hash(motDePasse, 10);
    const hash2 = await bcrypt.hash(motDePasse, 10);
    expect(hash1).not.toBe(hash2);
  });
});

// ── Génération et vérification de tokens JWT ────────────────────
describe("Tokens JWT", () => {
  test("un token JWT doit être généré correctement", () => {
    const payload = { userId: "507f1f77bcf86cd799439011" };
    const token = jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: "7d" });
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // header.payload.signature
  });

  test("un token JWT valide doit être correctement décodé", () => {
    const userId = "507f1f77bcf86cd799439011";
    const token = jwt.sign({ userId }, TEST_JWT_SECRET, { expiresIn: "7d" });
    const decoded = jwt.verify(token, TEST_JWT_SECRET);
    expect(decoded.userId).toBe(userId);
  });

  test("un token JWT avec un mauvais secret doit lever une erreur", () => {
    const token = jwt.sign({ userId: "123" }, TEST_JWT_SECRET);
    expect(() => jwt.verify(token, "mauvais_secret")).toThrow();
  });

  test("un token JWT expiré doit lever une erreur", async () => {
    const token = jwt.sign({ userId: "123" }, TEST_JWT_SECRET, {
      expiresIn: "1ms",
    });
    await new Promise((resolve) => setTimeout(resolve, 10)); // attendre expiration
    expect(() => jwt.verify(token, TEST_JWT_SECRET)).toThrow();
  });
});
