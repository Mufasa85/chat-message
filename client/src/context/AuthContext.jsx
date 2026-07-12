import { createContext, useContext, useState, useCallback, useMemo } from 'react';

// URL de l'API backend — lue depuis les variables d'environnement Vite
const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Création du contexte — null par défaut (sera rempli par le Provider)
const AuthContext = createContext(null);

// AuthProvider : enveloppe l'application et rend user/token accessible partout
export const AuthProvider = ({ children }) => {

  // Lire l'utilisateur sauvegardé dans localStorage au démarrage
  // Ainsi l'utilisateur reste connecté même après fermeture du navigateur
  // La fonction passée à useState n'est exécutée qu'une seule fois (initialisation lazy)
  const [user,  setUser]  = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem('token'));

  // Connexion : appelle POST /api/auth/login, reçoit token + user
  const login = useCallback(async (username, password) => {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error); // Remonte l'erreur à AuthPage pour affichage

    // Persister dans localStorage → survit à la fermeture du navigateur
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));

    // Mettre à jour le state → App.jsx détecte token !== null → affiche ChatPage
    setToken(data.token);
    setUser(data.user);
  }, []);

  // Inscription : même logique que login mais crée un nouveau compte
  const register = useCallback(async (username, password) => {
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  }, []);

  // Déconnexion : supprime tout du localStorage et remet les states à null
  // App.jsx détecte token === null → affiche AuthPage
  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  }, []);

  // Met à jour le profil utilisateur localement (après changement d'avatar, pseudo...)
  const updateUser = useCallback((updated) => {
    setUser(updated);
    localStorage.setItem('user', JSON.stringify(updated));
  }, []);

  // useMemo évite de recréer l'objet value à chaque render
  // L'objet ne change que si une des dépendances change
  const value = useMemo(() => ({
    user,    // L'objet utilisateur { _id, username, avatar, role }
    token,   // Le JWT pour les requêtes API
    login,
    register,
    logout,
    setUser: updateUser, // Exposé sous setUser pour mettre à jour le profil
  }), [user, token, login, register, logout, updateUser]);

  return (
    // Rend les données disponibles à tous les composants enfants
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook raccourci — au lieu d'écrire useContext(AuthContext) partout
// on écrit juste useAuth() dans n'importe quel composant
export const useAuth = () => useContext(AuthContext);
