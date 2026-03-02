# Documentación de API - Gestión de Barrios (CRUD con Cloudinary)

Esta documentación detalla los endpoints para la **creación, edición y eliminación** de barrios, localidades y ciudades en el sistema. Las imágenes se gestionan automáticamente a través de **Cloudinary**.

---

## ☁️ Integración con Cloudinary

Al crear o actualizar un barrio, puedes subir una imagen que se almacenará en Cloudinary automáticamente:

- **Subida**: La imagen se sube a la carpeta `aquanova/neighborhoods` de Cloudinary con optimización automática de calidad y formato.
- **URL**: La URL resultante se guarda en `metadata.imagen`.
- **Gestión interna**: El `public_id` de Cloudinary se guarda en `metadata.imagen_public_id` para permitir actualizaciones y eliminaciones futuras.
- **Limpieza**: Al actualizar una imagen, la anterior se elimina automáticamente de Cloudinary. Al eliminar un barrio, la imagen asociada también se elimina.

### Formatos de imagen aceptados

| Formato | MIME Type |
|---------|-----------|
| JPEG | `image/jpeg` |
| PNG | `image/png` |
| WebP | `image/webp` |
| AVIF | `image/avif` |
| GIF | `image/gif` |
| SVG | `image/svg+xml` |

**Tamaño máximo por imagen**: 10 MB

---

## 1. Crear Barrio

Crea un nuevo barrio, localidad o ciudad con imagen opcional.

**Endpoint:** `POST /api/neighborhoods`  
**Autenticación:** Requerida (Bearer Token)  
**Rol:** Administrador (1)  
**Content-Type:** `multipart/form-data` (con imagen) o `application/json` (sin imagen)

### Campos del Body

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `name` | `string` | ✅ Sí | Nombre del barrio o localidad |
| `code` | `string` | ✅ Sí | Código único (catastral o interno) |
| `parent_id` | `string (UUID)` | ❌ No | ID del nodo padre (para jerarquías) |
| `metadata` | `string (JSON)` / `object` | ❌ No | Datos adicionales. En `multipart/form-data` debe ser un **JSON string** |
| `imagen` | `file` | ❌ No | Archivo de imagen (solo en `multipart/form-data`) |

### Ejemplo de Consumo — Con imagen (multipart/form-data)

```javascript
/**
 * Crea un nuevo barrio con imagen subida a Cloudinary.
 * @param {object} barrioData - Datos del barrio: { name, code, parent_id, descripcion }.
 * @param {File} imagenFile - Archivo de imagen seleccionado por el usuario.
 * @param {string} token - Token JWT del administrador.
 * @returns {Promise<object>} - Barrio creado con metadata.imagen (URL de Cloudinary).
 */
const createNeighborhoodWithImage = async (barrioData, imagenFile, token) => {
  try {
    const formData = new FormData();
    formData.append('name', barrioData.name);
    formData.append('code', barrioData.code);

    if (barrioData.parent_id) {
      formData.append('parent_id', barrioData.parent_id);
    }

    // metadata se envía como JSON string en multipart
    const metadata = {};
    if (barrioData.descripcion) metadata.descripcion = barrioData.descripcion;
    if (barrioData.estrato) metadata.estrato = barrioData.estrato;
    formData.append('metadata', JSON.stringify(metadata));

    // Adjuntar imagen (campo debe llamarse 'imagen')
    if (imagenFile) {
      formData.append('imagen', imagenFile);
    }

    const response = await fetch('http://localhost:3000/api/neighborhoods', {
      method: 'POST',
      headers: {
        // NO incluir 'Content-Type' → el navegador lo asigna con el boundary
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Error al crear barrio');
    }

    console.log('Imagen Cloudinary:', result.data.metadata.imagen);
    return result;
  } catch (error) {
    console.error('Error creando barrio:', error);
    throw error;
  }
};

// --- Ejemplo de invocación ---
const fileInput = document.getElementById('inputImagen');
const imagenFile = fileInput.files[0]; // Archivo seleccionado

createNeighborhoodWithImage(
  {
    name: 'Cedritos',
    code: 'BAR-0105',
    parent_id: 'uuid-localidad-01',
    descripcion: 'Barrio residencial de clase media-alta con vida nocturna activa.'
  },
  imagenFile,
  userToken
).then(result => {
  console.log('Barrio creado:', result.data);
  // result.data.metadata.imagen → URL de Cloudinary lista para <img src="...">
});
```

