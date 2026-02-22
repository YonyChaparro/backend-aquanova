# Documentación del Endpoint de Actualización de Formularios

Esta documentación detalla cómo consumir el endpoint unificado para actualizar formularios. Este endpoint permite modificar los datos básicos (título, descripción, estado), la estructura de preguntas (generando automáticamente una nueva versión) y el barrio asociado a las publicaciones activas.

## Endpoint

**URL:** `PUT /api/forms/:id`  
**Método:** `PUT`  
**Autenticación:** Requerida (Bearer Token - Rol Admin)  
**Parámetros de Ruta:** `id` (UUID del formulario)

## Descripción

Este endpoint es polimórfico:
1. **Edición Básica:** Si envías `title`, `description` o `is_active`, actualiza estos campos en la base de datos sin cambiar la versión.
2. **Edición de Preguntas:** Si envías `schema` (array de preguntas), el sistema **crea una nueva versión** del formulario y actualiza todas las publicaciones activas para que apunten a esta nueva versión.
3. **Reasignación de Barrio:** Si envías `neighborhood_id`, actualiza el barrio de todas las publicaciones activas del formulario.
4. **Edición Completa:** Puedes combinar cualquiera de los campos anteriores en una sola petición.

## Cuerpo de la Petición (JSON)

Todos los campos son opcionales, pero debes enviar **al menos uno**.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `title` | string | Nuevo título del formulario |
| `description` | string | Nueva descripción del formulario |
| `is_active` | boolean | Activa (`true`) o desactiva (`false`) el formulario |
| `neighborhood_id` | string (UUID) | ID del nuevo barrio al que se reasignarán las publicaciones activas |
| `schema` | array | Nueva estructura de preguntas — genera una versión nueva |

```json
{
  "title": "Nuevo Título (Opcional)",
  "description": "Nueva descripción (Opcional)",
  "is_active": true,
  "neighborhood_id": "uuid-del-barrio",
  "schema": [ ... ]
}
```

## Ejemplos de Uso (Frontend - JavaScript/Fetch)

### 1. Actualizar solo Descripción y Estado

```javascript
async function updateFormBasics(formId, description, isActive, token) {
  const response = await fetch(`http://localhost:3000/api/forms/${formId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      description: description,
      is_active: isActive
    })
  });
  return await response.json();
}
```

### 2. Actualizar Preguntas (Generar Nueva Versión)

```javascript
async function updateFormQuestions(formId, newQuestions, token) {
  const response = await fetch(`http://localhost:3000/api/forms/${formId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      schema: newQuestions
    })
  });
  
  const data = await response.json();
  if (data.ok) {
    console.log(`Nueva versión creada: ${data.data.version}`);
  }
  return data;
}

// Ejemplo de array de preguntas
const questions = [
  { type: "text", label: "¿Nombre?", name: "nombre" },
  { type: "number", label: "¿Edad?", name: "edad" }
];
```

### 3. Reasignar a otro Barrio

```javascript
async function updateFormNeighborhood(formId, neighborhoodId, token) {
  const response = await fetch(`http://localhost:3000/api/forms/${formId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      neighborhood_id: neighborhoodId
    })
  });

  const data = await response.json();
  if (data.ok) {
    console.log(`Barrio actualizado. Publicaciones afectadas: ${data.data.publications_updated}`);
  }
  return data;
}
```

### 4. Actualización Completa (Datos + Barrio + Preguntas)

```javascript
async function updateFormFull(formId, token) {
  const response = await fetch(`http://localhost:3000/api/forms/${formId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      title: "Encuesta Completa V2",
      description: "Revisión total del formulario.",
      is_active: true,
      neighborhood_id: "uuid-del-nuevo-barrio",
      schema: [
        { type: "text", label: "¿Observaciones?", name: "obs" }
      ]
    })
  });
  return await response.json();
}
```

## Estructura de la Respuesta (200 OK)

La respuesta incluye únicamente los campos que fueron actualizados.

```json
{
  "ok": true,
  "message": "Formulario actualizado exitosamente y nueva versión 2 creada, barrio actualizado en 1 publicación(es)",
  "data": {
    "id": "uuid-del-formulario",
    "title": "Censo 2026",            // Si se actualizó
    "description": "...",             // Si se actualizó
    "is_active": 1,                   // Si se actualizó
    "version": 2,                     // SOLO si se envió 'schema'
    "versionId": "uuid-version",      // SOLO si se envió 'schema'
    "neighborhood_id": "uuid-barrio", // SOLO si se envió 'neighborhood_id'
    "publications_updated": 1         // SOLO si se envió 'neighborhood_id'
  }
}
```

### Descripción de campos de la respuesta

| Campo | Tipo | Cuándo aparece |
|-------|------|----------------|
| `id` | string | Siempre |
| `title` | string | Si se actualizó `title` o `description` o `is_active` |
| `description` | string | Si se actualizó `title` o `description` o `is_active` |
| `is_active` | number (0/1) | Si se actualizó `title` o `description` o `is_active` |
| `version` | integer | Solo si se envió `schema` |
| `versionId` | string | Solo si se envió `schema` |
| `neighborhood_id` | string | Solo si se envió `neighborhood_id` |
| `publications_updated` | integer | Solo si se envió `neighborhood_id` |

## Manejo de Errores

### 400 Bad Request — Ningún campo enviado
Ocurre si no se envía ningún campo válido.

```json
{
  "ok": false,
  "message": "Debe enviar al menos un campo a actualizar (title, description, is_active, schema, neighborhood_id)"
}
```

### 400 Bad Request — Tipo de dato incorrecto
Ocurre si `is_active` no es booleano o `schema` no es un array.

```json
{
  "ok": false,
  "message": "is_active debe ser boolean"
}
```

```json
{
  "ok": false,
  "message": "schema debe ser un array de preguntas"
}
```

### 404 Not Found — Formulario no encontrado
```json
{
  "ok": false,
  "message": "Formulario no encontrado"
}
```

### 404 Not Found — Barrio no encontrado
Ocurre si el `neighborhood_id` enviado no corresponde a ningún barrio registrado.

```json
{
  "ok": false,
  "message": "El barrio especificado no existe"
}
```

### 500 Internal Server Error
Error en el servidor o base de datos.
