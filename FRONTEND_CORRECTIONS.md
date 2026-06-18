# Correcciones Frontend — Gemelo Digital (Predios censados)

> Contexto: el frontend mostraba solo 36 predios como "censados" porque leía
> `lots.status` directamente desde el endpoint del gemelo digital. Ese campo
> no estaba sincronizado con los registros del censo.  
> La solución es consumir el nuevo endpoint `/map/census/:neighborhoodId` y
> calcular el status dinámicamente en el cliente.

---

## 1. Nuevo endpoint disponible

```
GET /api/map/census/:neighborhoodId
```

Devuelve todos los registros del formulario **"Censo de Usuarios"** para un
barrio, con la información suficiente para calcular el color de cada predio y
mostrar el detalle en el panel lateral.

### Respuesta

```json
{
  "ok": true,
  "count": 224,
  "data": [
    {
      "id_respuesta":           "50b2b119-11f6-4038-a596-28b0014281f7",
      "lot_id":                 "49fb78c1-c9f8-47e0-80ef-e4f75b541207",
      "lot_id_directo":         null,
      "predio_id_legado":       "49fb78c1-c9f8-47e0-80ef-e4f75b541207",
      "fecha_creacion":         "2026-04-12T19:36:46.000Z",
      "barrio":                 "Barrio Las Mercedes",
      "manzana":                4,
      "direccion":              "Calle 38 Sur # 16 - 162",
      "tipo_punto":             "Und. Hab./No Hab. Única",
      "clase_uso":              "Residencial",
      "estado_predio":          "Predio En Obra",
      "unidades_habitacionales": 1,
      "numero_habitantes":      null,
      "numero_familias":        null,
      "tiene_agua":             "Sí",
      "horas_agua":             24,
      "registro":               null,
      "plano":                  null,
      "observaciones":          "Esquinero de tres pisos...",
      "inspector_nombre":       "Javier García",
      "atendio_nombre":         null,
      "atendio_rol":            "No Especificado",
      "foto_fachada":           "https://res.cloudinary.com/.../foto.jpg",
      "firma_digital":          "https://res.cloudinary.com/.../firma.jpg"
    }
  ]
}
```

### Campos clave

| Campo | Descripción |
|---|---|
| `lot_id` | UUID del predio. Intentar cruzar con `lot.id` del gemelo digital |
| `lot_id_directo` | `null` si el predio no coincide con la BD actual (ver §4) |
| `registro` | Código del medidor de agua. Si tiene valor → status `registrado` |

---

## 2. Cambio en la carga inicial del mapa

Actualmente el frontend hace **una sola llamada** al cargar un barrio:

```
GET /api/map/digital-twin/:neighborhoodId
```

Debe hacer **dos llamadas en paralelo**:

```js
const [twinRes, censusRes] = await Promise.all([
  fetch(`/api/map/digital-twin/${neighborhoodId}`),
  fetch(`/api/map/census/${neighborhoodId}`)
]);

const { data: twin }     = await twinRes.json();
const { data: censoRows } = await censusRes.json();
```

---

## 3. Construir el índice de censo por predio

Antes de pintar el mapa, construir un `Map` indexado por `lot_id`:

```js
// Un predio puede tener varias visitas; guardar la más reciente (ya vienen
// ordenadas por fecha DESC desde el backend).
const censoIndex = new Map();

for (const record of censoRows) {
  if (record.lot_id && !censoIndex.has(record.lot_id)) {
    censoIndex.set(record.lot_id, record);
  }
}
```

---

## 4. Calcular el status de cada predio (reemplaza `lot.status`)

La lógica documentada en `FLUJO_DATOS_PREDIOS.md`:

```js
function computeLotStatus(lot, censoIndex) {
  const censo = censoIndex.get(lot.id);

  if (!censo) return 'sin_informacion'; // gris

  if (censo.registro && censo.registro.trim() !== '') {
    return 'registrado'; // verde — tiene código de medidor
  }

  return 'censado'; // azul — fue visitado pero sin medidor
}
```

Aplicarlo al renderizar cada predio:

```js
// Antes (incorrecto — depende del campo en BD):
const status = lot.status;

// Después (correcto — calculado desde el censo):
const status = computeLotStatus(lot, censoIndex);
```

> **No eliminar `lot.status` del modelo**; sigue siendo útil como fallback
> mientras el endpoint de censo no tenga datos para todos los predios.
> Si el censo no tiene registros (`censoRows.length === 0`), usar `lot.status`
> como valor por defecto.

---

## 5. Panel lateral de detalle del predio

Al hacer clic en un predio, mostrar los datos del censo si existen:

