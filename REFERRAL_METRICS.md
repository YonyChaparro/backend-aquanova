# Sistema de Referidos — Integración frontend

**Versión:** 1.1 — Junio 2026  
**Base métricas:** `/api/giveaways` · **Base perfil/QR:** `/api/users`  
**Autenticación:** JWT Bearer (excepto leaderboard público)

---

## Mapa de endpoints

| Método | Ruta | Auth | Roles | Propósito |
|---|---|---|---|---|
| `GET` | `/users/me/referral-profile` | ✅ | cualquiera | Perfil + URL de referido lista para compartir |
| `GET` | `/users/me/referral-qr` | ✅ | cualquiera | QR del link (JSON / SVG / PNG descargable) |
| `GET` | `/giveaways/metrics/overview` | ✅ | admin, operador | KPIs globales del sistema |
| `GET` | `/giveaways/metrics/ranking` | ✅ | admin, operador | Ranking global todos los sorteos |
| `GET` | `/giveaways/metrics/activity` | ✅ | admin, operador | Feed de actividad reciente |
| `GET` | `/giveaways/metrics/per-form` | ✅ | admin, operador | Estadísticas por formulario |
| `GET` | `/giveaways/metrics/user/:userId` | ✅ | solo admin | Detalle de un usuario |
| `GET` | `/giveaways/:formId/metrics` | ✅ | admin, operador | Detalle de un sorteo + timeline |
| `GET` | `/giveaways/:formId/leaderboard` | ❌ | público | Ranking del sorteo (para formularios) |

---

## Vista propuesta: `/dashboard/referidos`

La ruta de métricas se puede construir con **4 secciones principales**, cada una mapeada a un endpoint.

```
┌─────────────────────────────────────────────────────────────────┐
│  PANEL DE REFERIDOS                             [Actualizar]    │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│ Total refs   │ Procesados   │ Puntos dist. │ Tasa conversión    │
│     3        │     2        │     20       │     66.7%          │
├──────────────┴──────────────┴──────────────┴────────────────────┤
│                                                                 │
│  [Ranking Global]  [Por Formulario]  [Actividad]               │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ #  Nombre           Código    Pts  Referidos  Última act │   │
│  │ 1  María López      EAL34TM   30   3 / 2      Jun 20     │   │
│  │ 2  Carlos Ruiz      XPQ78NK   10   1 / 1      Jun 15     │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. GET `/api/giveaways/metrics/overview`

Tarjetas de KPIs — el bloque superior del dashboard.

### Headers
```
Authorization: Bearer <token>
```

### Response `200`
```json
{
  "ok": true,
  "data": {
    "total_referrals": 3,
    "processed_referrals": 2,
    "pending_referrals": 1,
    "total_points_distributed": 20,
    "active_referrers": 2,
    "users_with_profile": 4,
    "active_giveaways": 3,
    "total_submissions": 227,
    "submissions_via_referral": 3,
    "conversion_rate": 66.7,
    "referral_share": 1.3
  }
}
```

### Mapeo a tarjetas de UI

| Campo | Tarjeta | Descripción visible |
|---|---|---|
| `total_referrals` | **Total de invitaciones** | Links de referido que generaron un submission |
| `processed_referrals` | **Conversiones exitosas** | Invitados que se registraron |
| `pending_referrals` | **Pendientes** | Invitados que llenaron el form pero no se registraron |
| `total_points_distributed` | **Puntos distribuidos** | Suma de puntos en el ledger |
| `conversion_rate` | **Tasa de conversión** | `%` badge — verde si > 50%, amarillo si > 25%, rojo si < 25% |
| `referral_share` | **Participación viral** | `%` de submissions que llegaron por link de referido |
| `active_referrers` | **Participantes activos** | Usuarios que han ganado puntos |

### Implementación (React)

```tsx
// hooks/useReferralOverview.ts
import { useEffect, useState } from 'react';

interface OverviewStats {
  total_referrals: number;
  processed_referrals: number;
  pending_referrals: number;
  total_points_distributed: number;
  active_referrers: number;
  users_with_profile: number;
  active_giveaways: number;
  total_submissions: number;
  submissions_via_referral: number;
  conversion_rate: number;
  referral_share: number;
}