### Ejemplo de Consumo — Sin imagen (application/json)

```javascript
const createNeighborhoodJSON = async (data, token) => {
  try {
    const response = await fetch('http://localhost:3000/api/neighborhoods', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: data.name,
        code: data.code,
        parent_id: data.parent_id || null,
        metadata: {
          descripcion: data.descripcion,
          imagen: data.imagenUrl // URL directa (sin subir archivo)
        }
      })
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.message);
    return result;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};
```

### Ejemplo con cURL

```bash
# Con imagen (multipart/form-data)
curl -X POST http://localhost:3000/api/neighborhoods \
  -H "Authorization: Bearer TU_TOKEN" \
  -F "name=Cedritos" \
  -F "code=BAR-0105" \
  -F "parent_id=uuid-localidad-01" \
  -F 'metadata={"descripcion": "Barrio residencial de clase media-alta"}' \
  -F "imagen=@/ruta/a/imagen.jpg"

# Sin imagen (JSON)
curl -X POST http://localhost:3000/api/neighborhoods \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Cedritos",
    "code": "BAR-0105",
    "metadata": { "descripcion": "Barrio residencial" }
  }'
```

### Estructura de la Respuesta Exitosa (201 Created)

```json
{
  "ok": true,
  "message": "Barrio creado exitosamente",
  "data": {
    "id": "eee037e8-46df-40f0-86ee-0a978df50fa1",
    "name": "Cedritos",
    "code": "BAR-0105",
    "parent_id": "uuid-localidad-01",
    "metadata": {
      "descripcion": "Barrio residencial de clase media-alta",
      "imagen": "https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772487509/aquanova/neighborhoods/zwhaxlvnvnzqgg4xwvul.png",
      "imagen_public_id": "aquanova/neighborhoods/zwhaxlvnvnzqgg4xwvul"
    }
  }
}
```

### Respuestas Posibles

| Código | Descripción |
|--------|-------------|
| **201 Created** | Barrio creado exitosamente |
| **400 Bad Request** | Faltan `name` o `code`, o el código ya existe |
| **404 Not Found** | El `parent_id` especificado no existe |
| **403 Forbidden** | No tiene permisos de administrador |
| **500 Internal Server Error** | Error interno (incluye fallos de Cloudinary) |

---

## 2. Actualizar Barrio

Actualiza la información de un barrio existente, con opción de reemplazar la imagen.

**Endpoint:** `PUT /api/neighborhoods/:id`  
**Autenticación:** Requerida (Bearer Token)  
**Rol:** Administrador (1)  
**Content-Type:** `multipart/form-data` (con nueva imagen) o `application/json` (sin cambio de imagen)

### Parámetros de Ruta

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | `string (UUID)` | UUID del barrio a actualizar |

### Campos del Body

Todos los campos son opcionales, pero se debe enviar al menos uno (incluyendo una nueva imagen).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `name` | `string` | Nuevo nombre del barrio |
| `code` | `string` | Nuevo código único |
| `parent_id` | `string (UUID) \| null` | Nuevo padre (o `null` para quitar padre) |
| `metadata` | `string (JSON)` / `object` | Nuevos datos adicionales |
| `imagen` | `file` | Nueva imagen (reemplaza la anterior en Cloudinary) |

> **⚠️ Importante:** Si se sube una nueva imagen, la imagen anterior se **elimina automáticamente** de Cloudinary. No es necesario eliminarla manualmente.

### Ejemplo de Consumo — Con nueva imagen (multipart/form-data)

