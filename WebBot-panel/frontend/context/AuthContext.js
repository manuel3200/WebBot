// WebBot/frontend/context/AuthContext.js
import { createContext, useState, useEffect, useContext } from 'react';
import { jwtDecode } from 'jwt-decode'; // Necesitaremos una nueva librería

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Cuando la app carga, intentamos leer el token del localStorage
    const token = localStorage.getItem('token');
    if (token) {
      try {
        // Decodificamos el token para obtener los datos del usuario (id, name, role)
        const decodedUser = jwtDecode(token);
        setUser(decodedUser);
      } catch (error) {
        console.error("Error al decodificar el token:", error);
        // Si el token es inválido, lo limpiamos
        localStorage.removeItem('token');
      }
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};

// Un "hook" personalizado para acceder fácilmente a los datos del usuario
export const useAuth = () => {
  return useContext(AuthContext);
};
