# Titu's Finance

Aplicación responsive de finanzas personales desarrollada con React, TypeScript y Vite. Funciona completamente en el navegador y conserva la información en `localStorage` mediante una abstracción de repositorio.

## Desarrollo

```bash
npm install
npm run dev
```

Verificaciones:

```bash
npm test
npm run lint
npm run build
```

## Arquitectura

- `src/app`: composición, rutas, providers y layout.
- `src/modules`: dominio y presentación por feature.
- `src/infrastructure`: persistencia reemplazable.
- `src/shared`: componentes, estilos y utilidades transversales.

Los meses se guardan como snapshots independientes (`YYYY-MM`). Las recurrencias y los planes de cuotas conservan IDs estables; sus ocurrencias mantienen la referencia al origen.

## Deploy

Cada push a `main` ejecuta tests, compila la aplicación y la publica automáticamente en GitHub Pages. Se utiliza navegación con hash para que todas las pantallas funcionen correctamente en hosting estático.
