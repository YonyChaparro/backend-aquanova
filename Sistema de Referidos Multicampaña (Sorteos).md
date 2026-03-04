# Arquitectura Backend: Sistema de Referidos Multicampaña (Sorteos)

**Contexto del Patrón:** Implementaremos un modelo de **Atribución Diferida**. El flujo principal permite que un usuario anónimo complete un formulario mediante un link de referido, y solo *después* de registrarse, el sistema consolida la información y otorga los puntos al referente original según las reglas de ese sorteo específico.



---

## 1. Modificación de Endpoints Existentes

### A. Creación de Envío (Submissions)
**Endpoint Sugerido:** `POST /api/submissions` (Existente, a modificar)

**Lógica Adicional:**
1. El payload debe aceptar un parámetro opcional `referral_code` (proveniente de la URL `?ref=XYZ`).
2. Si se recibe el `referral_code`, el backend debe buscar el `users.id` correspondiente consultando la tabla `user_referral_profiles`.
3. Se inserta el formulario en `submissions` normalmente (con `user_id` en `NULL` al ser anónimo).
4. Dentro de la misma transacción, se inserta un registro en `submission_referrals` con el `submission_id` recién creado, el `referrer_user_id` obtenido, y el estado `is_processed` en `false`.
5. El endpoint debe retornar el `submission_id` al frontend. El frontend DEBE guardar este ID (ej. en LocalStorage) para enviarlo en el paso de registro.

### B. Registro de Usuario (User Registration)
**Endpoint Sugerido:** `POST /api/users/register` (Existente, a modificar)

**Lógica Adicional (La Conciliación):**
1. El payload de registro debe aceptar un array opcional de `pending_submission_ids` (los IDs de los formularios completados como anónimo).
2. Se crea el usuario en la tabla `users` con el flujo estándar.
3. Se ejecuta el **Proceso de Asignación de Puntos** (detallado en la sección 3).

---

## 2. Nuevos Endpoints Requeridos

### C. Perfil de Referido del Usuario
**Endpoint Sugerido:** `GET /api/users/me/referral-profile`

**Acción:** Consulta la tabla `user_referral_profiles`. Si el usuario no tiene un registro, el backend debe generarle un `referral_code` único (alfanumérico, 6-8 caracteres) e insertarlo "On-Demand" (Lazy loading). Retorna el código y el `total_accumulated_points`.

### D. Ranking por Sorteo (Leaderboard)
**Endpoint Sugerido:** `GET /api/giveaways/{form_id}/leaderboard`

**Acción:** Realiza una agregación analítica en la tabla `giveaway_points_ledger`.
**Query Base:** `SELECT user_id, SUM(points_earned) as total FROM giveaway_points_ledger WHERE giveaway_id = X GROUP BY user_id ORDER BY total DESC LIMIT 50;`

---

## 3. Lógica Transaccional Core (Proceso de Asignación de Puntos)

Esta es la lógica de negocio más crítica. Cuando el usuario anónimo se registra enviando su `pending_submission_id`, el backend debe abrir una **Transacción de Base de Datos (ACID)** y ejecutar estrictamente esta secuencia:

1. **Vincular Formulario:** Actualizar `submissions.user_id = nuevo_usuario.id`.
2. **Identificar Referencia:** Buscar en `submission_referrals` donde `submission_id = pending_submission_id` y `is_processed = false`.
3. **Vincular Referido:** Actualizar `submission_referrals.referred_user_id = nuevo_usuario.id`.
4. **Consultar Reglas:** Hacer JOIN con `submissions` -> `form_versions` -> `giveaway_configs` para obtener los puntos base (`points_per_referral`).
5. **Escribir en el Ledger (Libro Mayor):** Insertar en `giveaway_points_ledger` los puntos a favor del `referrer_user_id`.
6. **Actualizar Total Global:** Sumar los puntos al `total_accumulated_points` del `referrer_user_id` en `user_referral_profiles`.
7. **Sellar Operación:** Marcar `submission_referrals.is_processed = true`.
8. **Commit:** Confirmar y cerrar la transacción.

---

## 4. Reglas de Prevención y Seguridad (Anti-Fraude)

* **Idempotencia:** El backend debe asegurar que `is_processed` actúe como un candado (Lock). Si el registro ya indica `true`, la transacción debe abortar inmediatamente para prevenir la duplicación de puntos.
* **Auto-referencia:** Validar en la capa de aplicación que el `referrer_user_id` no sea idéntico al `referred_user_id` (prevenir que un usuario simule referirse a sí mismo).