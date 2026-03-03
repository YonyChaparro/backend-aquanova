# Documentación del Endpoint de Listado de Formularios

Esta documentación describe cómo consumir el endpoint para listar todos los formularios disponibles.

## Endpoint

**URL:** `GET /api/forms`  
**Método:** `GET`  
**Autenticación:** Requerida (Bearer Token)

## Descripción
Retorna una lista de todos los formularios ordenados por fecha de creación (descendente).

Cada formulario incluye:
- `is_active` — valor **boolean** (`true`/`false`) que indica si el formulario está activo.
- `metadata` — objeto con la **imagen de portada** alojada en Cloudinary (`imagen` + `imagen_public_id`). Retorna `null` si no se ha subido ninguna imagen.
- `neighborhoods` — array con los barrios donde el formulario tiene una **publicación activa**. Retorna `[]` si no tiene ninguna publicación activa asociada.

## Ejemplo de Uso (Frontend - JavaScript/Fetch)

```javascript
/**
 * Función para obtener todos los formularios.
 * @param {string} token - Token de autenticación (Bearer).
 */
async function getForms(token) {
  try {
    const url = `http://localhost:3000/api/forms`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Error al listar formularios');
    }

    // data.forms contiene la lista con los barrios y la imagen de portada
    return data.forms;

  } catch (error) {
    console.error('Error obteniendo formularios:', error);
    return [];
  }
}

// --- Ejemplo de consumo mostrando imagen y barrios ---
/*
getForms(token).then(forms => {
  forms.forEach(form => {
    console.log(`Formulario: ${form.title}`);
    
    // Imagen de portada (Cloudinary)
    if (form.metadata && form.metadata.imagen) {
      console.log(` - Imagen: ${form.metadata.imagen}`);
    }

    // Iterar sobre los barrios del formulario
    form.neighborhoods.forEach(barrio => {
      console.log(` - Barrio: ${barrio.name} (Código: ${barrio.code})`);
      if (barrio.parent_id) {
        console.log(`   * Es un sub-barrio del ID: ${barrio.parent_id}`);
      }
    });
  });
});
*/
```

## Estructura de la Respuesta (200 OK)

### Campos del formulario

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `string` | UUID del formulario |
| `key` | `string` | Slug único generado al crear |
| `title` | `string` | Título del formulario |
| `description` | `string` | Descripción del formulario |
| `metadata` | `object \| null` | Datos extra. Contiene imagen de portada en Cloudinary. `null` si no se subió imagen. |
| `is_active` | `boolean` | `true` si activo, `false` si desactivado |
| `created_by` | `string` | Nombre del administrador que lo creó |
| `created_at` | `string (ISO 8601)` | Fecha de creación |
| `neighborhoods` | `array` | Barrios con publicación activa. `[]` si ninguno |

### Campos del objeto `metadata`

| Campo | Tipo | Descripción |
|---|---|---|
| `imagen` | `string` | URL pública de la imagen de portada en Cloudinary |
| `imagen_public_id` | `string` | ID interno de Cloudinary (para gestionar la imagen) |

### Campos de cada objeto en `neighborhoods`

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `string` | UUID del barrio |
| `name` | `string` | Nombre del barrio |
| `code` | `string` | Código del barrio |
| `parent_id` | `string \| null` | ID del barrio padre (si es sub-barrio) |

### Ejemplo — formulario activo con imagen y barrio

```json
{
  "ok": true,
  "forms": [
    {
      "id": "uuid-form-123",
      "key": "censo-2026",
      "title": "Censo General 2026",
      "description": "Encuesta demográfica",
      "metadata": {
        "imagen": "https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772494157/aquanova/forms/abc123.jpg",
        "imagen_public_id": "aquanova/forms/abc123"
      },
      "is_active": true,
      "created_by": "Juan Perez",
      "created_at": "2026-01-20T10:00:00.000Z",
      "neighborhoods": [
        {
          "id": "uuid-barrio-hijo",
          "name": "Barrio Norte - Sector A",
          "code": "NORTE-A",
          "parent_id": "uuid-barrio-padre"
        },
        {
          "id": "uuid-barrio-centro",
          "name": "Barrio Centro",
          "code": "CENTRO-01",
          "parent_id": null
        }
      ]
    }
  ]
}
```

### Ejemplo — formulario sin imagen ni barrio asociado

```json
{
  "ok": true,
  "forms": [
    {
      "id": "uuid-form-456",
      "key": "encuesta-agua-5678",
      "title": "Encuesta Agua",
      "description": "Sin publicaciones activas",
      "metadata": null,
      "is_active": false,
      "created_by": "Admin User",
      "created_at": "2026-01-05T08:00:00.000Z",
      "neighborhoods": []
    }
  ]
}
```

## Manejo de Errores

### 500 Internal Server Error
```json
{
  "ok": false,
  "message": "Error al listar formularios"
}
```


## Ejemplo de Uso (Frontend - JavaScript/Fetch)

```javascript
/**
 * Función para obtener todos los formularios.
 * @param {string} token - Token de autenticación (Bearer).
 */
