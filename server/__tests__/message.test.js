/**
 * Tests unitaires — Validation des messages
 * Vérifie les règles métier sur le contenu des messages.
 */

// Logique de validation extraite du serveur (reproduite ici pour les tests)
const validateMessage = (content, type = 'text') => {
  if (type === 'text' || !type) {
    if (!content || !content.trim()) {
      return { valid: false, error: 'Le contenu du message est requis' };
    }
    if (content.trim().length > 2000) {
      return { valid: false, error: 'Message trop long (max 2000 caractères)' };
    }
  }
  return { valid: true };
};

const validateUsername = (username) => {
  if (!username || username.trim().length < 2) {
    return { valid: false, error: 'Nom d\'utilisateur trop court (min 2 caractères)' };
  }
  if (username.trim().length > 30) {
    return { valid: false, error: 'Nom d\'utilisateur trop long (max 30 caractères)' };
  }
  return { valid: true };
};

describe('Validation des messages', () => {
  test('un message texte non vide doit être valide', () => {
    const result = validateMessage('Bonjour tout le monde', 'text');
    expect(result.valid).toBe(true);
  });

  test('un message texte vide doit être invalide', () => {
    const result = validateMessage('', 'text');
    expect(result.valid).toBe(false);
  });

  test('un message avec seulement des espaces doit être invalide', () => {
    const result = validateMessage('   ', 'text');
    expect(result.valid).toBe(false);
  });

  test('un message de plus de 2000 caractères doit être invalide', () => {
    const longMessage = 'a'.repeat(2001);
    const result = validateMessage(longMessage, 'text');
    expect(result.valid).toBe(false);
  });

  test('un message de type giphy sans contenu texte doit être valide', () => {
    const result = validateMessage('', 'giphy');
    expect(result.valid).toBe(true);
  });
});

describe('Validation du nom d\'utilisateur', () => {
  test('un username valide (entre 2 et 30 caractères) doit être accepté', () => {
    expect(validateUsername('Randy').valid).toBe(true);
    expect(validateUsername('Mufasa85').valid).toBe(true);
  });

  test('un username trop court (moins de 2 caractères) doit être refusé', () => {
    expect(validateUsername('R').valid).toBe(false);
    expect(validateUsername('').valid).toBe(false);
  });

  test('un username trop long (plus de 30 caractères) doit être refusé', () => {
    expect(validateUsername('a'.repeat(31)).valid).toBe(false);
  });
});
