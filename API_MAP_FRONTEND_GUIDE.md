# Guía de Integración Frontend — Gemelo Digital (Módulo Map)

Esta guía explica exactamente cómo consumir el endpoint del mapa desde el frontend para renderizar el gemelo digital interactivo de AquaNova.

---

## Tabla de Contenidos

1. [Contexto: cómo funciona el mapa](#contexto)
2. [Endpoint a consumir](#endpoint)
3. [Estructura de la respuesta](#estructura-de-la-respuesta)
4. [Cómo renderizar el SVG](#cómo-renderizar-el-svg)
5. [Colores por estado](#colores-por-estado)
6. [Interactividad: clic en un predio](#interactividad)
7. [Actualizar un predio](#actualizar-un-predio)
8. [Ejemplo completo React](#ejemplo-completo-react)
9. [Ejemplo completo Vanilla JS](#ejemplo-completo-vanilla-js)
10. [Errores comunes](#errores-comunes)

---

## Contexto

El SVG original (`Mapa.svg`, creado en Inkscape) contiene 349 trazos `<path>`, uno por predio del barrio **San Miguel de la Cañada**. Cada path fue procesado y guardado en la tabla `lots` con su trazo SVG original intacto.

El endpoint devuelve esos mismos trazos SVG junto con los datos de cada predio (estado, medidor, etc.), listos para renderizarse directamente dentro de un elemento `<svg>` usando el `viewBox` provisto.

**Sistema de coordenadas del SVG:** `0 0 1103 667` (ancho × alto en unidades SVG, originado desde Inkscape).

---

## Endpoint

```
GET /api/map/digital-twin/:neighborhoodId
```

| Campo | Valor |
|-------|-------|
| Método | `GET` |
| Autenticación | No requerida |
| `neighborhoodId` | ID del barrio (obtenido de `GET /api/map/neighborhoods`) |

Para cargar **todos** los barrios activos a la vez (sin filtro):
```
GET /api/map/digital-twin
```

> **Nota:** Use `GET /api/map/neighborhoods` (público, sin autenticación) para obtener la lista de barrios disponibles para el mapa. No confundir con `GET /api/neighborhoods` que requiere autenticación y es para gestión administrativa.

---

## Estructura de la Respuesta

```json
{
  "ok": true,
  "data": {
    "viewBox": "0 0 1103 667",
    "blocks": [
      {
        "id": "uuid-del-bloque",
        "code": "M-01",
        "geom_path": "M0,0 Z",
        "label_position": null,
        "lots": [
          {
            "id": "uuid-del-predio",
            "number": "Lote-001",
            "status": "sin_informacion",
            "water_meter_code": null,
            "cadastral_id": null,
            "area_m2": 134.25,
            "path": "M 20.154775,15.690966 70.87988,15.555699 70.744613,36.927876 20.290042,36.251541 Z",
            "centroid": { "x": 45.51, "y": 26.31 }
          }
        ]
      }
    ]
  }
}
```

### Campos clave

| Campo | Descripción | Uso en frontend |
|-------|-------------|-----------------|
| `data.viewBox` | Dimensiones del sistema de coordenadas SVG | Atributo `viewBox` del elemento `<svg>` |
| `block.geom_path` | Contorno de la manzana (actualmente placeholder `M0,0 Z`) | Capa de fondo de la manzana (opcional) |
| `lot.path` | **Trazo SVG real del predio**, extraído del plano original | Atributo `d` del elemento `<path>` |
| `lot.centroid` | Centro geométrico `{x, y}` del predio | Posicionar tooltip o etiqueta de número |
| `lot.status` | Estado actual del predio | Color de relleno del `<path>` |

---

## Cómo Renderizar el SVG

El flujo es directo: usar `data.viewBox` en el `<svg>` y `lot.path` como atributo `d` de cada `<path>`.

```html
<svg
  viewBox="0 0 1103 667"
  width="100%"
  style="border: 1px solid #ccc; background: #f5f5f5;"
>
  <!-- Por cada predio: -->
  <path
    d="M 20.154775,15.690966 70.87988,15.555699 ..."
    fill="#9E9E9E"
    stroke="#fff"
    stroke-width="0.3"
  />
</svg>
```

> **Importante:** El `viewBox` debe usarse exactamente como lo retorna el endpoint. No asumas un valor fijo — el endpoint lo calcula dinámicamente desde los metadatos del barrio.

---

## Colores por Estado

Los tres estados del ENUM `lots.status` y su representación visual recomendada:

| Estado | Color recomendado | Hex | Significado |
|--------|------------------|-----|-------------|
| `sin_informacion` | Gris | `#9E9E9E` | Sin datos del predio |
| `censado` | Azul | `#2196F3` | Censo completado |
| `registrado` | Verde | `#4CAF50` | Formalmente registrado |

```javascript
const STATUS_COLORS = {
  sin_informacion: '#9E9E9E',
  censado:         '#2196F3',
  registrado:      '#4CAF50',
};

function getColor(status) {
  return STATUS_COLORS[status] || '#9E9E9E';
}
```

---

## Interactividad

Para hacer que un predio responda al clic, escucha los eventos en cada `<path>` y usa el `centroid` para mostrar un tooltip.

```javascript
// Al renderizar cada path, pasa el objeto lot:
path.addEventListener('click', () => handleLotClick(lot));
path.addEventListener('mouseenter', (e) => showTooltip(e, lot));
path.addEventListener('mouseleave', () => hideTooltip());

function handleLotClick(lot) {
  console.log('Predio seleccionado:', lot.id);
  console.log('Estado:', lot.status);
  console.log('Medidor:', lot.water_meter_code);
  // → Abrir modal de detalles / formulario de edición
}

function showTooltip(event, lot) {
  // Mostrar: lot.number, lot.status, lot.area_m2
  // Posicionar en lot.centroid (coordenadas SVG) o en event.clientX/Y
}
```

---

## Actualizar un Predio

Cuando el usuario edita un predio desde la interfaz, enviar `PATCH` al backend:

```javascript
async function updateLot(lotId, changes) {
  // changes puede tener: status, water_meter_code, cadastral_id, number
  const res = await fetch(`/api/map/predios/${lotId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes)
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.message);
  return data;
}

// Ejemplo: marcar como censado
await updateLot('uuid-del-predio', {
  status: 'censado',
  water_meter_code: 'MED-2026-042'
});
// → Actualizar el color del <path> en el DOM sin recargar el mapa
```

---

## Ejemplo Completo React

```jsx
import { useEffect, useState } from 'react';

const STATUS_COLORS = {
  sin_informacion: '#9E9E9E',
  censado:         '#2196F3',
  registrado:      '#4CAF50',
};

export default function MapaGemeloDigital({ neighborhoodId }) {
  const [mapData, setMapData] = useState(null);
  const [selectedLot, setSelectedLot] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = neighborhoodId
      ? `/api/map/digital-twin/${neighborhoodId}`
      : '/api/map/digital-twin';

    fetch(url)
      .then(r => r.json())
      .then(({ ok, data }) => {
        if (ok) setMapData(data);
      })
      .finally(() => setLoading(false));
  }, [neighborhoodId]);

  if (loading) return <p>Cargando mapa...</p>;
  if (!mapData)  return <p>Error al cargar el mapa.</p>;

  return (
    <div>
      <svg
        viewBox={mapData.viewBox}
        width="100%"
        style={{ background: '#f0f0f0', border: '1px solid #ddd' }}
      >
        {mapData.blocks.map(block =>
          block.lots.map(lot => (
            <g key={lot.id}>
              <path
                d={lot.path}
                fill={STATUS_COLORS[lot.status] || '#9E9E9E'}
                stroke="#ffffff"
                strokeWidth="0.3"
                opacity={selectedLot?.id === lot.id ? 0.7 : 1}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedLot(lot)}
              />
              {/* Etiqueta del número del predio */}
              {lot.centroid && (
                <text
                  x={lot.centroid.x}
                  y={lot.centroid.y}
                  fontSize="1.5"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#fff"
                  style={{ pointerEvents: 'none' }}
                >
                  {lot.number.replace('Lote-', '')}
                </text>
              )}
            </g>
          ))
        )}
      </svg>

      {/* Panel de detalle del predio seleccionado */}
      {selectedLot && (
        <div style={{ marginTop: 16, padding: 12, background: '#fff', border: '1px solid #ddd' }}>
          <h3>{selectedLot.number}</h3>
          <p><strong>Estado:</strong> {selectedLot.status}</p>
          <p><strong>Área:</strong> {selectedLot.area_m2} m²</p>
          <p><strong>Medidor:</strong> {selectedLot.water_meter_code || 'Sin asignar'}</p>
          <p><strong>Ficha catastral:</strong> {selectedLot.cadastral_id || 'Sin asignar'}</p>
          <button onClick={() => setSelectedLot(null)}>Cerrar</button>
        </div>
      )}

      {/* Leyenda */}
      <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <span key={status} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 16, height: 16, background: color, display: 'inline-block' }} />
            {status.replace('_', ' ')}
          </span>
        ))}
      </div>
    </div>
  );
}
```

---

## Ejemplo Completo Vanilla JS

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Gemelo Digital AquaNova</title>
  <style>
    #mapa { width: 100%; background: #f0f0f0; border: 1px solid #ccc; }
    path { cursor: pointer; transition: opacity 0.15s; }
    path:hover { opacity: 0.75; }
    #panel { margin-top: 1rem; padding: 1rem; background: #fff; border: 1px solid #ddd; display: none; }
  </style>
</head>
<body>
  <svg id="mapa"></svg>
  <div id="panel"></div>

  <script>
    const BASE_URL = 'http://localhost:3000';
    const STATUS_COLORS = {
      sin_informacion: '#9E9E9E',
      censado:         '#2196F3',
      registrado:      '#4CAF50',
    };

    async function cargarMapa(neighborhoodId) {
      const url = neighborhoodId
        ? `${BASE_URL}/api/map/digital-twin/${neighborhoodId}`
        : `${BASE_URL}/api/map/digital-twin`;

      const res = await fetch(url);
      const { ok, data } = await res.json();
      if (!ok) return console.error('Error al cargar mapa');

      const svg = document.getElementById('mapa');
      svg.setAttribute('viewBox', data.viewBox);

      // Limpiar
      svg.innerHTML = '';

      // Renderizar predios
      for (const block of data.blocks) {
        for (const lot of block.lots) {
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', lot.path);
          path.setAttribute('fill', STATUS_COLORS[lot.status] || '#9E9E9E');
          path.setAttribute('stroke', '#ffffff');
          path.setAttribute('stroke-width', '0.3');

          path.addEventListener('click', () => mostrarDetalle(lot, path));
          svg.appendChild(path);

          // Etiqueta en el centroide
          if (lot.centroid) {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', lot.centroid.x);
            text.setAttribute('y', lot.centroid.y);
            text.setAttribute('font-size', '1.5');
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('fill', '#fff');
            text.style.pointerEvents = 'none';
            text.textContent = lot.number.replace('Lote-', '');
            svg.appendChild(text);
          }
        }
      }
    }

    function mostrarDetalle(lot, pathEl) {
      const panel = document.getElementById('panel');
      panel.style.display = 'block';
      panel.innerHTML = `
        <h3>${lot.number}</h3>
        <p><strong>Estado:</strong> ${lot.status.replace('_', ' ')}</p>
        <p><strong>Área:</strong> ${lot.area_m2} m²</p>
        <p><strong>Medidor:</strong> ${lot.water_meter_code || 'Sin asignar'}</p>
        <p><strong>Ficha catastral:</strong> ${lot.cadastral_id || 'Sin asignar'}</p>
        <button onclick="document.getElementById('panel').style.display='none'">Cerrar</button>
      `;
    }

    // Inicializar: cargar todas las barrios activos
    cargarMapa();
  </script>
</body>
</html>
```

---

## Errores Comunes

### El mapa se ve desencuadrado o en la esquina
**Causa:** El `viewBox` del `<svg>` no coincide con las coordenadas reales de los paths.  
**Solución:** Usar siempre el `viewBox` que retorna el endpoint (`data.viewBox`), nunca hardcodearlo en el frontend.

### Los predios no aparecen
**Causa 1:** El barrio tiene `is_active = 0`.  
**Causa 2:** El `neighborhoodId` no existe.  
**Solución:** Verificar con `GET /api/map/neighborhoods` que el barrio aparezca en la lista.

### Los paths no se renderizan correctamente
**Causa:** El atributo `d` del `<path>` debe establecerse con `setAttribute('d', lot.path)` en JS, no con la propiedad `d.innerHTML`.
**Solución:** Siempre usar `element.setAttribute('d', lot.path)` o la prop JSX `d={lot.path}`.

### El texto de las etiquetas tapa los predios
**Causa:** El `font-size` está en unidades del sistema de coordenadas SVG (no pixels). Con `viewBox="0 0 1103 667"`, un `font-size="12"` es muy grande.  
**Solución:** Usar valores pequeños como `font-size="1.5"` o `font-size="2"`.