async function getForms(token) {
  try {
    const url = `http://localhost:3000/api/forms`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Error al listar formularios');
    }

    // data.forms contiene la lista con los barrios detallados
    return data.forms;

  } catch (error) {
    console.error('Error obteniendo formularios:', error);
    return [];
  }
}

// --- Ejemplo de consumo mostrando barrios padres/hijos ---
/*
getForms(token).then(forms => {
  forms.forEach(form => {
    console.log(`Formulario: ${form.title}`);
    
    // Iterar sobre los barrios del formulario
    form.neighborhoods.forEach(barrio => {
      console.log(` - Barrio: ${barrio.name} (Código: ${barrio.code})`);
      if (barrio.parent_id) {
        console.log(`   * Es un sub-barrio del ID: ${barrio.parent_id}`);
      }
    });
  });
});
*/
```

## Estructura de la Respuesta (200 OK)

### Campos del formulario

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `string` | UUID del formulario |
| `key` | `string` | Slug único generado al crear |
| `title` | `string` | Título del formulario |
| `description` | `string` | Descripción del formulario |
| `is_active` | `boolean` | `true` si activo, `false` si desactivado |
| `created_by` | `string` | Nombre del administrador que lo creó |
| `created_at` | `string (ISO 8601)` | Fecha de creación |
| `neighborhoods` | `array` | Barrios con publicación activa. `[]` si ninguno |

### Campos de cada objeto en `neighborhoods`

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `string` | UUID del barrio |
| `name` | `string` | Nombre del barrio |
| `code` | `string` | Código del barrio |
| `parent_id` | `string \| null` | ID del barrio padre (si es sub-barrio) |

### Ejemplo — formulario activo con barrio

```json
{
  "ok": true,
  "forms": [
    {
      "id": "uuid-form-123",
      "key": "censo-2026",
      "title": "Censo General 2026",
      "description": "Encuesta demográfica",
      "is_active": true,
      "created_by": "Juan Perez",
      "created_at": "2026-01-20T10:00:00.000Z",
      "neighborhoods": [
        {
          "id": "uuid-barrio-hijo",
          "name": "Barrio Norte - Sector A",
          "code": "NORTE-A",
          "parent_id": "uuid-barrio-padre"
        },
        {
          "id": "uuid-barrio-centro",
          "name": "Barrio Centro",
          "code": "CENTRO-01",
          "parent_id": null
        }
      ]
    }
  ]
}
```

### Ejemplo — formulario inactivo sin barrio asociado

```json
{
  "ok": true,
  "forms": [
    {
      "id": "uuid-form-456",
      "key": "encuesta-agua-5678",
      "title": "Encuesta Agua",
      "description": "Sin publicaciones activas",
      "is_active": false,
      "created_by": "Admin User",
      "created_at": "2026-01-05T08:00:00.000Z",
      "neighborhoods": []
    }
  ]
}
```

## Manejo de Errores

### 500 Internal Server Error
```json
{
  "ok": false,
  "message": "Error al listar formularios"
}
```
