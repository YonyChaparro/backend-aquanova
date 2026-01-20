# Documentación del Endpoint de Búsqueda de Barrios

Esta documentación describe cómo consumir el endpoint de búsqueda de barrios desde el frontend.

## Endpoint

**URL:** `GET /api/neighborhoods/search`  
**Query Params:** `query` (Requerido) - Término de búsqueda.

La búsqueda se realiza sobre:
*   Nombre del barrio (`name`)
*   Código del barrio (`code`)

## Ejemplo de Uso (Frontend - JavaScript/Fetch)

```javascript
/**
 * Función para buscar barrios.
 * @param {string} searchTerm - El término a buscar (nombre o código).
 * @param {string} token - Token de autenticación (Bearer).
 */
async function searchNeighborhoods(searchTerm, token) {
  try {
    // Es importante codificar el parámetro de búsqueda
    const queryParam = encodeURIComponent(searchTerm);
    const url = `http://localhost:3000/api/neighborhoods/search?query=${queryParam}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` // Endpoint protegido
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Error en la búsqueda de barrios');
    }

    return data.neighborhoods; // Retorna el array de barrios encontrados

  } catch (error) {
    console.error('Error buscando barrios:', error);
    return [];
  }
}

// --- Ejemplo de invocación ---
/*
const token = 'TU_TOKEN_JWT';
searchNeighborhoods('Norte', token).then(neighborhoods => {
    console.log('Barrios encontrados:', neighborhoods);
});
*/
```

## Estructura de la Respuesta Exitosa (200 OK)

El endpoint retorna un objeto JSON con la propiedad `ok: true` y una lista `neighborhoods`.

```json
{
  "ok": true,
  "neighborhoods": [
    {
      "id": "uuid-del-barrio",
      "name": "Barrio Norte",
      "code": "NORTE-002",
      "parent_id": null,
      "metadata": {
          "zona": "residencial"
      },
      "created_at": "2026-01-14T15:30:00.000Z"
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
Ocurre si hay un problema en el servidor o la base de datos.

```json
{
  "ok": false,
  "message": "Error al buscar barrios"
}
```
