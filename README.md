# Backend Aquanova

Este repositorio contiene el código fuente del backend para el proyecto **Aquanova**. Es una API RESTful construida con Node.js y Express, diseñada para gestionar usuarios, autenticación, formularios y envíos de datos.

🔗 **Repositorio:** [https://github.com/YonyChaparro/backend-aquanova](https://github.com/YonyChaparro/backend-aquanova)

## 📋 Tabla de Contenidos

- [Características](#características)
- [Tecnologías Utilizadas](#tecnologías-utilizadas)
- [Requisitos Previos](#requisitos-previos)
- [Instalación](#instalación)
- [Configuración](#configuración)
- [Base de Datos](#base-de-datos)
- [Ejecución](#ejecución)
- [Documentación de la API](#documentación-de-la-api)
- [Estructura del Proyecto](#estructura-del-proyecto)

## ✨ Características

- **Autenticación y Autorización:** Registro e inicio de sesión de usuarios mediante JWT (JSON Web Tokens).
- **Gestión de Usuarios:** CRUD de usuarios y roles.
- **Formularios Dinámicos:** Creación y gestión de formularios.
- **Envíos (Submissions):** Manejo de respuestas a formularios.
- **Seguridad:** Implementación de Helmet y CORS.
- **Documentación:** API documentada con Swagger UI.
- **Base de Datos:** Integración con MySQL usando `mysql2`.

## 🛠 Tecnologías Utilizadas

- **Entorno:** [Node.js](https://nodejs.org/)
- **Framework:** [Express.js](https://expressjs.com/)
- **Base de Datos:** MySQL
- **ORM/Driver:** mysql2 (Consultas SQL nativas con promesas)
- **Autenticación:** jsonwebtoken (JWT), bcryptjs
- **Documentación:** Swagger (swagger-jsdoc, swagger-ui-express)
- **Utilidades:** dotenv, morgan, cors, helmet, uuid

## ⚙️ Requisitos Previos

Asegúrate de tener instalado lo siguiente en tu máquina:

- [Node.js](https://nodejs.org/) (v14 o superior recomendado)
- [MySQL](https://www.mysql.com/)
- Git

## 🚀 Instalación

1.  **Clonar el repositorio:**

    ```bash
    git clone https://github.com/YonyChaparro/backend-aquanova.git
    cd backend-aquanova
    ```

2.  **Instalar dependencias:**

    ```bash
    npm install
    ```

## 🔧 Configuración

1.  Crea un archivo `.env` en la raíz del proyecto basándote en las variables necesarias. Puedes usar el siguiente ejemplo:

    ```env
    PORT=3000
    
    # Configuración de Base de Datos
    DB_HOST=localhost
    DB_USER=root
    DB_PASSWORD=tu_contraseña
    DB_NAME=app_aquanova_bd
    
    # Clave secreta para JWT
    JWT_SECRET=tu_clave_secreta_super_segura
    ```

## 🗄 Base de Datos

El proyecto incluye un archivo SQL para inicializar la estructura de la base de datos.

1.  Asegúrate de tener MySQL corriendo.
2.  Crea la base de datos (por defecto `app_aquanova_bd` o la que hayas definido en tu `.env`).
3.  Importa el archivo `src/config/BD.sql` en tu gestor de base de datos (MySQL Workbench, phpMyAdmin, DBeaver, etc.) o ejecuta el script manualmente.

> **Nota:** El proyecto incluye un script `seed.js` que se ejecuta al iniciar el servidor (`npm start` o `npm run dev`). Este script puede contener lógica para poblar datos iniciales o verificar la conexión.

## ▶️ Ejecución

El proyecto cuenta con los siguientes scripts definidos en `package.json`:

- **Modo Desarrollo (con nodemon):**
  Reinicia el servidor automáticamente ante cambios.
  ```bash
  npm run dev
  ```

- **Modo Producción:**
  ```bash
  npm start
  ```

El servidor se iniciará por defecto en `http://localhost:3000`.

## 📖 Documentación de la API

La documentación interactiva de la API está generada con Swagger. Una vez que el servidor esté corriendo, puedes acceder a ella en:

👉 **[http://localhost:3000/api-docs](http://localhost:3000/api-docs)**

Desde allí podrás probar los endpoints de:
- Autenticación (`/api/auth`)
- Usuarios (`/api/users`)
- Formularios (`/api/forms`)
- Envíos (`/api/submissions`)

## 📂 Estructura del Proyecto

```
backend-aquanova/
├── src/
│   ├── config/         # Configuración de BD y Swagger
│   ├── controllers/    # Lógica de los endpoints
│   ├── middlewares/    # Middlewares (Auth, Roles, etc.)
│   ├── models/         # Modelos de datos (Consultas SQL)
│   ├── routes/         # Definición de rutas de la API
│   └── utils/          # Funciones de utilidad
├── seed.js             # Script de inicialización/semilla
├── server.js           # Punto de entrada de la aplicación
├── package.json        # Dependencias y scripts
└── README.md           # Documentación del proyecto
```

---
Desarrollado por [Yony Chaparro](https://github.com/YonyChaparro)
