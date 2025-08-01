// WebBot/frontend/components/withAuth.js
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

// --- Lección: Componente de Orden Superior (HOC) ---
// Un HOC es una función que toma un componente como argumento
// y devuelve un nuevo componente con funcionalidades extra.
// En este caso, la funcionalidad extra es la "verificación de seguridad".
const withAuth = (WrappedComponent) => {
  // El HOC devuelve un nuevo componente funcional.
  return (props) => {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);

    // --- Lección: useEffect ---
    // Este "Hook" se ejecuta después de que el componente se monta en el navegador.
    // Es el lugar perfecto para interactuar con APIs del navegador como 'localStorage'.
    useEffect(() => {
      // Intentamos obtener el token que guardamos en el login.
      const token = localStorage.getItem('token');

      // Si no hay token, redirigimos al usuario a la página de login.
      if (!token) {
        router.replace('/login');
      } else {
        // Si hay un token, le permitimos al usuario ver la página.
        setIsLoading(false);
      }
    }, [router]); // El array de dependencias asegura que esto se ejecute solo una vez.

    // Mientras verificamos el token, podemos mostrar un mensaje de carga.
    // Esto evita un "parpadeo" donde el usuario ve la página protegida por un instante.
    if (isLoading) {
      return <div className="min-h-screen flex items-center justify-center">Cargando...</div>;
    }

    // Si todo está bien, mostramos el componente original que envolvimos.
    return <WrappedComponent {...props} />;
  };
};

export default withAuth;
