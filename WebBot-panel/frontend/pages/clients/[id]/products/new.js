import { useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/router';
import withAuth from '../../../../components/withAuth';
import Link from 'next/link';

function NewProductPage() {
    const router = useRouter();
    const { id: clientId } = router.query;

    const [productName, setProductName] = useState('');
    const [durationDays, setDurationDays] = useState('');
    const [serviceUsername, setServiceUsername] = useState('');
    const [servicePassword, setServicePassword] = useState('');
    const [productNotes, setProductNotes] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');

        try {
            const token = localStorage.getItem('token');
            const newProductData = {
                client_id: clientId,
                product_name: productName,
                duration_days: durationDays,
                service_username: serviceUsername,
                service_password: servicePassword,
                product_notes: productNotes,
            };

            await axios.post('http://localhost:3001/api/products', newProductData, {
                headers: { Authorization: `Bearer ${token}` },
            });

            router.push(`/clients/${clientId}`);
        } catch (err) {
            console.error('Error al añadir producto:', err);
            setError(err.response?.data?.message || 'No se pudo añadir el producto.');
            setSubmitting(false);
        }
    };

    return (
        <div>
            <Link
                href={`/clients/${clientId}`}
                className="text-[var(--primary)] hover:underline mb-8 inline-block font-semibold"
            >
                &larr; Volver a los detalles del cliente
            </Link>
            <h1 className="text-3xl font-black mb-8 text-[var(--primary)] drop-shadow">Añadir Nuevo Producto</h1>
            <div className="bg-[var(--panel)] p-8 rounded-xl shadow-xl max-w-2xl mx-auto border border-[var(--sidebar)]">
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-[var(--text-light)] text-sm font-bold mb-2" htmlFor="productName">
                            Nombre del Producto
                        </label>
                        <input
                            id="productName"
                            type="text"
                            value={productName}
                            onChange={(e) => setProductName(e.target.value)}
                            required
                            className="w-full"
                        />
                    </div>
                    <div className="mb-4">
                        <label className="block text-[var(--text-light)] text-sm font-bold mb-2" htmlFor="durationDays">
                            Duración (en días)
                        </label>
                        <input
                            id="durationDays"
                            type="number"
                            min="1"
                            value={durationDays}
                            onChange={(e) => setDurationDays(e.target.value)}
                            required
                            className="w-full"
                        />
                    </div>
                    <div className="mb-4">
                        <label className="block text-[var(--text-light)] text-sm font-bold mb-2" htmlFor="serviceUsername">
                            Usuario del Servicio (Opcional)
                        </label>
                        <input
                            id="serviceUsername"
                            type="text"
                            value={serviceUsername}
                            onChange={(e) => setServiceUsername(e.target.value)}
                            className="w-full"
                        />
                    </div>
                    <div className="mb-4">
                        <label className="block text-[var(--text-light)] text-sm font-bold mb-2" htmlFor="servicePassword">
                            Contraseña del Servicio (Opcional)
                        </label>
                        <input
                            id="servicePassword"
                            type="text"
                            value={servicePassword}
                            onChange={(e) => setServicePassword(e.target.value)}
                            className="w-full"
                        />
                    </div>
                    <div className="mb-6">
                        <label className="block text-[var(--text-light)] text-sm font-bold mb-2" htmlFor="productNotes">
                            Notas (Opcional)
                        </label>
                        <textarea
                            id="productNotes"
                            rows="3"
                            value={productNotes}
                            onChange={(e) => setProductNotes(e.target.value)}
                            className="w-full"
                        />
                    </div>

                    {error && <p className="text-[var(--danger)] text-center mb-4 font-semibold">{error}</p>}

                    <div className="flex items-center gap-4">
                        <Link
                            href={`/clients/${clientId}`}
                            className="button-secondary text-center"
                        >
                            Cancelar
                        </Link>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="button-main w-full"
                        >
                            {submitting ? 'Guardando...' : 'Guardar Producto'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default withAuth(NewProductPage);
