# Documentación del Endpoint de Actualización de Formularios

Esta documentación detalla cómo consumir el endpoint unificado para actualizar formularios. Este endpoint permite modificar tanto los datos básicos (título, descripción, estado) como la estructura de preguntas (generando automáticamante una nueva versión).

## Endpoint

**URL:** `PUT /api/forms/:id`  
**Método:** `PUT`  
**Autenticación:** Requerida (Bearer Token - Rol Admin)  
**Parámetros de Ruta:** `id` (UUID del formulario)

## Descripción

Este endpoint es polimórfico:
1.  **Edición Básica:** Si envías `title`, `description` o `is_active`, actualiza estos campos en la base de datos sin cambiar la versión.
2.  **Edición de Preguntas:** Si envías `schema` (array de preguntas), el sistema **crea una nueva versión** del formulario y actualiza todas las publicaciones activas para que apunten a esta nueva versión.
3.  **Edición Completa:** Puedes enviar todo al mismo tiempo.

## Cuerpo de la Petición (JSON)

Todos los campos son opcionales, pero debes enviar **al menos uno**.

```json
{
  "title": "Nuevo Título (Opcional)",
  "description": "Nueva descripción (Opcional)",
  "is_active": true, // (Opcional) boolean
  "schema": [ ... ] // (Opcional) Array de objetos con las preguntas
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

## Estructura de la Respuesta (200 OK)

La respuesta varía ligeramente dependiendo de qué se actualizó.

```json
{
  "ok": true,
  "message": "Formulario actualizado exitosamente y nueva versión 2 creada",
  "data": {
    "id": "uuid-del-formulario",
    "title": "Censo 2026",       // Si se actualizó
    "description": "...",        // Si se actualizó
    "is_active": 1,              // Si se actualizó
    "version": 2,                // SOLO si se envió 'schema'
    "versionId": "uuid-version"  // SOLO si se envió 'schema'
  }
}
```

## Manejo de Errores

### 400 Bad Request
Ocurre si no se envía ningún campo válido o si los tipos de datos son incorrectos (ej. `schema` no es un array).

```json
{
  "ok": false,
  "message": "Debe enviar al menos un campo a actualizar (title, description, is_active, schema)"
}
```

### 404 Not Found
El ID del formulario no existe.

### 500 Internal Server Error
Error en el servidor o base de datos.
