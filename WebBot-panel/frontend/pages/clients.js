// WebBot/frontend/pages/clients.js
import { useEffect, useState } from 'react';
import axios from 'axios';
import withAuth from '../components/withAuth';
import Link from 'next/link';
import ConfirmModal from '../components/ConfirmModal';

function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState(null);

  const fetchClients = async (page = 1, search = '', status = 'all') => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No se encontró el token.');

      // Preparamos los parámetros de la URL
      const params = new URLSearchParams();
      params.append('page', page);
      if (search) params.append('search', search);
      if (status && status !== 'all') params.append('status', status);

      const response = await axios.get(
        `http://localhost:3001/api/clients?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setClients(response.data.clients);
      setCurrentPage(response.data.currentPage);
      setTotalPages(response.data.totalPages);
      setError('');
    } catch (err) {
      setError('No se pudieron cargar los clientes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients(1, searchTerm, filterStatus);
  }, [searchTerm, filterStatus]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchClients(1, searchTerm, filterStatus);
  };

  const openDeleteModal = (client) => {
    setClientToDelete(client);
    setIsModalOpen(true);
  };
  const closeDeleteModal = () => {
    setClientToDelete(null);
    setIsModalOpen(false);
  };
  const handleDeleteClient = async () => {
    if (!clientToDelete) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`http://localhost:3001/api/clients/${clientToDelete.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      closeDeleteModal();
      fetchClients(activeSearch, filterStatus);
    } catch (err) {
      console.error('Error al eliminar cliente:', err);
      setError('No se pudo eliminar el cliente.');
      closeDeleteModal();
    }
  };

  // --- NUEVA FUNCIÓN PARA GENERAR EL ENLACE DE WHATSAPP ---
  const generateWhatsAppLink = (client) => {
    if (!client.whatsapp) return null;
    const phoneNumber = client.whatsapp.replace(/\D/g, '');
    const message = `¡Hola ${client.name}! Te contacto para conversar sobre tus servicios activos.`;
    const encodedMessage = encodeURIComponent(message);
    return `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
  };

  if (error) return <div className="text-[var(--danger)]">{error}</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-black text-[var(--primary)] drop-shadow">Lista de Clientes</h1>
        <Link
          href="/clients/new"
          className="button-main flex items-center gap-2"
        >
          <span className="text-lg">＋</span> Añadir Cliente
        </Link>
      </div>

      <div className="mb-8 bg-[var(--panel)] p-4 rounded-xl shadow-xl border border-[var(--sidebar)]">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-4 items-center">
          <input
            type="text"
            placeholder="Buscar por nombre de cliente o producto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full md:w-1/3"
          />
          <button
            type="submit"
            className="button-secondary w-full md:w-auto"
          >
            Buscar
          </button>
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              fetchClients(1, searchTerm, e.target.value);
            }}
            className="w-full md:w-auto"
          >
            <option value="all">Todos los Estados</option>
            <option value="Vencida">Solo Vencidos</option>
            <option value="upcoming">Próximos Vencimientos</option>
          </select>
        </form>
      </div>

      {loading ? (
        <div className="text-[var(--text-light)]">Cargando clientes...</div>
      ) : (
        <div className="bg-[var(--panel)] shadow-xl rounded-xl overflow-hidden border border-[var(--sidebar)]">
          <table className="min-w-full table-night">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>WhatsApp</th>
                <th>ID Cliente</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clients.length > 0 ? (
                clients.map((client) => (
                  <tr key={client.id} className="hover:bg-[var(--sidebar)]/80 transition">
                    <td>
                      <Link href={`/clients/${client.id}`} legacyBehavior>
                        <a className="text-[var(--primary)] hover:text-cyan-300 font-semibold transition">{client.name}</a>
                      </Link>
                    </td>
                    <td>
                      {client.whatsapp ? (
                        <a
                          href={generateWhatsAppLink(client)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-300 hover:text-cyan-100 font-semibold"
                        >
                          {client.whatsapp}
                        </a>
                      ) : (
                        <span className="text-[var(--text-light)]/70">N/A</span>
                      )}
                    </td>
                    <td>
                      <code className="bg-[var(--sidebar)] px-2 py-1 rounded text-sm text-[var(--primary)]">
                        {client.id}
                      </code>
                    </td>
                    <td>
                      <Link
                        href={`/clients/${client.id}/edit`}
                        className="text-[var(--success)] hover:text-[var(--primary)] mr-4 font-semibold"
                      >
                        Editar
                      </Link>
                      <button
                        onClick={() => openDeleteModal(client)}
                        className="text-[var(--danger)] hover:text-red-400 font-semibold"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="text-center py-10 text-[var(--text-light)]/60">
                    No se encontraron clientes que coincidan con los filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-center items-center mt-10 gap-4">
        <button
          onClick={() => fetchClients(currentPage - 1)}
          disabled={currentPage === 1}
          className="button-secondary disabled:opacity-50"
        >
          ← Anterior
        </button>
        <span className="text-[var(--primary)] font-bold">
          Página {currentPage} de {totalPages}
        </span>
        <button
          onClick={() => fetchClients(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="button-secondary disabled:opacity-50"
        >
          Siguiente →
        </button>
      </div>

      <ConfirmModal
        isOpen={isModalOpen}
        onClose={closeDeleteModal}
        onConfirm={handleDeleteClient}
        title="Confirmar Eliminación"
      >
        <p className="text-[var(--danger)] font-bold">
          ¿Estás seguro de que quieres eliminar al cliente <span className="underline">{clientToDelete?.name}</span>?
        </p>
        <p className="text-[var(--text-light)] text-sm mt-2">
          Esta acción es irreversible y eliminará todos sus productos asociados.
        </p>
      </ConfirmModal>
    </div>
  );
}

export default withAuth(ClientsPage);
