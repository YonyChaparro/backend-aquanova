# Documentación del Endpoint de Detalle de Barrio (Jerarquía)

Esta documentación describe cómo consumir el endpoint para obtener el detalle de un barrio, una localidad o una ciudad. La característica principal de este endpoint es que retorna la **jerarquía completa de ancestros** de forma recursiva y calcula automáticamente el tipo de unidad territorial.

## Endpoint

**URL:** `GET /api/neighborhoods/:id`  
**Método:** `GET`  
**Autenticación:** Requerida (Bearer Token)  
**Parámetros de Ruta:** `id` (UUID del barrio / localidad / ciudad)

---

## Descripción

Recupera la información de un nodo geográfico y **construye su árbol genealógico hacia arriba**.

El campo `type` se calcula automáticamente según la profundidad de la jerarquía:

| Nivel | Tipo | Condición |
|-------|------|-----------|
| Nivel 1 | `"Ciudad"` | Sin ancestros (`parent: null`) |
| Nivel 2 | `"Localidad"` | 1 ancestro (la Ciudad) |
| Nivel 3+ | `"Barrio"` | 2 o más ancestros |

Cada nodo contiene un objeto `parent` anidado con la misma estructura, hasta llegar a la Ciudad cuyo `parent` es `null`.

---

## Campos de la Respuesta

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | `string (UUID)` | Identificador único del nodo |
| `name` | `string` | Nombre del nodo geográfico |
| `code` | `string` | Código único del nodo |
| `parent_id` | `string \| null` | UUID del padre inmediato (`null` en ciudades) |
| `is_active` | `boolean` | Indica si el nodo está habilitado |
| `metadata` | `object \| null` | Información adicional del nodo |
| `metadata.imagen` | `string` | URL de imagen representativa (disponible en barrios) |
| `metadata.descripcion` | `string` | Descripción textual del lugar (disponible en barrios) |
| `created_at` | `string (ISO 8601)` | Fecha de creación del registro |
| `type` | `string` | Tipo calculado: `"Ciudad"`, `"Localidad"` o `"Barrio"` |
| `parent` | `object \| null` | Nodo padre con la misma estructura (recursivo) |

---

## Ejemplo de Uso (JavaScript / Fetch)

```javascript
/**
 * Obtiene el detalle de un barrio con su jerarquía completa.
 * @param {string} id    - UUID del barrio, localidad o ciudad.
 * @param {string} token - Bearer Token de autenticación.
 * @returns {Promise<object|null>}
 */
async function getNeighborhoodHierarchy(id, token) {
  try {
    const response = await fetch(`http://localhost:3000/api/neighborhoods/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const result = await response.json();

    if (!result.ok) {
      throw new Error(result.message || 'Error obteniendo el barrio');
    }

    const barrio = result.data;

    console.log(`Tipo: ${barrio.type} | Nombre: ${barrio.name}`);
    console.log(`Activo: ${barrio.is_active}`);

    // Imagen y descripción (disponibles en barrios; null en localidades/ciudades del seed)
    if (barrio.metadata) {
      console.log(`Imagen: ${barrio.metadata.imagen}`);
      console.log(`Descripción: ${barrio.metadata.descripcion}`);
    }

    // Padre inmediato (Localidad)
    if (barrio.parent) {
      console.log(`→ Localidad: ${barrio.parent.name} (activo: ${barrio.parent.is_active})`);

      // Abuelo (Ciudad)
      if (barrio.parent.parent) {
        console.log(`  → Ciudad: ${barrio.parent.parent.name}`);
      }
    }

    return barrio;

  } catch (error) {
    console.error('Error:', error.message);
    return null;
  }
}
```

---

## Estructura de la Respuesta

### `200 OK` — Consultando un Barrio (Nivel 3)

```json
{
  "ok": true,
  "data": {
    "id": "baf0c3d0-77e8-47a4-bb9e-552fe1aa058f",
    "name": "Santa Marta Central",
    "code": "SMC-001",
    "parent_id": "a1b2c3d4-0000-0000-0000-100000000001",
    "is_active": true,
    "metadata": {
      "imagen": "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=600&q=80",
      "descripcion": "Barrio tradicional bogotano con historia y cultura propias. Reconocido por sus festividades locales y la organización de su Junta de Acción Comunal."
    },
    "created_at": "2026-02-22T10:00:00.000Z",
    "type": "Barrio",
    "parent": {
      "id": "a1b2c3d4-0000-0000-0000-100000000001",
      "name": "Usaquén",
      "code": "BOG-LOC-01",
      "parent_id": "a1b2c3d4-0000-0000-0000-000000000001",
      "is_active": true,
      "metadata": null,
      "created_at": "2026-02-22T10:00:00.000Z",
      "type": "Localidad",
      "parent": {
        "id": "a1b2c3d4-0000-0000-0000-000000000001",
        "name": "Bogotá D.C.",
        "code": "BOG-001",
        "parent_id": null,
        "is_active": true,
        "metadata": null,
        "created_at": "2026-02-22T10:00:00.000Z",
        "type": "Ciudad",
        "parent": null
      }
    }
  }
}
```

### `200 OK` — Consultando una Localidad (Nivel 2)

```json
{
  "ok": true,
  "data": {
    "id": "a1b2c3d4-0000-0000-0000-100000000001",
    "name": "Usaquén",
    "code": "BOG-LOC-01",
    "parent_id": "a1b2c3d4-0000-0000-0000-000000000001",
    "is_active": true,
    "metadata": null,
    "created_at": "2026-02-22T10:00:00.000Z",
    "type": "Localidad",
    "parent": {
      "id": "a1b2c3d4-0000-0000-0000-000000000001",
      "name": "Bogotá D.C.",
      "code": "BOG-001",
      "parent_id": null,
      "is_active": true,
      "metadata": null,
      "created_at": "2026-02-22T10:00:00.000Z",
      "type": "Ciudad",
      "parent": null
    }
  }
}
```

### `200 OK` — Consultando una Ciudad (Nivel 1 / Raíz)

```json
{
  "ok": true,
  "data": {
    "id": "a1b2c3d4-0000-0000-0000-000000000001",
    "name": "Bogotá D.C.",
    "code": "BOG-001",
    "parent_id": null,
    "is_active": true,
    "metadata": null,
    "created_at": "2026-02-22T10:00:00.000Z",
    "type": "Ciudad",
    "parent": null
  }
}
```

---

## Manejo de Errores

### `404 Not Found`
El ID proporcionado no existe en la base de datos.
```json
{
  "ok": false,
  "message": "Barrio no encontrado"
}
```

### `401 Unauthorized`
Token ausente o inválido.
```json
{
  "ok": false,
  "message": "Token no proporcionado"
}
```

### `500 Internal Server Error`
Error técnico al procesar la jerarquía.
```json
{
  "ok": false,
  "message": "Error al obtener barrio"
}
```
