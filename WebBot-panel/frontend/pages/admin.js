import { useEffect, useState } from 'react';
import axios from 'axios';
import withAuth from '../components/withAuth';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/router';

function AdminPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { user: currentUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (currentUser && currentUser.role !== 'owner') {
      router.replace('/');
      return;
    }

    const fetchUsers = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Token no encontrado.');

        const response = await axios.get('http://localhost:3001/api/admin/users', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUsers(response.data);
      } catch (err) {
        console.error('Error al obtener usuarios:', err);
        setError(err.response?.data?.message || 'No se pudieron cargar los usuarios.');
      } finally {
        setLoading(false);
      }
    };

    if (currentUser && currentUser.role === 'owner') {
      fetchUsers();
    }
  }, [currentUser, router]);

  const handleRoleChange = async (userId, newRole) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`http://localhost:3001/api/admin/users/${userId}/role`, 
        { role: newRole },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setUsers(currentUsers =>
        currentUsers.map(user =>
          user.id === userId ? { ...user, role: newRole } : user
        )
      );
      alert('Rol actualizado con éxito!');
    } catch (err) {
      console.error('Error al cambiar el rol:', err);
      alert('Error al cambiar el rol.');
    }
  };

  if (loading) return <div className="text-[var(--text-light)]">Cargando usuarios...</div>;
  if (error) return <div className="text-[var(--danger)]">{error}</div>;

  return (
    <div>
      <h1 className="text-3xl font-black mb-10 text-[var(--primary)] drop-shadow">Panel de Administración de Usuarios</h1>
      <div className="bg-[var(--panel)] shadow-xl rounded-xl overflow-x-auto border border-[var(--sidebar)]">
        <table className="min-w-full table-night">
          <thead>
            <tr>
              <th>ID Usuario (Telegram)</th>
              <th>Nombre</th>
              <th>Usuario Web</th>
              <th>Rol Actual</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.id}</td>
                <td className="font-semibold">{user.name}</td>
                <td>{user.web_username || <span className="text-[var(--text-light)]/70">N/A</span>}</td>
                <td>
                  <select
                    value={user.role}
                    onChange={(e) => handleRoleChange(user.id, e.target.value)}
                    className="bg-[var(--input-bg)] border border-[var(--primary)] rounded py-2 px-3 text-[var(--text)] shadow focus:border-[var(--primary-hover)] focus:outline-none"
                    disabled={user.id === currentUser.id}
                  >
                    <option value="owner">owner</option>
                    <option value="administrador">administrador</option>
                    <option value="moderador">moderador</option>
                    <option value="usuario">usuario</option>
                  </select>
                  {user.id === currentUser.id && (
                    <span className="ml-2 text-xs text-[var(--warning)]">(Tú)</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default withAuth(AdminPage);
