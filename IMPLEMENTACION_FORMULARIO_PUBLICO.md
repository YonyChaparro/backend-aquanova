# Formulario Público — Guía de implementación frontend

Flujo completo desde que un usuario abre un link de invitación hasta que queda registrado
con su propio link para compartir.

---

## Endpoints utilizados

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `GET`  | `/api/forms/public/:key` | ❌ Público | Carga el formulario por su slug |
| `POST` | `/api/submissions/onboarding` | ❌ Público | Registra usuario + envía formulario en un paso |

**URL base de la API:** configurar en variable de entorno del frontend.

```env
# .env del proyecto frontend
VITE_API_URL=http://localhost:3000/api
```

---

## Flujo completo

```
URL recibida:
http://localhost:5173/formulario/encuesta-movilidad-2026?ref=EAL34TM
                                  └── form_key ──────┘   └── ref ──┘

1. Extraer form_key del path y ref del query string
2. GET /api/forms/public/{form_key}  →  schema + campos de registro + config sorteo
3. Renderizar formulario dinámicamente desde data.schema
4. Renderizar sección de registro desde data.registration_fields
5. Usuario completa todo y hace submit
6. POST /api/submissions/onboarding  →  crea usuario + submission + atribuye referido
7. Guardar token  →  usuario queda logueado automáticamente
8. Mostrar share_link del nuevo usuario  →  puede comenzar a referir
```

---

## Paso 1 — Extraer parámetros de la URL

```js
// React Router v6
import { useParams, useSearchParams } from 'react-router-dom';

const { formKey } = useParams();           // "encuesta-movilidad-2026"
const [searchParams] = useSearchParams();
const referralCode = searchParams.get('ref'); // "EAL34TM" | null
```

```js
// Vanilla JS
const segments = window.location.pathname.split('/');
const formKey = segments[segments.indexOf('formulario') + 1]; // "encuesta-movilidad-2026"
const referralCode = new URLSearchParams(window.location.search).get('ref'); // "EAL34TM" | null
```

> Guardar `referralCode` en el estado local. Si la URL no trae `?ref=`, el registro
> sigue funcionando normalmente sin atribuir referido.

---

## Paso 2 — Cargar el formulario

### Request

```
GET /api/forms/public/{form_key}
```

No requiere `Authorization` header.

### Ejemplo con fetch

```js
async function loadForm(formKey) {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/forms/public/${formKey}`);
  const json = await res.json();

  if (!res.ok) {
    // 404 → formulario inexistente o inactivo
    throw new Error(json.message);
  }

  return json.data;
}
```

### Response `200 OK` — estructura completa

```json
{
  "ok": true,
  "data": {
    "id":              "017bab20-236f-4e73-a486-5682ffcfe80f",
    "key":             "encuesta-movilidad-2026",
    "title":           "Encuesta de Movilidad y Transporte",
    "description":     "Caracterización de hábitos de movilidad...",
    "metadata": {
      "imagen": "https://res.cloudinary.com/.../foto.jpg"
    },
    "neighborhood_id": "616a6cc8-17e2-44f4-af0f-7103b5a0755f",
    "version":         1,
    "schema":          [ /* array de preguntas — ver sección 3 */ ],
    "giveaway": {
      "points_per_referral": 10,
      "is_active":           true
    },
    "registration_fields": { /* campos de registro — ver sección 4 */ }
  }
}
```

> **`data.neighborhood_id`** debe guardarse en el estado; se envía sin modificar
> en el POST de onboarding.

### Errores

| Código | Causa | Mensaje sugerido al usuario |
|--------|-------|-----------------------------|
| `404`  | Formulario no existe o está inactivo | "Este formulario ya no está disponible" |
| `500`  | Error del servidor | "Error al cargar el formulario, intenta más tarde" |

---

## Paso 3 — Renderizar las preguntas — `data.schema`

`schema` es un array de objetos. Cada objeto representa un campo del formulario.

### Estructura de un campo

```json
{
  "key":         "medio_principal",
  "type":        "select",
  "label":       "Medio de transporte principal",
  "required":    true,
  "options":     ["TransMilenio/SITP", "Bicicleta", "A pie"],
  "placeholder": "Ej: Centro, Chapinero..."
}
```

| Propiedad     | Siempre presente | Descripción |
|---------------|-----------------|-------------|
| `key`         | ✅              | Nombre del campo. Es la clave que va en el objeto `responses` |
| `type`        | ✅              | Tipo de input — ver tabla abajo |
| `label`       | ✅              | Etiqueta a mostrar |
| `required`    | ✅              | Si es obligatorio |
| `options`     | Solo en `radio`, `select`, `checkbox` | Lista de valores posibles |
| `placeholder` | Solo en `text`  | Texto de ayuda |
| `min` / `max` | Solo en `range` | Límites del slider |

### Tipos de campo y cómo renderizarlos

| `type`     | Componente                          | Valor en `responses`        |
|------------|-------------------------------------|-----------------------------|
| `text`     | `<input type="text">`               | `string`                    |
| `textarea` | `<textarea>`                        | `string`                    |
| `password` | `<input type="password">`           | `string`                    |
| `email`    | `<input type="email">`              | `string`                    |
| `tel`      | `<input type="tel">`                | `string`                    |
| `radio`    | Un `<input type="radio">` por opción | `string` (la opción elegida) |
| `select`   | `<select>` + un `<option>` por opción | `string`                  |
| `checkbox` | Un `<input type="checkbox">` por opción | `string[]` (array de opciones marcadas) |
| `range`    | `<input type="range" min max>`      | `number`                    |

### Construcción del objeto `responses`

```js
// Estado inicial: un objeto vacío que se va llenando
const [responses, setResponses] = useState({});

