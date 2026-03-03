# Documentación - Endpoint Desactivar Formulario

## 📋 Información General

**Endpoint:** `DELETE http://localhost:3000/api/forms/:id`

**Descripción:** Desactiva un formulario del sistema (soft delete). El formulario no se elimina permanentemente, sino que se marca como inactivo (`is_active = 0`), junto con todas sus publicaciones asociadas.

---

## 🔐 Autenticación y Autorización

### Requisitos

- **Autenticación:** Token JWT (Bearer Token) requerido
- **Rol Requerido:** **Administrador** (role_id = 1)

⚠️ **Importante:** Solo usuarios con rol de administrador pueden desactivar formularios.

### Headers Requeridos

```http
Authorization: Bearer <tu_token_jwt>
Content-Type: application/json
```

### Cómo obtener el token

1. Autenticarse en el endpoint de login:
   ```
   POST http://localhost:3000/api/auth/login
   ```

2. Body del login:
   ```json
   {
     "email": "admin@example.com",
     "password": "tu_contraseña"
   }
   ```

3. Usar el token recibido en el header `Authorization`

---

## 📤 Request (Solicitud)

### Método HTTP
```
DELETE
```

### URL Completa
```
http://localhost:3000/api/forms/:id
```

### Parámetros de Ruta

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `id` | string (UUID) | Sí | ID del formulario a desactivar |

### Ejemplo de URL
```
http://localhost:3000/api/forms/550e8400-e29b-41d4-a716-446655440000
```

---

## 💻 Ejemplos de Implementación

### Ejemplo con cURL
```bash
curl -X DELETE http://localhost:3000/api/forms/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json"
```

### Ejemplo con JavaScript (Fetch API)
```javascript
const deactivateForm = async (formId) => {
  const token = localStorage.getItem('token');
  
  try {
    const response = await fetch(`http://localhost:3000/api/forms/${formId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Respuesta:', data);
    return data;
    
  } catch (error) {
    console.error('Error al desactivar formulario:', error);
    throw error;
  }
};

// Uso
deactivateForm('550e8400-e29b-41d4-a716-446655440000')
  .then(data => {
    if (data.ok) {
      alert('Formulario desactivado exitosamente');
      // Actualizar la lista de formularios
    }
  });
```

### Ejemplo con Axios
```javascript
import axios from 'axios';

