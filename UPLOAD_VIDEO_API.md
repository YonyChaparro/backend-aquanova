# API Upload Video - Documentación

## Descripción General

Endpoint público para subir videos a Cloudinary. No requiere autenticación y está diseñado para ser usado por el formulario público de la aplicación.

---

## Endpoint

```
POST /api/upload/video
```

**Base URL**: `http://localhost:3000` (desarrollo)

---

## Request

### Headers

```
Content-Type: multipart/form-data
```

> **Nota**: El header `Authorization` es opcional. Si se incluye, debe seguir el formato `Bearer <token>`

### Body (FormData)

| Campo | Tipo | Requerido | Descripción | Ejemplo |
|-------|------|-----------|-------------|---------|
| `video` | File | ✅ Sí | Archivo de video a subir | `video.mp4` |
| `folder` | String | ❌ No | Carpeta destino en Cloudinary | `"submissions"` |

#### Formatos de video soportados

- **MP4** (`video/mp4`)
- **MOV** (`video/quicktime`)
- **AVI** (`video/x-msvideo`)
- **WebM** (`video/webm`)
- **MPEG** (`video/mpeg`)
- **MKV** (`video/x-matroska`)

#### Límites

- **Tamaño máximo**: 100 MB
- **Carpeta por defecto**: `aquanova/submissions` (si no se especifica)

---

## Response

### Success Response (200)

```json
{
  "ok": true,
  "message": "Video subido exitosamente",
  "url": "https://res.cloudinary.com/xxx/video/upload/v1234567890/aquanova/submissions/abc123.mp4",
  "secure_url": "https://res.cloudinary.com/xxx/video/upload/v1234567890/aquanova/submissions/abc123.mp4",
  "public_id": "aquanova/submissions/abc123",
  "resource_type": "video"
}
```

#### Campos de respuesta

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `ok` | Boolean | Indica si la operación fue exitosa |
| `message` | String | Mensaje descriptivo del resultado |
| `url` | String | URL segura HTTPS del video en Cloudinary |
| `secure_url` | String | URL segura (alias de `url`) |
| `public_id` | String | Identificador único del video en Cloudinary |
| `resource_type` | String | Tipo de recurso (siempre `"video"`) |

### Error Responses

#### 400 - Bad Request

**No se proporcionó ningún video**:
```json
{
  "ok": false,
  "message": "No se ha proporcionado ningún video"
}
```

**Tipo de archivo no permitido**:
```json
{
  "ok": false,
  "message": "Tipo de archivo no permitido: video/x-flv. Solo se permiten videos (MP4, MOV, AVI, WebM, MPEG, MKV)."
}
```

#### 500 - Internal Server Error

```json
{
  "ok": false,
  "message": "Error al subir el video a Cloudinary"
}
```

---

## Ejemplos de Uso

### JavaScript (Fetch API)

```javascript
const uploadVideo = async (videoFile, folder = 'submissions') => {
  const formData = new FormData();
  formData.append('video', videoFile);
  formData.append('folder', folder);

  try {
    const response = await fetch('http://localhost:3000/api/upload/video', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Video subido:', data.url);
    return data;
  } catch (error) {
    console.error('Error al subir video:', error);
    throw error;
  }
};

// Uso
const fileInput = document.querySelector('input[type="file"]');
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) {
    const result = await uploadVideo(file, 'submissions');
    console.log('URL del video:', result.url);
  }
});
```

### JavaScript (Axios)

```javascript
import axios from 'axios';

const uploadVideo = async (videoFile, folder = 'submissions') => {
  const formData = new FormData();
  formData.append('video', videoFile);
  formData.append('folder', folder);

  try {
    const { data } = await axios.post(
      'http://localhost:3000/api/upload/video',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          console.log(`Progreso: ${percentCompleted}%`);
        }
      }
    );

    return data;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    throw error;
  }
};
```

### React Example

