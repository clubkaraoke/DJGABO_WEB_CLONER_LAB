# Arquitectura — DJGABO WEB CLONER LAB

## Principio

El LAB separa **observación** de **reconstrucción**.

La web objetivo se usa para estudiar únicamente su superficie observable. El clon final debe utilizar código, datos, APIs y servicios propios.

## Pipeline

```text
[ TARGET URL ]
      |
      v
[ CAPTURE ENGINE / Playwright ]
      |
      +-- HTML runtime
      +-- screenshots
      +-- HAR/network
      +-- DOM inventory
      +-- computed styles
      +-- links/buttons/forms
      +-- responsive states
      |
      v
[ SITE BLUEPRINT ]             <- V0.2/V0.3
      |
      +-- routes
      +-- components
      +-- design tokens
      +-- interactions
      +-- API observations
      +-- animation observations
      |
      v
[ REBUILD ]                    <- V0.4
      |
      +-- React / Next.js
      +-- our assets
      +-- our APIs
      +-- our business logic
      |
      v
[ VISUAL QA ]                  <- V0.5
      |
      +-- screenshot diff
      +-- breakpoint diff
      +-- interaction checks
      +-- accessibility checks
```

## Fases

### V0.1 — Capture Engine ✅

Una URL pública produce un paquete de evidencia local reproducible.

### V0.2 — Route Crawler

Crawler limitado al mismo dominio, con profundidad y cantidad máxima configurables. Debe evitar logout, checkout, acciones destructivas y URLs no navegables.

### V0.3 — Interaction Recorder

Inventario y grabación controlada de estados UI:

- menú abierto/cerrado
- tabs
- acordeones
- modales
- hover/focus
- filtros
- sliders/carousels
- scroll triggers

No ejecutar compras, envíos de formularios sensibles ni acciones destructivas.

### V0.4 — Blueprint + Rebuild

Generar `blueprint.json` con rutas, componentes, tokens visuales e interacciones observadas para reconstrucción en React/Next.js.

### V0.5 — Visual QA

Comparación Original vs Rebuild por breakpoint y estado.

## Seguridad de datos

`captures/` está excluido de Git porque un HAR puede contener cabeceras o respuestas que no deben publicarse. El motor base tampoco extrae cookies, localStorage ni valores ingresados en formularios.

Nunca incluir claves API, tokens, cookies de sesión ni credenciales en commits.
