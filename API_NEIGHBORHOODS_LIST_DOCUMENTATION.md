# Documentación del Endpoint de Listado de Barrios y Localidades

Esta documentación describe cómo consumir el endpoint para obtener todos los barrios y localidades del sistema desde el frontend.

## Endpoint

**URL:** `GET /api/neighborhoods`  
**Método:** `GET`  
**Autenticación:** Requerida (Bearer Token)  
**Rol:** Cualquier usuario autenticado

## Descripción

Retorna todos los registros de la tabla `neighborhoods` (localidades y barrios), ordenados primero por nombre de localidad padre y luego por nombre de barrio. Cada registro incluye el **nombre del padre** (`parent_name`) y el **estado activo/inactivo** (`is_active`).

---

## Campos retornados

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | `string (UUID)` | Identificador único del registro |
| `name` | `string` | Nombre del barrio o localidad |
| `code` | `string` | Código único (ej: `BAR-0105`, `LOC-01`) |
| `parent_id` | `string \| null` | UUID de la localidad padre. `null` si es una localidad raíz |
| `parent_name` | `string \| null` | Nombre de la localidad padre. `null` si es una localidad raíz |
| `is_active` | `boolean` | `true` si el registro está activo, `false` si está desactivado |
| `metadata` | `object \| null` | Datos adicionales. Los barrios incluyen `imagen` y `descripcion`. Las localidades tienen `null`. |
| `metadata.imagen` | `string (URL)` | URL de imagen representativa del barrio (Unsplash) |
| `metadata.descripcion` | `string` | Descripción genérica del barrio |
| `created_at` | `string (ISO 8601)` | Fecha de creación |

---

## Ejemplo de Uso (Frontend - JavaScript/Fetch)

```javascript
/**
 * Obtiene todos los barrios y localidades del sistema.
 * @param {string} token - Token JWT del usuario autenticado.
 * @returns {Promise<Array>} - Array con todos los registros.
 */
async function getNeighborhoods(token) {
  try {
    const response = await fetch('http://localhost:3000/api/neighborhoods', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Error al obtener barrios');
    }

    return data.neighborhoods;

  } catch (error) {
    console.error('Error:', error);
    return [];
  }
}
```

### Filtrar solo activos

```javascript
const todos = await getNeighborhoods(token);
const activos = todos.filter(n => n.is_active);
```

### Agrupar barrios por localidad

```javascript
const todos = await getNeighborhoods(token);

const porLocalidad = todos.reduce((acc, item) => {
  if (!item.parent_id) {
    // Es una localidad raíz, crearle entrada si no existe
    if (!acc[item.id]) acc[item.id] = { localidad: item.name, barrios: [] };
  } else {
    // Es un barrio: agregar bajo su localidad
    if (!acc[item.parent_id]) acc[item.parent_id] = { localidad: item.parent_name, barrios: [] };
    acc[item.parent_id].barrios.push(item);
  }
  return acc;
}, {});

console.log(porLocalidad);
/*
  {
    "uuid-loc-08": {
      "localidad": "Kennedy",
      "barrios": [
        { name: "Américas", code: "BAR-0802", is_active: true, ... },
        { name: "Castilla",  code: "BAR-0803", is_active: true, ... },
        ...
      ]
    },
    ...
  }
*/
```

### Poblar un `<select>` HTML agrupado con `<optgroup>`

```javascript
async function llenarSelectBarrios(selectElement, token) {
  const todos = await getNeighborhoods(token);

  // Obtener localidades raíz
  const localidades = todos.filter(n => !n.parent_id && n.is_active);

  localidades.forEach(loc => {
    const grupo = document.createElement('optgroup');
    grupo.label = loc.name;

    // Obtener barrios activos de esta localidad
    const barrios = todos.filter(n => n.parent_id === loc.id && n.is_active);
    barrios.forEach(barrio => {
      const option = document.createElement('option');
      option.value = barrio.id;
      option.textContent = barrio.name;
      grupo.appendChild(option);
    });

    selectElement.appendChild(grupo);
  });
}

// Uso
const select = document.getElementById('selectBarrio');
llenarSelectBarrios(select, userToken);
```

---

## Estructura de la Respuesta Exitosa (200 OK)

```json
{
  "ok": true,
  "neighborhoods": [
    {
      "id": "uuid-localidad-01",
      "name": "Usaquén",
      "code": "LOC-01",
      "parent_id": null,
      "parent_name": null,
      "is_active": true,
      "metadata": null,
      "created_at": "2026-02-22T10:00:00.000Z"
    },
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

---

## Manejo de Errores

### 401 Unauthorized
El token no fue enviado, es inválido o está expirado.

```json
{
  "ok": false,
  "message": "Token inválido o expirado"
}
```

### 500 Internal Server Error
Error técnico en el servidor.

```json
{
  "ok": false,
  "message": "Error al listar barrios"
}
```
