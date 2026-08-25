# Configuration Husky, ESLint et tests

Ce document résume ce qui a été mis en place pour sécuriser le code avec des tests statiques, des tests unitaires et des hooks Git (Husky).

## Que contient la configuration ?

### ESLint — tests statiques

ESLint est installé et configuré à la fois côté `client` et côté `server`.

- **`client/eslint.config.js`** : ESLint pour React (flat config). Utilise `@eslint/js`, `eslint-plugin-react`, `eslint-plugin-react-hooks` et `eslint-plugin-react-refresh`.
- **`server/eslint.config.mjs`** : ESLint pour Node.js/Express.

Les règles sont configurées pour ne pas être bloquantes sur le code existant. Les warnings restent visibles, mais les commits ne sont pas empêchés par des erreurs de style historiques.

### Tests unitaires

- **Côté `server/`** : Jest était déjà installé. Les tests se trouvent dans `server/__tests__/`.
- **Côté `client/`** : Vitest a été ajouté avec `jsdom` et `@testing-library/react`. La configuration est dans `client/vitest.config.js`. Un test d'exemple est présent dans `client/src/__tests__/App.test.jsx`.

### Husky + lint-staged

- **`.husky/pre-commit`** : hook exécuté automatiquement avant chaque commit.
- **`.lintstagedrc`** : lance ESLint avec `--fix` puis les tests pour les fichiers stagés.
- **`package.json` racine** : contient le script `prepare: "husky"` pour installer les hooks Git après `npm install`.

## Commandes disponibles

### Racine (`chat-app/`)

```bash
npm run lint          # lint client + server
npm run lint:client   # lint uniquement le client
npm run lint:server   # lint uniquement le serveur
npm run test          # tests client + server
npm run test:client   # tests uniquement le client
npm run test:server   # tests uniquement le serveur
```

### Client (`client/`)

```bash
npm run lint          # ESLint sur le client
npm run lint:fix      # ESLint avec correction automatique
npm run test          # lance Vitest une fois
npm run test:watch    # lance Vitest en mode watch
npm run test:coverage # lance Vitest avec rapport de couverture
```

### Server (`server/`)

```bash
npm run lint          # ESLint sur le serveur
npm run lint:fix      # ESLint avec correction automatique
npm run test          # lance Jest une fois
npm run test:watch    # lance Jest en mode watch
npm run test:coverage # lance Jest avec rapport de couverture
```

## Vérifications actuelles

- Lint `server` : OK (warnings uniquement)
- Tests `server` : 21/21 passent
- Lint `client` : OK (17 warnings)
- Tests `client` : 1/1 passe

## Notes importantes

- ESLint a été downgradé côté client en version `^9.22.0` pour être compatible avec `eslint-plugin-react`.
- Côté client, certaines règles React expérimentales très strictes (`purity`, `refs`, `set-state-in-effect`, etc.) ont été désactivées temporairement pour ne pas bloquer le code existant.
- Les warnings restants concernent principalement des `exhaustive-deps` et `no-unused-vars` dans le code historique.
- `npm install` à la racine active automatiquement Husky grâce au script `prepare`.
