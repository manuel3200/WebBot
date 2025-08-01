// WebBot/frontend/pages/index.js
import { useEffect, useState } from 'react';
import axios from 'axios';
import withAuth from '../components/withAuth';

function HomePage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          throw new Error('No se encontró el token de autenticación.');
        }

        const response = await axios.get('http://localhost:3001/api/stats', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        setStats(response.data);
      } catch (err) {
        console.error('Error al obtener estadísticas:', err);
        setError('No se pudieron cargar las estadísticas.');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return <div className="text-[var(--text-light)] text-xl">Cargando estadísticas...</div>;
  }

  if (error) {
    return <div className="text-[var(--danger)] text-lg">{error}</div>;
  }

  return (
    <div>
      <h1 className="text-4xl font-black text-[var(--primary)] mb-10 tracking-tight drop-shadow-lg">Dashboard</h1>
      
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Total de Clientes */}
          <div className="bg-[var(--panel)] rounded-xl shadow-xl p-8 flex flex-col items-center justify-center border border-[var(--sidebar)] hover:scale-105 transition">
            <span className="inline-block text-5xl mb-2 text-cyan-300 drop-shadow">👥</span>
            <h3 className="text-lg font-semibold text-[var(--text-light)] mb-1">Total de Clientes</h3>
            <p className="text-4xl font-black text-cyan-400">{stats.totalClients}</p>
          </div>
          {/* Productos Activos */}
          <div className="bg-[var(--panel)] rounded-xl shadow-xl p-8 flex flex-col items-center justify-center border border-[var(--sidebar)] hover:scale-105 transition">
            <span className="inline-block text-5xl mb-2 text-green-300 drop-shadow">🟢</span>
            <h3 className="text-lg font-semibold text-[var(--text-light)] mb-1">Productos Activos</h3>
            <p className="text-4xl font-black text-green-400">{stats.activeProducts}</p>
          </div>
          {/* Próximos Vencimientos */}
          <div className="bg-[var(--panel)] rounded-xl shadow-xl p-8 flex flex-col items-center justify-center border border-[var(--sidebar)] hover:scale-105 transition">
            <span className="inline-block text-5xl mb-2 text-yellow-400 drop-shadow">⏳</span>
            <h3 className="text-lg font-semibold text-[var(--text-light)] mb-1">Próximos Vencimientos</h3>
            <p className="text-4xl font-black text-yellow-300">{stats.upcomingExpiries.length}</p>
            <small className="text-[var(--text-light)] mt-1">(en los próximos 7 días)</small>
          </div>
        </div>
      )}
    </div>
  );
}

export default withAuth(HomePage);
