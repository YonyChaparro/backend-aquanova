# Guía para Sincronizar la Base de Datos Local

Esta guía explica a todos los colaboradores del repositorio cómo mantener su entorno local actualizado con la última estructura y los datos maestrales de la base de datos.

## ¿Por qué es necesario?
Dado que este proyecto se apoya fuertemente en un esquema gestionado desde código, utilizamos el script `seed.js` como nuestra única fuente de verdad (Single Source of Truth). Esto garantiza que todos trabajemos exactamente con las mismas tablas, las mismas relaciones y la misma data básica requerida.

---

## Pasos para obtener la última versión

Cada vez que te notifiquen sobre un cambio en la estructura o traigas nuevos commits de tus compañeros, sigue estos pasos:

### 1. Actualiza tu repositorio local
Abre tu terminal en la ruta del proyecto (backend) y descárgate la última versión:
```bash
git pull origin main
```
*(Cambia `main` por tu rama de trabajo si aplica).*

### 2. Actualiza los paquetes (Opcional pero recomendado)
Si alguien instaló alguna librería nueva en el servidor:
```bash
npm install
```

### 3. Sincroniza la Base de Datos
Ejecuta el comando *seed* para regenerar la información de la base de datos:
```bash
npm run seed
```

---

## ⚠️ ¿Qué hace exactamente `npm run seed`?

El archivo `seed.js` ha sido configurado para limpiar tu entorno conflictivo reemplazándolo con una copia fresca:

1. Ejecuta un `DROP DATABASE IF EXISTS` **borrando toda tu base de datos actual.** (Ten en cuenta que esto eliminará cualquier dato de prueba que hayas creado a mano en tu máquina).
2. Ejecuta un `CREATE DATABASE` para crearla completamente limpia.
3. Genera el esquema completo más actual (Tablas, Claves Foráneas, Constraints...).
4. Inserta los datos maestros (Usuario Administrador, Roles, Formularios base, Coordenadas del Gemelo Digital, Sorteos...).

**Nota Importante:** Si estás desarrollando de manera local y tienes información muy valiosa (por ejemplo, formularios de prueba súper detallados o muchísimas _submissions_ registradas) asegúrate de hacer un `Export` desde tu herramienta SQL (como DBeaver o phpMyAdmin) **antes** de correr el seed, de lo contrario todo se restablecerá.
