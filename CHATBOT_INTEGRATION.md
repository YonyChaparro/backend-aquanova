# Aquabot — Contrato de integración frontend

**Versión:** 2.0 — Junio 2026  
**Endpoint base:** `/api/chat`  
**Autenticación:** ninguna (endpoint público)  
**Formato:** `application/json`

---

## Qué hay de nuevo en v2

| Capacidad | v1 | v2 |
|---|---|---|
| Respuestas de texto con datos del censo | ✅ | ✅ |
| **Gráficos interactivos** | ❌ | ✅ |
| **Reportes descargables (PDF)** | ❌ | ✅ |
| **Reportes descargables (Excel)** | ❌ | ✅ |
| Historial de conversación | ✅ | ✅ |
| `max_tokens` por respuesta | 2 048 | **4 096** |
| Iteraciones internas máximas | 5 | **8** |

---

## 1. Flujo general

```
Frontend                         Backend (Aquabot)
───────────────────────────────────────────────────────────
POST /api/chat                →  Claude analiza la pregunta
  { message, history? }            ├─ query_database  (texto)
                                   ├─ generate_chart  (gráfico)
                                   └─ generate_report (archivo)
                              ←  { ok, answer, charts?, report?, history, usage }

                              ←  Si viene report.id:
GET /api/chat/report/:id/pdf  →  Descarga el PDF
GET /api/chat/report/:id/xlsx →  Descarga el Excel
```

---

## 2. POST /api/chat

### Request

```
POST /api/chat
Content-Type: application/json
```

```json
{
  "message": "Genera un reporte del censo con estadísticas por manzana",
  "history": []
}
```

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `message` | `string` | ✅ | Pregunta en lenguaje natural |
| `history` | `array` | ❌ | Historial de turnos previos (ver §5). Omitir o `[]` para conversación nueva |

### Response `200 OK`

```jsonc
{
  "ok": true,
  "answer": "El censo registra **224 predios** en total...",

  // Presente solo cuando Aquabot generó uno o más gráficos
  "charts": [
    {
      "type": "bar",
      "title": "Predios censados por manzana",
      "x_label": "Manzana",
      "y_label": "Cantidad de predios",
      "labels": ["1", "2", "3", "4", "5"],
      "datasets": [
        {
          "label": "Cantidad de predios",
          "data": [18, 22, 15, 30, 12],
          "backgroundColor": "#0ea5e9"
        }
      ]
    }
  ],

  // Presente solo cuando Aquabot generó un reporte descargable
  "report": {
    "id": "a1b2c3d4-...",   // UUID — válido durante 1 hora
    "title": "Reporte del Censo Las Mercedes"
  },

  "history": [
    { "role": "user",      "content": "Genera un reporte..." },
    { "role": "assistant", "content": "El censo registra..." }
  ],
  "usage": {
    "input_tokens": 1240,
    "output_tokens": 320
  }
}
```

| Campo | Tipo | Siempre presente | Descripción |
|---|---|---|---|
| `ok` | `boolean` | ✅ | `true` en respuestas exitosas |
| `answer` | `string` | ✅ | Respuesta en **markdown**. Renderizar con `react-markdown` |
| `charts` | `array` | ❌ | Datos de gráficos. Ver §3 |
| `report` | `object` | ❌ | Referencia a reporte descargable. Ver §4 |
| `history` | `array` | ✅ | Historial actualizado. Guardar y reenviar en el siguiente turno |
| `usage` | `object` | ✅ | Tokens consumidos (debug / analytics) |

---

## 3. Gráficos — campo `charts[]`

Cuando el usuario pide una visualización ("muéstrame una gráfica de...", "¿cómo se distribuyen...?"), la respuesta incluye el campo `charts` con uno o más objetos directamente compatibles con **Chart.js v4**.

### Estructura de cada gráfico

```ts
interface AquabotChart {
  type: 'bar' | 'line' | 'pie' | 'doughnut';
  title: string;
  x_label?: string;   // etiqueta del eje X (bar/line)
  y_label?: string;   // etiqueta del eje Y (bar/line)
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor: string | string[];  // string para bar/line, array para pie/doughnut
    borderColor?: string;                // solo en line
    fill?: boolean;                      // solo en line
    borderWidth?: number;                // solo en line
  }>;
}
```

### Implementación con Chart.js

```bash
npm install chart.js react-chartjs-2
```

```tsx
import { Bar, Line, Pie, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, ArcElement, Title, Tooltip, Legend
} from 'chart.js';

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, ArcElement,
  Title, Tooltip, Legend
);

const CHART_COMPONENTS = { bar: Bar, line: Line, pie: Pie, doughnut: Doughnut };

function AquabotChartRenderer({ chart }: { chart: AquabotChart }) {
  const Component = CHART_COMPONENTS[chart.type];

  const options = {
    responsive: true,
    plugins: {
      legend: { position: 'top' as const },
      title: { display: true, text: chart.title }
    },
    scales: ['bar', 'line'].includes(chart.type) ? {
      x: { title: { display: !!chart.x_label, text: chart.x_label } },
      y: { title: { display: !!chart.y_label, text: chart.y_label }, beginAtZero: true }
    } : undefined
  };

  return (
    <div style={{ maxWidth: 600, margin: '1rem auto' }}>
      <Component data={{ labels: chart.labels, datasets: chart.datasets }} options={options} />
    </div>
  );
}
```