```javascript
/**
 * Actualiza un barrio con opción de reemplazar la imagen.
 * @param {string} id - UUID del barrio a actualizar.
 * @param {object} updateData - Campos a actualizar: { name, code, parent_id, descripcion }.
 * @param {File|null} nuevaImagen - Archivo de nueva imagen (o null si no se cambia).
 * @param {string} token - Token JWT del administrador.
 * @returns {Promise<object>} - Barrio actualizado.
 */
const updateNeighborhood = async (id, updateData, nuevaImagen, token) => {
  try {
    const formData = new FormData();

    if (updateData.name) formData.append('name', updateData.name);
    if (updateData.code) formData.append('code', updateData.code);
    if (updateData.parent_id !== undefined) {
      formData.append('parent_id', updateData.parent_id || '');
    }

    // metadata como JSON string
    if (updateData.metadata) {
      formData.append('metadata', JSON.stringify(updateData.metadata));
    }

    // Nueva imagen (la anterior se elimina automáticamente de Cloudinary)
    if (nuevaImagen) {
      formData.append('imagen', nuevaImagen);
    }

    const response = await fetch(`http://localhost:3000/api/neighborhoods/${id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Error al actualizar');
    }

    return result;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};

// --- Ejemplo de invocación ---
const fileInput = document.getElementById('inputNuevaImagen');
const nuevaImagen = fileInput.files[0]; // null si no se seleccionó

