# Changelog — ecommerce-vertex (storefront)

## [0.9.6] - 2026-10-15

### Added
- **Metadata de procedencia del build:** `assets/version.json` y `window.__VERTEX_STORE_SOURCE__` ahora exponen `sourceKind`, `sourceRef` y `commitSha`. Un build compilado desde una rama o un commit ya no se confunde con una release publicada, y el panel puede verificar qué se desplegó en cada tienda.

### Fixed
- **Layout y responsive del panel de administración:** dashboard (slider de actividad reciente en mobile), listado de pedidos (desktop y mobile), detalle de producto y creación de producto.

## [0.9.3] - 2026-09-16

### Fixed
- **fix(seo):** Added static Open Graph and Twitter Card baseline metadata in `index.html` and implemented modern `SeoService` with signals/inject to support WhatsApp and social preview unfurling.
- **fix(about):** Made banner title optional in "Nosotros" management form and refined storefront banner to conditionally render text overlay/scrim for clean photography.
- **fix(catalog):** Resolved accessibility WCAG blockers on filter inputs (replaced `display: none` with `.visually-hidden`), fixed skeleton/card CLS with `aspect-ratio: 1 / 1`, added reset filters button to empty state, and purified signal reactivity without `toObservable()` round-trips.

## [0.9.2] - 2026-09-14

### Fixed
- Cálculo consistente y reactivo del stock acumulado total para productos y variantes en detalle (`ProductDetail`) y servicio de formulario (`ProductVariantFormService`).
- Preservación del estado pristine del formulario en modo edición de producto y deshabilitación del botón de guardar cuando no hay cambios.

## [0.9.1] - 2026-09-11

### Fixed
- Soporte extendido para imágenes HEIC/HEIF y manejo seguro de errores no controlados en subidas a Storage.
- Corrección de tamaño y espaciado de badge en tiempo real en encabezado móvil de anuncios en el panel admin.
- Priorización de imagen primaria en la lista de productos del panel de administración.

## [0.9.0] - 2026-09-09

### Added
- Conversión HEIC/HEIF → WebP en navegador (punto único `StorageService.uploadFile`).
- Borrado de clientes y pedidos por admins de tienda con confirmación, auditoría (`admin_audit`) y restock automático.
- Estados finales de orden claros y regeneración de preferencias vencidas en webhook MP.

### Refactored
- `storage.service` con `startUpload` + pipeline HEIC lazy (import dinámico `heic2any`).

### Fixed
- Deliverabilidad de correos transaccionales (From SMTP autenticado, SPF/DKIM).
- Deducción atómica de inventario (isPaid/stockDecremented idempotentes) y estados `CANCELLED_UNPAID` para rechazadas/abandonadas.

### Changed
- Registro de clientes en el shard desde el webhook; fail-fast anti-master en resolución de tokens MP.
