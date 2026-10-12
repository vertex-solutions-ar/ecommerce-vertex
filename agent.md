# Universal Agent Rules — Storefront (`ecommerce-vertex`)

This file contains instructions for AI agents and developers working on the Storefront repository.

---

## 🏗️ Arquitectura

- **Framework**: Angular 22+ (Standalone components, Signals, Clean Naming architecture, `@angular/build`)
- **Backend**: Firebase Cloud Functions v2 (TypeScript)
- **DB**: Cloud Firestore (multi-tenant, un proyecto Firebase por tienda)
- **Auth**: Firebase Auth — Google OAuth únicamente en `/admin`
- **Multi-tenancy**: El `tenantId` se inyecta en runtime; `firebase-config.json` es el archivo
  que diferencia cada shard/tienda. El `APP_INITIALIZER` bloquea el render hasta resolver la config.
- **Contratos compartidos**: `@vertex/contracts` consumido desde `file:./packages/shared-contracts`

### Rutas principales

| Ruta           | Acceso                | Descripción                      |
| -------------- | --------------------- | -------------------------------- |
| `/shop`        | Público               | Tienda visible para todos        |
| `/admin`       | Solo admin autorizado | Panel de backoffice de la tienda |
| `/admin/login` | Público               | Login Google OAuth               |

---

## 💻 Comandos de desarrollo

```bash
npm start                  # Dev server en puerto 4201
npm run lint               # ESLint
npm run typecheck          # TypeScript strict check
npm run test:ci            # Tests unitarios headless (750 specs — 100% pasando con cobertura)
npm run build              # Build producción (@angular/build)
npm run build:dev          # Build desarrollo
npm run e2e                # Cypress headless
npm run e2e:open           # Cypress interactivo

# Versioning (ejecutar en main o develop antes del merge a main)
npm run release:patch      # 0.8.0 → 0.8.1
npm run release:minor      # 0.8.0 → 0.9.0
npm run release:major      # 0.8.0 → 1.0.0
```

---

## 🧪 Política Obligatoria de Cobertura de Código (Quality Gate ≥95%, 100% Ideal)

- **Umbral Mínimo No Modificable**: La cobertura de código en Storefront debe ser estrictamente **$\ge 95\%$ en todas las 4 métricas**:
  1. `Statements` $\ge 95\%$
  2. `Branches` $\ge 95\%$
  3. `Functions` $\ge 95\%$
  4. `Lines` $\ge 95\%$
  - **100%** es el objetivo ideal permanente para toda la lógica de negocio y utilidades.
- **Bloqueo en Hooks Locales (`pre-commit` y `pre-push`)**: Los hooks de Husky ejecutan `npm run test:ci` y `node scripts/verify-coverage.js`. No se permite realizar `git commit` ni `git push` si cualquiera de los porcentajes es menor a 95%.
- **Bloqueo en CI/CD**: `ci.yml` ejecuta la misma verificación y rechaza automáticamente PRs que no alcancen el 95%.

---

## 🔄 Git Flow & PR Governance

- Ramas permanentes: `develop` (dev) y `main` (prod)
- Feature branches: `feat/*`, `fix/*`, `chore/*` desde `develop`
- Direct push a `develop`/`main` **bloqueado** por server-side rules
- Bypass Husky local (solo cuando hay problemas de deps):
  ```bash
  HUSKY=0 git push origin branch-name
  ```

---

## 🔢 Versionado del Template

El storefront es el **template de tienda** versionado semánticamente (Semver).
Versión actual: `0.8.0`

| Tipo de cambio                     | Comando                 |
| ---------------------------------- | ----------------------- |
| Bugfix / ajuste visual             | `npm run release:patch` |
| Nueva feature                      | `npm run release:minor` |
| Breaking change en modelo de datos | `npm run release:major` |

**Flujo al hacer release:**

1. `npm run release:minor` → bump, commit, tag, push automático
2. CI `release.yml` crea GitHub Release y notifica a `vertex-platform`
3. `vertex-platform` abre PR automático para actualizar `CURRENT_TEMPLATE_VERSION`

### Probar sin crear un tag (fuente de despliegue)

Desde el panel de la plataforma (`/stores/:id` > Orquestación) se puede compilar el storefront
desde **una rama** o **un commit**, sin crear tag ni bumpear semver, para probar antes de
publicar. La metadata de esos builds es explícita y verificable:

| Campo        | Origen                                             | Dónde se ve                                                                              |
| ------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `sourceKind` | `DEPLOY_SOURCE_KIND` (`release`/`branch`/`commit`) | `assets/version.json`, `<meta name="app-source-kind">`, `window.__VERTEX_STORE_SOURCE__` |
| `sourceRef`  | `DEPLOY_SOURCE_REF` (rama, tag o SHA)              | `assets/version.json`, `<meta name="app-source-ref">`                                    |
| `commitSha`  | `git rev-parse HEAD` tras el checkout              | `assets/version.json`                                                                    |

