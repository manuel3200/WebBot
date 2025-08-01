// WebBot/frontend/pages/_app.js
import '../styles/globals.css';
import Layout from '../components/Layout';
import { useRouter } from 'next/router';
import { AuthProvider } from '../context/AuthContext'; // 1. Importamos el AuthProvider que creamos

function MyApp({ Component, pageProps }) {
  const router = useRouter();

  return (
    // 2. Envolvemos toda la aplicación con el AuthProvider. 1
    // Ahora, cualquier componente dentro de nuestra app (Layout, Component, etc.)
    // puede acceder a la información del usuario usando el hook `useAuth`.
    <AuthProvider>
      {router.pathname === '/login' ? (
        // La página de login no necesita el Layout, así que la mostramos sola.
        <Component {...pageProps} />
      ) : (
        // Todas las demás páginas se muestran dentro del Layout.
        <Layout>
          <Component {...pageProps} />
        </Layout>
      )}
    </AuthProvider>
  );
}

export default MyApp;
