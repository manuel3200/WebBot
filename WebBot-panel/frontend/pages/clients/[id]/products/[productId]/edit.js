import { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/router';
import withAuth from '../../../../../components/withAuth';
import Link from 'next/link';
import moment from 'moment';

function EditProductPage() {
    const router = useRouter();
    const { id: clientId, productId } = router.query;

    const [formState, setFormState] = useState({
        product_name: '',
        status: '',
        expiry_date: '',
        service_username: '',
        service_password: '',
        product_notes: ''
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // ------------------- HISTORIAL -------------------
    const [history, setHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [errorHistory, setErrorHistory] = useState('');

    const fetchProductHistory = async () => {
        setLoadingHistory(true);
        setErrorHistory('');
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(
                `http://localhost:3001/api/products/${productId}/history`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setHistory(response.data);
        } catch (err) {
            setErrorHistory('No se pudo cargar el historial.');
        } finally {
            setLoadingHistory(false);
        }
    };

    useEffect(() => {
        if (!productId) return;
        const fetchProduct = async () => {
            try {
                const token = localStorage.getItem('token');
                const response = await axios.get(`http://localhost:3001/api/products/${productId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const formattedData = {
                    ...response.data,
                    expiry_date: moment(response.data.expiry_date).format('YYYY-MM-DD')
                };
                setFormState(formattedData);
            } catch (err) {
                setError('No se pudo cargar el producto.');
            } finally {
                setLoading(false);
            }
        };
        fetchProduct();
        fetchProductHistory();
    }, [productId]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormState(prevState => ({ ...prevState, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const token = localStorage.getItem('token');
            await axios.put(`http://localhost:3001/api/products/${productId}`, formState, {
                headers: { Authorization: `Bearer ${token}` }
            });
            router.push(`/clients/${clientId}`);
        } catch (err) {
            setError('No se pudo actualizar el producto.');
            setSubmitting(false);
        }
    };

    if (loading) return <div className="text-[var(--text-light)]">Cargando producto...</div>;
    if (error) return <div className="text-[var(--danger)]">{error}</div>;

    return (
        <div>
            <Link
                href={`/clients/${clientId}`}
                className="text-[var(--primary)] hover:underline mb-8 inline-block font-semibold"
            >
                &larr; Volver a los detalles del cliente
            </Link>
            <h1 className="text-3xl font-black mb-8 text-[var(--primary)] drop-shadow">Editar Producto</h1>
            <div className="bg-[var(--panel)] p-8 rounded-xl shadow-xl max-w-2xl mx-auto border border-[var(--sidebar)]">
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-[var(--text-light)] text-sm font-bold mb-2">Nombre del Producto</label>
                        <input name="product_name" value={formState.product_name} onChange={handleChange} required className="w-full" />
                    </div>
                    <div className="mb-4">
                        <label className="block text-[var(--text-light)] text-sm font-bold mb-2">Fecha de Vencimiento</label>
                        <input name="expiry_date" type="date" value={formState.expiry_date} onChange={handleChange} required className="w-full" />
                    </div>
                    <div className="mb-4">
                        <label className="block text-[var(--text-light)] text-sm font-bold mb-2">Estado</label>
                        <input name="status" value={formState.status} onChange={handleChange} required className="w-full" />
                    </div>
                    <div className="mb-4">
                        <label className="block text-[var(--text-light)] text-sm font-bold mb-2">Usuario del Servicio</label>
                        <input name="service_username" value={formState.service_username || ''} onChange={handleChange} className="w-full" />
                    </div>
                    <div className="mb-4">
                        <label className="block text-[var(--text-light)] text-sm font-bold mb-2">Contraseña del Servicio</label>
                        <input name="service_password" value={formState.service_password || ''} onChange={handleChange} className="w-full" />
                    </div>
                    <div className="mb-6">
                        <label className="block text-[var(--text-light)] text-sm font-bold mb-2">Notas</label>
                        <textarea name="product_notes" rows="3" value={formState.product_notes || ''} onChange={handleChange} className="w-full" />
                    </div>
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
                            {submitting ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </div>
                </form>

                {/* --- HISTORIAL DE CAMBIOS --- */}
                <div className="mt-10">
                    <h3 className="text-lg font-bold mb-3 text-[var(--primary)]">Historial de cambios de usuario y contraseña</h3>
                    <div className="overflow-x-auto rounded-xl">
                        {loadingHistory && <div className="text-[var(--text-light)]">Cargando historial...</div>}
                        {errorHistory && <div className="text-[var(--danger)]">{errorHistory}</div>}
                        {history.length === 0 && !loadingHistory && !errorHistory && (
                            <div className="text-[var(--text-light)]/60">Este producto no tiene historial de cambios.</div>
                        )}
                        {history.length > 0 && (
                            <table className="min-w-full table-night">
                                <thead>
                                    <tr>
                                        <th>Fecha</th>
                                        <th>Correo anterior</th>
                                        <th>Contraseña anterior</th>
                                        <th>Correo nuevo</th>
                                        <th>Contraseña nueva</th>
                                        <th>ID usuario</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.map((item, idx) => (
                                        <tr key={item.id}>
                                            <td>{moment(item.changed_at).format('DD/MM/YYYY HH:mm')}</td>
                                            <td>{item.old_service_username || <i className="text-gray-400">-</i>}</td>
                                            <td>{item.old_service_password || <i className="text-gray-400">-</i>}</td>
                                            <td>{item.new_service_username || <i className="text-gray-400">-</i>}</td>
                                            <td>{item.new_service_password || <i className="text-gray-400">-</i>}</td>
                                            <td>{item.changed_by_user_id}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default withAuth(EditProductPage);
