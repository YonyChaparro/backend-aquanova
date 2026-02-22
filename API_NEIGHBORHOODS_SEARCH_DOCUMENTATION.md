# Documentación del Endpoint de Búsqueda de Barrios

Esta documentación describe cómo consumir el endpoint de búsqueda de barrios desde el frontend.

## Endpoint

**URL:** `GET /api/neighborhoods/search`  
**Query Params:** `query` (Requerido) - Término de búsqueda.

La búsqueda se realiza sobre:
*   Nombre del barrio/localidad (`name`)
*   Código del barrio/localidad (`code`)

## Campos retornados

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | `string (UUID)` | Identificador único |
| `name` | `string` | Nombre del barrio o localidad |
| `code` | `string` | Código único (ej: `BAR-0105`, `LOC-01`) |
| `parent_id` | `string \| null` | UUID de la localidad padre. `null` si es raíz |
| `parent_name` | `string \| null` | Nombre de la localidad padre. `null` si es raíz |
| `is_active` | `boolean` | Indica si el registro está activo en el sistema |
| `metadata` | `object \| null` | Datos adicionales. Los barrios incluyen `imagen` y `descripcion`. Las localidades tienen `null`. |
| `metadata.imagen` | `string (URL)` | URL de imagen representativa del barrio (Unsplash) |
| `metadata.descripcion` | `string` | Descripción genérica del barrio |
| `created_at` | `string (ISO 8601)` | Fecha de creación |

## Ejemplo de Uso (Frontend - JavaScript/Fetch)

```javascript
/**
 * Función para buscar barrios.
 * @param {string} searchTerm - El término a buscar (nombre o código).
 * @param {string} token - Token de autenticación (Bearer).
 */
async function searchNeighborhoods(searchTerm, token) {
  try {
    const queryParam = encodeURIComponent(searchTerm);
    const url = `http://localhost:3000/api/neighborhoods/search?query=${queryParam}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Error en la búsqueda de barrios');
    }

    // Filtrar solo los activos si es necesario
    const activos = data.neighborhoods.filter(n => n.is_active);
    return activos;

  } catch (error) {
    console.error('Error buscando barrios:', error);
    return [];
  }
}

// --- Ejemplo de invocación ---
/*
const token = 'TU_TOKEN_JWT';
searchNeighborhoods('Cedritos', token).then(neighborhoods => {
    neighborhoods.forEach(n => {
        console.log(`${n.name} (${n.code}) — Localidad: ${n.parent_name ?? 'Raíz'} — Activo: ${n.is_active}`);
    });
});
*/
```

## Estructura de la Respuesta Exitosa (200 OK)

```json
{
  "ok": true,
  "neighborhoods": [
    {
      "id": "uuid-barrio-0105",
      "name": "Cedritos",
      "code": "BAR-0105",
      "parent_id": "uuid-localidad-01",
      "parent_name": "Usaquén",
      "is_active": true,
      "metadata": {
        "imagen": "https://images.unsplash.com/photo-1564769662533-4f00a87b4056?auto=format&fit=crop&w=600&q=80",
        "descripcion": "Zona residencial de estrato medio con calles arboladas, plazoletas y una activa vida comercial en su eje principal."
      },
      "created_at": "2026-02-22T10:00:00.000Z"
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
