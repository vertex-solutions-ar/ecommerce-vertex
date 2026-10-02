# 🛒 Vertex Ecommerce (Storefront)

Plantilla de comercio electrónico para la tienda (storefront) y panel de administración (backoffice) de cada cliente en el ecosistema multi-tenant de Vertex.

## 🏢 Arquitectura Multi-Repo en Paralelo (Side-by-Side)

Este proyecto opera bajo una topología de repositorios hermanos en paralelo:

- **Plano de control (Backoffice central/API):** `platform/` (Asociado al repositorio `vertex-solutions-ar/vertex-platform`)
- **Plantilla de Tienda (Storefront/Admin cliente):** `storefront/` (Asociado al repositorio `vertex-solutions-ar/ecommerce-vertex`)

### Consumo de Contratos Compartidos via File-Path

La tienda consume los esquemas de validación estrictos de Zod de `@vertex/contracts` directamente desde el paquete local del repositorio, mediante la directiva `file:` en `package.json`:

```json
"dependencies": {
   "@vertex/contracts": "file:./packages/shared-contracts"
}
```

---

## 🚀 Inicio Rápido (10 minutos)

Puedes inicializar y ejecutar la aplicación usando el entorno contenedorizado unificado o mediante tu host de forma nativa:

### Opción A: Entorno Contenedorizado Unificado (Recomendado)

Si tienes **Docker Desktop** instalado, puedes levantar el **Storefront** junto con la **Platform** y los **Emuladores de Firebase** en un solo comando desde el repositorio hermano `platform/`:

```bash
# Entrar al repositorio de platform y arrancar el stack
cd ../platform
bash docker/start.sh
```

