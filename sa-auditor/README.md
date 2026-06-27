# SA Auditor — AutoRx Center

Herramienta interna para **Service Advisors** y **manager** que audita los Repair Orders activos en Tekmetric y marca lo que falta — para que "no haya excusa".

**No lee la pantalla de Tekmetric ni usa la API desde el navegador.** Lee los datos que ya se sincronizan a tu base de Supabase (`tekmetric-integration C`) vía vistas de solo lectura. Las credenciales de Tekmetric se quedan en tu pipeline de sync (servidor) — nunca en el navegador. Cumple los términos de tu API License Agreement (read-only, solo datos de tu shop).

## Qué audita (por RO activo: Estimate / Repair in Progress)

- **Sin VIN válido** (17 caracteres)
- **Sin millas de entrada** (`miles_in`)
- **Job autorizado sin técnico** asignado
- **Job autorizado sin labor**
- **Línea de parte sin precio de venta / sin costo / sin cantidad**
- **Sin jobs autorizados** (posible estimado no creado — señal suave, puede ser estimado en espera de aprobación)

## Estructura

```
sa-auditor/
├── README.md
├── PUBLICAR.md                 ← cómo publicar en la Web Store y lanzar updates
├── sql/
│   └── 01_audit_views.sql      ← vistas ro_audit y sa_rollup (ya aplicadas en Supabase)
├── dashboard/
│   └── index.html              ← tablero del manager (abrir en el navegador)
├── extension/                  ← la extensión de Chrome (lo que se publica)
│   ├── manifest.json
│   ├── icons/                  ← íconos 16/48/128 (los pide la Web Store)
│   └── ...
├── scripts/
│   ├── build.sh                ← empaqueta extension/ en dist/*.zip
│   └── bump-version.sh         ← sube la versión del manifest
└── .gitignore
```

> CI: `.github/workflows/publish-sa-auditor.yml` empaqueta y publica en la Web Store
> al hacer push de un tag `sa-auditor-v*`.

## Tablero del manager

Abre `dashboard/index.html` en Chrome. Muestra:
- Resumen por SA (ROs activos, cuántos con problemas).
- Tabla de ROs con chips de qué le falta a cada uno, filtrable por SA y por tipo de problema.
- Botón de refrescar (los datos vienen frescos a minutos del sync).

La URL y la llave **anon** de Supabase ya están embebidas (la anon key es de tipo publishable; el acceso está limitado a estas dos vistas, no a las tablas crudas, y no expone datos personales del cliente).

## Datos / Supabase

- Proyecto: `tekmetric-integration C` (`kiziudyqjnihywbmgsqn`).
- Vistas: `public.ro_audit`, `public.sa_rollup` (solo lectura, `security_invoker=false`, `grant select ... to anon`).
- Para **deshacer**: `drop view public.sa_rollup; drop view public.ro_audit;`

## Seguridad (notas)

- La anon key vive en el HTML. Como el archivo es interno (tu máquina), el riesgo es bajo, pero si quieres endurecer: mover la lectura a una **Supabase Edge Function** con secreto, o poner Supabase Auth. Fácil de agregar después.
- Las vistas **no exponen** nombre/teléfono/email del cliente ni el VIN en texto — solo el # de RO, el vehículo (año/marca/modelo), el SA y banderas de qué falta.

## Próximos pasos

- Extensión SA dentro del RO (checklist en vivo) — fase 2, lee las mismas vistas.
- Endurecer acceso (Edge Function + secreto) si se comparte fuera de tu equipo.
- Afinar la regla "sin estimado" con datos reales (hoy es señal suave).

---

## Extensión SA/Admin (carpeta `extension/`)

Una sola extensión de Chrome que se **adapta al rol** de quien la instala, leyendo las mismas vistas de Supabase:

- **Admin** (tú): tablero con KPIs, lista por SA y, al hacer clic en un SA, sus ROs por completar.
- **Service Advisor**: solo **sus** ROs activos por completar, con chips de qué falta. Si está viendo un RO en Tekmetric, ese RO se **resalta** arriba.

**Rol/identidad:** la extensión **auto-detecta** el usuario logueado en Tekmetric. Si no lo reconoce, cada quien lo elige una vez con el botón **"cambiar"** del panel (o en Ajustes). Los nombres de admin se configuran en Ajustes (por defecto: Osman Perez).

### Instalar (cada usuario, en su propio Chrome)

**Recomendado — Chrome Web Store (privada/no listada):** instalación con un clic y
auto-actualización. Sin carpetas locales ni modo desarrollador.
1. Abrir el **link de la Web Store** de la extensión.
2. **Añadir a Chrome**.
3. Abrir `shop.tekmetric.com`. El panel **SA Auditor** aparece arriba a la derecha.
4. Si no te reconoce, pulsa **"cambiar"** y elige tu nombre (o Admin).

> Cómo publicarla la primera vez y cómo lanzar actualizaciones **sin volver a subir el
> `.zip` a mano**: ver **[`PUBLICAR.md`](PUBLICAR.md)**.

**Alternativa — sin empaquetar (solo para desarrollo/pruebas):**
`chrome://extensions` → **Modo de desarrollador** → **Cargar extensión sin empaquetar**
→ carpeta `extension/`.

### Notas
- **Auto-detección:** depende de cómo Tekmetric muestre el nombre del usuario. Puede necesitar afinar el **selector CSS** (Ajustes → avanzado). Osman: cuando lo probemos en vivo, capturamos el selector exacto.
- **Seguridad:** usa la llave anon (rápido para arrancar). Para producción con varios usuarios conviene migrar a login (Supabase Auth) — ver `dashboard` README.
