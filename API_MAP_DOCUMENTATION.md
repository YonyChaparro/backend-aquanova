# Documentación API — Módulo Map (Gemelo Digital)

Gestión y consulta del gemelo digital: bloques, predios y barrios del proyecto AquaNova.

---

## Tabla de Contenidos

1. [Descripción General](#descripción-general)
2. [Endpoints](#endpoints)
   - [GET /api/map/digital-twin](#1-obtener-gemelo-digital-completo)
   - [GET /api/map/digital-twin/:neighborhoodId](#2-obtener-gemelo-digital-por-barrio)
   - [PATCH /api/map/predios/:lotId](#3-actualizar-predio)
   - [GET /api/map/neighborhoods](#4-listar-barrios-disponibles)
3. [Estructuras de Datos](#estructuras-de-datos)
4. [Casos de Uso](#casos-de-uso)
5. [Notas Técnicas](#notas-técnicas)

---

## Descripción General

| Campo | Valor |
|-------|-------|
| Prefijo base | `/api/map` |
| Autenticación | **No requerida** en ningún endpoint de este módulo |
| Formato | JSON |

> **Importante:** Todos los endpoints del módulo Map **filtran automáticamente** por barrios activos (`neighborhoods.is_active = 1`). Los bloques, predios y barrios inactivos **no se exponen** en ningún endpoint.

El módulo Map expone los datos geoespaciales del proyecto mediante caminos SVG pre-calculados en la base de datos, los cuales pueden renderizarse directamente en un elemento `<svg>`.

Los estados posibles de un predio (`lots.status`) son:

| Valor | Descripción |
|-------|-------------|
| `sin_informacion` | Predio sin datos registrados |
| `censado` | Predio con censo completado |
| `registrado` | Predio formalmente registrado en el sistema |

---

## Endpoints

### 1. Obtener Gemelo Digital Completo

```
GET /api/map/digital-twin
```

**Autenticación:** No requerida
**Descripción:** Retorna todos los bloques y predios del proyecto que pertenezcan a barrios **activos**.

#### Respuesta exitosa `200 OK`

```json
{
  "ok": true,
  "data": {
    "viewBox": "0 0 1103 667",
    "blocks": [
      {
        "id": "uuid-block-1",
        "code": "BLQ-001",
        "geom_path": "M 100 100 L 200 100 L 200 200 L 100 200 Z",
        "label_position": {
          "x": 150,
          "y": 150
        },
        "lots": [
          {
            "id": "uuid-lot-1",
            "number": "1",
            "status": "sin_informacion",
            "water_meter_code": null,
            "cadastral_id": null,
            "area_m2": 150.50,
            "path": "M 100 100 L 150 100 L 150 150 L 100 150 Z",
            "centroid": {
              "x": 125,
              "y": 125
            }
          },
          {
            "id": "uuid-lot-2",
            "number": "2",
            "status": "censado",
            "water_meter_code": "MED-2026-001",
            "cadastral_id": "CAD-001-A",
            "area_m2": 160.75,
            "path": "M 150 100 L 200 100 L 200 150 L 150 150 Z",
            "centroid": {
              "x": 175,
              "y": 125
            }
          }
        ]
      }
    ]
  }
}
```

#### Errores

| Código | Mensaje | Causa |
|--------|---------|-------|
| `500` | `"Error obteniendo los datos del mapa."` | Error interno del servidor |

---

### 2. Obtener Gemelo Digital por Barrio

```
GET /api/map/digital-twin/:neighborhoodId
```

**Autenticación:** No requerida  
**Descripción:** Igual que el endpoint anterior, pero filtra por un barrio específico. El barrio debe estar **activo** para obtener resultados; si está inactivo, se retorna `blocks: []`.

#### Parámetros de ruta

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `neighborhoodId` | `string (UUID)` | Sí | ID del barrio activo por el que filtrar |

#### Respuesta exitosa `200 OK`

```json
{
  "ok": true,
  "data": {
    "viewBox": "0 0 1103 667",
    "blocks": [
      {
        "id": "uuid-block-1",
        "code": "BLQ-001",
        "geom_path": "M 100 100 L 200 100 L 200 200 L 100 200 Z",
        "label_position": { "x": 150, "y": 150 },
        "lots": [ "..." ]
      }
    ]
  }
}
```

> Si el `neighborhoodId` está inactivo, no existe, o no tiene bloques, se retorna `blocks: []` con `200 OK`.

#### Errores

| Código | Mensaje | Causa |
|--------|---------|-------|
| `500` | `"Error obteniendo los datos del mapa."` | Error interno del servidor |

---

### 3. Actualizar Predio

```
PATCH /api/map/predios/:lotId
```

**Autenticación:** No requerida  
**Descripción:** Actualiza uno o más campos de un predio. Solo se modifican los campos incluidos en el body; los omitidos quedan intactos.

#### Parámetros de ruta

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `lotId` | `string (UUID)` | Sí | ID del predio a actualizar |

#### Body `application/json`

```json
{
  "status": "censado",
  "water_meter_code": "MED-2026-001",
  "cadastral_id": "CAD-001-A",
  "number": "1A"
}
```

#### Campos actualizables

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `status` | `string` | Estado del predio: `sin_informacion`, `censado` o `registrado` |
| `water_meter_code` | `string` | Código del medidor de agua asignado |
| `cadastral_id` | `string` | Identificador catastral del predio |
| `number` | `string` | Número o etiqueta del predio |

> Al menos uno de los campos anteriores debe estar presente. El resto es opcional.

#### Respuesta exitosa `200 OK`

```json
{
  "ok": true,
  "message": "Predio actualizado exitosamente."
}
```

#### Errores

| Código | Mensaje | Causa |
|--------|---------|-------|
| `400` | `"No hay datos para actualizar."` | Body vacío o sin ningún campo válido |
| `500` | `"Error interno al actualizar predio."` | Error interno del servidor |

---

### 4. Listar Barrios Disponibles

```
GET /api/map/neighborhoods
```

**Autenticación:** No requerida
**Descripción:** Retorna únicamente los barrios con `is_active = 1`, ordenados alfabéticamente. Útil para poblar selectores o filtros de la interfaz antes de cargar el mapa.

> **Nota:** Este endpoint es diferente de `GET /api/neighborhoods` (que requiere autenticación y retorna todos los barrios con su jerarquía completa). Use este endpoint (`/api/map/neighborhoods`) para el renderizado público del mapa.

#### Respuesta exitosa `200 OK`

```json
{
  "ok": true,
  "data": [
    {
      "id": "uuid-nei-1",
      "name": "Barrio Centro",
      "code": "CEN-01"
    },
    {
      "id": "uuid-nei-2",
      "name": "Barrio Norte",
      "code": "NOR-01"
    }
  ]
}
```

> Los barrios con `is_active = 0` no se incluyen en esta lista.

#### Errores

| Código | Mensaje | Causa |
|--------|---------|-------|
| `500` | `"Error interno al obtener los sectores."` | Error interno del servidor |

---

## Estructuras de Datos

### Block

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | `string` | UUID único del bloque |
| `code` | `string` | Código identificador del bloque (ej. `"BLQ-001"`) |
| `geom_path` | `string` | Camino SVG que define el contorno del bloque |
| `label_position` | `{ x: number, y: number }` | Coordenadas donde se debe colocar el label del bloque |
| `lots` | `Lot[]` | Predios contenidos en el bloque |

### Lot

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | `string` | UUID único del predio |
| `number` | `string` | Número o etiqueta del predio |
| `status` | `"sin_informacion" \| "censado" \| "registrado"` | Estado actual del predio |
| `water_meter_code` | `string \| null` | Código del medidor de agua asignado |
| `cadastral_id` | `string \| null` | Identificador catastral |
| `area_m2` | `number` | Área en metros cuadrados |
| `path` | `string` | Camino SVG que define el contorno del predio |
| `centroid` | `{ x: number, y: number }` | Coordenadas del centroide del predio |

### Neighborhood (en `/map/neighborhoods`)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | `string` | UUID único del barrio |
| `name` | `string` | Nombre del barrio |
| `code` | `string` | Código identificador del barrio |

---

## Casos de Uso

### Mostrar mapa interactivo de un barrio

```javascript
// 1. Cargar solo barrios activos para el selector
const res = await fetch('/api/map/neighborhoods');
const { data: neighborhoods } = await res.json();
// → populateSelect(neighborhoods)

// 2. Al seleccionar un barrio, cargar su mapa
const neighborhoodId = selectEl.value;
const mapRes = await fetch(`/api/map/digital-twin/${neighborhoodId}`);
const { data: mapData } = await mapRes.json();
// → renderMap(mapData.viewBox, mapData.blocks)
```

### Actualizar estado de un predio tras censo

```javascript
const result = await fetch(`/api/map/predios/${lotId}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    status: 'censado',
    water_meter_code: 'MED-2026-099',
    cadastral_id: 'CAD-ABC-123'
  })
});

const data = await result.json();
if (data.ok) {
  console.log(data.message); // "Predio actualizado exitosamente."
}
```

### Cargar mapa completo y estadísticas

```javascript
const res = await fetch('/api/map/digital-twin');
const { data } = await res.json();

const todos = data.blocks.flatMap(b => b.lots);
const sinInfo  = todos.filter(l => l.status === 'sin_informacion').length;
const censados = todos.filter(l => l.status === 'censado').length;
const registrados = todos.filter(l => l.status === 'registrado').length;

console.log(`Total: ${todos.length} | Sin info: ${sinInfo} | Censados: ${censados} | Registrados: ${registrados}`);
```

---

## Notas Técnicas

- **Filtro de barrios activos:** Tanto `getBlocksAndLots` como `getAllNeighborhoods` en el modelo aplican `n.is_active = 1` vía `INNER JOIN` y `WHERE` respectivamente. Los barrios inactivos no se exponen en ningún endpoint.
- **Sin autenticación:** Ningún endpoint de este módulo usa el middleware `verifyToken`. Si en el futuro se protegen, se debe añadir `Authorization: Bearer <token>`.
- **SVG paths:** Los campos `geom_path` (bloque) y `path` (predio) contienen comandos SVG estándar y pueden usarse directamente como atributo `d` de un elemento `<path>`.
- **Centroide y label_position:** Almacenados como JSON en la BD y parseados automáticamente en el controlador. Útiles para posicionar etiquetas sobre el mapa SVG.
- **viewBox dinámico:** El valor del `viewBox` se extrae del campo `metadata` del barrio (guardado al procesar el plano). Si el barrio no tiene metadata, se usa el fallback `"0 0 1103 667"` (dimensiones del SVG de San Miguel de la Cañada).
- **Bloque sin predios:** Un bloque puede existir sin predios asociados; en ese caso su array `lots` será vacío (`[]`).
- **Actualización parcial:** `PATCH /predios/:lotId` construye la sentencia `UPDATE` dinámicamente con solo los campos recibidos en el body.