```jsx
import { useState } from 'react';

function VideoUploader() {
  const [uploading, setUploading] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');

  const handleUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validar tamaño (100MB)
    if (file.size > 100 * 1024 * 1024) {
      alert('El video excede el tamaño máximo de 100MB');
      return;
    }

    const formData = new FormData();
    formData.append('video', file);
    formData.append('folder', 'submissions');

    setUploading(true);

    try {
      const response = await fetch('http://localhost:3000/api/upload/video', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (data.ok) {
        setVideoUrl(data.url);
        console.log('Video subido exitosamente:', data.url);
      } else {
        alert(data.message);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error al subir el video');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        accept="video/mp4,video/quicktime,video/x-msvideo,video/webm,video/mpeg,video/x-matroska"
        onChange={handleUpload}
        disabled={uploading}
      />
      {uploading && <p>Subiendo video...</p>}
      {videoUrl && (
        <video src={videoUrl} controls width="400">
          Tu navegador no soporta el elemento de video.
        </video>
      )}
    </div>
  );
}

export default VideoUploader;
```

### cURL

```bash
curl -X POST http://localhost:3000/api/upload/video \
  -F "video=@/path/to/video.mp4" \
  -F "folder=submissions"
```

---

## Configuración Requerida

### Variables de Entorno

El endpoint requiere que Cloudinary esté configurado con las siguientes variables de entorno en el archivo `.env`:

```env
# Opción 1: URL completa de Cloudinary
CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME

# Opción 2: Configuración individual
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### Estructura de Archivos

```
src/
├── config/
│   └── cloudinary.js          # Configuración de Cloudinary
├── controllers/
│   └── uploadController.js    # Lógica de upload
├── helpers/
│   └── cloudinaryHelper.js    # Helper para subir videos
├── middlewares/
│   └── uploadMiddleware.js    # Multer config (100MB limit)
└── routes/
    └── uploadRoutes.js        # Rutas de upload
```

---

## Validaciones

### Validación de tipo de archivo

El middleware `uploadMiddleware.js` valida que el archivo sea un video permitido mediante el `mimetype`:

```javascript
const allowedMimeTypes = [
  'video/mp4',
  'video/quicktime',  // MOV
  'video/x-msvideo',  // AVI
  'video/webm',
  'video/mpeg',
  'video/3gpp',
  'video/x-matroska'  // MKV
];
```

### Validación de tamaño

- **Límite configurado**: 100 MB (104,857,600 bytes)
- **Validado por**: Multer middleware
- **Comportamiento**: Si se excede el límite, Multer rechaza el archivo automáticamente

---

## Optimización en Cloudinary

Los videos subidos incluyen transformación automática:

```javascript
transformation: [
  { quality: 'auto' }  // Optimización automática de calidad
]
```

Esto permite que Cloudinary ajuste la calidad del video según el dispositivo y conexión del usuario final.

---

## Códigos de Estado HTTP

| Código | Significado | Descripción |
|--------|-------------|-------------|
| 200 | OK | Video subido exitosamente |
| 400 | Bad Request | No se proporcionó video o tipo de archivo inválido |
| 500 | Internal Server Error | Error en el servidor o en Cloudinary |

---

## Notas Adicionales

1. **Endpoint público**: No requiere autenticación
2. **CORS habilitado**: Puede ser llamado desde cualquier dominio
3. **Almacenamiento temporal**: Usa `multer.memoryStorage()` (buffer en memoria)
4. **Limpieza automática**: El buffer se libera después de subir a Cloudinary
5. **Overwrite**: Las subidas con el mismo `public_id` sobrescribirán el archivo anterior

---

## Swagger Documentation

La documentación interactiva está disponible en:

```
http://localhost:3000/api-docs
```

Busca el tag **Upload** y el endpoint **POST /upload/video** para probar directamente desde el navegador.

---

## Soporte y Troubleshooting

### Error: "No se ha proporcionado ningún video"

- Verifica que el campo del FormData se llame `video`
- Asegúrate de usar `multipart/form-data` como `Content-Type`

### Error: "Tipo de archivo no permitido"

- Verifica que el formato del video esté en la lista de formatos soportados
- Algunos archivos pueden tener extensión .mp4 pero mimetype diferente

### Error 500: "Error al subir el video a Cloudinary"

- Verifica que las credenciales de Cloudinary en `.env` sean correctas
- Revisa los logs del servidor para más detalles
- Verifica que tu plan de Cloudinary permita videos del tamaño que estás subiendo

---

## Changelog

- **v1.0.0** (2026-03-17): Implementación inicial con soporte para:
  - Formatos: MP4, MOV, AVI, WebM, MPEG, MKV
  - Límite: 100MB
  - Optimización automática de calidad
