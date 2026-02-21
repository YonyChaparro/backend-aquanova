# Documentación del módulo Map (Gemelo Digital)

Esta documentación describe los endpoints del módulo Map, que gestiona la visualización del gemelo digital con bloques y predios del proyecto AquaNova.

## Descripción General

El módulo Map proporciona acceso a la información geoespacial del proyecto, permitiendo:
- Obtener la estructura completa del mapa (bloques y predios)
- Filtrar datos por barrio específico
- Actualizar información de predios individuales
- Listar barrios disponibles

## Endpoints

### 1. Obtener Gemelo Digital Completo

**URL:** `GET /api/map/digital-twin`  
**Método:** `GET`  
**Autenticación:** No requerida  

#### Descripción
Retorna la información completa del gemelo digital con todos los bloques y predios del proyecto.

#### Respuesta (200 OK)

```json
{
  "ok": true,
  "data": {
    "viewBox": "0 0 1200 800",
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
            "status": "disponible",
            "water_meter_code": "MED-2026-001",
            "cadastral_id": "CAD-001-A",
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
            "status": "ocupado",
            "water_meter_code": "MED-2026-002",
            "cadastral_id": "CAD-001-B",
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

**500 Internal Server Error**
```json
{
  "ok": false,
  "message": "Error obteniendo los datos del mapa."
}
```

---

### 2. Obtener Gemelo Digital por Barrio

**URL:** `GET /api/map/digital-twin/:neighborhoodId`  
**Método:** `GET`  
**Autenticación:** No requerida  

#### Parámetros

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `neighborhoodId` | string | Sí | ID único del barrio |

#### Descripción
Retorna la información del gemelo digital filtrada para un barrio específico.

#### Ejemplo de Uso

```javascript
// JavaScript/Fetch
async function getMapByNeighborhood(neighborhoodId) {
  try {
    const response = await fetch(
      `http://localhost:3000/api/map/digital-twin/${neighborhoodId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Error al obtener datos del mapa');
    }

    return data.data; // Retorna el objeto con viewBox y blocks
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

// Uso
getMapByNeighborhood('uuid-neighborhood-1').then(mapData => {
  console.log('Bloques del barrio:', mapData.blocks);
});
```

#### Respuesta (200 OK)
La respuesta tiene la misma estructura que el endpoint completo, pero solo incluye bloques y predios del barrio especificado.

#### Errores

**500 Internal Server Error**
```json
{
  "ok": false,
  "message": "Error obteniendo los datos del mapa."
}
```

---

### 3. Actualizar Información de un Predio

**URL:** `PATCH /api/map/predios/:lotId`  
**Método:** `PATCH`  
**Autenticación:** No requerida  

#### Parámetros

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `lotId` | string | Sí | ID único del predio |

#### Body (application/json)

```json
{
  "status": "ocupado",
  "water_meter_code": "MED-2026-001",
  "cadastral_id": "CAD-001-A",
  "number": "1A"
}
```

**Nota:** Todos los campos son opcionales. Solo se actualizarán los campos proporcionados.

#### Campos Actualizables

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `status` | string | Estado del predio (disponible, ocupado, etc.) |
| `water_meter_code` | string | Código del medidor de agua |
| `cadastral_id` | string | ID catastral del predio |
| `number` | string | Número del predio |

#### Descripción
Actualiza la información de un predio específico. Permite actualizar el estado, código de medidor, ID catastral o número del predio.

#### Ejemplo de Uso

```javascript
// JavaScript/Fetch
async function updateLotInfo(lotId, updateData) {
  try {
    const response = await fetch(
      `http://localhost:3000/api/map/predios/${lotId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Error al actualizar predio');
    }

    return data;
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

// Uso - actualizar solo el estado
updateLotInfo('uuid-lot-1', { status: 'ocupado' }).then(result => {
  console.log(result.message); // "Predio actualizado exitosamente."
});

// Uso - actualizar múltiples campos
updateLotInfo('uuid-lot-1', {
  status: 'ocupado',
  water_meter_code: 'MED-2026-NEW',
  number: '1B'
}).then(result => {
  console.log(result.message);
});
```

#### Respuesta (200 OK)

```json
{
  "ok": true,
  "message": "Predio actualizado exitosamente."
}
```

#### Errores

**400 Bad Request** (No hay datos para actualizar)
```json
{
  "ok": false,
  "message": "No hay datos para actualizar."
}
```

**500 Internal Server Error**
```json
{
  "ok": false,
  "message": "Error interno al actualizar predio."
}
```

---

### 4. Obtener Lista de Barrios

**URL:** `GET /api/map/neighborhoods`  
**Método:** `GET`  
**Autenticación:** No requerida  

#### Descripción
Retorna una lista completa de barrios ordenados alfabéticamente. Útil para poblar selectores o filtros en la interfaz.

#### Respuesta (200 OK)

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
    },
    {
      "id": "uuid-nei-3",
      "name": "Barrio Sur",
      "code": "SUR-01"
    }
  ]
}
```

#### Ejemplo de Uso

```javascript
// JavaScript/Fetch
async function getNeighborhoods() {
  try {
    const response = await fetch(
      'http://localhost:3000/api/map/neighborhoods',
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Error al obtener barrios');
    }

    return data.data;
  } catch (error) {
    console.error('Error:', error);
    return [];
  }
}

// Uso - poblar un select
getNeighborhoods().then(neighborhoods => {
  neighborhoods.forEach(neighborhood => {
    console.log(`${neighborhood.name} (${neighborhood.code})`);
  });
});
```

#### Errores

**500 Internal Server Error**
```json
{
  "ok": false,
  "message": "Error interno al obtener los sectores."
}
```

---

## Estructura de Datos

### Block Object

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | string | ID único del bloque |
| `code` | string | Código identificador del bloque |
| `geom_path` | string | SVG path que define la geometría del bloque |
| `label_position` | object | Posición {x, y} para el label del bloque |
| `lots` | array | Array de predios contenidos en el bloque |

### Lot Object

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | string | ID único del predio |
| `number` | string | Número del predio |
| `status` | string | Estado actual del predio |
| `water_meter_code` | string | Código del medidor de agua asignado |
| `cadastral_id` | string | ID catastral del predio |
| `area_m2` | number | Área del predio en metros cuadrados |
| `path` | string | SVG path que define la geometría del predio |
| `centroid` | object | Posición {x, y} del centroide del predio |

### Neighborhood Object

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | string | ID único del barrio |
| `name` | string | Nombre del barrio |
| `code` | string | Código identificador del barrio |

---

## Casos de Uso Comunes

### Caso 1: Mostrar mapa interactivo de un barrio
```javascript
// 1. Obtener lista de barrios para el selector
const neighborhoods = await getNeighborhoods();
populateSelect(neighborhoods);

// 2. Cuando el usuario selecciona un barrio
const selectedNeighborhoodId = document.getElementById('neighborhoodSelect').value;
const mapData = await getMapByNeighborhood(selectedNeighborhoodId);

// 3. Renderizar SVG con bloques y predios
renderMapFromData(mapData);
```

### Caso 2: Actualizar estado de un predio
```javascript
// Cuando el usuario interactúa con un predio en el mapa
const lotId = clickedLot.id;
const updatedStatus = 'ocupado';

const result = await updateLotInfo(lotId, { 
  status: updatedStatus,
  water_meter_code: 'MED-2026-NEW' 
});

if (result.ok) {
  showNotification('Predio actualizado exitosamente');
  refreshMap();
}
```

### Caso 3: Obtener información completa del proyecto
```javascript
// Para dashboards o reportes que necesiten toda la información
const completeMapData = await getCompleteMap();

// Contar total de predios
const totalLots = completeMapData.blocks.reduce(
  (sum, block) => sum + block.lots.length, 
  0
);

// Obtener predios por estado
const occupiedLots = [];
completeMapData.blocks.forEach(block => {
  occupiedLots.push(...block.lots.filter(lot => lot.status === 'ocupado'));
});
```

---

## Notas Técnicas

- **SVG Paths**: Los datos `geom_path` y `path` en los objetos Block y Lot contienen comandos SVG estándar que pueden renderizarse directamente en un elemento `<svg>`.
- **Centroide de Predios**: La propiedad `centroid` indica el punto central del predio, útil para posicionar labels o íconos.
- **Label Position**: En bloques, la propiedad `label_position` define dónde se debe mostrar el código del bloque.
- **Ordenamiento**: Los barrios se retornan ordenados alfabéticamente por nombre.

---

## Consideraciones de Performance

- El endpoint `/digital-twin` sin filtros puede retornar grandes cantidades de datos si hay muchos bloques y predios. Considere usar el endpoint filtrado por barrio cuando sea posible.
- Los datos geométricos (SVG paths) son pre-computados en la base de datos para optimizar la respuesta.