Esto levantará la tienda de cara al cliente en [http://localhost:4201](http://localhost:4201) y el panel administrativo en [http://localhost:4201/admin](http://localhost:4201/admin) de manera automática.

---

### Opción B: Arranque Local (Nativo en el Host)

Si prefieres ejecutar el Storefront en tu host localmente, sigue estos pasos:

1. **Configurar el entorno (Script interactivo CLI):**

   ```bash
   npm run setup
   ```

2. **Instalar dependencias y vincular contratos:**

   ```bash
   npm install
   ```

3. **Iniciar el servidor local de desarrollo:**

   ```bash
   npm start
   ```

4. **Ejecutar validaciones de calidad (Quality Gates):**
   Asegúrate de que el formateo, los tipos y las pruebas unitarias pasan sin errores:
   ```bash
   npm run lint && npm run typecheck && npm run test:ci && npm run build
   ```

---

## 📁 Estructura del Proyecto

- **`src/app`**: Componentes Angular de la tienda (`shop/`) y del panel de administración (`admin/`) bajo **Clean Naming Architecture** (sin sufijos `.component.*`), servicios del core y utilidades compartidas.
- **`functions/src`**: Funciones backend de Firebase (TypeScript), tales como la integración con pasarelas de pago y webhooks.
- **`cypress`**: Suite de pruebas de integración de punta a punta (E2E).
- **`integration-tests`**: Pruebas que validan la continuidad del ciclo de vida en conjunto con la plataforma principal.

---

## 🛠️ Tecnologías Principales

- **Frontend**: Angular 22, Clean Naming Architecture, `@angular/build` (esbuild/Vite), señales (Signals), componentes independientes (Standalone) y SCSS.
- **Backend**: Firebase Cloud Functions v2 (TypeScript).
- **Base de datos e Integraciones**: Cloud Firestore, Firebase Authentication y Firebase Storage.
- **Pruebas y QA**: Jasmine/Karma (`@angular/build:karma`), Cypress y Playwright.
- **Seguridad**: Política de **0 vulnerabilidades** auditadas en `npm audit` mediante overrides seguros.
- **CI/CD**: GitHub Actions.

---

## 💻 Comandos Útiles de Desarrollo

| Comando             | Descripción                                                                          |
| ------------------- | ------------------------------------------------------------------------------------ |
| `npm start`         | Inicia el servidor de desarrollo en Angular (por defecto en `http://localhost:4200`) |
| `npm run lint`      | Ejecuta el análisis estático de código (ESLint)                                      |
| `npm run typecheck` | Ejecuta la verificación estricta de tipos de TypeScript                              |
| `npm run test:ci`   | Corre las pruebas unitarias usando Chrome en modo headless                           |
| `npm run build`     | Genera la compilación optimizada para producción                                     |
| `npm run quality`   | Ejecuta de manera consolidada linting, typecheck y pruebas unitarias                 |
| `npm run e2e`       | Ejecuta las pruebas Cypress de punta a punta en modo headless                        |
| `npm run e2e:open`  | Abre la interfaz interactiva de Cypress                                              |

---

## 🔐 Acceso Admin de Tienda (Google OAuth-Only)

Desde mayo de 2026, el panel administrativo de tienda (`/admin/login`) acepta exclusivamente autenticación con Google OAuth.

Reglas operativas:

1. El correo debe estar preautorizado en Firestore (`admin_roles/{storeId}_{email}` — clave compuesta `{tienda}_{email}`).
2. El único rol operativo admitido para acceso al panel es `admin` (o `owner`).
3. Los custom claims se sincronizan automáticamente mediante Cloud Functions en alta de usuario y cambios de rol (`role.functions.ts`).
4. La vista Staff usa funciones callable (`getAdminStaff`, `upsertAdminStaff`, `revokeAdminStaff`) para evitar fallas de permisos por reglas cliente.
5. El aislamiento multi-tenant se basa en el claim `tenantId` (== `storeId`) que debe coincidir con el campo `storeId` de los documentos consultados.

Errores comunes (capturados en `auth.service.ts` / `login.component.ts`):

- `permission-denied`: el correo no está autorizado.
- `auth/unauthorized-domain`: el dominio usado para login no está en Firebase Auth > Authorized domains.
- `auth/popup-blocked`: el navegador bloqueó la ventana emergente de Google.
- `auth/popup-closed-by-user`: la ventana de Google se cerró antes de completar el acceso.
- `auth/invalid-continue-uri`: la URL de continuación no es válida para esta tienda.
- `redirect_uri_mismatch` / `auth/redirect-uri-mismatch`: la URI de redirección OAuth no está autorizada en Google Cloud.

---

## 🖼️ Gestión de Imágenes y Buscador de Variantes en Admin

### Buscador Integrado de Variantes

El formulario de creación/edición de productos (`/admin/products/new` y `/admin/products/:id`) incluye una barra de búsqueda reactiva sobre la tabla de variantes. Permite filtrar al instante por:

- SKU / ID de variante
- Talle, Color y Atributos dinámicos
- Nivel de stock

### Subida Multi-Tenant de Imágenes

Las imágenes del producto (`mainImage` y la galería `images`) son procesadas por `ProductMediaService`:

- Se suben a Firebase Storage bajo el namespace estricto del tenant: `tenants/${storeId}/products/images/` y `tenants/${storeId}/products/gallery/`.
- Cuentan con manejo reactivo de progreso, errores con alertas SweetAlert y marcado automático como `dirty` en los FormControls para evitar desincronizaciones al guardar.

---

## 💳 Mercado Pago (Credenciales y Webhook)

Desde mayo de 2026, la URL de webhook en configuración de tienda se calcula automáticamente y no es editable en UI.

Reglas operativas:

1. `webhookUrl` se deriva de la URL base de Cloud Functions (`.../mercadoPagoWebhookHandler`).
2. Si existe token configurado (o se rota), la `Public Key` es obligatoria.
3. El `accessToken` se persiste en Secret Manager; en Firestore solo se guarda referencia y valor enmascarado.
4. **Resiliencia de Webhooks**: `mercadoPagoWebhookHandler` valida la firma HMAC-SHA256 (`x-signature`) y procesa el pedido en Firestore. Retorna **siempre un código HTTP 200 OK** (incluso en caso de excepciones internas) para evitar que la infraestructura de Mercado Pago entre en bucles de reintentos continuos que puedan degradar la disponibilidad del servicio.

---

## 🔒 Despliegue y Gobernanza de Ramas

Este repositorio opera bajo políticas estrictas de flujo de trabajo y protección de ramas.

### Entornos y Ramas Principales

| Rama      | Entorno / Propósito          | Proyecto Firebase      | Comando de Despliegue |
| --------- | ---------------------------- | ---------------------- | --------------------- |
| `develop` | Integración / Pruebas        | `ecommerce-vertex-dev` | `npm run deploy:dev`  |
| `main`    | Producción / Versión Estable | `ecommerce-vertex`     | `npm run deploy:prod` |

### Políticas Obligatorias

1. **Promoción exclusiva vía PR:** Todo cambio hacia la rama `main` debe promoverse únicamente mediante un Pull Request desde `develop` hacia `main`.
2. **Sincronización Inversa Inmediata (Back-Sync):** Tras fusionar una PR en `main`, es obligatorio realizar una Pull Request de fusión inversa de `main` a `develop` para evitar divergencias en el historial de Git.
3. **Protecciones de Rama Activas:** Las ramas `develop` y `main` están protegidas del lado del servidor. Las eliminaciones y empujes directos están bloqueados.
4. **Persistencia Histórica:** Bajo ninguna circunstancia se deben eliminar las ramas permanentes `develop` y `main`. La opción de borrar rama al fusionar una PR (`delete branch`) jamás debe aplicarse sobre estas ramas.

---

## 🚨 Guías de Resolución de Incidentes (Runbooks)

### 1) PR Bloqueada por Verificaciones Pendientes o Canceladas

1. Inspecciona los resultados de las comprobaciones requeridas en GitHub.
2. Si un job falló o se canceló por motivos ajenos al código, vuelve a ejecutar el workflow en GitHub Actions.
3. Espera a que todas las verificaciones del **Quality Gate** pasen a estado verde antes de proceder con la fusión.

### 2) Deriva de Ramas (Drift) entre `develop` y `main`

1. Abre un PR de sincronización inversa (`main` -> `develop`).
2. Valida que pasen las comprobaciones de CI requeridas.
3. Realiza la fusión de forma segura sin eliminar las cabezas de rama permanentes.

### 3) Lista de Cierre de Lanzamiento (Release Close Checklist)

- [ ] Validaciones de CI en `develop` completadas con éxito (verde ✅).
- [ ] Despliegue automático de `develop` completado sin errores.
- [ ] PR de `develop` -> `main` revisado y fusionado de manera lineal (Squash/Rebase).
- [ ] Validaciones de CI en `main` completadas con éxito.
- [ ] Despliegue automático de producción (`main`) verificado operacionalmente.

---

## 🔢 Versionado del Template

Este repositorio es el **template de tienda** que la plataforma provisiona para cada cliente.
Las versiones siguen **Semver** (`MAJOR.MINOR.PATCH`).

### Comandos de release

```bash
npm run release:patch   # Bugfix → 0.1.0 → 0.1.1
npm run release:minor   # Nueva feature → 0.1.0 → 0.2.0
npm run release:major   # Breaking change → 0.1.0 → 1.0.0
```

Cada comando hace automáticamente: bump de `package.json` + commit + tag + push.

### Flujo automático tras el release

1. CI `release.yml` detecta el nuevo tag `v*`
2. Valida que `package.json` y el tag coincidan
3. Crea el **GitHub Release** oficial con notas autogeneradas
4. Notifica a `vertex-platform` vía `repository_dispatch`
5. La plataforma abre un **PR automático** para actualizar `CURRENT_TEMPLATE_VERSION`
6. Un admin de plataforma revisa y mergea el PR (paso manual intencional)

### Versión actual: `v0.4.0` (desarrollo)

La versión del template vive en `CURRENT_TEMPLATE_VERSION` (platform) y `version` en los
`package.json` de ambos repos. El panel del platform la muestra por tienda
(`appVersion`, `targetChannel`, `lastDeployedAt` en `stores/{storeId}`) y permite
seleccionar la versión a desplegar individualmente.

---

## 💳 Arquitectura del Flujo de Checkout y Gestión de Inventario

1. **Preservación del Carrito:** Los artículos en `localStorage` se mantienen al redirigir a Mercado Pago y solo se eliminan al cargar `/shop/order-confirmation/:id`. Si el comprador cancela o vuelve atrás, el carrito sigue intacto en `/shop/cart`.
2. **Reserva Atómica de Stock:** `createPaymentPreference` decrementa el inventario de la variante inmediatamente (`FieldValue.increment(-quantity)`) para evitar sobreventas concurrentes.
3. **Reconciliación por Webhooks:** `mercadoPagoWebhookHandler` valida la firma criptográfica HMAC `x-signature`. Ante pagos aprobados finaliza la orden; ante pagos rechazados/cancelados invoca `revertStockOnFailure` para restituir el stock al catálogo.
4. **Barrido de Órdenes Expiradas:** La función programada `cleanupExpiredOrders` (cada 60 min) detecta compras abandonadas sin pago aprobado y devuelve el stock automáticamente.
5. **Logs de Terceros en Consola:** Los avisos de consola emitidos por `TrackBuilder`, `Armor` o directivas CSP en dominios de Mercado Pago son propios de su infraestructura antifraude y cumplen normativas **PCI-DSS**.

---

## 🧩 Multi-shard deployment

Cada tienda se despliega a un **shard** (`vtx-sd-*`, ~35 tiendas por shard) con hosting +
functions + rules + índices vía el workflow `Deploy All Stores (Development/Production)`.
El `authDomain` del storefront apunta al shard (`https://{shard}.firebaseapp.com`) y el
Google IdP del shard usa el clientId del master. El único paso manual es registrar el
redirect URI del shard en la consola de Google (una vez por shard) — verificado
automáticamente por `check-oauth-redirects.ts` y con banner en el panel.


## 🧩 Modelo de Datos Flat y Tenant Filtering (V1.0)

Desde V1.0 el storefront opera sobre **colecciones planas etiquetadas con `storeId`** (sin namespaces `tenants/{tenantId}/...`):

```
products, categories, attributes, configuracion, banners, pages,
orders, clients, settings, mail   →  { storeId, ... }
```

- **Tenant filtering**: todos los servicios de consulta (`product`, `category`, `attribute`, `footer`, `home-content`, `store-config`, `about-us`, `order`, `client`, `email-settings`) aplican `storeIdFilter()` = `where('storeId', '==', resolveTenantId())`.
- **Docs singleton por tienda**: `configuracion/store_{storeId}`, `footer_{storeId}`, `hero_{storeId}`, `banners/home_{storeId}`, `pages/aboutUs_{storeId}`, `settings/emailTemplates_{storeId}`.
- **Clientes**: doc ID compuesto `{storeId}_{email}`.

## 🗄️ Firebase Storage (hardening)

`storage.rules` (ver [`docs/security.md`](docs/security.md)):

- Lectura pública de imágenes de catálogo.
- Escritura solo administradores autenticados, MIME `image/(jpeg|png|webp)` y **≤5MB** (validado además en `image-validation.service.ts`).
- El borrado de productos (`ProductService.deleteProduct`) elimina las imágenes asociadas de Storage (`deleteFileByUrl`) antes de borrar el documento, evitando archivos huérfanos.

## 🧪 Sembrado de Datos de Prueba (Seed)

Los datos de demostración están desacoplados en constantes dedicadas (< 300 líneas por servicio):

- `src/app/core/constants/seed-orders.constants.ts` (`CLIENT_DATA`, `CLIENT_DAYS_LIST`, `CLIENT_ORDER_COUNTS`, `ORDER_DATA`)
- `src/app/core/constants/seed-products.constants.ts` (`PRODUCT_CATALOGUE`)

Servicios: `seed-data.service.ts`, `seed-content.service.ts`, `seed-products.service.ts`, `seed-orders.service.ts` (todos escriben con `storeId`).

---

📖 **Nota para Desarrolladores:** Mantén este documento `README.md` actualizado como la referencia operativa principal. Para reglas de agentes de IA y flujos de QA unificados, consulta [agent.md](agent.md).

---

## 🏗️ Arquitectura Flat Multi-Tenant V1.0

Cada tienda vive en un **shard** (proyecto GCP compartido, ~35 tiendas) y sus datos se
almacenan en colecciones planas con el campo `storeId` (slug de la tienda), más singletons
en `configuracion/store_{storeId}` (config pública), `configuracion/footer_{storeId}`,
`configuracion/hero_{storeId}`, `settings/emailTemplates_{storeId}` (Gestión de Emails) y
`admin_roles/{storeId}_{email}` (RBAC). Todas las consultas del storefront filtran por
`storeId` (`storeIdFilter()` en `@core/utils/tenant`).

## ✉️ Sistema de Notificaciones Duales (comprador + vendedor)

- **Endpoint público** `notifyOrderConfirmation` (HTTPS) y trigger `onOrderWrittenSendNotifications`
  resuelven la DB del tenant vía `tenantDb` (por `projectId`) y envían **dos emails en paralelo**:
  confirmación al **comprador** y aviso de nueva venta al **vendedor** (`storeOwnerEmail`).
- La **fuente de verdad de los emails** es `settings/emailTemplates_{storeId}` (Gestión de
  Emails), que **gana** sobre la config pública `configuracion/store_{storeId}` — así el
  vendedor siempre recibe la notificación al email real configurado.
- Despacho con **idempotencia**: el pedido marca `emailDirectSent=true` para no reenviar.

## 🖨️ Voucher Imprimible

El recibo vive en `#printable-receipt` dentro de `OrderConfirmationComponent`. En `@media print`
se oculta el resto de la página (`visibility: hidden`) y el recibo se posiciona
`position: absolute; top: 0` para que **nunca se corte en la parte superior**; se genera un PDF
limpio con `window.print()`.

## 🔢 IDs Cortos de Pedido (Base32)

`OrderService.createOrder` genera IDs de **8 caracteres** con alfabeto Base32 sin caracteres
ambiguos `0/O/1/I/L` (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`) vía `crypto.getRandomValues`, en
reemplazo de los IDs largos (20+ chars) de Firestore. Ver `generateShortOrderId()`.

## ✅ Guía de Calidad y Testing

- `npm run lint` — 0 errores ESLint.
- `npm run typecheck` — 0 errores TS.
- `npm run test:ci` — 313+ tests; el hook `pre-push` exige **Statements Coverage ≥ 85%**
  (`scripts/verify-coverage.js`). Coverage actual: **78.4%** (los módulos `@angular/fire/firestore`
  no son mockeables con jasmine/Karma; los specs se enfocan en servicios delegados, pipes y
  componentes con servicios mockeados).
- `npm run build` — build de producción limpio.


---

## Order & Payment Integrity (Checkout → IPN)

- An order is created as `pending`, then moved by `createPaymentPreference` to **`PENDING_PAYMENT`** (`paymentStatus: 'pending'`, `stockDecremented: false`, `isPaid: false`). **No inventory is reserved and no revenue counter fires at checkout** — an abandoned checkout is never a sale.
- **Stock is deducted atomically only by the IPN webhook** (`mercadoPagoWebhookHandler`) when Mercado Pago reports `payment.status === 'approved'`: an in-transaction idempotency guard (`stockDecremented === true` → no-op) plus a non-negative safety (`min(currentStock, qty)`); the order is then marked `status:'processing'`, `paymentStatus:'approved'`, `isPaid:true`, `paidAt`.
- Rejected / cancelled / expired payments never touch inventory and are moved to `cancelled` / `CANCELLED_UNPAID`.
- Sales metrics only include statuses reachable via an approved payment (`processing`, `shipped`, `delivered`) — phantom/unpaid orders stay out of dashboards.
- **Legacy cleanup:** orders deducted before this contract (unpaid, with `stockDecremented === true` and no `paymentDetails.paymentId`) can be restored in the cloud with the administrative callable `executeStockAndMetricsRestorationAdmin` (guard: `vertex.tech.dev@gmail.com` / `platformAdmin` claim, or `x-admin-token` header matching env `RESTORE_ADMIN_TOKEN`; supports `dryRun` and per-shard `tenantProjectId` discovery). Local equivalent: `npx tsx scripts/restore-unpaid-stock.ts` with `FIREBASE_SERVICE_ACCOUNT`/`FIREBASE_SERVICE_ACCOUNT_DEV`.
- Mercado Pago credential resolution prefers the store's own token (per-store secret or Firestore `store_payments/{storeId}` across all documented paths) and only then falls back to the Vertex master test token; an `APP_USR-` env token is never applied to a store without its own credentials. Redirect is always `init_point` for `APP_USR-`, `sandbox_init_point` for `TEST-`.

_Procesado de forma segura por Vertex Platform._


---

## Runbooks y arquitectura (Enterprise)

### Super Admin & limpieza de tiendas
- **Purga masiva** (plataforma, tienda → Orquestación → “Limpieza de datos de prueba”): elimina pedidos, clientes, catálogo y/o contenido **solo de esa tienda** (filtro por tenant), sin tocar configuración/credenciales.
- **Borrado puntual con auditoría**: clientes (por email) y pedidos (por orderId) desde el admin de la tienda o la plataforma. Cada borrado queda en `admin_audit` (quién, cuándo, entidad, stock restituido). Los pedidos con stock descontado devuelven inventario automáticamente.
- Permisos: admins de tienda (claim `admin` del tenant) y super admins (Juan/Lihue/Vertex o claims `platformAdmin`/`superAdmin`).

### Ciclo de vida de órdenes
1. Checkout crea la orden → **`PENDING_PAYMENT`** (`stockDecremented:false`, `isPaid:false`): nunca es una venta.
2. Mercado Pago notifica al webhook (URL canónica con `tenant`+`projectId` del shard) → solo con `approved` se descuenta stock de forma atómica (idempotente, no-negativo), se marca `processing` + `approved`, se crea/actualiza el cliente y se envían los mails (remitente SMTP autenticado = deliverabilidad).
3. Rechazadas/canceladas/expiradas → `CANCELLED_UNPAID`, sin inventario ni métricas afectadas.
4. Reconciliación automática (platform, cada 60 min) cancela abandonadas, restaura fantasmas legacy y hace backfill de clientes.

### Pipeline de imágenes (HEIC/HEIF → WebP)
`StorageService.uploadFile` es el único punto de subida: si el archivo es `.heic/.heif` o `image/heic`/`image/heif`, lo convierte a **WebP (calidad 0.85)** en el cliente con `heic2any` (carga lazy) antes de Firebase Storage. Cualquier otro formato sigue el camino original sin cambios.
