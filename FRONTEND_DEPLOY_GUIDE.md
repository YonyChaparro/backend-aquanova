# Guía de Despliegue y Consumo de API — Frontend AquaVisor

> **Para el equipo de frontend.** Este documento describe la arquitectura de producción,
> las URLs de la API, el manejo de autenticación y todo lo necesario para desplegar
> y conectar el frontend correctamente en el entorno de Hostinger.

---

## Arquitectura en Producción

```
aquavisor.co                                       →  Frontend (archivos estáticos en Hostinger)
https://whitesmoke-mule-772754.hostingersite.com   →  Backend Node.js (API REST)
https://whitesmoke-mule-772754.hostingersite.com/api-docs  →  Documentación Swagger interactiva
```

El frontend y el backend **viven en dominios separados**.
El frontend solo debe hacer peticiones a `https://whitesmoke-mule-772754.hostingersite.com`.

> ⚠️ **Nota:** Este es el dominio temporal de Hostinger. Cuando el dominio definitivo
> `api.aquavisor.co` sea configurado, solo habrá que actualizar `VITE_API_URL` (u equivalente)
> en el `.env.production` del frontend.

---

## URL Base de la API

| Entorno     | Base URL                                                         |
|-------------|------------------------------------------------------------------|
| Desarrollo  | `http://localhost:3000/api`                                      |
| Producción  | `https://whitesmoke-mule-772754.hostingersite.com/api`           |

> **Recomendación:** Usa una variable de entorno en el frontend para no hardcodear la URL.

### Ejemplo con Vite (`.env.development` / `.env.production`)

```env
# .env.development
VITE_API_URL=http://localhost:3000/api

# .env.production
VITE_API_URL=https://whitesmoke-mule-772754.hostingersite.com/api
```

```js
// En tu código
const API_URL = import.meta.env.VITE_API_URL;
const response = await fetch(`${API_URL}/forms`);
```

### Ejemplo con Create React App

```env
# .env.development
REACT_APP_API_URL=http://localhost:3000/api

# .env.production
REACT_APP_API_URL=https://whitesmoke-mule-772754.hostingersite.com/api
```

### Ejemplo con Next.js (`next.config.js`)

```js
// next.config.js
module.exports = {
  env: {
    API_URL: process.env.NODE_ENV === 'production'
      ? 'https://whitesmoke-mule-772754.hostingersite.com/api'
      : 'http://localhost:3000/api',
  },
};
```

---

## Autenticación (JWT)

La API usa **JSON Web Tokens (JWT)**. El flujo es:

### 1. Login — Obtener el token

```
POST https://whitesmoke-mule-772754.hostingersite.com/api/auth/login
Content-Type: application/json

{
  "document_number": "1000000000",
  "password": "tu_password"
}
```

**Respuesta exitosa (`200`):**
```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 2. Guardar el token

Guarda el token en `localStorage` o en el estado global de la aplicación:

```js
localStorage.setItem('token', data.token);
```

> ⚠️ **Seguridad:** Para mayor seguridad en producción, considera `httpOnly cookies`
> en lugar de `localStorage`. Consulta con el equipo backend si se requiere este cambio.

### 3. Enviar el token en cada petición protegida

Todas las rutas protegidas requieren el header `Authorization`:

```js
const token = localStorage.getItem('token');

