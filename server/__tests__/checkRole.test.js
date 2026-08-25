/**
 * Tests unitaires — Middleware de gestion des rôles
 * Vérifie que checkRole autorise/bloque correctement selon le rôle.
 */
const { checkRole } = require("../middleware/checkRole");

// Utilitaire pour créer un mock de req/res/next Express
const mockReqResNext = (userRole = null) => {
  const req = {
    user: userRole ? { role: userRole, username: "testuser" } : null,
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  return { req, res, next };
};

describe("Middleware checkRole", () => {
  test("doit appeler next() si le rôle est autorisé", () => {
    const { req, res, next } = mockReqResNext("admin");
    const middleware = checkRole("admin");
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test("doit retourner 403 si le rôle est insuffisant", () => {
    const { req, res, next } = mockReqResNext("user");
    const middleware = checkRole("admin");
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test("doit retourner 401 si aucun utilisateur authentifié", () => {
    const { req, res, next } = mockReqResNext(null);
    const middleware = checkRole("admin");
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("doit accepter plusieurs rôles autorisés", () => {
    const { req, res, next } = mockReqResNext("user");
    const middleware = checkRole("admin", "user");
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test("doit refuser un rôle non listé parmi les autorisés", () => {
    const { req, res, next } = mockReqResNext("moderator");
    const middleware = checkRole("admin", "user");
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