const deactivateForm = async (formId) => {
  const token = localStorage.getItem('token');
  
  try {
    const response = await axios.delete(
      `http://localhost:3000/api/forms/${formId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Formulario desactivado:', response.data);
    return response.data;
    
  } catch (error) {
    console.error('Error al desactivar formulario:', error);
    throw error;
  }
};

// Uso
deactivateForm('550e8400-e29b-41d4-a716-446655440000');
```

---

## 📥 Response (Respuesta)

### Respuesta Exitosa (200 OK)

```json
{
  "ok": true,
  "message": "Formulario desactivado exitosamente"
}
```

### Estructura de la Respuesta

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `ok` | boolean | Indica si la operación fue exitosa |
| `message` | string | Mensaje descriptivo de la operación |

---

## ⚠️ Errores Posibles

### 400 Bad Request - ID inválido
```json
{
  "ok": false,
  "message": "ID de formulario inválido"
}
```
**Causa:** El formato del ID no es un UUID válido.

**Solución:** Verifica que el ID sea un UUID válido en formato:  
`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

---

### 401 Unauthorized - Token no proporcionado o inválido
```json
{
  "ok": false,
  "message": "Token no proporcionado"
}
```
**Causa:** No se incluyó el header `Authorization` o el token es inválido.

**Solución:** Asegúrate de incluir el token JWT en el header:
```javascript
headers: {
  'Authorization': `Bearer ${token}`
}
```

---

### 403 Forbidden - Sin permisos de administrador
```json
{
  "ok": false,
  "message": "Acceso denegado. Solo administradores pueden realizar esta acción"
}
```
**Causa:** El usuario autenticado no tiene rol de administrador.

**Solución:** Este endpoint solo puede ser usado por usuarios con `role_id = 1` (Administrador). Verifica que estés usando las credenciales correctas.

---

### 404 Not Found - Formulario no encontrado
```json
{
  "ok": false,
  "message": "Formulario no encontrado"
}
```
**Causa:** No existe un formulario con el ID especificado.

**Solución:** Verifica que el ID del formulario sea correcto. Puedes consultar la lista de formularios con `GET /api/forms`.

---

### 500 Internal Server Error
```json
{
  "ok": false,
  "message": "Error interno al desactivar formulario"
}
```
**Causa:** Error interno del servidor (problemas con la base de datos).

**Solución:** Contacta al administrador del sistema o verifica los logs del servidor.

---

## 💡 Ejemplo Completo en React

### Componente con Confirmación

```jsx
import React, { useState } from 'react';
import axios from 'axios';

const FormDeactivateButton = ({ formId, formTitle, onDeactivated }) => {
  const [loading, setLoading] = useState(false);

  const handleDeactivate = async () => {
    // Confirmación antes de desactivar
    const confirmed = window.confirm(
      `¿Estás seguro que deseas desactivar el formulario "${formTitle}"?\n\n` +
      'El formulario no será eliminado, solo quedará inactivo y no aparecerá en las apps de los usuarios.'
    );

    if (!confirmed) return;

    const token = localStorage.getItem('token');
    
    if (!token) {
      alert('No estás autenticado');
      return;
    }

    setLoading(true);

    try {
      const response = await axios.delete(
        `http://localhost:3000/api/forms/${formId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.ok) {
        alert('Formulario desactivado exitosamente');
        // Callback para actualizar la lista
        if (onDeactivated) {
          onDeactivated(formId);
        }
      }

    } catch (error) {
      console.error('Error:', error);
      
      if (error.response?.status === 401) {
        alert('Token inválido o expirado. Por favor, inicia sesión nuevamente.');
      } else if (error.response?.status === 403) {
        alert('No tienes permisos de administrador para realizar esta acción.');
      } else if (error.response?.status === 404) {
        alert('El formulario no fue encontrado.');
      } else {
        alert('Error al desactivar el formulario. Intenta nuevamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button 
      onClick={handleDeactivate} 
      disabled={loading}
      style={{
        backgroundColor: '#dc3545',
        color: 'white',
        padding: '8px 16px',
        border: 'none',
        borderRadius: '4px',
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.6 : 1
      }}
    >
      {loading ? 'Desactivando...' : 'Desactivar Formulario'}
    </button>
  );
};

export default FormDeactivateButton;
```

### Uso del Componente

```jsx
import FormDeactivateButton from './FormDeactivateButton';

const FormsList = () => {
  const [forms, setForms] = useState([...]);

  const handleFormDeactivated = (formId) => {
    // Actualizar el estado del formulario en la lista
    setForms(prevForms => 
      prevForms.map(form => 
        form.id === formId 
          ? { ...form, is_active: false } 
          : form
      )
    );
  };

  return (
    <div>
      {forms.map(form => (
        <div key={form.id}>
          <h3>{form.title}</h3>
          <span>{form.is_active ? '✅ Activo' : '❌ Inactivo'}</span>
          
          {form.is_active && (
            <FormDeactivateButton 
              formId={form.id}
              formTitle={form.title}
              onDeactivated={handleFormDeactivated}
            />
          )}
        </div>
      ))}
    </div>
  );
};
```

---

## 🔄 Alternativa: Actualizar Estado con PUT

También puedes desactivar un formulario usando el endpoint de actualización.

> ⚠️ El endpoint PUT ahora usa `multipart/form-data`. El campo `is_active` se envía como string `"false"`.

```javascript
// PUT http://localhost:3000/api/forms/:id
const deactivateFormWithPut = async (formId) => {
  const token = localStorage.getItem('token');
  
  const formData = new FormData();
  formData.append('is_active', 'false');

  const response = await fetch(
    `http://localhost:3000/api/forms/${formId}`,
    {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    }
  );
  
  return await response.json();
};
```

### Diferencias entre DELETE y PUT

| Método | Endpoint | Uso recomendado |
|--------|----------|-----------------|
| **DELETE** | `/api/forms/:id` | Desactivar completamente (soft delete) |
| **PUT** | `/api/forms/:id` | Actualizar estado + otros campos |

---

## 🛠️ Servicio API Reutilizable

```javascript
// services/formService.js
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
};

export const formService = {
  
  // Listar todos los formularios
  async getAllForms() {
    const response = await axios.get(`${API_URL}/forms`, {
      headers: getAuthHeaders()
    });
    return response.data;
  },

  // Obtener detalle de un formulario
  async getFormById(formId) {
    const response = await axios.get(`${API_URL}/forms/${formId}`, {
      headers: getAuthHeaders()
    });
    return response.data;
  },

  // Desactivar formulario
  async deactivateForm(formId) {
    const response = await axios.delete(`${API_URL}/forms/${formId}`, {
      headers: getAuthHeaders()
    });
    return response.data;
  },

  // Actualizar formulario (multipart/form-data)
  async updateForm(formId, fields, imageFile = null) {
    const formData = new FormData();
    if (imageFile) formData.append('imagen', imageFile);
    if (fields.title !== undefined) formData.append('title', fields.title);
    if (fields.description !== undefined) formData.append('description', fields.description);
    if (fields.is_active !== undefined) formData.append('is_active', String(fields.is_active));
    if (fields.schema !== undefined) formData.append('schema', JSON.stringify(fields.schema));
    if (fields.neighborhood_id !== undefined) formData.append('neighborhood_id', fields.neighborhood_id);

    const response = await axios.put(
      `${API_URL}/forms/${formId}`,
      formData,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    return response.data;
  },

  // Crear formulario (multipart/form-data)
  async createForm(fields, imageFile = null) {
    const formData = new FormData();
    if (imageFile) formData.append('imagen', imageFile);
    formData.append('title', fields.title);
    formData.append('neighborhood_id', fields.neighborhood_id);
    formData.append('schema', JSON.stringify(fields.schema));
    if (fields.description) formData.append('description', fields.description);

    const response = await axios.post(
      `${API_URL}/forms`,
      formData,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    return response.data;
  }
};
```

### Uso del Servicio

```javascript
import { formService } from './services/formService';

// Desactivar formulario
try {
  const result = await formService.deactivateForm(formId);
  if (result.ok) {
    console.log('Formulario desactivado');
  }
} catch (error) {
  console.error('Error:', error);
}
```

---

## 🔍 Comportamiento del Soft Delete

### ¿Qué sucede al desactivar un formulario?

1. **Campo `is_active` del formulario:** Se cambia de `1` a `0`
2. **Publicaciones asociadas:** Todas las publicaciones del formulario en los barrios se desactivan (`is_active = 0`)
3. **Datos preservados:** Los datos del formulario NO se eliminan, solo se marcan como inactivos
4. **Imagen de portada (Cloudinary):** La imagen alojada en Cloudinary **NO se elimina** al desactivar. El formulario puede ser reactivado conservando su imagen.
5. **Respuestas existentes:** Las respuestas anteriores al formulario se mantienen intactas

### ¿Cómo aparece en el listado?

Después de desactivar, el formulario seguirá apareciendo en `GET /api/forms` pero con `is_active: false`.

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Censo Barrial",
  "is_active": false,  // ← Ahora está en false
  "neighborhoods": [...]
}
```

### Reactivar un formulario

Para reactivar un formulario desactivado, usa el endpoint PUT:

```javascript
await axios.put(
  `http://localhost:3000/api/forms/${formId}`,
  { is_active: true },
  { headers: getAuthHeaders() }
);
```

---

## 📝 Notas Importantes

1. **Solo Administradores:** Este endpoint requiere rol de administrador (`role_id = 1`).

2. **Soft Delete:** No es una eliminación permanente. Los datos se preservan en la base de datos.

3. **Imagen Cloudinary preservada:** La imagen de portada alojada en Cloudinary **no se elimina** al desactivar el formulario. Solo se desactiva el registro en base de datos.

4. **Transacción:** La desactivación es una transacción que afecta:
   - Tabla `forms` (campo `is_active`)
   - Tabla `form_publications` (campo `is_active`)

5. **Respuestas existentes:** Las respuestas de usuarios al formulario se mantienen intactas.

6. **Sin cuerpo en la petición:** El método DELETE no requiere body, solo el ID en la URL.

7. **Confirmación recomendada:** Implementa siempre confirmación en el frontend antes de desactivar.

---

## ✅ Checklist de Integración

- [ ] Verificar que el usuario tiene rol de administrador
- [ ] Implementar sistema de autenticación con token JWT
- [ ] Obtener el ID del formulario desde la lista de formularios
- [ ] Implementar confirmación antes de desactivar
- [ ] Manejar errores 401 (no autenticado), 403 (sin permisos), 404 (no encontrado)
- [ ] Implementar indicador de carga durante la operación
- [ ] Actualizar la UI después de desactivar (cambiar `is_active` a false)
- [ ] Mostrar mensaje de éxito al usuario
- [ ] Opcional: Permitir reactivar formularios (usando PUT)
- [ ] Implementar logs de auditoría en el frontend

---

## 🔗 Endpoints Relacionados

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/forms` | GET | Listar todos los formularios |
| `/api/forms/:id` | GET | Obtener detalle de un formulario |
| `/api/forms/:id` | PUT | Actualizar formulario (incluye reactivar) |
| `/api/forms/:id` | DELETE | Desactivar formulario (soft delete) |
| `/api/forms` | POST | Crear nuevo formulario |

---

**Última actualización:** 2 de marzo de 2026