### Renderizado en el componente de chat

```tsx
function ChatMessage({ message }: { message: ChatResponse }) {
  return (
    <div>
      <ReactMarkdown>{message.answer}</ReactMarkdown>

      {message.charts?.map((chart, i) => (
        <AquabotChartRenderer key={i} chart={chart} />
      ))}

      {message.report && (
        <ReportDownloadButtons reportId={message.report.id} title={message.report.title} />
      )}
    </div>
  );
}
```

---

## 4. Reportes descargables — campo `report`

Cuando el usuario pide un informe o reporte ("genera un reporte del censo", "exporta los datos de manzanas"), Aquabot construye un documento estructurado con múltiples secciones y devuelve un `report.id` para descargarlo.

> **TTL:** los reportes expiran **1 hora** después de generarse. Pasado ese tiempo, el servidor devuelve `404`.

### Endpoints de descarga

```
GET /api/chat/report/:id/pdf
GET /api/chat/report/:id/xlsx
```

**No requieren autenticación.** El `id` actúa como token de acceso de un solo uso.

### Contenido de los archivos

| Formato | Descripción |
|---|---|
| **PDF** | A4 apaisado, portada con título y fecha, secciones con tablas formateadas, manejo de saltos de página automático |
| **Excel** | Hoja "Información" con resúmenes de texto + una hoja por cada tabla, encabezados con color, anchos automáticos de columna |

Cada sección de tabla incluye hasta **500 filas**. Si se truncó, se indica al pie.

### Componente de botones de descarga

```tsx
function ReportDownloadButtons({ reportId, title }: { reportId: string; title: string }) {
  const base = `/api/chat/report/${reportId}`;

  return (
    <div className="report-download-card">
      <p>📄 <strong>{title}</strong> listo para descargar</p>
      <div className="download-buttons">
        <a
          href={`${base}/pdf`}
          download
          className="btn btn-primary"
        >
          ⬇ Descargar PDF
        </a>
        <a
          href={`${base}/xlsx`}
          download
          className="btn btn-secondary"
        >
          ⬇ Descargar Excel
        </a>
      </div>
      <small className="text-muted">El enlace expira en 1 hora</small>
    </div>
  );
}
```

> **Nota:** usar `<a href="..." download>` en lugar de `fetch()` para que el navegador abra el diálogo de "Guardar archivo" directamente.

---

## 5. Historial de conversación

Para que Aquabot recuerde el contexto entre mensajes, el frontend debe:

1. Guardar el array `history` devuelto en cada respuesta.
2. Enviarlo en el campo `history` de la siguiente petición.

El backend aplica un límite de **20 turnos** (40 mensajes). Los turnos más viejos se descartan automáticamente.

```ts
// Hook de ejemplo en React
const [history, setHistory] = useState<HistoryEntry[]>([]);

async function sendMessage(userText: string) {
  setLoading(true);

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: userText, history })
  });

  const data: ChatResponse = await res.json();

  if (data.ok) {
    setHistory(data.history);   // actualizar historial
    addMessageToUI(data);        // renderizar answer + charts + report
  } else {
    showError(data.message);
  }

  setLoading(false);
}

// Reiniciar conversación
function resetChat() {
  setHistory([]);
}
```

---

## 6. Tiempos de respuesta esperados

| Tipo de pregunta | Tiempo aprox. |
|---|---|
| Pregunta conceptual (sin BD) | 1–2 s |
| Consulta simple (1 query SQL) | 2–4 s |
| Gráfico (1 query + procesamiento) | 3–5 s |
| Reporte complejo (múltiples queries) | 5–12 s |

Mostrar siempre un **indicador de carga** mientras se espera la respuesta. Para reportes complejos, considerar un mensaje más descriptivo: "Generando reporte, esto puede tardar unos segundos…"

---

## 7. Errores

| HTTP | `ok` | Causa | `message` |
|---|---|---|---|
| `400` | `false` | `message` vacío o faltante | `"El campo \"message\" es requerido."` |
| `404` | `false` | Reporte expirado o ID inválido | `"Reporte no encontrado o expirado."` |
| `429` | `false` | Límite de Claude alcanzado | `"Límite de uso de Claude alcanzado. Intenta en un momento."` |
| `503` | `false` | `ANTHROPIC_API_KEY` no configurada | `"El chatbot no está configurado (ANTHROPIC_API_KEY faltante)."` |
| `500` | `false` | Error interno | `"Error interno del chatbot."` |

**Manejo recomendado:**

