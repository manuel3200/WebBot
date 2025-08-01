import { useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/router';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  
  const router = useRouter();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    try {
      const response = await axios.post('http://localhost:3001/api/auth/login', {
        username: username,
        password: password,
      });

      const { token } = response.data;
      localStorage.setItem('token', token);
      router.push('/');
    } catch (err) {
      setError('Usuario o contraseña incorrectos. Por favor, intenta de nuevo.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
      <div className="bg-[var(--panel)] p-8 rounded-2xl shadow-xl w-full max-w-md border border-[var(--sidebar)]">
        <h1 className="text-3xl font-black text-center mb-10 text-[var(--primary)] tracking-wide drop-shadow">
          Iniciar Sesión
        </h1>
        <form onSubmit={handleSubmit}>
          <div className="mb-5">
            <label className="block text-[var(--text-light)] text-sm font-bold mb-2" htmlFor="username">
              Usuario
            </label>
            <input
              className="w-full"
              id="username"
              type="text"
              placeholder="Tu nombre de usuario"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="mb-8">
            <label className="block text-[var(--text-light)] text-sm font-bold mb-2" htmlFor="password">
              Contraseña
            </label>
            <input
              className="w-full"
              id="password"
              type="password"
              placeholder="******************"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <p className="text-[var(--danger)] text-center mb-4 font-semibold">
              {error}
            </p>
          )}

          <button
            className="button-main w-full mt-2"
            type="submit"
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
