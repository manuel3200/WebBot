// WebBot/frontend/pages/clients/[id]/edit.js
import { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/router';
import withAuth from '../../../components/withAuth';
import Link from 'next/link';

function EditClientPage() {
  const [client, setClient] = useState({ name: '', whatsapp: '', email: '', general_notes: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const { id } = router.query; // Obtenemos el ID del cliente desde la URL

  // useEffect para cargar los datos del cliente cuando la página se monta
  useEffect(() => {
    // Nos aseguramos de que tengamos un ID antes de intentar buscar los datos
    if (!id) return;

    const fetchClientData = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Token no encontrado.');

        const response = await axios.get(`http://localhost:3001/api/clients/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        // Guardamos los datos del cliente en el estado para pre-llenar el formulario
        setClient(response.data);
        setLoading(false);
      } catch (err) {
        console.error('Error al cargar datos del cliente:', err);
        setError('No se pudo cargar la información del cliente.');
        setLoading(false);
      }
    };

    fetchClientData();
  }, [id]); // Este efecto se volverá a ejecutar si el 'id' cambia

  // Manejador para actualizar el estado a medida que el usuario escribe
  const handleChange = (e) => {
    const { name, value } = e.target;
    setClient(prevClient => ({ ...prevClient, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Token no encontrado.');

      // Usamos el método PUT para actualizar, enviando los datos del estado 'client'
      await axios.put(`http://localhost:3001/api/clients/${id}`, client, {
        headers: { Authorization: `Bearer ${token}` },
      });

      router.push('/clients');
    } catch (err) {
      console.error('Error al actualizar cliente:', err);
      setError('No se pudo actualizar el cliente. Inténtalo de nuevo.');
      setSubmitting(false);
    }
  };

  if (loading) return <div>Cargando cliente...</div>;
  if (error) return <div className="text-red-500">{error}</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Editar Cliente</h1>
      <div className="bg-white p-8 rounded-lg shadow-md max-w-2xl mx-auto">
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="name">Nombre</label>
            <input
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700"
              id="name"
              name="name" // El 'name' debe coincidir con la clave en el estado 'client'
              type="text"
              value={client.name}
              onChange={handleChange}
              required
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="whatsapp">WhatsApp</label>
            <input
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700"
              id="whatsapp"
              name="whatsapp"
              type="text"
              value={client.whatsapp || ''}
              onChange={handleChange}
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="email">Email</label>
            <input
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700"
              id="email"
              name="email"
              type="email"
              value={client.email || ''}
              onChange={handleChange}
            />
          </div>
          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="general_notes">Notas Generales</label>
            <textarea
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700"
              id="general_notes"
              name="general_notes"
              rows="4"
              value={client.general_notes || ''}
              onChange={handleChange}
            />
          </div>
          {error && <p className="text-red-500 text-center mb-4">{error}</p>}
          <div className="flex items-center gap-4">
            <Link href="/clients" className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded text-center">
              Cancelar
            </Link>
            <button
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded w-full"
              type="submit"
              disabled={submitting}
            >
              {submitting ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default withAuth(EditClientPage);
