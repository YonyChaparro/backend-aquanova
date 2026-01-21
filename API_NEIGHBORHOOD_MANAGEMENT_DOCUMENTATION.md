# Documentación de API - Gestión de Barrios

Esta documentación detalla los endpoints para la edición y eliminación de barrios en el sistema.

## 1. Actualizar Barrio

Actualiza la información de un barrio existente.

**Endpoint:** `PUT /api/neighborhoods/:id`  
**Autenticación:** Requerida (Bearer Token)  
**Rol:** Administrador (1)

### Parámetros de Ruta

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | UUID del barrio a actualizar |

### Cuerpo de la Petición (JSON)

Todos los campos son opcionales, pero se debe enviar al menos uno.

```json
{
  "name": "Barrio Centro Actualizado",
  "code": "CEN-001",
  "parent_id": "uuid-del-padre", // O null para quitar padre
  "metadata": {
    "estrato": 4,
    "poblacion": 5000
  }
}
```

### Ejemplo de Consumo (Frontend)

```javascript
const updateNeighborhood = async (id, data, token) => {
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

// Uso
const barrioId = "123e4567-e89b-12d3-a456-426614174000";
const updateData = {
    name: "Nuevo Nombre",
    metadata: { zona: "Norte" }
};

updateNeighborhood(barrioId, updateData, userToken)
  .then(data => console.log("Actualizado:", data))
  .catch(err => console.error(err));
```

### Respuestas Posibles

- **200 OK**: Actualización exitosa.
- **400 Bad Request**: Datos inválidos, código duplicado o intento de asignarse a sí mismo como padre.
- **404 Not Found**: El barrio o el padre especificado no existen.
- **403 Forbidden**: No tiene permisos de administrador.

---

## 2. Eliminar Barrio

Elimina un barrio del sistema. No se permite eliminar si tiene sub-barrios asociados.

**Endpoint:** `DELETE /api/neighborhoods/:id`  
**Autenticación:** Requerida (Bearer Token)  
**Rol:** Administrador (1)

### Parámetros de Ruta

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | string | UUID del barrio a eliminar |

### Ejemplo de Consumo (Frontend)

```javascript
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

### Respuestas Posibles

- **200 OK**: Eliminación exitosa.
- **400 Bad Request**: No se puede eliminar porque tiene hijos (sub-barrios) o está referenciado en otros registros.
- **404 Not Found**: El barrio no existe.
- **403 Forbidden**: No tiene permisos de administrador.
