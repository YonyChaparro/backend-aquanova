# Documentación del Endpoint de Listado de Formularios

Esta documentación describe cómo consumir el endpoint para listar todos los formularios disponibles, destacando la estructura detallada de los barrios asociados (incluyendo códigos, metadatos y relaciones padre/hijo).

## Endpoint

**URL:** `GET /api/forms`  
**Método:** `GET`  
**Autenticación:** Requerida (Bearer Token)

## Descripción
Retorna una lista de todos los formularios ordenados por fecha de creación (descendente). Cada formulario incluye un array `neighborhoods` con la información completa de los barrios donde está publicado.

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

El objeto de respuesta incluye el detalle completo del barrio en `neighborhoods`.

```json
{
  "ok": true,
  "forms": [
    {
      "id": "uuid-form-123",
      "key": "censo-2026",
      "title": "Censo General 2026",
      "description": "Encuesta demográfica",
      "is_active": 1,
      "created_by": "Juan Perez",
      "created_at": "2026-01-20T10:00:00.000Z",
      "neighborhoods": [
        {
          "id": "uuid-barrio-hijo",
          "name": "Barrio Norte - Sector A",
          "code": "NORTE-A",
          "parent_id": "uuid-barrio-padre", 
          "metadata": {
            "zona": "residencial",
            "estrato": 3
          },
          "created_at": "2026-01-15T09:30:00.000Z"
        },
        {
          "id": "uuid-barrio-independiente",
          "name": "Barrio Centro",
          "code": "CENTRO-01",
          "parent_id": null,
          "metadata": null,
          "created_at": "2026-01-10T08:00:00.000Z"
        }
      ]
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
