import { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/router';
import withAuth from '../../../../../components/withAuth';
import Link from 'next/link';
import moment from 'moment';

function RenewProductPage() {
    const router = useRouter();
    const { id: clientId, productId } = router.query;

    const [product, setProduct] = useState(null);
    const [durationDays, setDurationDays] = useState('30');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!productId) return;
        const fetchProduct = async () => {
            try {
                const token = localStorage.getItem('token');
                const response = await axios.get(`http://localhost:3001/api/products/${productId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setProduct(response.data);
            } catch (err) {
                setError('No se pudo cargar el producto.');
            } finally {
                setLoading(false);
            }
        };
        fetchProduct();
    }, [productId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const token = localStorage.getItem('token');
            await axios.post(`http://localhost:3001/api/products/${productId}/renew`, 
                { duration_days: durationDays },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            router.push(`/clients/${clientId}`);
        } catch (err) {
            setError('No se pudo renovar el producto.');
            setSubmitting(false);
        }
    };

    if (loading) return <div className="text-[var(--text-light)]">Cargando producto...</div>;
    if (error) return <div className="text-[var(--danger)]">{error}</div>;
    if (!product) return <div className="text-[var(--danger)]">Producto no encontrado.</div>;

    return (
        <div>
            <Link
                href={`/clients/${clientId}`}
                className="text-[var(--primary)] hover:underline mb-8 inline-block font-semibold"
            >
                &larr; Volver a los detalles del cliente
            </Link>
            <h1 className="text-3xl font-black mb-2 text-[var(--primary)] drop-shadow">Renovar Producto</h1>
            <h2 className="text-xl text-[var(--text-light)] mb-8">{product.product_name}</h2>
            
            <div className="bg-[var(--panel)] p-8 rounded-xl shadow-xl max-w-lg mx-auto border border-[var(--sidebar)]">
                <p className="text-center mb-6 text-[var(--text-light)] text-lg">
                    Vencimiento actual: <strong className="font-mono text-cyan-300">{moment(product.expiry_date).format('DD/MM/YYYY')}
</strong>
                </p>
                <form onSubmit={handleSubmit}>
                    <div className="mb-8">
                        <label className="block text-[var(--text-light)] text-base font-bold mb-2 text-center" htmlFor="duration_days">
                            Añadir Días de Suscripción
                        </label>
                        <input 
                            id="duration_days"
                            type="number"
                            min="1"
                            value={durationDays}
                            onChange={(e) => setDurationDays(e.target.value)}
                            required
                            className="w-full text-center text-lg"
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
                            className="button-main w-full bg-gradient-to-r from-green-500 to-cyan-400 hover:from-cyan-400 hover:to-green-500"
                        >
                            {submitting ? 'Renovando...' : 'Confirmar Renovación'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default withAuth(RenewProductPage);