```ts
if (!data.ok) {
  if (res.status === 503) showBanner('Chatbot temporalmente no disponible');
  else if (res.status === 429) showRetryMessage('Demasiadas consultas, espera un momento');
  else if (res.status === 404) showError('El reporte expiró. Pide uno nuevo al chatbot');
  else showError(data.message ?? 'Error inesperado');
}
```

---

## 8. Tipos TypeScript completos

```ts
// Entrada
interface ChatRequest {
  message: string;
  history?: HistoryEntry[];
}

interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

// Salida
interface ChatResponse {
  ok: boolean;
  answer: string;
  charts?: AquabotChart[];
  report?: {
    id: string;    // UUID — válido 1 hora
    title: string;
  };
  history: HistoryEntry[];
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  message?: string; // presente en errores
}

interface AquabotChart {
  type: 'bar' | 'line' | 'pie' | 'doughnut';
  title: string;
  x_label?: string;
  y_label?: string;
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor: string | string[];
    borderColor?: string;
    fill?: boolean;
    borderWidth?: number;
  }>;
}
```

---

## 9. Preguntas de ejemplo por capacidad

### Texto
- "¿Cuántos predios hay censados en total?"
- "¿Cuántas familias no tienen acceso al agua?"
- "¿Qué formularios están activos en el sistema?"
- "Lista los predios de la manzana 4 con su estado"

### Gráficos (activan `charts[]`)
- "Muéstrame una gráfica de predios por manzana"
- "Gráfico de torta con la distribución de estados de predio"
- "Visualiza el acceso al agua por manzana"
- "Gráfico de barras de habitantes por manzana"

### Reportes (activan `report`)
- "Genera un reporte completo del censo"
- "Crea un informe con todas las manzanas, predios y estadísticas de agua"
- "Exporta los datos de familias y habitantes por predio"
- "Necesito un reporte para la junta del acueducto"

---

## 10. Variables de entorno del servidor

```env
ANTHROPIC_API_KEY=sk-ant-...              # Requerida
CLAUDE_MODEL=claude-haiku-4-5-20251001    # Opcional — default: Haiku (rápido y económico)
```

**Modelos disponibles:**

| Modelo | Velocidad | Costo | Uso recomendado |
|---|---|---|---|
| `claude-haiku-4-5-20251001` | ⚡ Rápido | $ Bajo | Default. Consultas de datos, reportes rutinarios |
| `claude-sonnet-4-6` | Medio | $$ Medio | Reportes complejos, análisis con múltiples variables |

---

## 11. Ejemplo de integración completa

```tsx
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Bar, Pie, Line, Doughnut } from 'react-chartjs-2';

const CHART_COMPONENTS = { bar: Bar, pie: Pie, line: Line, doughnut: Doughnut };

export function AquabotChat() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Array<{ role: string; content: any }>>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    if (!input.trim() || loading) return;
    const userText = input.trim();
    setInput('');
    setLoading(true);

    setMessages(prev => [...prev, { role: 'user', content: userText }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText, history })
      });
      const data: ChatResponse = await res.json();

      if (data.ok) {
        setHistory(data.history);
        setMessages(prev => [...prev, { role: 'assistant', content: data }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'error',
          content: data.message ?? 'Error inesperado'
        }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'error', content: 'Sin conexión con el servidor' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message message--${msg.role}`}>
            {msg.role === 'user' && <p>{msg.content}</p>}

            {msg.role === 'assistant' && (
              <>
                <ReactMarkdown>{msg.content.answer}</ReactMarkdown>

                {msg.content.charts?.map((chart: AquabotChart, ci: number) => {
                  const ChartComp = CHART_COMPONENTS[chart.type];
                  return (
                    <div key={ci} className="chart-wrapper">
                      <ChartComp
                        data={{ labels: chart.labels, datasets: chart.datasets }}
                        options={{
                          responsive: true,
                          plugins: { title: { display: true, text: chart.title } }
                        }}
                      />
                    </div>
                  );
                })}

                {msg.content.report && (
                  <div className="report-download">
                    <span>📄 {msg.content.report.title}</span>
                    <a href={`/api/chat/report/${msg.content.report.id}/pdf`} download>
                      ⬇ PDF
                    </a>
                    <a href={`/api/chat/report/${msg.content.report.id}/xlsx`} download>
                      ⬇ Excel
                    </a>
                  </div>
                )}
              </>
            )}

            {msg.role === 'error' && (
              <p className="error-text">{msg.content}</p>
            )}
          </div>
        ))}

        {loading && <div className="message message--loading">Aquabot está analizando…</div>}
      </div>

      <div className="chat-input">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Pregunta sobre el censo, pide una gráfica o un reporte…"
          disabled={loading}
        />
        <button onClick={handleSend} disabled={loading || !input.trim()}>
          Enviar
        </button>
        <button onClick={() => { setHistory([]); setMessages([]); }}>
          Nueva conversación
        </button>
      </div>
    </div>
  );
}
```
