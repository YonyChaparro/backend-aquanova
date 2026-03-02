# Documentación del Endpoint de Búsqueda de Barrios

Esta documentación describe cómo consumir el endpoint de búsqueda de barrios desde el frontend. Las imágenes de cada registro son almacenadas y servidas desde **Cloudinary** (ver [API_NEIGHBORHOOD_MANAGEMENT_DOCUMENTATION.md](./API_NEIGHBORHOOD_MANAGEMENT_DOCUMENTATION.md) para la gestión de imágenes).

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
| `metadata` | `object \| null` | Datos adicionales. Tanto localidades como barrios incluyen `imagen` (Cloudinary) y `descripcion` específica del lugar. |
| `metadata.imagen` | `string (URL)` | URL de imagen almacenada en Cloudinary (`res.cloudinary.com`). Lista para usar en `<img src="...">` |
| `metadata.imagen_public_id` | `string` | ID público de la imagen en Cloudinary. Uso interno para gestión (actualización/eliminación) |
| `metadata.descripcion` | `string` | Descripción específica y contextualizada del barrio o localidad |
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
        "imagen": "https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772334412/bogota-cedritos-hero_ukrcgl.png",
        "descripcion": "Barrio residencial de clase media-alta con alta densidad de apartamentos modernos. Conocido por su activa vida nocturna en la zona de bares y restaurantes sobre la calle 140."
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