updateNeighborhood(
  '123e4567-e89b-12d3-a456-426614174000',
  {
    name: 'Cedritos Renovado',
    metadata: { descripcion: 'Barrio renovado con nuevas zonas verdes.' }
  },
  nuevaImagen, // El archivo nuevo o null
  userToken
).then(result => {
  console.log('Actualizado:', result.data);
  // Si se subió imagen nueva:
  // result.data.metadata.imagen → Nueva URL de Cloudinary
});
```

### Ejemplo de Consumo — Sin cambio de imagen (application/json)

```javascript
const updateNeighborhoodJSON = async (id, data, token) => {
  try {
    const response = await fetch(`http://localhost:3000/api/neighborhoods/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Error al actualizar');
    }

    return result;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};

// Uso — actualizar solo el nombre (sin tocar imagen)
updateNeighborhoodJSON(barrioId, { name: 'Nuevo Nombre' }, userToken);
```

### Ejemplo con cURL

```bash
# Con nueva imagen (multipart/form-data)
curl -X PUT http://localhost:3000/api/neighborhoods/UUID_DEL_BARRIO \
  -H "Authorization: Bearer TU_TOKEN" \
  -F "name=Cedritos Renovado" \
  -F 'metadata={"descripcion": "Barrio renovado"}' \
  -F "imagen=@/ruta/a/nueva_imagen.jpg"

# Sin imagen (JSON)
curl -X PUT http://localhost:3000/api/neighborhoods/UUID_DEL_BARRIO \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Nuevo Nombre"}'
```

### Estructura de la Respuesta Exitosa (200 OK)

```json
{
  "ok": true,
  "message": "Barrio actualizado exitosamente",
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "Cedritos Renovado",
    "code": "BAR-0105",
    "parent_id": "uuid-localidad-01",
    "metadata": {
      "descripcion": "Barrio renovado con nuevas zonas verdes.",
      "imagen": "https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772490000/aquanova/neighborhoods/nueva_imagen_abc123.jpg",
      "imagen_public_id": "aquanova/neighborhoods/nueva_imagen_abc123"
    }
  }
}
```

### Respuestas Posibles

| Código | Descripción |
|--------|-------------|
| **200 OK** | Actualización exitosa |
| **400 Bad Request** | Datos inválidos, código duplicado, o intento de asignarse a sí mismo como padre |
| **404 Not Found** | El barrio o el `parent_id` especificado no existen |
| **403 Forbidden** | No tiene permisos de administrador |
| **500 Internal Server Error** | Error interno (incluye fallos de Cloudinary) |

---

## 3. Eliminar Barrio

Elimina un barrio del sistema. La imagen asociada en Cloudinary se **elimina automáticamente**.

**Endpoint:** `DELETE /api/neighborhoods/:id`  
**Autenticación:** Requerida (Bearer Token)  
**Rol:** Administrador (1)

### Parámetros de Ruta

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | `string (UUID)` | UUID del barrio a eliminar |

> **⚠️ Restricción:** No se puede eliminar un barrio que tenga sub-barrios (hijos) asociados. Primero debe eliminar los hijos.

### Ejemplo de Consumo (Frontend)

```javascript
/**
 * Elimina un barrio y su imagen de Cloudinary.
 * @param {string} id - UUID del barrio a eliminar.
 * @param {string} token - Token JWT del administrador.
 * @returns {Promise<object>} - Confirmación de eliminación.
 */
const deleteNeighborhood = async (id, token) => {
  try {
    const response = await fetch(`http://localhost:3000/api/neighborhoods/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const result = await response.json();

    if (!response.ok) {
      // Manejar casos específicos como dependencias
      throw new Error(result.message || 'Error al eliminar');
    }

    return result;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};

// Uso
const barrioId = "123e4567-e89b-12d3-a456-426614174000";

deleteNeighborhood(barrioId, userToken)
  .then(data => console.log("Eliminado:", data))
  .catch(err => alert(err.message));
```

### Ejemplo con cURL

```bash
curl -X DELETE http://localhost:3000/api/neighborhoods/UUID_DEL_BARRIO \
  -H "Authorization: Bearer TU_TOKEN"
```

### Estructura de la Respuesta Exitosa (200 OK)

```json
{
  "ok": true,
  "message": "Barrio eliminado exitosamente",
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "Cedritos",
    "code": "BAR-0105"
  }
}
```

### Respuestas Posibles

| Código | Descripción |
|--------|-------------|
| **200 OK** | Eliminación exitosa (imagen también eliminada de Cloudinary) |
| **400 Bad Request** | Tiene sub-barrios asociados o está referenciado en otros registros |
| **404 Not Found** | El barrio no existe |
| **403 Forbidden** | No tiene permisos de administrador |
| **500 Internal Server Error** | Error interno |

---

## Notas para el Frontend

### 1. Formulario HTML de referencia (Crear/Editar)

```html
<form id="formBarrio" enctype="multipart/form-data">
  <input type="text" name="name" placeholder="Nombre del barrio" required />
  <input type="text" name="code" placeholder="Código (ej: BAR-0105)" required />
  
  <select name="parent_id">
    <option value="">Sin padre (raíz)</option>
    <!-- Opciones dinámicas desde GET /api/neighborhoods -->
  </select>

  <textarea name="descripcion" placeholder="Descripción del barrio"></textarea>
  
  <label>
    Imagen del barrio:
    <input type="file" name="imagen" accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/svg+xml" />
  </label>
  
  <button type="submit">Guardar</button>
</form>
```

### 2. Renderizar imagen desde la respuesta

```javascript
// Después de GET /api/neighborhoods
neighborhoods.forEach(barrio => {
  if (barrio.metadata && barrio.metadata.imagen) {
    const img = document.createElement('img');
    img.src = barrio.metadata.imagen; // URL de Cloudinary
    img.alt = barrio.name;
    img.loading = 'lazy'; // Carga diferida para rendimiento
    container.appendChild(img);
  }
});
```

### 3. Flujo completo: Crear barrio con imagen

```
Usuario selecciona imagen → FormData con 'imagen' →
POST /api/neighborhoods (multipart/form-data) →
Backend sube a Cloudinary → Guarda URL en metadata →
Respuesta con metadata.imagen (URL de Cloudinary) →
Frontend muestra imagen con <img src="metadata.imagen">
```

### 4. Flujo completo: Actualizar imagen

```
Usuario selecciona nueva imagen → FormData con 'imagen' →
PUT /api/neighborhoods/:id (multipart/form-data) →
Backend elimina imagen anterior de Cloudinary →
Backend sube nueva imagen a Cloudinary →
Guarda nueva URL en metadata.imagen →
Respuesta con nueva metadata.imagen
```
