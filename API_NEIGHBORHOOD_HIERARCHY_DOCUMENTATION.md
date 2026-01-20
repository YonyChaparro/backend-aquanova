# Documentación del Endpoint de Detalle de Barrio (Jerarquía)

Esta documentación describe cómo consumir el endpoint para obtener el detalle de un barrio, una localidad o una ciudad. La característica principal de este endpoint es que retorna la **jerarquía completa de ancestros** (padres) de forma recursiva y calcula automáticamente el tipo de unidad territorial.

## Endpoint

**URL:** `GET /api/neighborhoods/:id`  
**Método:** `GET`  
**Autenticación:** Requerida (Bearer Token)  
**Parámetros de Ruta:** `id` (UUID del barrio/localidad/ciudad)

## Descripción

Recupera la información de un nodo geográfico y **construye su árbol genealógico hacia arriba**.

El sistema calcula automáticamente el campo `type` basándose en la profundidad de la jerarquía:
*   **Ciudad:** No tiene padres (Nivel superior).
*   **Localidad:** Tiene 1 padre (La Ciudad).
*   **Barrio:** Tiene 2 o más ancestros (Localidad -> Ciudad).

## Ejemplo de Uso (Frontend - JavaScript/Fetch)

```javascript
/**
 * Obtiene el detalle de un barrio con su jerarquía.
 * @param {string} id - UUID del barrio.
 * @param {string} token - Token de autenticación.
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
      throw new Error(result.message || 'Error obteniendo barrio');
    }

    const barrio = result.data;
    console.log(`Viendo información de: ${barrio.type} ${barrio.name}`);
    
    // Acceder al padre (si existe)
    if (barrio.parent) {
       console.log(`Pertenece a la ${barrio.parent.type}: ${barrio.parent.name}`);
       
       // Acceder al abuelo (si existe)
       if (barrio.parent.parent) {
          console.log(`Ubicada en la ${barrio.parent.parent.type}: ${barrio.parent.parent.name}`);
       }
    }

    return barrio;

  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}
```

## Estructura de la Respuesta (200 OK)

La respuesta es un objeto JSON recursivo. Cada nivel tiene un objeto `parent` que contiene al ancestro inmediato.

### Ejemplo: Consultando un Barrio (Nivel 3)

```json
{
  "ok": true,
  "data": {
    "id": "uuid-barrio-san-juan",
    "name": "San Juan",
    "code": "BSJ-01",
    "type": "Barrio",           // Calculado automáticamente
    "parent_id": "uuid-localidad-norte",
    "metadata": { "estrato": 2 },
    "created_at": "2026-01-20T10:00:00.000Z",
    "parent": {                 // <--- PADRE (Localidad)
      "id": "uuid-localidad-norte",
      "name": "Localidad Norte",
      "code": "LOC-N",
      "type": "Localidad",      // Calculado automáticamente
      "parent_id": "uuid-ciudad-capital",
      "metadata": null,
      "parent": {               // <--- ABUELO (Ciudad)
        "id": "uuid-ciudad-capital",
        "name": "Ciudad Capital",
        "code": "CAP-01",
        "type": "Ciudad",       // Calculado automáticamente
        "parent_id": null,
        "metadata": null,
        "parent": null          // Fin de la cadena
      }
    }
  }
}
```

### Ejemplo: Consultando una Ciudad (Nivel 1)

```json
{
  "ok": true,
  "data": {
    "id": "uuid-ciudad-capital",
    "name": "Ciudad Capital",
    "type": "Ciudad",
    "parent_id": null,
    "parent": null
  }
}
```

## Manejo de Errores

### 404 Not Found
Si el ID proporcionado no existe en la base de datos.
```json
{
  "ok": false,
  "message": "Barrio no encontrado"
}
```

### 500 Internal Server Error
Error técnico al procesar la jerarquía.