```js
function onLotClick(lot) {
  const censo = censoIndex.get(lot.id);

  if (!censo) {
    // Mostrar panel vacío con el mensaje "Sin información de censo"
    showEmptyPanel(lot);
    return;
  }

  showCensoPanel({
    direccion:              censo.direccion,
    fecha:                  censo.fecha_creacion,
    barrio:                 censo.barrio,
    manzana:                censo.manzana,
    tipo_punto:             censo.tipo_punto,
    clase_uso:              censo.clase_uso,
    estado_predio:          censo.estado_predio,
    unidades_habitacionales: censo.unidades_habitacionales,
    numero_habitantes:      censo.numero_habitantes,
    numero_familias:        censo.numero_familias,
    tiene_agua:             censo.tiene_agua,
    horas_agua:             censo.horas_agua,
    registro:               censo.registro,        // código medidor
    plano:                  censo.plano,
    observaciones:          censo.observaciones,
    inspector_nombre:       censo.inspector_nombre,
    atendio_nombre:         censo.atendio_nombre,
    atendio_rol:            censo.atendio_rol,
    foto_fachada:           censo.foto_fachada,
    firma_digital:          censo.firma_digital,
  });
}
```

---

## 6. Migración de UUID — campo `external_id` en predios

El campo `external_id` ya fue agregado a la tabla `lots` y al endpoint del
gemelo digital. Permite cruzar registros del censo del sistema anterior con
los predios del sistema actual.

### Cómo funciona ahora

El endpoint `/map/census/:neighborhoodId` resuelve `lot_id` en tres niveles:

| Prioridad | Mecanismo | Descripción |
|---|---|---|
| 1 | `submissions.lot_id` (FK directa) | El mejor caso — submission ya vinculada al predio nuevo |
| 2 | `lots.external_id` matching | El UUID del CSV coincide con `external_id` del lote actual |
| 3 | UUID legado del formulario | Fallback — deja el UUID del sistema anterior |

El campo `lot_id` devuelto en la respuesta ya refleja el mejor resultado disponible.

### Qué cambiar en el frontend

El endpoint `/map/digital-twin/:neighborhoodId` ahora incluye `external_id` en
cada predio. Construir dos índices en paralelo:

```js
const censoIndex    = new Map(); // lot_id (resuelto) → record
const censoByLegacy = new Map(); // predio_id_legado  → record

for (const record of censoRows) {
  // censoIndex usa lot_id que ya incorpora la resolución por external_id
  if (record.lot_id && !censoIndex.has(record.lot_id)) {
    censoIndex.set(record.lot_id, record);
  }
  if (record.predio_id_legado && !censoByLegacy.has(record.predio_id_legado)) {
    censoByLegacy.set(record.predio_id_legado, record);
  }
}
```

Lookup con fallback a `external_id`:

```js
function computeLotStatus(lot, censoIndex, censoByLegacy) {
  const censo = censoIndex.get(lot.id)
             || (lot.external_id ? censoByLegacy.get(lot.external_id) : undefined);

  if (!censo) return 'sin_informacion';
  if (censo.registro && censo.registro.trim() !== '') return 'registrado';
  return 'censado';
}
```

### Estado actual de la migración

| Escenario | `lot_id_directo` | `lot_id_via_external` | Resultado |
|---|---|---|---|
| UUID del CSV = `lots.id` (36 predios en prod) | no null | null | ✅ Resuelto por FK directa |
| `lots.external_id` = UUID del CSV | null | no null | ✅ Resuelto por external_id |
| Sin mapeo aún | null | null | ❌ Sigue en gris |

### Completar el mapeo manualmente

```bash
# 1. Genera el archivo de mapeo
node generate-lot-mapping.js
# → crea lot-uuid-mapping.json

# 2. Edita lot-uuid-mapping.json:
#    Para cada entrada con match_type == "PENDIENTE",
#    asigna new_lot_id con el UUID del predio correcto en BD
#    (usa la sección lista_lotes_disponibles del mismo archivo como referencia).

# 3. Aplica el mapeo
node apply-lot-mapping.js

# 4. Re-importa las submissions (ahora con lot_id resuelto)
node seed-submissions.js
```

---

## 7. Resumen de cambios en el frontend

| # | Qué cambiar | Dónde |
|---|---|---|
| 1 | Agregar llamada a `GET /api/map/census/:neighborhoodId` al cargar el barrio | Carga inicial del mapa |
| 2 | Construir `censoIndex` (Map de `lot_id → record`) con los datos recibidos | Lógica de datos |
| 3 | Reemplazar `lot.status` por `computeLotStatus(lot, censoIndex)` | Renderizado de predios |
| 4 | Mostrar datos del censo en el panel lateral al hacer clic en un predio | Panel de detalle |
| 5 | Usar `lot.status` como fallback si el censo no tiene datos aún | Manejo de errores |
