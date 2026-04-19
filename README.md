# Payroll Manager

Portal de administración de nóminas para Carnes de Binéfar y Agropecuaria Salvatella.

## Stack

- **Frontend**: React + Vite + TypeScript + Tailwind CSS + Recharts → GitHub Pages
- **Backend**: Node.js + Express + TypeScript + SQLite (better-sqlite3) → Render.com
- **Auth**: Google OAuth restringido a `@carnesbinefar.es`
- **CI/CD**: GitHub Actions

## Estructura

```
payroll-manager/
├── frontend/          # React app
├── backend/           # Express API
└── .github/workflows/ # CI + deploy pipelines
```

## Setup local

### Backend

```bash
cd backend
cp .env.example .env   # editar con tus credenciales
npm install
npm run dev            # http://localhost:3001
```

### Frontend

```bash
cd frontend
cp .env.example .env   # editar con tu Google Client ID
npm install
npm run dev            # http://localhost:5173
```

## Despliegue en producción (gratuito)

### 1. Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com) → Credenciales → OAuth 2.0 Client ID
2. Authorized origins: `https://TU_USUARIO.github.io`
3. Authorized redirect URIs: `https://TU_USUARIO.github.io/payroll-manager`

### 2. Backend en Render.com (gratis)

1. [render.com](https://render.com) → New Web Service → conecta este repo
2. Root directory: `backend` · Build: `npm install && npm run build` · Start: `node dist/index.js`
3. Añade las variables de entorno del `.env.example`
4. Copia el **Deploy Hook URL** (Settings → Deploy Hooks)

### 3. GitHub Secrets

Settings → Secrets and variables → Actions:

| Secret | Valor |
|--------|-------|
| `VITE_GOOGLE_CLIENT_ID` | Client ID de Google OAuth |
| `VITE_API_URL` | `https://TU-APP.onrender.com/api` |
| `RENDER_DEPLOY_HOOK` | URL del deploy hook de Render |

### 4. GitHub Pages

Settings → Pages → Source: **GitHub Actions** → push a `main` despliega automáticamente.

URL: `https://TU_USUARIO.github.io/payroll-manager/`

## Flujo de uso

**Subir nóminas** → Nóminas → Subir archivos → arrastra PDFs → Procesar

**Configurar emails** → Empleados → icono lápiz → introduce email de cada empleado

**Enviar nóminas** → Nóminas → Registros y envío → expande el mes → "Enviar todas"

**Reintentar errores** → Nóminas → Historial de envíos → Reintentar en los fallidos

## Formato de archivos aceptados

- `REC{EMPRESA}{MES}{AÑO}.pdf` — nóminas individuales (un empleado por página)
- `{EMPRESA}{FECHA}.pdf` — resumen mensual con todos los empleados

## Email SMTP

Usa una **App Password** de Gmail: Google Account → Seguridad → Verificación en 2 pasos → Contraseñas de aplicaciones.
