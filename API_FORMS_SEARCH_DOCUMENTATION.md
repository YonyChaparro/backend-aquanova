# Documentación del Endpoint de Búsqueda de Formularios

Esta documentación describe cómo consumir el endpoint de búsqueda de formularios desde el frontend.

## Endpoint

**URL:** `GET /api/forms/search`  
**Query Params:** `query` (Requerido) - Término de búsqueda.
**Autenticación:** Requerida (Bearer Token)

La búsqueda se realiza sobre:
*   Título del formulario
*   Descripción del formulario
*   Nombre del barrio asociado

## Ejemplo de Uso (Frontend - JavaScript/Fetch)

```javascript
/**
 * Función para buscar formularios.
 * @param {string} searchTerm - El término a buscar.
 * @param {string} token - Token de autenticación (Bearer).
 */
async function searchForms(searchTerm, token) {
  try {
    const queryParam = encodeURIComponent(searchTerm);
    const url = `http://localhost:3000/api/forms/search?query=${queryParam}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Error en la búsqueda');
    }

    return data.forms;

  } catch (error) {
    console.error('Error buscando formularios:', error);
    return [];
  }
}

// --- Ejemplo de invocación ---
/*
const token = 'TU_TOKEN_JWT';
searchForms('censo', token).then(forms => {
  forms.forEach(form => {
    console.log(`Formulario: ${form.title}`);
    if (form.metadata && form.metadata.imagen) {
      console.log(` - Imagen: ${form.metadata.imagen}`);
    }
  });
});
*/
```

## Estructura de la Respuesta Exitoso (200 OK)

El endpoint retorna un objeto JSON con la propiedad `ok: true` y una lista `forms`.

### Campos del formulario

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `string` | UUID del formulario |
| `key` | `string` | Slug único |
| `title` | `string` | Título del formulario |
| `description` | `string` | Descripción del formulario |
| `metadata` | `object \| null` | Imagen de portada en Cloudinary. `null` si no se subió imagen. |
| `is_active` | `boolean` | `true` si activo |
| `created_by` | `string` | Nombre del administrador |
| `created_at` | `string (ISO 8601)` | Fecha de creación |
| `neighborhoods` | `array` | Barrios con publicación activa asociados al formulario |

### Campos del objeto `metadata`

| Campo | Tipo | Descripción |
|---|---|---|
| `imagen` | `string` | URL pública de la imagen de portada en Cloudinary |
| `imagen_public_id` | `string` | ID interno de Cloudinary |

```json
{
  "ok": true,
  "forms": [
    {
      "id": "uuid-del-formulario",
      "key": "censo-barrial-2026",
      "title": "Censo Barrial 2026",
      "description": "Formulario para recolección de datos...",
      "metadata": {
        "imagen": "https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772494157/aquanova/forms/abc123.jpg",
        "imagen_public_id": "aquanova/forms/abc123"
      },
      "is_active": true,
      "created_at": "2026-01-14T10:00:00.000Z",
      "created_by": "Admin User",
      "neighborhoods": [
        {
          "id": "uuid-del-barrio",
          "name": "Barrio Los Pinos",
          "code": "LPN-01",
          "parent_id": null,
          "metadata": null,
          "created_at": "2026-01-10T10:00:00.000Z"
        }
      ]
    }
  ]
}
```

## Manejo de Errores

### 400 Bad Request
Ocurre si no se envía el parámetro `query`.

```json
{
  "ok": false,
  "message": "Debe enviar un parámetro de búsqueda \"query\""
}
```

### 500 Internal Server Error
Ocurre si hay un problema en el servidor o base de datos.

```json
{
  "ok": false,
  "message": "Error al buscar formularios"
}
```


## Ejemplo de Uso (Frontend - JavaScript/Fetch)

```javascript
/**
 * Función para buscar formularios.
 * @param {string} searchTerm - El término a buscar.
 * @param {string} token - Token de autenticación (Bearer).
 */
async function searchForms(searchTerm, token) {
  try {
    // Es importante codificar el parámetro de búsqueda para manejar espacios y caracteres especiales
    const queryParam = encodeURIComponent(searchTerm);
    const url = `http://localhost:3000/api/forms/search?query=${queryParam}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` // Si el endpoint requiere autenticación
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Error en la búsqueda');
    }

    return data.forms; // Retorna el array de formularios encontrados

  } catch (error) {
    console.error('Error buscando formularios:', error);
    return [];
  }
}

// --- Ejemplo de invocación ---
/*
const token = 'TU_TOKEN_JWT';
searchForms('censo', token).then(forms => {
    console.log('Resultados:', forms);
});
*/
```

## Estructura de la Respuesta Exitoso (200 OK)

El endpoint retorna un objeto JSON con la propiedad `ok: true` y una lista `forms`.

```json
{
  "ok": true,
  "forms": [
    {
      "id": "uuid-del-formulario",
      "key": "censo-barrial-2026",
      "title": "Censo Barrial 2026",
      "description": "Formulario para recolección de datos...",
      "is_active": true,
      "created_at": "2026-01-14T10:00:00.000Z",
      "created_by": "Admin User",
      "neighborhoods": [
        {
          "id": "uuid-del-barrio",
          "name": "Barrio Los Pinos",
          "code": "LPN-01",
          "parent_id": null
        }
      ]
    }
  ]
}
```

## Manejo de Errores

### 400 Bad Request
Ocurre si no se envía el parámetro `query`.

```json
{
  "ok": false,
  "message": "Debe enviar un parámetro de búsqueda \"query\""
}
```

### 500 Internal Server Error
Ocurre si hay un problema en el servidor o base de datos.

```json
{
  "ok": false,
  "message": "Error al buscar formularios"
}
```