- `scripts/generate-build-info.js` lee esas variables y las estampa en `BUILD_INFO` +
  `version.json`. Sin ellas (build local, `deploy-all-stores`) el default es `release`.
- El job `provision-store` de `deploy.yml` exporta esas variables y reporta la procedencia real
  a la plataforma. **No usar `github.sha`** para eso: en un `repository_dispatch` apunta a la
  punta de la rama por defecto, no al ref compilado.
- Verificación del build desplegado:

```bash
curl -s https://vtx-<tienda>.web.app/assets/version.json | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d['version'], d['sourceKind'], d['sourceRef'], d['commitSha'])"
```

- Sólo las tiendas de entorno `development` (o con `allowTestDeployments: true`) aceptan ramas o
  commits; una tienda de producción únicamente compila releases etiquetadas.

---

## 📖 Regla de Oro: Mantenimiento Obligatorio de Documentación

**Toda tarea, bugfix, cambio de infraestructura o evolución arquitectónica DEBE mantener la documentación sincronizada antes de darse por finalizada.**

1. **Actualización Inmediata**: Al modificar flujos, reglas, modelos o CI/CD, actualizar de inmediato los documentos correspondientes (`agent.md`, `README.md`, y `.agents/AGENTS.md` en la raíz).
2. **Cero Desincronización**: Las versiones en la documentación deben coincidir con `package.json`.
3. **Documentación como Criterio de Aceptación (DoD)**: Un PR o desarrollo NO se considera terminado si no incluye la actualización de su respectiva documentación técnica y operacional.

---

## 💳 Flujo de Pagos, Carrito y Gestión de Stock (Mercado Pago)

### 1. Preservación del Carrito

- El carrito en `localStorage` **NO se vacía** al redirigir al checkout de Mercado Pago.
- Se vacía **únicamente** cuando el cliente navega a la pantalla de confirmación exitosa (`/shop/order-confirmation/:id`).
- Si el usuario cancela o regresa desde Mercado Pago sin pagar, el storefront lo redirige a `/shop/cart`, detecta el retorno sin pago, muestra una notificación informativa y **mantiene los productos en el carrito** para que no pierda su selección.

### 2. Ciclo de Vida del Stock (Productos Simples y con Variantes)

- **Reserva Inicial**: Al invocar `createPaymentPreference`, la Cloud Function decrementa de forma atómica el stock de la variante (`variantRef.stock`) si existe subcolección, y descuenta el `totalStock` del producto (`productRef.totalStock`), registrando `stockDecremented: true` en la orden (`status: 'processing'`). Si el producto no tiene variantes o es simple, valida directamente contra `totalStock`.
- **Pago Aprobado**: El webhook `mercadoPagoWebhookHandler` recibe `status: 'approved'`, confirma el pago y la orden pasa a procesarse definitivamente.
- **Pago Cancelado o Rechazado**: El webhook ejecuta `revertStockOnFailure(orderId)`, revirtiendo mediante transacción el stock exacto a cada variante y/o producto simple (`totalStock`) y marcando la orden como `cancelled`.
- **Abandono / Expiración de Pago**: La Cloud Function programada `cleanupExpiredOrders` corre cada 60 minutos, busca órdenes `processing` expiradas (`mercadopago_expiration_date <= now`) sin pago confirmado y devuelve el stock al inventario automáticamente tanto para variantes como para productos simples.

### 3. Logs de Consola de Terceros en Checkout (Mercado Pago)

- Al interactuar con el iframe o la redirección de Mercado Pago, la consola del navegador puede registrar eventos de `TrackBuilder`, `Armor` (sistema antifraude de Mercado Libre), o avisos internos de CSP (`script-src 'nonce...'`) emitidos por el dominio `mercadopago.com.ar` / `mercadolibre.com`.
- Estos logs provienen de los scripts de la pasarela y cumplen con el estándar **PCI-DSS**. No exponen credenciales ni interfieren con el correcto funcionamiento de Vertex.

---

## 🚀 Ciclo de Vida de Canales de Preview Efímeros (PR Previews)

