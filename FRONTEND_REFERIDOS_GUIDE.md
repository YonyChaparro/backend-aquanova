# Guía de Integración Frontend — Sistema de Referidos y Métricas

**Versión:** 1.0 — Junio 2026  
**Aplica a:** vistas de usuario (perfil de referido + QR) y panel de administración (métricas)  
**Prerequisito:** usuario autenticado con JWT almacenado

---

## Tabla de contenidos

1. [Flujo completo del sistema](#1-flujo-completo)
2. [Ruta del link de referido — leer antes de todo](#2-ruta-del-link-de-referido)
3. [Rutas del frontend sugeridas](#3-rutas-del-frontend)
4. [Feature: Perfil de referido y compartir QR](#4-perfil-y-qr)
5. [Feature: Dashboard de métricas (admin)](#5-dashboard-de-métricas)
6. [Feature: Leaderboard público (en el formulario)](#6-leaderboard-público)
7. [Hooks reutilizables](#7-hooks)
8. [TypeScript — interfaces completas](#8-typescript)
9. [Variables de entorno del frontend](#9-variables-de-entorno)
10. [Checklist de implementación](#10-checklist)

---

## 1. Flujo completo

```
USUARIO REFERENTE (registrado)
──────────────────────────────────────────────────────
  GET /api/users/me/referral-profile
    └─ recibe referral_code + referral_url
  GET /api/users/me/referral-qr
    └─ recibe QR del link (SVG / PNG / data URL)
  → Comparte link por WhatsApp, redes, o imprime el QR

USUARIO NUEVO (anónimo — llega por el link)
──────────────────────────────────────────────────────
  Abre: {FRONTEND_URL}/formulario?ref=EAL34TM
  Frontend extrae ?ref= → guarda en sessionStorage
  Llena el formulario → POST /api/submissions/anonymous
    Body: { ..., referral_code: "EAL34TM" }
  Backend crea submission + insertion en submission_referrals (is_processed=false)
  → Usuario se registra → POST /api/users
    Body: { ..., pending_submission_ids: ["uuid-submission"] }
  Backend ejecuta reconciliación ACID:
    → vincula submission al nuevo usuario
    → otorga puntos al referente en el ledger
    → marca submission_referral como is_processed=true

ADMINISTRADOR
──────────────────────────────────────────────────────
  GET /api/giveaways/metrics/overview   → KPIs globales
  GET /api/giveaways/metrics/ranking    → tabla de puestos
  GET /api/giveaways/metrics/activity   → feed cronológico
  GET /api/giveaways/metrics/per-form   → tabla comparativa
  GET /api/giveaways/:formId/metrics    → detalle + timeline
  GET /api/giveaways/metrics/user/:id   → perfil de un referente
```

---

## 2. Ruta del link de referido

> **Leer antes de implementar.** Esta es la decisión más crítica para que los QR funcionen.

El backend construye la URL que va codificada en el QR con dos variables de entorno:

```env
FRONTEND_URL=https://aquavisor.co
REFERRAL_FORM_PATH=/formulario        ← debe coincidir con la ruta del frontend
```

El link resultante es:

```
https://aquavisor.co/formulario?ref=EAL34TM
```

**Si el formulario público en el frontend está en una ruta diferente** (p.ej. `/f/:formKey`, `/censo`, `/forms/public`), hay que hacer DOS cosas:

1. Cambiar `REFERRAL_FORM_PATH` en el servidor (sin tocar código).
2. Asegurarse de que el frontend extrae `?ref=` en esa ruta.

Si el link incluye el formId:
```
https://aquavisor.co/formulario/49d3db06-...?ref=EAL34TM
```
El QR con formId se obtiene pasando `?formId=uuid` al endpoint QR:
```
GET /api/users/me/referral-qr?formId=49d3db06-...
```

---

## 3. Rutas del frontend

### Vista de usuario (cualquier rol autenticado)

```
/perfil/referidos                 → Tarjeta de perfil con código, link y QR
```

### Panel de administración (rol 1=admin, 2=operador)

```
/dashboard/referidos              → Resumen + tabs (ranking / actividad / por formulario)
/dashboard/referidos/:formId      → Detalle de un sorteo (config + timeline + top 10)
/dashboard/referidos/usuario/:id  → Perfil completo de un referente (solo admin)
```

### Ruta pública (sin login, en la pantalla del formulario compartido)

```
/formulario?ref=EAL34TM           → Formulario con referido pre-cargado
  └─ Incluye el leaderboard público del sorteo de ese formulario
```

### React Router

```tsx
import { Routes, Route } from 'react-router-dom';
import { PrivateRoute } from './components/PrivateRoute'; // tu wrapper de auth

<Routes>
  {/* Usuario autenticado */}
  <Route path="/perfil/referidos" element={
    <PrivateRoute><ReferralProfilePage /></PrivateRoute>
  } />

  {/* Admin / Operador */}
  <Route path="/dashboard/referidos" element={
    <PrivateRoute roles={[1, 2]}><ReferralDashboard /></PrivateRoute>
  } />
  <Route path="/dashboard/referidos/:formId" element={
    <PrivateRoute roles={[1, 2]}><FormReferralDetail /></PrivateRoute>
  } />
  <Route path="/dashboard/referidos/usuario/:userId" element={
    <PrivateRoute roles={[1]}><UserReferralDetail /></PrivateRoute>
  } />

  {/* Público */}
  <Route path="/formulario" element={<PublicFormPage />} />
</Routes>
```

---

## 4. Feature: Perfil de referido y compartir QR

### Endpoints usados

| Endpoint | Cuándo llamarlo |
|---|---|
| `GET /api/users/me/referral-profile` | Al montar la página, para obtener código + URL + puntos |
| `GET /api/users/me/referral-qr` | Al abrir el modal de QR (lazy — no llamar en el montaje) |
| `GET /api/users/me/referral-qr?format=png` | Al pulsar "Descargar QR" |

### 4.1 Hook: useReferralProfile

```ts
// hooks/useReferralProfile.ts
import { useEffect, useState } from 'react';

interface ReferralProfile {
  referral_code: string;
  referral_url: string;
  total_accumulated_points: number;
  share_base_url: string;
}

export function useReferralProfile(token: string) {
  const [data, setData]     = useState<ReferralProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/users/me/referral-profile', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(r => {
        if (r.ok) setData(r.data);
        else setError(r.message);
      })
      .catch(() => setError('Error de conexión'))
      .finally(() => setLoading(false));
  }, [token]);

  return { data, loading, error };
}
```

### 4.2 Hook: useReferralQR

```ts
// hooks/useReferralQR.ts
import { useState } from 'react';

interface QRData {
  referral_code: string;
  referral_url: string;
  qr_svg: string;
  qr_data_url: string;
}

export function useReferralQR(token: string) {
  const [data, setData]       = useState<QRData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const fetchQR = async (formId?: string) => {
    setLoading(true);
    setError(null);
    const params = formId ? `?formId=${formId}` : '';
    try {
      const r = await fetch(`/api/users/me/referral-qr${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await r.json();
      if (json.ok) setData(json.data);
      else setError(json.message);
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  // Descarga el PNG directamente (requiere fetch para enviar el JWT)
  const downloadPNG = async (referralCode: string, formId?: string) => {
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
  };

  return { data, loading, error, fetchQR, downloadPNG };
}
```

### 4.3 Componente: ReferralProfileCard

```tsx
// components/ReferralProfileCard.tsx
import { useState } from 'react';
import { useReferralProfile } from '../hooks/useReferralProfile';
import { ReferralQRModal } from './ReferralQRModal';

export function ReferralProfileCard({ token }: { token: string }) {
  const { data, loading, error } = useReferralProfile(token);
  const [showQR, setShowQR]      = useState(false);
  const [copied, setCopied]      = useState(false);

  if (loading) return <div className="skeleton-card" />;
  if (error)   return <p className="text-error">{error}</p>;
  if (!data)   return null;

  const copyLink = async () => {
    await navigator.clipboard.writeText(data.referral_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareLink = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Únete al censo de Aquanova',
        text: '¡Ayuda a tu comunidad completando el censo! Usa mi link:',
        url: data.referral_url
      });
    } else {
      copyLink(); // fallback para escritorio
    }
  };

  return (
    <div className="referral-card">
      <header className="referral-card__header">
        <h3>Tu link de referido</h3>
        <span className="points-badge">
          {data.total_accumulated_points} pts acumulados
        </span>
      </header>

      {/* Código y URL */}
      <div className="referral-card__code">
        <span className="label">Tu código</span>
        <code className="code-badge">{data.referral_code}</code>
      </div>

      <div className="referral-card__url">
        <input
          readOnly
          value={data.referral_url}
          className="url-input"
          onClick={e => (e.target as HTMLInputElement).select()}
        />
      </div>

      {/* Acciones */}
      <div className="referral-card__actions">
        <button onClick={copyLink} className="btn btn-outline">
          {copied ? '¡Copiado!' : 'Copiar link'}
        </button>

        <button onClick={shareLink} className="btn btn-primary">
          Compartir
        </button>

        <button onClick={() => setShowQR(true)} className="btn btn-secondary">
          Ver QR
        </button>
      </div>

      {/* Modal de QR */}
      {showQR && (
        <ReferralQRModal
          token={token}
          onClose={() => setShowQR(false)}
        />
      )}
    </div>
  );
}
```

### 4.4 Componente: ReferralQRModal

```tsx
// components/ReferralQRModal.tsx
import { useEffect } from 'react';
import { useReferralQR } from '../hooks/useReferralQR';

interface Props {
  token: string;
  formId?: string;  // opcional — para QR específico de un formulario
  onClose: () => void;
}

export function ReferralQRModal({ token, formId, onClose }: Props) {
  const { data, loading, error, fetchQR, downloadPNG } = useReferralQR(token);

  // Cargar el QR al abrir el modal (lazy)
  useEffect(() => { fetchQR(formId); }, [formId]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>

        <h3 className="modal-title">Comparte tu QR de referido</h3>

        {loading && <div className="qr-skeleton" />}

        {error && (
          <p className="text-error">
            {error === 'FRONTEND_URL no está configurada en el servidor.'
              ? 'El servidor no tiene la URL del frontend configurada. Contacta al administrador.'
              : error}
          </p>
        )}

        {data && (
          <>
            {/* QR con data URL — compatible con todos los navegadores */}
            <div className="qr-wrapper">
              <img
                src={data.qr_data_url}
                alt={`QR de referido ${data.referral_code}`}
                width={240}
                height={240}
              />
            </div>

            <p className="qr-url-label">
              <strong>{data.referral_code}</strong>
              <br />
              <small>{data.referral_url}</small>
            </p>

            <div className="qr-actions">
              {/* Compartir por Web Share API */}
              {navigator.share && (
                <button
                  className="btn btn-primary"
                  onClick={() => navigator.share!({
                    title: 'Únete al censo — Aquanova',
                    text: '¡Escanea este QR o abre el link para completar el censo!',
                    url: data.referral_url
                  })}
                >
                  Compartir por WhatsApp / redes
                </button>
              )}

              {/* Descarga PNG para imprimir */}
              <button
                className="btn btn-outline"
                onClick={() => downloadPNG(data.referral_code, formId)}
              >
                Descargar PNG (para imprimir)
              </button>
            </div>

            <p className="qr-hint">
              Escanea con la cámara del celular para abrir el formulario directamente.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
```

### 4.5 Página completa: /perfil/referidos

```tsx
// pages/ReferralProfilePage.tsx
import { ReferralProfileCard } from '../components/ReferralProfileCard';
import { useAuth } from '../hooks/useAuth'; // tu hook de auth

export function ReferralProfilePage() {
  const { token } = useAuth();
  return (
    <main className="page-container">
      <h1>Mi perfil de referidos</h1>
      <p className="page-desc">
        Comparte tu link o QR para invitar a otros a completar el censo.
        Ganas puntos cada vez que alguien se registra usando tu código.
      </p>
      <ReferralProfileCard token={token} />
    </main>
  );
}
```

---

## 5. Feature: Dashboard de métricas

### 5.1 Página principal — /dashboard/referidos

Llama cuatro endpoints al montar y los organiza en tabs:

```tsx
// pages/ReferralDashboard.tsx
import { useState, useEffect } from 'react';
import { KpiGrid }          from '../components/KpiGrid';
import { GlobalRanking }    from '../components/GlobalRanking';
import { ActivityFeed }     from '../components/ActivityFeed';
import { PerFormTable }     from '../components/PerFormTable';

type Tab = 'ranking' | 'actividad' | 'formularios';

export function ReferralDashboard({ token }: { token: string }) {
  const [overview, setOverview] = useState(null);
  const [tab, setTab]           = useState<Tab>('ranking');

  useEffect(() => {
    fetch('/api/giveaways/metrics/overview', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(r => r.ok && setOverview(r.data));
  }, [token]);

  return (
    <main className="page-container">
      <h1>Panel de Referidos</h1>

      {/* KPIs superiores */}
      {overview && <KpiGrid stats={overview} />}

      {/* Tabs */}
      <nav className="tab-nav">
        {(['ranking', 'actividad', 'formularios'] as Tab[]).map(t => (
          <button
            key={t}
            className={`tab-btn ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {{ ranking: 'Ranking global', actividad: 'Actividad', formularios: 'Por formulario' }[t]}
          </button>
        ))}
      </nav>

      <section className="tab-content">
        {tab === 'ranking'      && <GlobalRanking token={token} />}
        {tab === 'actividad'    && <ActivityFeed  token={token} />}
        {tab === 'formularios'  && <PerFormTable  token={token} />}
      </section>
    </main>
  );
}
```

### 5.2 Componente: KpiGrid

```tsx
// components/KpiGrid.tsx
interface OverviewStats {
  total_referrals: number;
  processed_referrals: number;
  pending_referrals: number;
  total_points_distributed: number;
  active_referrers: number;
  conversion_rate: number;
  referral_share: number;
  active_giveaways: number;
}

function KpiCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className={`kpi-card ${color ? `kpi-card--${color}` : ''}`}>
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
    </div>
  );
}

export function KpiGrid({ stats }: { stats: OverviewStats }) {
  const convColor = stats.conversion_rate >= 50 ? 'green'
                  : stats.conversion_rate >= 25 ? 'yellow' : 'red';
  return (
    <div className="kpi-grid">
      <KpiCard label="Total invitaciones"  value={stats.total_referrals} />
      <KpiCard label="Convertidas"         value={stats.processed_referrals} color="green" />
      <KpiCard label="Pendientes"          value={stats.pending_referrals} />
      <KpiCard label="Puntos distribuidos" value={stats.total_points_distributed} />
      <KpiCard
        label="Tasa de conversión"
        value={`${stats.conversion_rate}%`}
        color={convColor}
      />
      <KpiCard label="Participación viral" value={`${stats.referral_share}%`} />
      <KpiCard label="Participantes activos" value={stats.active_referrers} />
      <KpiCard label="Sorteos activos"     value={stats.active_giveaways} />
    </div>
  );
}
```

### 5.3 Componente: GlobalRanking

```tsx
// components/GlobalRanking.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export function GlobalRanking({ token }: { token: string }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    fetch('/api/giveaways/metrics/ranking?limit=50', {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json()).then(r => r.ok && setRows(r.data));
  }, [token]);

  const medalIcon = (pos: number) =>
    pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos;

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Nombre</th>
          <th>Código</th>
          <th>Puntos</th>
          <th>Referidos</th>
          <th>Exitosos</th>
          <th>Última actividad</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row: any) => (
          <tr key={row.user_id}>
            <td className="pos-cell">{medalIcon(row.position)}</td>
            <td>{row.name}</td>
            <td><code>{row.referral_code}</code></td>
            <td><strong>{row.total_points}</strong></td>
            <td>{row.total_referrals}</td>
            <td>
              <span className="badge badge-green">{row.successful_referrals}</span>
            </td>
            <td className="muted">
              {row.last_activity
                ? new Date(row.last_activity).toLocaleDateString('es-CO')
                : '—'}
            </td>
            <td>
              <Link to={`/dashboard/referidos/usuario/${row.user_id}`}>
                Ver →
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### 5.4 Componente: ActivityFeed

```tsx
// components/ActivityFeed.tsx
import { useEffect, useState } from 'react';

export function ActivityFeed({ token }: { token: string }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    fetch('/api/giveaways/metrics/activity?limit=30', {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json()).then(r => r.ok && setItems(r.data));
  }, [token]);

  return (
    <ul className="activity-feed">
      {items.map((item: any) => (
        <li key={item.referral_id} className="feed-item">
          <span className={`feed-dot ${item.is_processed ? 'green' : 'gray'}`} />
          <div className="feed-body">
            <strong>{item.referrer_name}</strong>
            {' invitó a '}
            <strong>{item.referred_name ?? 'alguien (pendiente)'}</strong>
            {' · '}
            <span className="muted">{item.form_title}</span>
          </div>
          <div className="feed-meta">
            {item.is_processed
              ? <span className="badge badge-green">+{item.points_awarded} pts</span>
              : <span className="badge badge-gray">Pendiente</span>
            }
            <time className="muted">
              {new Date(item.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
            </time>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

### 5.5 Componente: PerFormTable

```tsx
// components/PerFormTable.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export function PerFormTable({ token }: { token: string }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    fetch('/api/giveaways/metrics/per-form', {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json()).then(r => r.ok && setRows(r.data));
  }, [token]);

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Formulario</th>
          <th>Estado</th>
          <th>Pts / referido</th>
          <th>Total refs</th>
          <th>Procesados</th>
          <th>Puntos dist.</th>
          <th>Participantes</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row: any) => (
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
              <Link to={`/dashboard/referidos/${row.form_id}`}>
                Detalle →
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### 5.6 Página: /dashboard/referidos/:formId

```tsx
// pages/FormReferralDetail.tsx
import { useEffect, useState } from 'react';
import { useParams }           from 'react-router-dom';
import { Bar }                 from 'react-chartjs-2';

export function FormReferralDetail({ token }: { token: string }) {
  const { formId } = useParams<{ formId: string }>();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/giveaways/${formId}/metrics`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json()).then(r => r.ok && setData(r.data));
  }, [formId, token]);

  if (!data) return <div className="skeleton-page" />;

  const { config, timeline, top10 } = data;

  // Datos para Chart.js
  const chartData = {
    labels: timeline.map((d: any) => d.date),
    datasets: [
      {
        label: 'Referidos creados',
        data: timeline.map((d: any) => d.referrals_created),
        backgroundColor: '#94a3b8'
      },
      {
        label: 'Convertidos',
        data: timeline.map((d: any) => d.referrals_converted),
        backgroundColor: '#0ea5e9'
      }
    ]
  };

  return (
    <main className="page-container">
      <h1>{config.form_title}</h1>

      {/* KPIs del sorteo */}
      <div className="kpi-row">
        <div className="kpi-mini">
          <span>{config.total_referrals}</span><label>Referidos</label>
        </div>
        <div className="kpi-mini green">
          <span>{config.processed_referrals}</span><label>Convertidos</label>
        </div>
        <div className="kpi-mini">
          <span>{config.conversion_rate}%</span><label>Conversión</label>
        </div>
        <div className="kpi-mini">
          <span>{config.total_points_distributed}</span><label>Puntos dist.</label>
        </div>
        <div className="kpi-mini">
          <span>{config.active_referrers}</span><label>Participantes</label>
        </div>
      </div>

      {/* Timeline — últimos 30 días */}
      <section>
        <h2>Actividad últimos 30 días</h2>
        {timeline.length === 0
          ? <p className="muted">Sin actividad registrada.</p>
          : <Bar
              data={chartData}
              options={{
                responsive: true,
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                plugins: { legend: { position: 'top' } }
              }}
            />
        }
      </section>

      {/* Top 10 */}
      <section>
        <h2>Top 10 referentes</h2>
        <table className="data-table">
          <thead>
            <tr><th>#</th><th>Nombre</th><th>Puntos</th><th>Referidos</th></tr>
          </thead>
          <tbody>
            {top10.map((row: any) => (
              <tr key={row.user_id}>
                <td>{row.position <= 3 ? ['🥇','🥈','🥉'][row.position - 1] : row.position}</td>
                <td>{row.name}</td>
                <td><strong>{row.total_points}</strong></td>
                <td>{row.referrals_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
```

### 5.7 Página: /dashboard/referidos/usuario/:userId

```tsx
// pages/UserReferralDetail.tsx
import { useEffect, useState } from 'react';
import { useParams }           from 'react-router-dom';

export function UserReferralDetail({ token }: { token: string }) {
  const { userId } = useParams<{ userId: string }>();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/giveaways/metrics/user/${userId}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json()).then(r => r.ok && setData(r.data));
  }, [userId, token]);

  if (!data) return <div className="skeleton-page" />;

  const { profile, by_giveaway, recent_referrals } = data;

  return (
    <main className="page-container">
      {/* Header del perfil */}
      <header className="user-profile-header">
        <div>
          <h1>{profile.name}</h1>
          <p className="muted">{profile.email}</p>
        </div>
        <div className="profile-stats">
          <span className="stat-big">{profile.total_accumulated_points}</span>
          <span className="stat-label">puntos totales</span>
        </div>
        <div className="profile-stats">
          <span className="stat-big">{profile.successful_referrals}</span>
          <span className="stat-label">referidos exitosos</span>
        </div>
        <div className="code-block">
          Código: <code>{profile.referral_code}</code>
        </div>
      </header>

      {/* Desglose por sorteo */}
      <section>
        <h2>Participación por sorteo</h2>
        <table className="data-table">
          <thead>
            <tr><th>Formulario</th><th>Referidos</th><th>Puntos</th></tr>
          </thead>
          <tbody>
            {by_giveaway.map((g: any) => (
              <tr key={g.form_id}>
                <td>{g.form_title}</td>
                <td>{g.referrals_in_giveaway}</td>
                <td><strong>{g.points_earned}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Últimas 20 actividades */}
      <section>
        <h2>Historial reciente</h2>
        <ul className="activity-feed">
          {recent_referrals.map((r: any) => (
            <li key={r.referral_id} className="feed-item">
              <span className={`feed-dot ${r.is_processed ? 'green' : 'gray'}`} />
              <div>
                {r.referred_name
                  ? <>Invitó a <strong>{r.referred_name}</strong></>
                  : <span className="muted">Invitación pendiente de registro</span>
                }
                {' · '}
                <span className="muted">{r.form_title}</span>
              </div>
              <div className="feed-meta">
                {r.is_processed
                  ? <span className="badge badge-green">+{r.points_earned} pts</span>
                  : <span className="badge badge-gray">Pendiente</span>
                }
                <time className="muted">
                  {new Date(r.created_at).toLocaleDateString('es-CO')}
                </time>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
```

---

## 6. Feature: Formulario público — flujo QR completo

Esta sección cubre todo lo que el frontend debe hacer cuando un usuario **escanea el QR con la cámara del celular** y llega al formulario.

### 6.1 Flujo paso a paso

```
Usuario escanea QR con la cámara
        │
        ▼
Cámara detecta la URL y abre el navegador
        │
        ▼
Navega a: https://aquavisor.co/formulario?ref=EAL34TM
        │
        ▼
[PublicFormPage monta]
  → Extrae ?ref=EAL34TM de la URL
  → Guarda en sessionStorage('referral_code', 'EAL34TM')
  → Muestra un banner: "Estás accediendo por invitación de [referente]" (opcional)
        │
        ▼
Usuario completa el formulario y pulsa Enviar
        │
        ▼
POST /api/submissions/anonymous
  Body: { form_id, neighborhood_id, responses, referral_code: "EAL34TM" }
        │
        ▼
Backend crea submission + registra referido pendiente
  → Responde: { submissionId: "uuid-xxx" }
        │
        ▼
Frontend guarda submissionId en sessionStorage
  (para la reconciliación al registrarse después)
        │
        ▼
Usuario se registra → POST /api/users
  Body: { name, ..., pending_submission_ids: ["uuid-xxx"] }
        │
        ▼
Backend concilia automáticamente → otorga puntos al referente
```

### 6.2 Hook: useReferralFromUrl

Lee el `?ref=` de la URL al montar y lo persiste en sessionStorage.

```ts
// hooks/useReferralFromUrl.ts
import { useEffect, useState } from 'react';

export function useReferralFromUrl() {
  const [referralCode, setReferralCode] = useState<string | null>(null);

  useEffect(() => {
    // Intentar recuperar de sessionStorage primero (el usuario recargó la página)
    const stored = sessionStorage.getItem('referral_code');
    if (stored) {
      setReferralCode(stored);
      return;
    }

    // Leer de la URL actual
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref && /^[A-Z0-9]{5,12}$/.test(ref)) {  // validación básica del formato
      sessionStorage.setItem('referral_code', ref);
      setReferralCode(ref);
    }
  }, []);

  const clearReferral = () => {
    sessionStorage.removeItem('referral_code');
    setReferralCode(null);
  };

  return { referralCode, clearReferral };
}
```

### 6.3 Página del formulario público

```tsx
// pages/PublicFormPage.tsx
import { useState }              from 'react';
import { useReferralFromUrl }    from '../hooks/useReferralFromUrl';
import { PublicLeaderboard }     from '../components/PublicLeaderboard';

export function PublicFormPage() {
  const { referralCode, clearReferral } = useReferralFromUrl();
  const [submitting, setSubmitting]     = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  // Formulario completado — se avanza al registro
  const handleSubmit = async (formData: {
    form_id: string;
    neighborhood_id: string;
    responses: Record<string, unknown>;
  }) => {
    setSubmitting(true);
    try {
      const body = {
        ...formData,
        // Incluir el código de referido si existe — esto es lo que activa el sistema
        ...(referralCode ? { referral_code: referralCode } : {})
      };

      const res = await fetch('/api/submissions/anonymous', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.message);

      // Guardar el submissionId para la reconciliación al registrarse
      sessionStorage.setItem('pending_submission_id', json.submissionId);
      setSubmissionId(json.submissionId);

      // Limpiar el código de referido — ya fue usado
      clearReferral();

    } catch (err) {
      console.error('Error enviando formulario:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Pantalla de confirmación — invita al usuario a registrarse
  if (submissionId) {
    return (
      <div className="form-success">
        <h2>¡Formulario enviado!</h2>
        <p>Para ganar puntos y ver tu posición en el ranking, crea tu cuenta.</p>
        <a href="/registro" className="btn btn-primary">Crear cuenta</a>
      </div>
    );
  }

  return (
    <div className="public-form-layout">
      {/* Banner de referido — solo se muestra si llegaron por un QR/link */}
      {referralCode && (
        <div className="referral-banner">
          Estás llenando el formulario por invitación.
          Al registrarte, tu invitador recibirá puntos.
        </div>
      )}

      {/* Aquí va tu componente de formulario existente */}
      <FormComponent
        onSubmit={handleSubmit}
        disabled={submitting}
      />

      {/* Leaderboard lateral — sin auth */}
      <PublicLeaderboard formId="ID_DEL_FORMULARIO_ACTIVO" />
    </div>
  );
}
```

### 6.4 Pantalla de registro — conciliación del referido

Cuando el usuario crea su cuenta después de haber llenado el formulario, hay que pasar el `submissionId` guardado:

```tsx
// pages/RegisterPage.tsx
const handleRegister = async (userData: {
  name: string;
  document_number: string;
  email: string;
  password: string;
  role_id: number;
  neighborhood_id?: string;
}) => {
  // Recuperar el submission pendiente de sessionStorage
  const pendingId = sessionStorage.getItem('pending_submission_id');

  const body = {
    ...userData,
    ...(pendingId ? { pending_submission_ids: [pendingId] } : {})
  };

  const res = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const json = await res.json();
  if (json.ok) {
    // Limpiar el submission pendiente — ya fue conciliado
    sessionStorage.removeItem('pending_submission_id');
    // Redirigir al login o al perfil
  }
};
```

La respuesta incluye el resultado de la conciliación:

```json
{
  "ok": true,
  "userId": "2e373e79-...",
  "reconciliation": [
    {
      "submissionId": "uuid-xxx",
      "reconciled": true,
      "points_awarded": 10
    }
  ]
}
```

Si `reconciled: true`, el referente ya recibió sus puntos automáticamente.

### 6.5 Leaderboard público por formulario

```tsx
// components/PublicLeaderboard.tsx
import { useEffect, useState } from 'react';

export function PublicLeaderboard({ formId }: { formId: string }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    fetch(`/api/giveaways/${formId}/leaderboard?limit=10`)
      .then(r => r.json())
      .then(r => r.ok && setRows(r.data));
  }, [formId]);

  if (rows.length === 0) return null;

  return (
    <aside className="leaderboard-widget">
      <h3>Top participantes</h3>
      <ol className="leaderboard-list">
        {rows.map((row: any) => (
          <li key={row.user_id} className="leaderboard-item">
            <span className="pos">{row.position}</span>
            <span className="name">{row.name}</span>
            <span className="pts">{row.total_points} pts</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
```

> **Nota sobre el formId:** La URL del QR es `/formulario?ref=EAL34TM` y no incluye el formId. Para mostrar el leaderboard del formulario correcto, el frontend debe obtenerlo de la API al cargar la página (p.ej. `GET /api/forms/active` o desde el contexto de la aplicación).

---

## 7. Hooks reutilizables

### useApiQuery — genérico para cualquier endpoint autenticado

```ts
// hooks/useApiQuery.ts
import { useEffect, useState } from 'react';

export function useApiQuery<T>(url: string, token: string) {
  const [data, setData]       = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!url || !token) return;
    setLoading(true);
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(r => { if (r.ok) setData(r.data); else setError(r.message); })
      .catch(() => setError('Error de conexión'))
      .finally(() => setLoading(false));
  }, [url, token]);

  return { data, loading, error };
}

// Uso:
// const { data, loading } = useApiQuery<OverviewStats>('/api/giveaways/metrics/overview', token);
```

---

## 8. TypeScript — interfaces completas

```ts
// types/referrals.ts

export interface ReferralProfile {
  referral_code: string;
  referral_url: string;
  total_accumulated_points: number;
  share_base_url: string;
}

export interface QRData {
  referral_code: string;
  referral_url: string;
  qr_svg: string;
  qr_data_url: string;
}

export interface OverviewStats {
  total_referrals: number;
  processed_referrals: number;
  pending_referrals: number;
  total_points_distributed: number;
  active_referrers: number;
  users_with_profile: number;
  active_giveaways: number;
  total_submissions: number;
  submissions_via_referral: number;
  conversion_rate: number;      // porcentaje (0-100)
  referral_share: number;       // porcentaje (0-100)
}

export interface RankingEntry {
  position: number;
  user_id: string;
  name: string;
  referral_code: string;
  total_points: number;
  total_referrals: number;
  successful_referrals: number;
  last_activity: string | null; // ISO 8601
}

export interface ActivityEvent {
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

export interface FormStats {
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

export interface FormMetrics {
  config: FormStats & {
    form_key: string;
    total_submissions: number;
    conversion_rate: number;
  };
  timeline: Array<{
    date: string;              // "2026-06-21"
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

export interface UserReferralDetail {
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

---

## 9. Variables de entorno del frontend

```env
# .env del frontend (Vite)

# URL base de la API
VITE_API_URL=https://api.aquavisor.co/api

# Usada para construir el link de compartir si se genera en el frontend
# (el backend también usa su propia FRONTEND_URL + REFERRAL_FORM_PATH)
VITE_FRONTEND_URL=https://aquavisor.co
VITE_REFERRAL_FORM_PATH=/formulario
```

> `VITE_REFERRAL_FORM_PATH` debe coincidir con la ruta real del componente de formulario y con `REFERRAL_FORM_PATH` en el servidor. Si cambia, actualizar ambos lados.

---

## 10. Checklist de implementación

### Fase 1 — Perfil y QR (usuario autenticado)

- [ ] Crear ruta `/perfil/referidos`
- [ ] Implementar `useReferralProfile` y verificar que `referral_url` llega correcto
- [ ] Implementar `useReferralQR` con carga lazy al abrir modal
- [ ] Montar `ReferralProfileCard` con botones: copiar link · compartir · ver QR
- [ ] Montar `ReferralQRModal` con imagen QR + descarga PNG
- [ ] Probar Web Share API en móvil (Chrome/Safari)
- [ ] Probar descarga PNG por `fetch` + `createObjectURL`
- [ ] Confirmar que `REFERRAL_FORM_PATH` en el servidor coincide con la ruta del formulario

### Fase 2 — Flujo QR: escaneo → formulario → registro

**Esta fase cierra el ciclo completo del QR.**

- [ ] Crear hook `useReferralFromUrl` (ver sección 6.2)
- [ ] En `PublicFormPage` montar el hook al cargar y guardar `referral_code` en sessionStorage
- [ ] Mostrar banner "Estás accediendo por invitación" si `referralCode` no es null
- [ ] Al hacer submit del formulario, incluir `referral_code` en el body de `POST /api/submissions/anonymous`
- [ ] Guardar el `submissionId` que devuelve el backend en sessionStorage
- [ ] Limpiar `referral_code` de sessionStorage después del submit exitoso
- [ ] En `RegisterPage`, leer `pending_submission_id` de sessionStorage y enviarlo en `pending_submission_ids`
- [ ] Limpiar `pending_submission_id` de sessionStorage tras registro exitoso
- [ ] **Prueba de humo:** escanear el QR desde el celular → verificar que `?ref=` se lee → enviar formulario → crear cuenta → confirmar que `reconciliation[0].reconciled === true` en la respuesta

### Fase 3 — Dashboard de métricas (admin)

- [ ] Crear ruta `/dashboard/referidos` (roles 1 y 2)
- [ ] Montar `KpiGrid` con datos de `/metrics/overview`
- [ ] Implementar los 3 tabs: ranking · actividad · por formulario
- [ ] Crear ruta `/dashboard/referidos/:formId` con timeline y top 10
- [ ] Instalar `chart.js` y `react-chartjs-2` para el gráfico de timeline
- [ ] Crear ruta `/dashboard/referidos/usuario/:userId` (solo rol 1)

### Fase 4 — Leaderboard público

- [ ] Añadir `PublicLeaderboard` en la pantalla del formulario compartido
- [ ] Obtener el `formId` del formulario activo (del contexto o de la API)

---

## Dependencias necesarias

```bash
npm install chart.js react-chartjs-2
```

```tsx
// Registrar los módulos de Chart.js una sola vez (en main.tsx o App.tsx)
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  BarElement, LineElement, PointElement, ArcElement,
  Title, Tooltip, Legend
} from 'chart.js';

ChartJS.register(
  CategoryScale, LinearScale,
  BarElement, LineElement, PointElement, ArcElement,
  Title, Tooltip, Legend
);
```

---

## Errores de API — manejo recomendado

| HTTP | Endpoint | Causa | Acción en UI |
|---|---|---|---|
| `401` | cualquiera | Token expirado / no enviado | Redirigir a login |
| `403` | métricas | Rol insuficiente | Mostrar "Sin acceso" y ocultar la ruta |
| `404` | `/:formId/metrics` | formId inválido | "Sorteo no encontrado", redirigir al listado |
| `404` | `/metrics/user/:id` | userId sin perfil de referido | "Este usuario no tiene actividad de referidos" |
| `503` | `/me/referral-qr` | `FRONTEND_URL` no configurada en servidor | "El QR no está disponible. Contacta al administrador" |
| `500` | cualquiera | Error interno | Toast de error con botón "Reintentar" |
