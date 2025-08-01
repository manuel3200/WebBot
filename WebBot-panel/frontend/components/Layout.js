// WebBot/frontend/components/Layout.js
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import React, { useState } from 'react';

export default function Layout({ children }) {
  const router = useRouter();
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      {/* Sidebar fijo Night Pro */}
      <aside className={`
        bg-[var(--sidebar)] text-[var(--sidebar-link)] p-6 fixed h-screen w-64 z-40
        transition-all duration-300 border-r border-[var(--panel)]
        ${sidebarOpen ? '' : 'hidden'}
        md:block
      `}>
        <div className="flex flex-col h-full">
          {/* Bloque superior: menú */}
          <div className="flex-1 flex flex-col">
            <h1 className="text-2xl font-black tracking-widest mb-10 text-accent select-none drop-shadow-lg">
              <span className="text-accent">Dashboard</span>
            </h1>
            <nav>
              <ul>
                <li className="mb-3">
                  <Link
                    href="/"
                    className={`block px-3 py-2 rounded-lg font-semibold transition hover:bg-[var(--primary)]/10 hover:text-[var(--primary)] ${router.pathname === '/' ? 'bg-[var(--primary)]/20 text-[var(--primary)]' : ''}`}
                  >
                    <span className="inline-block mr-2">🏠</span> Dashboard
                  </Link>
                </li>
                <li className="mb-3">
                  <Link
                    href="/clients"
                    className={`block px-3 py-2 rounded-lg font-semibold transition hover:bg-[var(--primary)]/10 hover:text-[var(--primary)] ${router.pathname.startsWith('/clients') ? 'bg-[var(--primary)]/20 text-[var(--primary)]' : ''}`}
                  >
                    <span className="inline-block mr-2">👥</span> Clientes
                  </Link>
                </li>
                {user && user.role === 'owner' && (
                  <li className="mb-3">
                    <Link
                      href="/admin"
                      className="block px-3 py-2 rounded-lg font-bold bg-gradient-to-r from-[var(--primary)] to-fuchsia-500 text-white shadow hover:shadow-lg transition"
                    >
                      <span className="inline-block mr-2">🛡️</span> Panel de Admin
                    </Link>
                  </li>
                )}
              </ul>
            </nav>
          </div>
          {/* Bloque inferior: usuario y logout */}
          <div className="mt-8">
            {user && (
              <p className="text-xs text-[var(--text-light)] mb-2">
                <span className="inline-block align-middle bg-gradient-to-r from-[var(--primary)] to-cyan-400 text-white rounded-full w-7 h-7 flex items-center justify-center mr-2 font-bold">
                  {user.name[0].toUpperCase()}
                </span>
                Logueado como: <span className="font-semibold">{user.name}</span>
              </p>
            )}
            <button
              onClick={handleLogout}
              className="button-main w-full mt-2 bg-gradient-to-r from-[var(--danger)] to-pink-500 hover:from-pink-500 hover:to-[var(--danger)]"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      </aside>

      {/* Botón hamburguesa solo en mobile */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed top-4 left-4 z-50 p-2 rounded bg-[var(--sidebar)] text-[var(--primary)] hover:bg-[var(--primary)]/20 focus:outline-none md:hidden shadow-md"
        aria-label="Mostrar menú"
      >
        ☰
      </button>

      {/* Fondo oscuro cuando el sidebar está abierto en mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Contenido principal, desplazado a la derecha */}
      <main className="flex-1 p-4 md:p-10 overflow-y-auto transition-all duration-300 md:ml-64 bg-[var(--background)] min-h-screen">
        {children}
      </main>
    </div>
  );
}
