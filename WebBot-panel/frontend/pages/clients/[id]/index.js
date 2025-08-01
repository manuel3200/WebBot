// WebBot/frontend/pages/clients/[id]/index.js
import { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/router';
import withAuth from '../../../components/withAuth';
import Link from 'next/link';
import moment from 'moment';
import ConfirmModal from '../../../components/ConfirmModal';

function ClientDetailPage() {
  const [client, setClient] = useState(null);
  const [products, setProducts] = useState([]);
  const [currentProductPage, setCurrentProductPage] = useState(1);
  const [productTotalPages, setProductTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();
  const { id } = router.query;
  const [searchProduct, setSearchProduct] = useState('');

  // --- NUEVO: Estado para productos seleccionados ---
  const [selectedProducts, setSelectedProducts] = useState([]);

  // --- Selección individual ---
  const toggleSelectProduct = (productId) => {
    setSelectedProducts((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  };

  // --- Selección/Des-selección masiva ---
  const toggleSelectAll = () => {
    if (selectedProducts.length === filteredProducts.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(filteredProducts.map((p) => p.id));
    }
  };

  // --- Función de copiar al portapapeles ---
  const handleCopySelected = () => {
    const selected = products.filter(p => selectedProducts.includes(p.id));
    const lines = selected.map(p =>
      `${p.product_name} | ${p.service_username || '-'} | ${p.service_password || '-'} | ${moment(p.expiry_date).format('DD/MM/YYYY')}`
    );
    if (lines.length > 0) {
      navigator.clipboard.writeText(lines.join('\n'));
      alert('Productos copiados al portapapeles');
    } else {
      alert('No seleccionaste productos para copiar.');
    }
  };

  // --- FILTRO DE PRODUCTOS ---
  const filteredProducts = products.filter(product =>
    product.product_name.toLowerCase().includes(searchProduct.toLowerCase())
  );

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);

  const fetchClientDetails = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Token no encontrado.');
      const clientResponse = await axios.get(`http://localhost:3001/api/clients/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      setClient(clientResponse.data);
    } catch (err) {
      console.error('Error al cargar los detalles del cliente:', err);
      setError('No se pudieron cargar los datos.');
    } finally {
      setLoading(false);
    }
  };

  // ¡Esta es la función que refresca productos!
  const fetchProducts = async (page = 1) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `http://localhost:3001/api/clients/${id}/products?page=${page}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setProducts(response.data.products);
      setCurrentProductPage(response.data.currentPage);
      setProductTotalPages(response.data.totalPages);
      // Si cambias de página, des-seleccionamos
      setSelectedProducts([]);
    } catch (err) {
      setError('No se pudieron cargar los productos.');
    }
  };

  useEffect(() => {
    if (id) {
      fetchClientDetails();
      fetchProducts(1); // SIEMPRE la primera página cuando abres el detalle
    }
  }, [id]);

  // Cuando se agrega, edita o elimina producto, solo refresca la lista de productos.
  const openDeleteProductModal = (product) => {
    setProductToDelete(product);
    setIsProductModalOpen(true);
  };

  const closeDeleteProductModal = () => {
    setProductToDelete(null);
    setIsProductModalOpen(false);
  };

  const handleDeleteProduct = async () => {
    if (!productToDelete) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`http://localhost:3001/api/products/${productToDelete.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      closeDeleteProductModal();
      // ¡Solo refresca productos!
      fetchProducts(currentProductPage);
    } catch (err) {
      console.error('Error al eliminar producto:', err);
      setError('No se pudo eliminar el producto.');
      closeDeleteProductModal();
    }
  };

  if (loading) return <div>Cargando...</div>;
  if (error) return <div className="text-red-500">{error}</div>;
  if (!client) return <div>Cliente no encontrado.</div>;

  return (
    <div>
      <Link href="/clients" className="text-purple-400 hover:underline mb-6 inline-block">&larr; Volver a la lista de clientes</Link>
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 p-6 rounded-lg shadow-md mb-8 text-gray-200">
        <h1 className="text-3xl font-extrabold text-purple-400 mb-2">{client.name}</h1>
        <p className="text-purple-300 mt-2">ID Cliente: <code className="bg-gray-700 rounded px-1">{client.id}</code></p>
        <p className="mt-1">WhatsApp: <span className="text-purple-200">{client.whatsapp || 'N/A'}</span></p>
        <p className="mt-1">Email: <span className="text-purple-200">{client.email || 'N/A'}</span></p>
        <p className="mt-4"><strong className="font-bold text-purple-300">Notas:</strong> {client.general_notes || <span className="italic text-gray-400">Ninguna</span>}</p>
      </div>

      <div className="bg-gradient-to-br from-gray-900 to-gray-800 p-6 rounded-lg shadow-md">
        <div className="flex flex-col md:flex-row justify-between md:items-center mb-4 gap-4">
          <h2 className="text-2xl font-extrabold text-purple-400">Productos Contratados</h2>
          <Link href={`/clients/${client.id}/products/new`} className="bg-purple-600 hover:bg-purple-800 text-white font-bold py-2 px-4 rounded shadow">
            + Añadir Producto
          </Link>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-4">
          <input
            type="text"
            placeholder="Buscar producto por nombre..."
            value={searchProduct}
            onChange={e => setSearchProduct(e.target.value)}
            className="shadow border border-purple-600 bg-gray-800 text-purple-200 rounded w-full py-2 px-3 mr-2 placeholder-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button
            className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded flex items-center gap-2"
            onClick={handleCopySelected}
            title="Copiar productos seleccionados"
          >
            <span role="img" aria-label="copiar">📋</span> Copiar seleccionados
          </button>
        </div>

        <div className="overflow-x-auto rounded">
          <table className="min-w-full leading-normal bg-gray-900 rounded text-purple-200">
            <thead>
              <tr className="bg-gray-800 text-purple-400 uppercase text-sm">
                <th className="px-3 py-3 border-b-2 border-gray-700 text-center">
                  <input
                    type="checkbox"
                    checked={
                      filteredProducts.length > 0 &&
                      selectedProducts.length === filteredProducts.length
                    }
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-700 text-left">Producto</th>
                <th className="px-5 py-3 border-b-2 border-gray-700 text-left">Estado</th>
                <th className="px-5 py-3 border-b-2 border-gray-700 text-left">Vencimiento</th>
                <th className="px-5 py-3 border-b-2 border-gray-700 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length > 0 ? (
                filteredProducts.map((product) => (
                  <tr key={product.id} className="border-b border-gray-800 hover:bg-gray-800">
                    <td className="px-3 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={selectedProducts.includes(product.id)}
                        onChange={() => toggleSelectProduct(product.id)}
                      />
                    </td>
                    <td className="px-5 py-4 font-semibold text-purple-100">{product.product_name}</td>
                    <td className="px-5 py-4">
                      <span className={
                        product.status === "Activa"
                          ? "font-bold text-green-400"
                          : product.status === "Vencida"
                          ? "font-bold text-red-400"
                          : "font-bold text-yellow-400"
                      }>
                        {product.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-purple-100">
                      {moment(product.expiry_date).format('DD/MM/YYYY')}
                    </td>
                    <td className="px-5 py-4 flex flex-col md:flex-row gap-2">
                      <Link href={`/clients/${client.id}/products/${product.id}/renew`} legacyBehavior>
                        <a className="text-green-400 hover:text-green-300 font-semibold">Renovar</a>
                      </Link>
                      <Link href={`/clients/${client.id}/products/${product.id}/edit`} legacyBehavior>
                        <a className="text-blue-400 hover:text-blue-200">Editar</a>
                      </Link>
                      <button onClick={() => openDeleteProductModal(product)} className="text-red-400 hover:text-red-600">
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="text-center py-10 text-gray-400">
                    {searchProduct
                      ? "No se encontraron productos que coincidan con la búsqueda."
                      : "Este cliente no tiene productos."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex justify-center items-center mt-4 gap-4">
        <button
          onClick={() => fetchProducts(currentProductPage - 1)}
          disabled={currentProductPage === 1}
          className="px-4 py-2 bg-purple-700 text-white rounded disabled:bg-gray-600"
        >
          ← Anterior
        </button>
        <span className="text-purple-200">Página {currentProductPage} de {productTotalPages}</span>
        <button
          onClick={() => fetchProducts(currentProductPage + 1)}
          disabled={currentProductPage === productTotalPages}
          className="px-4 py-2 bg-purple-700 text-white rounded disabled:bg-gray-600"
        >
          Siguiente →
        </button>
      </div>
      <ConfirmModal
        isOpen={isProductModalOpen}
        onClose={closeDeleteProductModal}
        onConfirm={handleDeleteProduct}
        title="Confirmar Eliminación de Producto"
      >
        <p className="text-gray-800">¿Estás seguro de que quieres eliminar el producto <strong className="font-bold">{productToDelete?.product_name}</strong>?</p>
        <p className="text-sm text-gray-600 mt-2">Esta acción es irreversible.</p>
      </ConfirmModal>
    </div>
  );
}

export default withAuth(ClientDetailPage);
