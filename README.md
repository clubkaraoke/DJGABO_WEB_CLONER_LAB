# DJGABO WEB CLONER LAB

Laboratorio para analizar y reconstruir interfaces web de forma reproducible.

## Objetivo

Dada una URL, el laboratorio captura la parte observable del sitio y genera evidencia estructurada para reconstruirla con nuestro propio frontend y backend:

- screenshots desktop / tablet / mobile
- HTML renderizado por el navegador
- HAR de red
- enlaces, botones, formularios y assets
- inventario de estilos computados de componentes visibles
- metadatos y mapa básico de interacción
- manifest de la captura

> Este proyecto no intenta copiar lógica privada del servidor, credenciales, sesiones, CAPTCHAs ni sistemas de pago. Las funciones privadas deben reconstruirse con APIs y servicios propios.

## Flujo

```text
URL objetivo
   |
   v
Playwright / Chromium
   |
   +--> screenshots responsive
   +--> HTML runtime
   +--> HAR / network
   +--> DOM + assets
   +--> componentes + estilos
   +--> links / botones / forms
   |
   v
captures/<sitio>/<timestamp>/
   |
   v
RECONSTRUCCION PROPIA
React / Next.js / APIs propias
```

## Instalacion

Requiere Node.js 20+.

```bash
npm install
npx playwright install chromium
```

## Primera captura

```bash
npm run clone -- --url https://example.com --name ejemplo
```

Modo visible para estudiar interacciones:

```bash
npm run clone -- --url https://example.com --name ejemplo --headful
```

## Salida

Cada ejecución crea una carpeta como:

```text
captures/ejemplo/2026-09-11T21-30-00-000Z/
  manifest.json
  page.html
  page-data.json
  network.har
  screenshots/
    desktop.png
    tablet.png
    mobile.png
```

`page-data.json` contiene inventarios de enlaces, botones, formularios, imágenes, scripts, hojas de estilo y una muestra de elementos visibles con estilos computados.

## Estado

**V0.1 — Capture Engine**

La siguiente etapa del LAB será incorporar:

1. crawler controlado de rutas internas;
2. grabación de acciones/clics y estados UI;
3. detector de frameworks y animaciones;
4. comparación visual Original vs Clone;
5. generador de blueprint para React/Next.js.