const response = await fetch(`${API_URL}/users`, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

### Expiración del token

El token expira en **8 horas**. Cuando la API retorne `401`, redirige al usuario
al login y limpia el token almacenado:

```js
if (response.status === 401) {
  localStorage.removeItem('token');
  window.location.href = '/login';
}
```

---

## Roles de Usuario

| Rol ID | Descripción         | Acceso                                  |
|--------|---------------------|-----------------------------------------|
| `1`    | Administrador       | Acceso total (CRUD completo)            |
| `2`    | Encuestador/Usuario | Acceso limitado (lectura y envío forms) |

El payload del token decodificado contiene `{ id, rol }`. Úsalo para
controlar qué vistas o botones mostrar en el frontend.

---

## Endpoints Disponibles

La documentación interactiva completa está en:
**`https://whitesmoke-mule-772754.hostingersite.com/api-docs`**

A continuación, un resumen por módulo:

### 🔐 Autenticación — `/api/auth`

| Método | Endpoint         | Auth | Descripción                        |
|--------|------------------|------|------------------------------------|
| `POST` | `/auth/login`    | No   | Iniciar sesión, obtiene JWT        |
| `GET`  | `/auth/me`       | Sí   | Datos del usuario autenticado      |

---

### 👥 Usuarios — `/api/users`

| Método | Endpoint       | Auth     | Rol  | Descripción               |
|--------|----------------|----------|------|---------------------------|
| `GET`  | `/users`       | Sí       | `1`  | Listar todos los usuarios |
| `POST` | `/users`       | No       | —    | Crear usuario             |
| `GET`  | `/users/me/referral-profile` | Sí | — | Perfil de referidos del usuario actual |

---

### 📝 Formularios — `/api/forms`

| Método   | Endpoint              | Auth | Rol | Descripción                        |
|----------|-----------------------|------|-----|------------------------------------|
| `GET`    | `/forms`              | No   | —   | Listar formularios activos         |
| `GET`    | `/forms/search`       | No   | —   | Buscar formularios                 |
| `GET`    | `/forms/:id`          | No   | —   | Detalle de un formulario           |
| `GET`    | `/forms/public/:key`  | No   | —   | Formulario público (por clave URL) |
| `POST`   | `/forms`              | Sí   | `1` | Crear formulario                   |
| `PUT`    | `/forms/:id`          | Sí   | `1` | Actualizar formulario              |
| `DELETE` | `/forms/:id`          | Sí   | `1` | Eliminar formulario                |

---

### 📊 Respuestas — `/api/submissions`

| Método | Endpoint                    | Auth     | Descripción                         |
|--------|-----------------------------|----------|-------------------------------------|
| `POST` | `/submissions`              | Opcional | Enviar respuesta de formulario      |
| `POST` | `/submissions/onboarding`   | No       | Crear onboarding de usuario         |
| `GET`  | `/submissions/:formId`      | Sí       | Ver respuestas de un formulario     |

---

### 🏘️ Barrios — `/api/neighborhoods`

| Método   | Endpoint                  | Auth | Rol | Descripción              |
|----------|---------------------------|------|-----|--------------------------|
| `GET`    | `/neighborhoods`          | No   | —   | Listar barrios           |
| `GET`    | `/neighborhoods/search`   | No   | —   | Buscar barrios           |
| `GET`    | `/neighborhoods/:id`      | No   | —   | Detalle de un barrio     |
| `POST`   | `/neighborhoods`          | Sí   | `1` | Crear barrio             |
| `PUT`    | `/neighborhoods/:id`      | Sí   | `1` | Actualizar barrio        |
| `DELETE` | `/neighborhoods/:id`      | Sí   | `1` | Eliminar barrio          |

---

### 🗺️ Mapa / Gemelo Digital — `/api/map`

| Método  | Endpoint                              | Auth | Descripción                         |
|---------|---------------------------------------|------|-------------------------------------|
| `GET`   | `/map/neighborhoods`                  | No   | Barrios para el mapa                |
| `GET`   | `/map/digital-twin`                   | No   | Datos gemelo digital (todos)        |
| `GET`   | `/map/digital-twin/:neighborhoodId`   | No   | Datos gemelo digital por barrio     |
| `PATCH` | `/map/predios/:lotId`                 | Sí   | Actualizar estado de un predio      |

---

### 🎰 Sorteos — `/api/giveaways`

| Método | Endpoint                       | Auth | Descripción                    |
|--------|--------------------------------|------|--------------------------------|
| `GET`  | `/giveaways/:formId/leaderboard` | No | Tabla de líderes del sorteo    |

---

## Links de referidos (share links)

Los endpoints que devuelven `share_link` los construyen con la URL del frontend.
En producción estos links tendrán el formato:

```
https://aquavisor.co/formulario/{form-key}?ref=CODIGO
```

Asegúrate de que las rutas `/formulario/:key` existan en el router del frontend.

---

## Subir archivos (imágenes)

Los endpoints que aceptan imágenes (`POST /forms`, `POST /neighborhoods`, etc.)
usan `multipart/form-data`. Ejemplo:

```js
const formData = new FormData();
formData.append('nombre', 'Mi Formulario');
formData.append('imagen', fileInput.files[0]); // campo 'imagen'

await fetch(`${API_URL}/forms`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
  // ⚠️ NO pongas 'Content-Type' manualmente; el navegador lo añade con el boundary
});
```

Las imágenes se almacenan en **Cloudinary**. La API devuelve la URL pública de la imagen.

---

## Despliegue del Frontend en Hostinger

### Estructura de carpetas en Hostinger

```
public_html/          ← carpeta raíz de aquavisor.co (frontend)
  index.html
  assets/
  ...
public_html/api/      ← carpeta del backend Node.js
  server.js           ←  https://whitesmoke-mule-772754.hostingersite.com
  src/
  ...
```

### Pasos para desplegar

1. **Build de producción:**
   ```bash
   # Vite
   npm run build       # genera carpeta dist/

   # Create React App
   npm run build       # genera carpeta build/

   # Next.js (export estático)
   npm run build && npm run export   # genera carpeta out/
   ```

2. **Subir a Hostinger:**
   - Comprime la carpeta de build (`dist/`, `build/` o `out/`) en un `.zip`
   - Ve al panel de Hostinger → *File Manager* → `public_html/`
   - Sube el `.zip` y extráelo allí
   - El `index.html` debe quedar en la raíz de `public_html/`

3. **Configurar SPA routing (evitar 404 en rutas directas):**

   Si tu frontend es una SPA (React, Vue, etc.), crea un archivo `.htaccess`
   en `public_html/` para que todas las rutas redirijan al `index.html`:

   ```apache
   # public_html/.htaccess
   Options -MultiViews
   RewriteEngine On
   RewriteCond %{REQUEST_FILENAME} !-f
   RewriteRule ^ index.html [QL]
   ```

---

## CORS — Orígenes permitidos

El backend **solo acepta peticiones** desde:

- `https://aquavisor.co`
- `https://www.aquavisor.co`

> ⚠️ **Durante desarrollo/pruebas:** Si el frontend todavía no está en `aquavisor.co`,
> contacta al equipo backend para agregar temporalmente tu origen al listado de CORS.

Si el frontend hace peticiones desde cualquier otro dominio en producción,
recibirá un error de CORS. Esto es intencional por seguridad.

---

## HTTPS obligatorio en producción

Todas las peticiones en producción deben usar **`https://`**.
Hostinger activa SSL automáticamente para el dominio y subdominios.
Si usas `http://` en producción, el navegador bloqueará la petición
debido a *mixed content*.

---

## Contacto / Documentación adicional

- **Swagger UI (producción):** https://whitesmoke-mule-772754.hostingersite.com/api-docs
- **Repositorio backend:** https://github.com/YonyChaparro/backend-aquanova
  - Rama de producción: `produccion`
  - Rama de desarrollo: `main`

---

## Dominios — Estado actual

| Dominio | Estado | Uso |
|---|---|---|
| `https://whitesmoke-mule-772754.hostingersite.com` | ✅ Activo | Backend (temporal Hostinger) |
| `https://api.aquavisor.co` | 🔜 Por configurar | Backend (definitivo) |
| `https://aquavisor.co` | 🔜 Por configurar | Frontend |