- **Despliegue y Sembrado Automático**: Cada PR hacia `develop` compila contra el shard de desarrollo (`build:dev-template`), despliega un canal efímero en Firebase Hosting y ejecuta `scripts/seed-pr-tenant.ts` generando productos con catálogo, imágenes, combinaciones completas de variantes (talles/colores) y stock real. El bot de preview genera y comenta la URL directa apuntando a `/shop` (`https://ecommerce-vertex-dev--pr-XXX.web.app/shop`) garantizando acceso inmediato al storefront sembrado.
- **Unificación de Pipeline**: El despliegue de preview se canaliza a través de `pr-preview.yml`, mientras que `ci.yml` valida la integridad de artefactos de compilación sin disparar deploys concurrentes duplicados ni condiciones de carrera en el canal.
- **Retorno Dinámico**: Las URLs de retorno (`back_urls`) de Mercado Pago se calculan dinámicamente usando el origen de la preview activa (`https://ecommerce-vertex-dev--pr-XXX.web.app`).
- **Destrucción y Notificación Automática**: Al cerrar o mergear el PR, `preview-cleanup.yml`:
  1. Elimina el canal en Firebase Hosting (devuelve 404).
  2. Borra los documentos generados en Firestore (`vtx-pr-XXX`).
  3. Publica un comentario en el PR (`🗑️ Instancia de Preview Eliminada`).
  4. Elimina automáticamente la rama remota de GitHub.

---

## 🧹 Política de Higiene del Repositorio (Clean Repo Policy)

- **Archivos Prohibidos en Git**: No commitear carpetas locales de IDEs (`.antigravitycli/`, `.gemini/`, `.claude/`, `.cursor/`), logs (`firestore-debug.log`, `firebase-debug.log`, `*.log`), credenciales `.env`, ni datos locales de emuladores (`emulator-data/`).
- **Verificación**: Siempre verificar con `git status` y `.gitignore` antes de hacer commit.

---

## 🛡️ Reglas de código

- **Cero hardcoding**: no IDs de proyectos Firebase, colores ni textos de marca en componentes
- **Anti-FOUC**: `APP_INITIALIZER` debe bloquear render hasta resolver config de tenant
- **Signals**: exponer como `asReadonly()`, mutar solo desde métodos explícitos
- **Errores**: degradar con `SweetAlertService`, nunca silenciar ni crashear el layout
- **Confirmación destructiva**: toda acción de eliminación debe usar el modal de confirmación existente
- **Patrón de Estados de Carga & Empty States en Admin**:
  - Prohibido emitir arrays vacíos prematuramente (`startWith([])` o `BehaviorSubject([])`) que causan parpadeos (flashing) de 100ms.
  - Usar `isLoading = signal(true)` manejado mediante operadores `tap` / `finalize` / `catchError` en el stream observable.
  - Los templates del panel de administración deben usar control flow mutuamente excluyente:
    `@if (isLoading()) { <skeleton> } @else if (items$ | async; as items) { @if (items.length === 0) { <empty-state> } @else { <table/grid> <pagination> } }`
  - Prohibido superponer loading spinners y skeletons simultáneamente.
- **Clean Naming Architecture**:
  - Nombres de archivos directos sin sufijo `.component` (`home.ts`, `catalog.ts`, `cart.ts`, etc.).
  - Clases de componentes limpias (`Home`, `Catalog`, `Cart`, `Checkout`, `StoreConfig`, etc.).
  - Modelos de datos aliasados limpiamente en caso de colisión (`ProductModel`, `StoreConfigData`, `CartModel`).
- **Zero Vulnerabilities & Safe Overrides**:
  - Todo el árbol de dependencias debe mantener `npm audit: 0 vulnerabilities`.
  - Toda vulnerabilidad transitiva se mitiga mediante la sección `overrides` en `package.json`.

---

## 🔥 Firebase / Firestore

- Colección principal: `stores/{tenantId}/...`
- Reglas de seguridad: ver `firestore.rules`
- Nunca leer `admin_roles` directamente desde cliente; usar Cloud Functions callable
- Acceso multi-tenant: validado por `tenantId` en claims del token

---

---

## 📧 Notificaciones por Email y Comprobantes de Compra (Receipt Voucher)

### 1. Despacho Multi-Tenant de Emails (`notifyOrderConfirmation`)

- **Trigger HTTPS Público**: La Cloud Function `notifyOrderConfirmation` opera como endpoint HTTPS (`onRequest({ cors: true, invoker: 'public' })`) para evitar errores `401 Unauthorized` derivados del chequeo automático de audience de Firebase Auth (`aud: <shard-id>` vs `<platform-id>`) al invocar funciones centrales desde shards dedicados.
- **Despacho Automático Redundante**: `OrderConfirmation` (`/shop/order-confirmation/:id`) invoca `notifyOrderConfirmation` al cargar el pedido aprobado para asegurar el envío inmediato aun si el webhook de Mercado Pago experimenta retrasos en entornos locales o de prueba.
- **Resolución Automática de Shards**: Si la petición proviene de un shard o storefront, la función resuelve la base de datos de Firestore correspondiente mediante `resolveTenantDb(tenantProjectId)` o buscando el tenant en la colección global `stores`.
- **Doble Notificación**: Despacha emails transaccionales tanto al comprador (`clientEmail`) como al administrador/dueño de la tienda configurado en Firestore o en la colección `admin_roles`.

