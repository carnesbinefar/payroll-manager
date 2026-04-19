import { GoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';
import { api } from '../utils/api';

export default function Login() {
  const setAuth = useAuthStore(s => s.setAuth);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-900 to-brand-700">
      <div className="card p-10 w-full max-w-sm flex flex-col items-center gap-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Nóminas</h1>
          <p className="text-sm text-gray-500 mt-1">Carnes de Binéfar · Agropecuaria Salvatella</p>
        </div>

        <div className="w-full flex flex-col items-center gap-3">
          <p className="text-sm text-gray-600">Accede con tu cuenta de Google</p>
          <GoogleLogin
            onSuccess={async (response) => {
              try {
                const { token, email, name } = await api.post<{ token: string; email: string; name: string }>(
                  '/auth/google',
                  { credential: response.credential },
                );
                setAuth(token, email, name);
                navigate('/');
              } catch (err) {
                alert(err instanceof Error ? err.message : 'Error de autenticación');
              }
            }}
            onError={() => alert('Error al iniciar sesión con Google')}
            useOneTap
          />
          <p className="text-xs text-gray-400 text-center mt-2">
            Solo accesible para cuentas @carnesbinefar.es
          </p>
        </div>
      </div>
    </div>
  );
}
