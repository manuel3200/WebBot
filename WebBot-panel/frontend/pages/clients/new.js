import { useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/router';
import withAuth from '../../components/withAuth';
import Link from 'next/link';

function NewClientPage() {
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Token no encontrado.');

      const newClientData = {
        name,
        whatsapp,
        email,
        general_notes: generalNotes,
      };

      await axios.post('http://localhost:3001/api/clients', newClientData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      router.push('/clients');
    } catch (err) {
      console.error('Error al crear cliente:', err);
      setError('No se pudo crear el cliente. Inténtalo de nuevo.');
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-black mb-8 text-[var(--primary)] drop-shadow">Añadir Nuevo Cliente</h1>
      <div className="bg-[var(--panel)] p-8 rounded-xl shadow-xl max-w-2xl mx-auto border border-[var(--sidebar)]">
        <form onSubmit={handleSubmit}>
          {/* Campo Nombre */}
          <div className="mb-4">
            <label className="block text-[var(--text-light)] text-sm font-bold mb-2" htmlFor="name">
              Nombre
            </label>
            <input
              className="w-full"
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          {/* Campo WhatsApp */}
          <div className="mb-4">
            <label className="block text-[var(--text-light)] text-sm font-bold mb-2" htmlFor="whatsapp">
              WhatsApp (Opcional)
            </label>
            <input
              className="w-full"
              id="whatsapp"
              type="text"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
            />
          </div>
          {/* Campo Email */}
          <div className="mb-4">
            <label className="block text-[var(--text-light)] text-sm font-bold mb-2" htmlFor="email">
              Email (Opcional)
            </label>
            <input
              className="w-full"
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {/* Campo Notas */}
          <div className="mb-6">
            <label className="block text-[var(--text-light)] text-sm font-bold mb-2" htmlFor="general_notes">
              Notas Generales (Opcional)
            </label>
            <textarea
              className="w-full"
              id="general_notes"
              rows="4"
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
            />
          </div>

          {error && <p className="text-[var(--danger)] text-center mb-4 font-semibold">{error}</p>}

          <div className="flex items-center gap-4">
            <Link
              href="/clients"
              className="button-secondary text-center"
            >
              Cancelar
            </Link>
            <button
              className="button-main w-full"
              type="submit"
              disabled={submitting}
            >
              {submitting ? 'Guardando...' : 'Guardar Cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default withAuth(NewClientPage);
