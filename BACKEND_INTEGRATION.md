# Integración Backend — Selector de Lote en Formularios Públicos

Este documento describe los contratos que el backend debe cumplir para que el selector de mapa funcione correctamente dentro de cualquier formulario público de Aquanova.

---

## Índice

1. [Visión general del flujo](#1-visión-general-del-flujo)
2. [Endpoint: obtener formulario público](#2-endpoint-obtener-formulario-público)
3. [Endpoint: mapa del gemelo digital](#3-endpoint-mapa-del-gemelo-digital)
4. [Endpoint: envío de respuestas (onboarding)](#4-endpoint-envío-de-respuestas-onboarding)
5. [Tipo de campo `lot_selector` en el schema](#5-tipo-de-campo-lot_selector-en-el-schema)
6. [Autenticación](#6-autenticación)
7. [Errores esperados y cómo los maneja el frontend](#7-errores-esperados-y-cómo-los-maneja-el-frontend)
8. [Checklist de verificación](#8-checklist-de-verificación)

---

## 1. Visión general del flujo

```
Usuario abre formulario público
         │
         ▼
GET /forms/public/:formKey
  → Devuelve formData con neighborhood_id y schema
         │
         ├── ¿El schema tiene un campo type = "lot_selector"?
         │         │
         │         ▼
         │   GET /map/digital-twin/:neighborhoodId   ← cargado en LotSelectorField
         │     → Devuelve mapa SVG con bloques y predios
         │         │
         │         ▼
         │   Usuario toca un predio en el mapa
         │     → responses[field.key] = lot.id (UUID del predio)
         │
         ▼
POST /submissions/onboarding
  → Payload incluye: responses, name, document_number, lot_id (si había selector)
```

---

## 2. Endpoint: obtener formulario público

```
GET /api/forms/public/:formKey
```

No requiere token de autenticación.

### Respuesta esperada

```json
{
  "ok": true,
  "data": {
    "id":              "uuid-del-formulario",
    "key":             "censo-las-mercedes-2026",
    "title":           "Censo de Usuarios — Barrio Las Mercedes",
    "description":     "Formulario de levantamiento de información predial.",
    "neighborhood_id": "de0a481e-eaaf-43af-becc-bfd0858c7243",
    "version":         3,
    "is_active":       true,
    "metadata": {
      "imagen": "https://res.cloudinary.com/.../portada.jpg"
    },
    "giveaway": {
      "is_active":          false,
      "points_per_referral": 0
    },
    "schema": [
      {
        "key":      "selecciona_predio",
        "type":     "lot_selector",
        "label":    "Selecciona el predio",
        "required": true
      },
      {
        "key":         "tipo_punto",
        "type":        "select",
        "label":       "Tipo de punto",
        "required":    true,
        "options":     ["Und. Hab./No Hab. Única", "Multifamiliar Medidor Colectivo"]
      }
    ],
    "registration_fields": {
      "name":            { "required": true,  "type": "text",  "label": "Nombre completo" },
      "document_number": { "required": true,  "type": "text",  "label": "Número de cédula" }
    }
  }
}
```

### Campos críticos

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `data.neighborhood_id` | UUID string | Sí | Se usa para cargar el mapa cuando hay un campo `lot_selector` en el schema |
| `data.schema` | array | Sí | Lista de campos del formulario. Ver [§5](#5-tipo-de-campo-lot_selector-en-el-schema) para el tipo `lot_selector` |
| `data.is_active` | boolean | Sí | Si es `false`, el frontend no debe permitir envíos |

> **Importante**: `neighborhood_id` debe ser el mismo UUID que identifica el barrio en la tabla de gemelos digitales. Es el identificador que se pasa directamente a `GET /map/digital-twin/:neighborhoodId`.

---

## 3. Endpoint: mapa del gemelo digital

```
GET /api/map/digital-twin/:neighborhoodId
```

**No requiere token de autenticación.** Este endpoint es consumido desde el formulario público, que se accede sin login.

### Respuesta esperada

```json
{
  "data": {
    "viewBox": "0 0 1103 667",
    "blocks": [
      {
        "id":   "uuid-de-la-manzana",
        "code": "M-01",
        "lots": [
          {
            "id":         "uuid-del-predio",
            "number":     "3",
            "display_id": "M-01-03",
            "path":       "M 10,20 L 50,20 L 50,60 L 10,60 Z",
            "status":     "sin_informacion",
            "centroid":   { "x": 30, "y": 40 },
            "area_m2":    120,
            "version":    1
          }
        ]
      }
    ]
  }
}
```

### Campos requeridos por `LotSelectorField`

#### Nivel raíz de `data`

| Campo | Tipo | Descripción |
|---|---|---|
| `viewBox` | string SVG | Coordenadas del viewport: `"minX minY ancho alto"`. Controla el sistema de coordenadas del SVG. **Sin este campo el mapa no se renderiza correctamente.** |
| `blocks` | array | Lista de manzanas del barrio |

#### Cada objeto `block`

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID string | Identificador único de la manzana |
| `code` | string | Código visible, ej: `"M-01"`. Se usa para construir `display_id` |
| `lots` | array | Lista de predios dentro de la manzana |

#### Cada objeto `lot`

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `id` | UUID string | Sí | Identificador único. Es el valor que queda guardado en la respuesta del formulario como `lot_id` |
| `path` | string SVG | Sí | Geometría del predio en coordenadas SVG (ej: `"M 10,20 L 50,20..."`). Sin este campo el predio no se dibuja y el frontend lo omite silenciosamente. Se acepta también como `svg_path` |
| `number` | string | Sí | Número del predio dentro de la manzana. Fallback para la etiqueta visible |
| `display_id` | string | Recomendado | Identificador concatenado manzana+lote (ej: `"M-01-03"`). Si no viene, el frontend lo calcula con `block.code + lot.number` |
| `status` | string | Recomendado | Estado del predio. Determina el color en el mapa: `"sin_informacion"` (gris), `"censado"` (azul), `"registrado"` (verde). Si no viene, se muestra gris |
| `centroid` | `{ x, y }` | Recomendado | Coordenadas del centro del predio en el sistema SVG. Se usa para colocar la etiqueta con el número dentro del polígono |

### Comportamiento del frontend cuando faltan campos

| Campo faltante | Comportamiento |
|---|---|
| `data.viewBox` ausente o `null` | El SVG se renderiza sin viewBox. Los predios pueden aparecer diminutos o fuera de pantalla |
| `lot.path` y `lot.svg_path` ambos `null` | El predio se omite del mapa (`return null` en `LotPolygon`) |
| `lot.status` no viene | El predio se colorea gris (`sin_informacion`) |
| `lot.centroid` no viene | El predio se dibuja sin etiqueta de número |
| `data.blocks` vacío o ausente | El mapa muestra "Sin mapa disponible para este barrio" |

---

## 4. Endpoint: envío de respuestas (onboarding)

```
POST /api/submissions/onboarding
Content-Type: application/json
```

No requiere token de autenticación.

### Payload enviado por el frontend

```json
{
  "form_key":        "censo-las-mercedes-2026",
  "neighborhood_id": "de0a481e-eaaf-43af-becc-bfd0858c7243",
  "name":            "José Alfredo Rodríguez",
  "document_number": "1030528082",
  "lot_id":          "49fb78c1-c9f8-47e0-80ef-e4f75b541207",
  "responses": {
    "selecciona_predio": "49fb78c1-c9f8-47e0-80ef-e4f75b541207",
    "tipo_punto":        "Und. Hab./No Hab. Única",
    "clase_uso":         "Residencial"
  },
  "location": { "lat": 4.578, "lng": -74.209 },
  "referral_code": null
}
```

### Campos del payload

| Campo | Tipo | Siempre presente | Descripción |
|---|---|---|---|
| `form_key` | string | Sí | Slug del formulario |
| `neighborhood_id` | UUID string | Sí | UUID del barrio del formulario |
| `name` | string | Sí | Nombre completo del encuestado |
| `document_number` | string | Sí | Cédula del encuestado |
| `lot_id` | UUID string | Solo si el schema tiene `lot_selector` y el usuario seleccionó un predio | UUID del predio seleccionado en el mapa. **Este es el campo que vincula la respuesta con el predio en el gemelo digital** |
| `responses` | object | Sí | Mapa `{ [field.key]: value }` con todas las respuestas del formulario. Si hay un campo `lot_selector`, su valor en `responses` también es el UUID del predio (igual que `lot_id`) |
| `responses.firma_digital` | string URL | Si el usuario firmó | URL de Cloudinary con la imagen de la firma |
| `location` | `{ lat, lng }` | Si el navegador otorgó permisos | Coordenadas GPS en el momento del envío |
| `referral_code` | string | Si viene en query param `?ref=` | Código de referido |

### Respuesta esperada (éxito)

```json
{
  "ok":           true,
  "token":        "eyJhbGci...",
  "user": {
    "id":              "uuid-usuario",
    "name":            "José Alfredo Rodríguez",
    "document_number": "1030528082",
    "email":           null,
    "role":            "encuestado"
  },
  "submissionId":  "uuid-de-la-submission",
  "referral_code": "JOSE-4F2A",
  "share_link":    "https://app.aquanova.co/f/censo?ref=JOSE-4F2A",
  "reconciliation": {
    "reconciled":    false,
    "points_awarded": 0
  }
}
```

### Cómo debe persistir el backend el `lot_id`

El campo `lot_id` del payload debe almacenarse en la tabla de submissions vinculando el registro con el predio correspondiente en la tabla `lots`. Esta relación permite:

1. Calcular el `status` del predio en el gemelo digital (`censado` o `registrado`) al servir `GET /map/census/:neighborhoodId`.
2. Mostrar el historial de visitas a un predio en el panel de administración.
3. Evitar el doble-censo cuando se quiere alertar al inspector sobre predios ya visitados.

---

## 5. Tipo de campo `lot_selector` en el schema

El campo de tipo `lot_selector` es el que activa el mapa dentro del formulario. El administrador lo agrega desde el editor de formularios bajo el nombre **"Selector de Lote"**.

### Definición en el schema (guardada en BD)

```json
{
  "key":      "selecciona_predio",
  "type":     "lot_selector",
  "label":    "Selecciona el predio",
  "required": true
}
```

### Comportamiento en el frontend

- Cuando el frontend encuentra un campo con `type === "lot_selector"`, renderiza el mapa SVG interactivo del barrio.
- El mapa se carga desde `GET /map/digital-twin/:neighborhoodId` usando el `neighborhood_id` del formulario.
- Al seleccionar un predio, se guarda su `lot.id` (UUID) en `responses["selecciona_predio"]`.
- Al enviar, el frontend extrae el valor del campo `lot_selector` y lo incluye adicionalmente como `lot_id` en el payload raíz (fuera de `responses`), para facilitar el acceso directo en el backend.

### Restricciones

| Restricción | Detalle |
|---|---|
| Solo uno por formulario | El frontend extrae el primer campo `lot_selector` del schema para construir `lot_id`. Si hay más de uno, solo se procesa el primero |
| Requiere `neighborhood_id` en el formulario | Si el formulario no tiene `neighborhood_id` configurado, el mapa muestra "Este formulario no tiene un barrio configurado." y no bloquea el envío (el campo puede quedar vacío si no es `required`) |
| El valor guardado es el UUID del predio | No se guarda el `display_id` ni el `number`, sino el `id` (UUID) del predio en la tabla `lots` |

---

## 6. Autenticación

Los tres endpoints involucrados en el flujo del formulario público **no deben requerir token**:

| Endpoint | ¿Requiere token? |
|---|---|
| `GET /api/forms/public/:formKey` | No |
| `GET /api/map/digital-twin/:neighborhoodId` | **No** — es consumido desde el formulario público |
| `POST /api/submissions/onboarding` | No |

> El endpoint `GET /api/map/digital-twin/:neighborhoodId` también es usado por el panel de administración (con usuario autenticado). Si el backend necesita restringirlo, debe hacerlo solo cuando se accede desde rutas protegidas, o mantenerlo público con rate-limiting.

---

## 7. Errores esperados y cómo los maneja el frontend

### En `GET /map/digital-twin/:neighborhoodId`

| Código HTTP | Comportamiento del frontend |
|---|---|
| `200` con `data.blocks.length === 0` | Muestra "Sin mapa disponible para este barrio." El formulario sigue siendo enviable |
| `404` | Muestra "No se pudo cargar el mapa del barrio." El formulario sigue siendo enviable |
| `500` o error de red | Muestra "No se pudo cargar el mapa del barrio." El formulario sigue siendo enviable |

El mapa usa un `try/catch` con `.catch(() => null)` en el hook raíz del formulario, por lo que un fallo del mapa **nunca bloquea el envío del formulario**.

### En `POST /api/submissions/onboarding`

| Código HTTP | Comportamiento del frontend |
|---|---|
| `400` | Muestra "Por favor completa todos los campos requeridos correctamente." |
| `404` | Muestra "Este formulario ya no está disponible." |
| `409` | Muestra "¿Ya tienes una cuenta? El documento o correo ya está registrado." |
| `500` | Muestra "Ocurrió un error. Intenta de nuevo más tarde." |

---

## 8. Checklist de verificación

Antes de probar la integración, verificar que el backend cumple:

- [ ] `GET /api/forms/public/:formKey` retorna `data.neighborhood_id` como UUID string
- [ ] `GET /api/forms/public/:formKey` retorna el schema con el campo `{ type: "lot_selector" }` (no `"Selector de Lote"` — esa es la etiqueta de UI que el frontend convierte internamente)
- [ ] `GET /api/map/digital-twin/:neighborhoodId` **no requiere token**
- [ ] `GET /api/map/digital-twin/:neighborhoodId` retorna `data.viewBox` como string SVG válido
- [ ] `GET /api/map/digital-twin/:neighborhoodId` retorna `data.blocks[].lots[].path` (o `svg_path`) con la geometría SVG de cada predio
- [ ] `GET /api/map/digital-twin/:neighborhoodId` retorna `data.blocks[].lots[].id` como UUID (este es el valor que se almacena como `lot_id` en la submission)
- [ ] `POST /api/submissions/onboarding` acepta y persiste el campo `lot_id` en la tabla `submissions`
- [ ] El `lot_id` persistido referencia correctamente la tabla `lots` (FK o al menos validación de existencia)
- [ ] Los predios de `digital-twin` tienen `lot.status` calculado a partir del censo (para mostrar colores correctos en el mapa del formulario)
