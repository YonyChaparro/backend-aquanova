# Documentación del Endpoint de Búsqueda de Formularios

Esta documentación describe cómo consumir el endpoint de búsqueda de formularios desde el frontend.

## Endpoint

**URL:** `GET /api/forms/search`  
**Query Params:** `query` (Requerido) - Término de búsqueda.

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
      "is_active": 1,
      "created_at": "2026-01-14T10:00:00.000Z",
      "created_by": "Admin User",
      "neighborhoods": [
        {
          "id": "uuid-del-barrio",
          "name": "Barrio Los Pinos"
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
