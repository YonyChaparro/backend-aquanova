# Documentación Técnica — Datos requeridos por el Frontend (Aquanova)

Esta documentación describe qué datos debe consultar y exponer el backend para que el mapa digital funcione correctamente. Está escrita desde la perspectiva del backend.

---

## Endpoints consumidos por el frontend

### 1. `GET /map/digital-twin/:neighborhoodId`

Es el endpoint principal. El frontend lo llama al seleccionar un barrio y espera **toda la estructura geográfica del sector** con sus predios y manzanas.

#### Estructura de respuesta esperada

```json
{
  "data": {
    "blocks": [
      {
        "id": "uuid-de-la-manzana",
        "code": "M-01",
        "lots": [
          {
            "id": "uuid-del-predio",
            "number": "3",
            "path": "M 10,20 L 50,20 L 50,60 L 10,60 Z",
            "area_m2": 120,
            "version": 1
          }
        ]
      }
    ]
  }
}
```

#### Campos requeridos — tabla `blocks` (manzanas)

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | Identificador único de la manzana |
| `code` | string | Nombre/código visible (ej: `"M-01"`, `"M-02"`) |
| `lots` | array | Lista de predios que pertenecen a esta manzana |

#### Campos requeridos — tabla `lots` / `predios`

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | Identificador único del predio. Se usa para cruzar con el censo |
| `number` | string | Número del predio dentro de la manzana (ej: `"3"`, `"12"`) |
| `path` | string | Geometría SVG del predio para dibujarlo en el mapa |
| `area_m2` | number | Área del predio en metros cuadrados |
| `version` | number | Versión del registro (usado en operaciones de unión/división) |

> El frontend genera automáticamente el `display_id` concatenando `block.code + lot.number` (ej: `"M-01-03"`). No es necesario que el backend lo calcule.

---

### 2. `GET /map/neighborhoods`

Devuelve la lista de barrios disponibles para el selector de la UI.

#### Estructura esperada

```json
[
  { "id": "uuid-barrio", "name": "Las Mercedes" },
  { "id": "uuid-barrio-2", "name": "Otro Barrio" }
]
```

---

### 3. `GET /map/available-lots/:neighborhoodId`

Lista de predios disponibles (sin asignar o libres) dentro de un barrio. Se usa en flujos de edición.

---

### 4. `PATCH /map/predios/:lotId`

Actualiza información de un predio. El frontend envía un objeto parcial con los campos que cambiaron.

#### Payload de ejemplo

```json
{
  "number": "5",
  "area_m2": 135
}
```

---

### 5. `PATCH /map/blocks/:blockId`

Actualiza el nombre/código de una manzana.

#### Payload

```json
{
  "code": "M-01"
}
```

---

### 6. `POST /map/topology-update`

Se llama cuando el usuario une o divide predios en el mapa. El backend debe aplicar los cambios estructurales en la BD.

---

## Datos del censo — Pendiente de integración

Actualmente los datos del censo están en un archivo local mock (`censosMockData.js`). El backend debe exponer un endpoint que devuelva esta información para que el frontend pueda cruzarla con los predios del mapa.

### Campos que el frontend necesita por cada registro de censo

El cruce entre predio y censo se hace por el campo **`lot_id` (UUID del predio)**. Este debe estar presente en cada registro de censo.

| Campo en censo | Descripción | Ejemplo |
|---|---|---|
| `lot_id` | UUID del predio al que corresponde el censo | `"1957f97a-..."` |
| `id_respuesta` | UUID único de la respuesta del censo | `"f4f235f7-..."` |
| `fecha_creacion` | Fecha y hora del registro | `"2026-04-12 11:25:52"` |
| `barrio` | Nombre del barrio | `"Las Mercedes"` |
| `manzana` | Número de manzana (entero) | `4` |
| `direccion` | Dirección física del predio | `"Calle 37 Sur # 16 - 17/43"` |
| `tipo_punto` | Tipo de uso del punto | `"Und. Hab./No Hab. Única"` |
| `clase_uso` | Clase de uso (residencial, comercial, etc.) | `"Residencial"` |
| `estado_predio` | Estado actual del predio | `"Predio Solo (Habitado)"` |
| `unidades_habitacionales` | Cantidad de unidades en el predio | `1` |
| `numero_habitantes` | Número de personas que habitan | `8` |
| `numero_familias` | Número de familias | `4` |
| `tiene_agua` | Si el predio tiene acceso a agua | `"Sí"` / `"No"` |
| `horas_agua` | Horas diarias de suministro de agua | `"24"` |
| `registro` | Código del medidor de agua | `"38002701"` |
| `plano` | Número de plano catastral | `"..."` |
| `observaciones` | Notas del inspector | `"De dos pisos..."` |
| `inspector_nombre` | Nombre del inspector que realizó el censo | `"Javier García"` |
| `atendio_nombre` | Nombre de quien atendió la visita | `"José Alfredo..."` |
| `atendio_rol` | Rol de quien atendió | `"Arrendatario"` |
| `foto_fachada` | URL de la foto de fachada | `"https://res.cloudinary.com/..."` |
| `firma_digital` | URL de la firma digital | `"https://res.cloudinary.com/..."` |

### Lógica del `status` que aplica el frontend

El frontend asigna un estado visual a cada predio según los datos del censo:

```
¿Tiene registro de censo?
    ├── SÍ → ¿Tiene código de medidor (registro)?
    │         ├── SÍ → status = "registrado"   (color verde)
    │         └── NO → status = "censado"       (color azul)
    └── NO → status = "sin_informacion"         (color gris)
```

---

## Resumen de endpoints

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/map/digital-twin/:neighborhoodId` | Estructura geográfica completa del barrio |
| `GET` | `/map/neighborhoods` | Lista de barrios |
| `GET` | `/map/available-lots/:neighborhoodId` | Predios disponibles en un barrio |
| `PATCH` | `/map/predios/:lotId` | Actualiza datos de un predio |
| `PATCH` | `/map/blocks/:blockId` | Actualiza nombre de una manzana |
| `POST` | `/map/topology-update` | Aplica unión o división de predios |
| `GET` | *(pendiente)* | Datos del censo por barrio o por predio |