export function useReferralOverview(token: string) {
  const [data, setData] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/giveaways/metrics/overview', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(r => { if (r.ok) setData(r.data); else setError(r.message); })
      .catch(() => setError('Error de conexión'))
      .finally(() => setLoading(false));
  }, [token]);

  return { data, loading, error };
}
```

```tsx
// components/ReferralKpiCards.tsx
function ReferralKpiCards({ stats }: { stats: OverviewStats }) {
  const conversionColor =
    stats.conversion_rate >= 50 ? 'green' :
    stats.conversion_rate >= 25 ? 'yellow' : 'red';

  return (
    <div className="kpi-grid">
      <KpiCard title="Total invitaciones"  value={stats.total_referrals} />
      <KpiCard title="Conversiones"        value={stats.processed_referrals} />
      <KpiCard title="Pendientes"          value={stats.pending_referrals} />
      <KpiCard title="Puntos distribuidos" value={stats.total_points_distributed} />
      <KpiCard
        title="Tasa de conversión"
        value={`${stats.conversion_rate}%`}
        color={conversionColor}
      />
      <KpiCard title="Participación viral" value={`${stats.referral_share}%`} />
    </div>
  );
}
```

---

## 2. GET `/api/giveaways/metrics/ranking?limit=50`

Tabla del ranking global — todos los sorteos combinados.

### Query params
| Param | Tipo | Default | Máx | Descripción |
|---|---|---|---|---|
| `limit` | `integer` | `50` | `100` | Número de entradas |

### Response `200`
```json
{
  "ok": true,
  "count": 2,
  "data": [
    {
      "position": 1,
      "user_id": "uuid-...",
      "name": "María López",
      "referral_code": "EAL34TM",
      "total_points": 30,
      "total_referrals": 3,
      "successful_referrals": 2,
      "last_activity": "2026-06-20T14:32:00.000Z"
    },
    {
      "position": 2,
      "user_id": "uuid-...",
      "name": "Carlos Ruiz",
      "referral_code": "XPQ78NK",
      "total_points": 10,
      "total_referrals": 1,
      "successful_referrals": 1,
      "last_activity": "2026-06-15T09:10:00.000Z"
    }
  ]
}
```

### Implementación

```tsx
// components/GlobalRankingTable.tsx
function GlobalRankingTable({ token }: { token: string }) {
  const [ranking, setRanking] = useState([]);

  useEffect(() => {
    fetch('/api/giveaways/metrics/ranking?limit=50', {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json()).then(r => r.ok && setRanking(r.data));
  }, [token]);

  return (
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Nombre</th>
          <th>Código</th>
          <th>Puntos</th>
          <th>Referidos</th>
          <th>Exitosos</th>
          <th>Última actividad</th>
        </tr>
      </thead>
      <tbody>
        {ranking.map(row => (
          <tr key={row.user_id}>
            <td>
              {row.position <= 3
                ? ['🥇','🥈','🥉'][row.position - 1]
                : row.position}
            </td>
            <td>{row.name}</td>
            <td><code>{row.referral_code}</code></td>
            <td><strong>{row.total_points}</strong></td>
            <td>{row.total_referrals}</td>
            <td>{row.successful_referrals}</td>
            <td>{row.last_activity
              ? new Date(row.last_activity).toLocaleDateString('es-CO')
              : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

> **Enlace al detalle:** en el campo `name` de cada fila añadir un `<Link to={/referidos/usuario/${row.user_id}}>` para navegar a la vista de detalle del usuario.

---

## 3. GET `/api/giveaways/metrics/activity?limit=30`

Feed cronológico — quién refirió a quién y cuándo.

### Response `200`
```json
{
  "ok": true,
  "count": 3,
  "data": [
    {
      "referral_id": "uuid-...",
      "created_at": "2026-06-20T14:32:00.000Z",
      "is_processed": true,
      "referrer_id": "uuid-...",
      "referrer_name": "María López",
      "referral_code": "EAL34TM",
      "referred_id": "uuid-...",
      "referred_name": "Juan Pérez",
      "form_id": "uuid-...",
      "form_title": "Censo de Usuarios Las Mercedes",
      "points_awarded": 10
    },
    {
      "referral_id": "uuid-...",
      "created_at": "2026-06-19T10:00:00.000Z",
      "is_processed": false,
      "referrer_name": "María López",
      "referral_code": "EAL34TM",
      "referred_id": null,
      "referred_name": null,
      "form_title": "Censo de Usuarios Las Mercedes",
      "points_awarded": 0
    }
  ]
}
```

### Implementación

```tsx
// components/ReferralActivityFeed.tsx
function ReferralActivityFeed({ token }: { token: string }) {
  const [activity, setActivity] = useState([]);

  useEffect(() => {
    fetch('/api/giveaways/metrics/activity?limit=30', {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json()).then(r => r.ok && setActivity(r.data));
  }, [token]);

  return (
    <ul className="activity-feed">
      {activity.map(item => (
        <li key={item.referral_id} className={`feed-item ${item.is_processed ? 'processed' : 'pending'}`}>
          <span className="status-dot" />
          <div>
            <strong>{item.referrer_name}</strong>
            {' invitó a '}
            <strong>{item.referred_name ?? 'alguien (pendiente)'}</strong>
            {' · '}
            <em>{item.form_title}</em>
          </div>
          <div className="feed-meta">
            {item.is_processed
              ? <span className="badge badge-green">+{item.points_awarded} pts</span>
              : <span className="badge badge-gray">Pendiente</span>}
            <time>{new Date(item.created_at).toLocaleString('es-CO')}</time>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

---

## 4. GET `/api/giveaways/metrics/per-form`

Tabla comparativa entre todos los formularios con sorteo.

### Response `200`
```json
{
  "ok": true,
  "count": 3,
  "data": [
    {
      "form_id": "uuid-...",
      "form_title": "Censo de Usuarios Las Mercedes",
      "giveaway_id": "uuid-...",
      "points_per_referral": 10,
      "max_points_per_user": null,
      "is_active": true,
      "total_referrals": 3,
      "processed_referrals": 2,
      "pending_referrals": 1,
      "total_points_distributed": 20,
      "active_referrers": 2
    }
  ]
}
```

### Implementación

```tsx
// Cada fila puede tener un botón "Ver detalle" que navega a /referidos/formulario/:formId
function PerFormTable({ data }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Formulario</th>
          <th>Estado</th>
          <th>Pts/referido</th>
          <th>Total refs</th>
          <th>Procesados</th>
          <th>Puntos dist.</th>
          <th>Participantes</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {data.map(row => (
          <tr key={row.form_id}>
            <td>{row.form_title}</td>
            <td>
              <span className={`badge ${row.is_active ? 'badge-green' : 'badge-gray'}`}>
                {row.is_active ? 'Activo' : 'Inactivo'}
              </span>
            </td>
            <td>{row.points_per_referral}</td>
            <td>{row.total_referrals}</td>
            <td>{row.processed_referrals}</td>
            <td>{row.total_points_distributed}</td>
            <td>{row.active_referrers}</td>
            <td>
              <Link to={`/referidos/formulario/${row.form_id}`}>
                Ver detalle →
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

---

## 5. GET `/api/giveaways/:formId/metrics`

Vista de detalle de un sorteo específico — ruta `/dashboard/referidos/formulario/:formId`.

### Response `200`
```json
{
  "ok": true,
  "data": {
    "config": {
      "form_id": "uuid-...",
      "form_title": "Censo de Usuarios Las Mercedes",
      "form_key": "censo_usuarios",
      "giveaway_id": "uuid-...",
      "points_per_referral": 10,
      "max_points_per_user": null,
      "is_active": true,
      "total_submissions": 227,
      "total_referrals": 3,
      "processed_referrals": 2,
      "pending_referrals": 1,
      "total_points_distributed": 20,
      "active_referrers": 2,
      "conversion_rate": 66.7
    },
    "timeline": [
      { "date": "2026-06-15", "referrals_created": 1, "referrals_converted": 1, "points_awarded": 10 },
      { "date": "2026-06-19", "referrals_created": 1, "referrals_converted": 0, "points_awarded": 0 },
      { "date": "2026-06-20", "referrals_created": 1, "referrals_converted": 1, "points_awarded": 10 }
    ],
    "top10": [
      { "position": 1, "user_id": "uuid-...", "name": "María López", "total_points": 20, "referrals_count": 2 },
      { "position": 2, "user_id": "uuid-...", "name": "Carlos Ruiz", "total_points": 10, "referrals_count": 1 }
    ]
  }
}
```

### Gráfico de timeline con Chart.js

```tsx
import { Bar } from 'react-chartjs-2';

function ReferralTimeline({ timeline }) {
  const labels = timeline.map(d => d.date);

  const data = {
    labels,
    datasets: [
      {
        label: 'Referidos creados',
        data: timeline.map(d => d.referrals_created),
        backgroundColor: '#94a3b8'
      },
      {
        label: 'Convertidos',
        data: timeline.map(d => d.referrals_converted),
        backgroundColor: '#0ea5e9'
      }
    ]
  };

  const options = {
    responsive: true,
    scales: {
      x: { stacked: false },
      y: { beginAtZero: true, ticks: { stepSize: 1 } }
    },
    plugins: {
      title: { display: true, text: 'Actividad de referidos — últimos 30 días' }
    }
  };

  return <Bar data={data} options={options} />;
}
```

---

## 6. GET `/api/giveaways/metrics/user/:userId`

Vista de perfil de referido de un usuario — ruta `/dashboard/referidos/usuario/:userId`.  
Solo accesible por **administradores**.

### Response `200`
```json
{
  "ok": true,
  "data": {
    "profile": {
      "id": "uuid-...",
      "name": "María López",
      "email": "maria@correo.com",
      "phone": "3001234567",
      "referral_code": "EAL34TM",
      "total_accumulated_points": 30,
      "total_referrals": 3,
      "successful_referrals": 2,
      "pending_referrals": 1,
      "last_activity": "2026-06-20T14:32:00.000Z"
    },
    "by_giveaway": [
      {
        "form_id": "uuid-...",
        "form_title": "Censo de Usuarios Las Mercedes",
        "points_earned": 30,
        "referrals_in_giveaway": 3
      }
    ],
    "recent_referrals": [
      {
        "referral_id": "uuid-...",
        "created_at": "2026-06-20T14:32:00.000Z",
        "is_processed": true,
        "referred_name": "Juan Pérez",
        "form_title": "Censo de Usuarios Las Mercedes",
        "points_earned": 10
      }
    ]
  }
}
```

### Implementación

```tsx
// pages/UserReferralDetail.tsx
function UserReferralDetail({ userId, token }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(`/api/giveaways/metrics/user/${userId}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json()).then(r => r.ok && setData(r.data));
  }, [userId, token]);

  if (!data) return <Spinner />;

  const { profile, by_giveaway, recent_referrals } = data;

  return (
    <div>
      {/* Header del perfil */}
      <section className="user-profile-header">
        <h2>{profile.name}</h2>
        <p>Código: <code>{profile.referral_code}</code></p>
        <div className="kpi-mini">
          <span>{profile.total_accumulated_points} pts</span>
          <span>{profile.successful_referrals} / {profile.total_referrals} referidos</span>
        </div>
      </section>

      {/* Desglose por sorteo */}
      <section>
        <h3>Participación por sorteo</h3>
        <table>
          <thead>
            <tr><th>Formulario</th><th>Referidos</th><th>Puntos</th></tr>
          </thead>
          <tbody>
            {by_giveaway.map(g => (
              <tr key={g.form_id}>
                <td>{g.form_title}</td>
                <td>{g.referrals_in_giveaway}</td>
                <td><strong>{g.points_earned}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Historial reciente */}
      <section>
        <h3>Últimas actividades</h3>
        <ul>
          {recent_referrals.map(r => (
            <li key={r.referral_id}>
              <span className={`dot ${r.is_processed ? 'green' : 'gray'}`} />
              {r.referred_name ?? 'Pendiente de registro'}
              <em> · {r.form_title}</em>
              {r.is_processed && <strong> +{r.points_earned} pts</strong>}
              <time>{new Date(r.created_at).toLocaleDateString('es-CO')}</time>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

---

## 7. GET `/api/users/me/referral-qr` — Código QR del link de referido

Genera el QR que el usuario puede compartir o imprimir para captar referidos.

### Query params

| Param | Tipo | Default | Descripción |
|---|---|---|---|
| `format` | `json` \| `svg` \| `png` | `json` | Formato de salida |
| `formId` | UUID | — | Si se pasa, el QR apunta a ese formulario específico |

### URL codificada en el QR

```
Sin formId:   {FRONTEND_URL}{REFERRAL_FORM_PATH}?ref={referral_code}
Con formId:   {FRONTEND_URL}{REFERRAL_FORM_PATH}/{formId}?ref={referral_code}

Ejemplo:      https://aquavisor.co/formulario?ref=EAL34TM
```

> **Importante:** la variable `REFERRAL_FORM_PATH` en el servidor debe coincidir con la
> ruta que el frontend usa para el formulario. Valor por defecto: `/formulario`.
> Si el frontend cambia su ruta, actualizar esta variable de entorno en el servidor.

### Response `format=json` (default)

```json
{
  "ok": true,
  "data": {
    "referral_code": "EAL34TM",
    "referral_url": "https://aquavisor.co/formulario?ref=EAL34TM",
    "qr_svg": "<svg xmlns='http://www.w3.org/2000/svg' ...>...</svg>",
    "qr_data_url": "data:image/png;base64,iVBORw0KGgo..."
  }
}
```

### Response `format=svg`

SVG binario (`Content-Type: image/svg+xml`) — para `<img src>` o iframe inline.

### Response `format=png`

PNG 512×512 px (`Content-Type: image/png`, `Content-Disposition: attachment`) — para descarga y compartir por WhatsApp/redes.

### Implementación

```tsx
// components/ReferralQRCard.tsx
import { useEffect, useState } from 'react';

interface QRData {
  referral_code: string;
  referral_url: string;
  qr_svg: string;
  qr_data_url: string;
}

function ReferralQRCard({ token, formId }: { token: string; formId?: string }) {
  const [qr, setQr] = useState<QRData | null>(null);

  useEffect(() => {
    const params = formId ? `?formId=${formId}` : '';
    fetch(`/api/users/me/referral-qr${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(r => r.ok && setQr(r.data));
  }, [token, formId]);

  if (!qr) return <Spinner />;

  // URL de descarga PNG directa (navegador abre diálogo "Guardar")
  const downloadUrl = `/api/users/me/referral-qr?format=png${formId ? `&formId=${formId}` : ''}`;

  return (
    <div className="qr-card">
      {/* Mostrar QR usando data URL (más simple) */}
      <img
        src={qr.qr_data_url}
        alt={`QR referido ${qr.referral_code}`}
        width={200}
        height={200}
      />

      {/* Alternativamente: SVG inline (escalable, sin petición extra) */}
      {/* <div dangerouslySetInnerHTML={{ __html: qr.qr_svg }} /> */}

      <p className="qr-code-label">
        Código: <strong>{qr.referral_code}</strong>
      </p>

      <p className="qr-url-preview">{qr.referral_url}</p>

      <div className="qr-actions">
        {/* Botón compartir (Web Share API) */}
        <button onClick={() => navigator.share?.({
          title: 'Únete a Aquanova',
          text: '¡Completa el censo y ayuda a tu comunidad!',
          url: qr.referral_url
        })}>
          Compartir enlace
        </button>

        {/* Descarga PNG para WhatsApp / impresión */}
        <a
          href={`${downloadUrl}&_token=${token}`}
          download={`qr-referido-${qr.referral_code}.png`}
        >
          Descargar QR (PNG)
        </a>
      </div>
    </div>
  );
}
```

> **Nota sobre descarga PNG con auth:** el endpoint requiere JWT. Para la descarga
> directa con `<a href>`, el token no viaja en el header. Opciones:
> - Usar `fetch()` + `URL.createObjectURL(blob)` para crear el link de descarga en el cliente (recomendado).
> - O exponer un endpoint público temporal (ver patrón `one-time-token` si se necesita en el futuro).

#### Descarga con fetch (patrón recomendado)

```tsx
async function downloadQRPng(token: string, referralCode: string, formId?: string) {
  const params = `format=png${formId ? `&formId=${formId}` : ''}`;
  const res = await fetch(`/api/users/me/referral-qr?${params}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `qr-referido-${referralCode}.png`;
  a.click();
  URL.revokeObjectURL(url);
}
```

---

## 8. GET `/api/giveaways/:formId/leaderboard` (público)

Endpoint existente, ahora incluye el campo `position` en cada fila.

### Response `200`
```json
{
  "ok": true,
  "count": 2,
  "data": [
    {
      "position": 1,
      "user_id": "uuid-...",
      "name": "María López",
      "total_points": "20",
      "referrals_count": 2
    }
  ]
}
```

---

## Estructura de rutas frontend sugerida

```
/dashboard/referidos                       →  Dashboard principal (overview + tabs)
  ├── tab "Ranking global"                 →  GlobalRankingTable  (GET /metrics/ranking)
  ├── tab "Por formulario"                 →  PerFormTable        (GET /metrics/per-form)
  └── tab "Actividad"                      →  ReferralActivityFeed (GET /metrics/activity)

/dashboard/referidos/formulario/:formId   →  Detalle de sorteo
  ├── KPIs del sorteo                      →  config de GET /:formId/metrics
  ├── Gráfico de actividad (30 días)       →  timeline de GET /:formId/metrics
  └── Top 10                               →  top10 de GET /:formId/metrics

/dashboard/referidos/usuario/:userId      →  Perfil de un referidor
  ├── Header con puntos y código           →  profile de GET /metrics/user/:userId
  ├── Tabla por sorteo                     →  by_giveaway
  └── Historial reciente                  →  recent_referrals
```

### Ejemplo de React Router

```tsx
import { Routes, Route } from 'react-router-dom';

<Routes>
  <Route path="/dashboard/referidos" element={<ReferralDashboard />} />
  <Route path="/dashboard/referidos/formulario/:formId" element={<FormReferralDetail />} />
  <Route path="/dashboard/referidos/usuario/:userId" element={<UserReferralDetail />} />
</Routes>
```

---

## Variables de entorno del servidor

Ambas variables afectan la URL codificada en el QR y el campo `referral_url` del perfil.

```env
FRONTEND_URL=https://aquavisor.co          # URL base del frontend (sin barra final)
REFERRAL_FORM_PATH=/formulario             # Ruta del formulario en el frontend
```

> Si el frontend usa una ruta distinta (p.ej. `/censo` o `/forms/public`),
> actualizar `REFERRAL_FORM_PATH` en el servidor. **No tocar el código.**

---

## Manejo de errores

| HTTP | Causa | Acción recomendada |
|---|---|---|
| `401` | Token expirado o faltante | Redirigir a login |
| `403` | Sin permisos para el endpoint | Mostrar "Sin acceso" |
| `404` | `userId` o `formId` no existe | Mostrar "No encontrado", redirigir al listado |
| `503` | `FRONTEND_URL` no configurada en el servidor | Avisar al admin, el QR no puede generarse |
| `500` | Error interno del servidor | Mostrar error genérico con opción de reintento |

---

## TypeScript — interfaces completas

```ts
// Resumen global
interface ReferralOverview {
  total_referrals: number;
  processed_referrals: number;
  pending_referrals: number;
  total_points_distributed: number;
  active_referrers: number;
  users_with_profile: number;
  active_giveaways: number;
  total_submissions: number;
  submissions_via_referral: number;
  conversion_rate: number;
  referral_share: number;
}

// Fila del ranking (global y por sorteo)
interface RankingEntry {
  position: number;
  user_id: string;
  name: string;
  referral_code: string;
  total_points: number;
  total_referrals: number;
  successful_referrals: number;
  last_activity: string | null;
}

// Evento de actividad
interface ReferralActivity {
  referral_id: string;
  created_at: string;
  is_processed: boolean;
  referrer_id: string;
  referrer_name: string;
  referral_code: string;
  referred_id: string | null;
  referred_name: string | null;
  form_id: string;
  form_title: string;
  points_awarded: number;
}

// Fila de métricas por formulario
interface FormReferralStats {
  form_id: string;
  form_title: string;
  giveaway_id: string;
  points_per_referral: number;
  max_points_per_user: number | null;
  is_active: boolean;
  total_referrals: number;
  processed_referrals: number;
  pending_referrals: number;
  total_points_distributed: number;
  active_referrers: number;
}

// Detalle completo de un sorteo
interface FormMetrics {
  config: FormReferralStats & {
    form_key: string;
    total_submissions: number;
    conversion_rate: number;
  };
  timeline: Array<{
    date: string;
    referrals_created: number;
    referrals_converted: number;
    points_awarded: number;
  }>;
  top10: Array<{
    position: number;
    user_id: string;
    name: string;
    total_points: number;
    referrals_count: number;
  }>;
}

// Detalle de un usuario
interface UserReferralDetail {
  profile: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    referral_code: string;
    total_accumulated_points: number;
    total_referrals: number;
    successful_referrals: number;
    pending_referrals: number;
    last_activity: string | null;
  };
  by_giveaway: Array<{
    form_id: string;
    form_title: string;
    points_earned: number;
    referrals_in_giveaway: number;
  }>;
  recent_referrals: Array<{
    referral_id: string;
    created_at: string;
    is_processed: boolean;
    referred_name: string | null;
    form_title: string;
    points_earned: number;
  }>;
}
```