### 2. Generación e Impresión de Comprobante / Recibo

- El componente `OrderConfirmation` (`/shop/order-confirmation/:id`) incluye un toolbar de acciones con botón de **Imprimir / Descargar Comprobante** (`printReceipt()`), invocando `window.print()`.
- Incorpora un voucher imprimible semántico (`#printable-receipt`) con reglas `@media print` dedicadas que ocultan headers, navegaciones y fondos web, formateando una factura/recibo limpia y lista para ser guardada como PDF o impresa físicamente sin cortes superiores (`@page { margin: 12mm; }`).

### 3. Soporte de Productos Simples y Sincronización de Precios

- Soporte para productos sin atributos (ej. libros, bazar, servicios) mediante resolución automática de variante base (`attributes: {}`, `stock: totalStock`).
- Al editar el precio base de un producto en el panel de administración, la actualización se propaga de forma atómica a todas sus variantes para mantener la consistencia de precios en la subcolección de variantes de Firestore y en `createPaymentPreference`.
- El storefront habilita directamente la compra y el carrito muestra el nombre limpio del producto.

### 4. Slider de Productos Destacados (Featured Continuous Marquee)

- **Storefront**: Componente `FeaturedSlider` (`app-featured-slider`) en `src/app/features/shop/components/home/components/featured-slider/`.
  - Marquee infinito continuo acelerado por GPU (`transform: translate3d(...)`) con pausa en `:hover` y `:focus-within`.
  - Dimensiones responsive: 2 ítems por viewport en mobile y 5 ítems en desktop.
  - Integrado en `home.html` inmediatamente debajo del hero/banner y antes de las categorías destacadas.
- **Admin**: Gestión en `HomeManagement` con subcomponente `FeaturedProducts` (`app-featured-products`).
  - Habilitación/deshabilitación, título configurable y selección entre 5 y 15 productos con validación estricta (`featuredProductsSectionValidator`) y contador reactivo en tiempo real.
  - Foco accesible (`autofocus`) preservado al abrir y cerrar selectores y modales de producto.

---

## ⚠️ Errores comunes y soluciones

| Error                                                  | Causa                                                                            | Solución                                                                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `auth/operation-not-allowed`                           | Google OAuth no habilitado en Firebase Console                                   | Habilitar en Authentication > Sign-in methods                                                                |
| `auth/popup-closed-by-user`                            | COOP header omitido o desconfigurado                                             | Garantizar `Cross-Origin-Opener-Policy: same-origin-allow-popups` en `firebase.json`                         |
| `7 PERMISSION_DENIED` en `createPaymentPreference`     | SA de Cloud Run 2da Gen sin rol datastore.user                                   | `ensureShardProjectIam` asigna automáticamente `roles/datastore.user` a la SA del Compute Engine en el shard |
| `notifyOrderConfirmation 401 (Unauthorized)`           | Funciones `onCall` verificando token contra el proyecto central en vez del shard | Usar `onRequest({ cors: true, invoker: 'public' })` y despachar petición HTTP desacoplada de Auth header     |
| `permission-denied` en Firestore                       | Email no en `admin_roles`                                                        | Agregar vía Cloud Function o plataforma                                                                      |
| `Cannot read properties of undefined (hasOwnProperty)` | Problema de DI en Angular con lazy loading                                       | Revisar barrel imports y providers                                                                           |

## Vertex Storefront — Notas de Agente (v0.6.x)

- **Regla de oro**: nunca `write` con `isAuthenticated()` genérico en rules; aislamiento por
  `storeId` siempre. El catch-all del shard es `if false` (deny).
- **Fleet deploy (dev)**: el workflow `deploy-all-stores-dev.yml` separa **Hosting** (solo
  tiendas `autoUpdate=true`, canary + rest) de **Infra de shard** (`firestore.rules`, índices,
  functions — SIEMPRE a todos los shards activos, vía el job `deploy-infra`). Disparo por
  `workflow_dispatch` (sin `on: push` para evitar carreras de concurrencia).
- **Emails**: la Gestión de Emails (`settings/emailTemplates_{storeId}`) es la fuente de verdad;
  el seed escribe el `storeOwnerEmail` real (nunca placeholders `admin@<slug>`).
- **Pedidos**: IDs cortos Base32 de 8 chars; el checkout prunnea items obsoletos antes de pagar.
- **Coverage**: el hook pre-push pide Statements ≥85%; los módulos firestore no se mockean
  (specs de servicios delegados + componentes).