// text / textarea / radio / select / email / tel
function handleChange(key, value) {
  setResponses(prev => ({ ...prev, [key]: value }));
}

// range → convertir a número
function handleRange(key, value) {
  setResponses(prev => ({ ...prev, [key]: Number(value) }));
}

// checkbox → manejar array
function handleCheckbox(key, option, checked) {
  setResponses(prev => {
    const current = prev[key] || [];
    return {
      ...prev,
      [key]: checked
        ? [...current, option]
        : current.filter(v => v !== option)
    };
  });
}
```

### Ejemplo de renderizado dinámico (React)

```jsx
function FormField({ field, value, onChange }) {
  const { key, type, label, required, options, placeholder, min, max } = field;

  return (
    <div>
      <label>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>

      {(type === 'text' || type === 'email' || type === 'tel') && (
        <input
          type={type}
          name={key}
          placeholder={placeholder}
          required={required}
          value={value || ''}
          onChange={e => onChange(key, e.target.value)}
        />
      )}

      {type === 'textarea' && (
        <textarea
          name={key}
          required={required}
          value={value || ''}
          onChange={e => onChange(key, e.target.value)}
        />
      )}

      {type === 'select' && (
        <select
          name={key}
          required={required}
          value={value || ''}
          onChange={e => onChange(key, e.target.value)}
        >
          <option value="">Selecciona...</option>
          {options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )}

      {type === 'radio' && options.map(opt => (
        <label key={opt}>
          <input
            type="radio"
            name={key}
            value={opt}
            checked={value === opt}
            onChange={() => onChange(key, opt)}
          />
          {opt}
        </label>
      ))}

      {type === 'checkbox' && options.map(opt => (
        <label key={opt}>
          <input
            type="checkbox"
            name={key}
            value={opt}
            checked={(value || []).includes(opt)}
            onChange={e => {
              const current = value || [];
              onChange(
                key,
                e.target.checked
                  ? [...current, opt]
                  : current.filter(v => v !== opt)
              );
            }}
          />
          {opt}
        </label>
      ))}

      {type === 'range' && (
        <>
          <input
            type="range"
            name={key}
            min={min}
            max={max}
            value={value || min}
            onChange={e => onChange(key, Number(e.target.value))}
          />
          <span>{value || min}</span>
        </>
      )}
    </div>
  );
}
```

---

## Paso 4 — Renderizar los campos de registro — `data.registration_fields`

Objeto fijo con los campos mínimos para crear la cuenta. Siempre tiene las mismas cinco claves.

```json
{
  "name":            { "required": true,  "type": "text",     "label": "Nombre completo" },
  "document_number": { "required": true,  "type": "text",     "label": "Número de documento" },
  "password":        { "required": false, "type": "password", "label": "Crear contraseña" },
  "email":           { "required": false, "type": "email",    "label": "Correo electrónico" },
  "phone":           { "required": false, "type": "tel",      "label": "Teléfono" }
}
```

```jsx
// Renderizar dinámicamente igual que los campos del schema
function RegistrationSection({ fields, values, onChange }) {
  return (
    <fieldset>
      <legend>Tus datos de registro</legend>
      {Object.entries(fields).map(([name, field]) => (
        <div key={name}>
          <label>
            {field.label}
            {field.required && ' *'}
          </label>
          <input
            type={field.type}
            name={name}
            required={field.required}
            value={values[name] || ''}
            onChange={e => onChange(name, e.target.value)}
          />
        </div>
      ))}
    </fieldset>
  );
}
```

---

## Paso 4b — Banner del sorteo — `data.giveaway`

```jsx
{data.giveaway.is_active && (
  <div className="giveaway-banner">
    Completa esta encuesta y gana <strong>{data.giveaway.points_per_referral} puntos</strong> por
    cada persona que invites con tu link
  </div>
)}
```

---

## Paso 5 — Enviar el formulario (onboarding)

### Captura de ubicación GPS (opcional)

```js
function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      ()  => resolve(null),   // si el usuario rechaza el permiso, se omite
      { timeout: 5000 }
    );
  });
}
```

### Request

```
POST /api/submissions/onboarding
Content-Type: application/json
```

```json
{
  "form_key":        "encuesta-movilidad-2026",
  "neighborhood_id": "616a6cc8-17e2-44f4-af0f-7103b5a0755f",
  "responses": {
    "trabaja_estudia":   "Trabaja",
    "destino_principal": "Centro",
    "medio_principal":   "Bicicleta",
    "tiempo_viaje":      "15-30 min",
    "usa_bicicleta":     "Sí",
    "satisf_transporte": 7,
    "problemas_movi":    ["Falta de andenes", "Sin ciclovía"],
    "tiene_vehiculo":    "No"
  },
  "referral_code":   "EAL34TM",
  "name":            "Carlos Pérez",
  "document_number": "1098765432",
  "password":        "miClave2026",
  "email":           "carlos@example.com",
  "phone":           "3001234567",
  "location": { "lat": 4.7110, "lng": -74.0721 }
}
```

#### Campos del body

| Campo             | Requerido | Origen en el frontend |
|-------------------|-----------|-----------------------|
| `form_key`        | ✅        | `useParams()` / path de la URL |
| `neighborhood_id` | ✅        | `data.neighborhood_id` del GET previo |
| `responses`       | ✅        | Objeto construido desde el formulario |
| `name`            | ✅        | Input del usuario |
| `document_number` | ✅        | Input del usuario |
| `referral_code`   | ❌        | `?ref=` de la URL — omitir si `null` |
| `password`        | ❌        | Input del usuario — `password_hash` es NULL en la BD |
| `email`           | ❌        | Input del usuario |
| `phone`           | ❌        | Input del usuario |
| `location`        | ❌        | `navigator.geolocation` |

### Ejemplo con fetch

```js
async function submitOnboarding({
  formKey, neighborhoodId, responses,
  referralCode,
  name, documentNumber, password, email, phone
}) {
  const location = await getLocation(); // null si el usuario no da permiso

  const body = {
    form_key:        formKey,
    neighborhood_id: neighborhoodId,
    responses,
    name,
    document_number: documentNumber,
    password,
    ...(referralCode && { referral_code: referralCode }),  // solo si existe
    ...(email        && { email }),
    ...(phone        && { phone }),
    ...(location     && { location }),
  };

  const res = await fetch(`${import.meta.env.VITE_API_URL}/submissions/onboarding`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  const json = await res.json();

  if (!res.ok) throw { status: res.status, message: json.message };

  return json;
}
```

### Response `201 Created`

```json
{
  "ok":      true,
  "message": "Registro y envío de formulario exitosos",
  "token":   "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id":              "cf00a33d-9062-44ff-9a63-3155cd7c1f07",
    "name":            "Carlos Pérez",
    "document_number": "1098765432",
    "email":           "carlos@example.com",
    "role":            "usuario"
  },
  "submissionId":  "b68cada5-df73-407a-a3b3-afe72e85acc0",
  "referral_code": "SXQSS3B",
  "share_link":    "http://localhost:5173/formulario/encuesta-movilidad-2026?ref=SXQSS3B",
  "reconciliation": {
    "reconciled":     true,
    "points_awarded": 10
  }
}
```

#### Qué hacer con cada campo de la respuesta

| Campo | Acción |
|---|---|
| `token` | `localStorage.setItem('token', json.token)` — usar como `Authorization: Bearer {token}` en futuras peticiones |
| `user` | Guardar en el estado global (contexto / Zustand / Redux). El usuario queda logueado automáticamente |
| `share_link` | Mostrar en pantalla de éxito con botón "Copiar link" |
| `referral_code` | Mostrar junto al `share_link` como texto auxiliar |
| `reconciliation` | Si `reconciled === true` → "¡Tu invitador ganó `points_awarded` puntos gracias a ti!" |

### Errores del POST

| Código | Causa | Qué mostrar al usuario |
|--------|-------|------------------------|
| `400`  | Falta `name` o `document_number` | Resaltar el campo vacío con validación inline |
| `404`  | Formulario inexistente o sin versión activa | "Este formulario ya no está disponible" |
| `409`  | `document_number` o `email` ya registrados | "Ya tienes una cuenta registrada. ¿Deseas iniciar sesión?" |
| `500`  | Error del servidor | "Ocurrió un error. Intenta de nuevo en unos minutos" |

```js
// Manejo de errores en el submit handler
try {
  const result = await submitOnboarding({ ... });
  // → navegar a pantalla de éxito con result.share_link
} catch (err) {
  if (err.status === 409) {
    setError('Ya tienes una cuenta registrada. ¿Deseas iniciar sesión?');
  } else if (err.status === 400) {
    setError('Por favor completa todos los campos obligatorios.');
  } else {
    setError('Ocurrió un error. Intenta de nuevo en unos minutos.');
  }
}
```

---

## Paso 6 — Pantalla de éxito

```jsx
function SuccessScreen({ shareLink, referralCode, userName, reconciliation }) {
  function copyLink() {
    navigator.clipboard.writeText(shareLink);
  }

  return (
    <div>
      <h2>¡Registro exitoso, {userName}!</h2>
      <p>Tu encuesta fue enviada correctamente.</p>

      {reconciliation?.reconciled && (
        <p>¡Tu invitador ganó {reconciliation.points_awarded} puntos gracias a ti!</p>
      )}

      <div>
        <p>Tu link para compartir:</p>
        <code>{shareLink}</code>
        <button onClick={copyLink}>Copiar link</button>
      </div>

      <p>
        Por cada persona que llene el formulario con tu link,
        ganarás puntos en el sorteo.
      </p>
    </div>
  );
}
```

---

## Diagrama de secuencia

```
Frontend                                     Backend
   │                                            │
   │  /formulario/encuesta-movilidad?ref=XYZ   │
   │  → extrae formKey="encuesta-movilidad"     │
   │  → extrae referralCode="XYZ"              │
   │                                            │
   │  GET /api/forms/public/encuesta-movilidad  │
   │──────────────────────────────────────────►│
   │◄── { schema, registration_fields,          │
   │       giveaway, neighborhood_id } ─────────│
   │                                            │
   │  [renderiza formulario dinámicamente]      │
   │  [usuario llena preguntas + datos cuenta]  │
   │                                            │
   │  POST /api/submissions/onboarding          │
   │  { form_key, neighborhood_id, responses,   │
   │    referral_code, name, document_number,   │
   │    password, email?, phone?, location? }   │
   │──────────────────────────────────────────►│
   │                                            │  ┌─ INSERT user (bcrypt hash)
   │                                            │  ├─ INSERT user_roles (role=3)
   │                                            │  ├─ INSERT submission
   │                                            │  └─ INSERT submission_referral
   │                                            │       ↓ COMMIT
   │                                            │  reconcileSubmission → +10 pts referente
   │                                            │  getOrCreateReferralProfile → código propio
   │                                            │  firma JWT
   │                                            │
   │◄── { token, user, share_link,              │
   │       referral_code, reconciliation } ─────│
   │                                            │
   │  localStorage.setItem('token', ...)        │
   │  [muestra pantalla éxito + share_link]     │
```
