# Publicar e instalar SA Auditor (Chrome Web Store, privada)

Esta guía te deja la extensión **instalable con un clic** desde un link y que se
**auto-actualiza sola** en todas las computadoras cuando publiques una versión nueva.
No queda ninguna carpeta local en las máquinas de los usuarios.

Hay dos partes:

- **A. Configuración inicial** (se hace UNA sola vez).
- **B. Cada vez que quieras actualizar** (un paso, automático).

> ¿Por qué la Web Store y no auto-hospedar el `.crx`? Porque Chrome bloquea la
> instalación y la auto-actualización de extensiones auto-hospedadas para usuarios
> normales. La Web Store (aunque sea privada/no listada) es la única forma simple de
> "instalar con un clic + auto-update" sin tocar políticas de empresa en cada PC.

---

## A. Configuración inicial (una sola vez)

### 1. Cuenta de desarrollador de Google ($5, pago único)
1. Entra a <https://chrome.google.com/webstore/devconsole/> con tu cuenta de Google.
2. Acepta el acuerdo y paga la cuota única de **$5**.

### 2. Primera subida manual (para obtener el ID de la extensión)
1. Genera el `.zip` (puedes hacerlo en tu compu con `bash scripts/build.sh`, o bajar
   el artefacto `sa-auditor-extension` que produce GitHub Actions).
2. En el Developer Dashboard: **Add new item** → sube el `.zip`.
3. Completa la ficha mínima:
   - **Descripción** (puedes copiar la del README).
   - **Ícono de tienda 128×128** (ya viene en `extension/icons/icon128.png`).
   - **Al menos 1 screenshot** (1280×800 o 640×400). Sirve una captura del panel.
   - Categoría, idioma, y la **política de privacidad** (puedes poner una nota simple:
     "uso interno, lee solo vistas agregadas de Supabase, no recolecta datos personales").
4. En **Visibility / Visibilidad** elige **No listada (Unlisted)**.
   - *No listada* = no aparece en búsquedas; solo entra quien tenga el link. Ideal para el taller.
   - *Privada* = solo cuentas de un Google Workspace o testers que agregues. Más cerrada aún.
5. **Publica**. La primera revisión puede tardar de minutos a un par de días.
6. Copia el **ID de la extensión** (cadena larga de letras, p. ej. `abcdefghijklmnopabcdefghijklmnop`).
   Lo ves en la URL del item o en su página del dashboard.

### 3. Credenciales de la API (para que GitHub publique solo)
Esto permite que, de aquí en adelante, **no tengas que volver a subir nada a mano**.
Sigue la guía oficial de la API de la Web Store para obtener 3 valores:
<https://developer.chrome.com/docs/webstore/using-api>

En resumen:
1. En **Google Cloud Console** crea (o usa) un proyecto y **habilita** la
   *Chrome Web Store API*.
2. Crea credenciales **OAuth client ID** tipo *Desktop app*. Anota
   **Client ID** y **Client Secret**.
3. Genera un **Refresh token** una sola vez (la guía oficial explica el flujo de
   `accounts.google.com/o/oauth2` con el scope
   `https://www.googleapis.com/auth/chromewebstore`). Anota el **Refresh token**.

### 4. Guardar los secretos en GitHub
En el repo: **Settings → Secrets and variables → Actions → New repository secret**.
Crea estos 4 (nombres EXACTOS):

| Nombre del secreto         | Valor                                  |
|----------------------------|----------------------------------------|
| `SA_AUDITOR_EXTENSION_ID`  | el ID de la extensión (paso A.2.6)     |
| `CWS_CLIENT_ID`            | OAuth Client ID                        |
| `CWS_CLIENT_SECRET`        | OAuth Client Secret                    |
| `CWS_REFRESH_TOKEN`        | Refresh token                          |

Listo. La configuración inicial terminó.

---

## B. Cada vez que quieras actualizar (esto es lo de "sin re-subir todo a mano")

Cuando cambies código de la extensión:

```bash
# 1) sube el número de versión (la Web Store exige una versión nueva cada vez)
bash scripts/bump-version.sh            # 0.1.0 -> 0.1.1   (o: minor / major / X.Y.Z)

# 2) commit + tag + push
git add -A
git commit -m "sa-auditor v0.1.1"
git tag sa-auditor-v0.1.1
git push --follow-tags
```

Con eso, **GitHub Actions empaqueta y publica solo** en la Web Store
(workflow `.github/workflows/publish-sa-auditor.yml`). En unas horas, **todas las
computadoras donde esté instalada se actualizan automáticamente** — no tienes que
tocar ninguna máquina ni volver a mandar el `.zip` a nadie.

> ¿Solo quieres probar el empaquetado sin publicar? En **Actions → Publicar SA Auditor
> → Run workflow** pon `publish = false`: genera el `.zip` como artefacto y no sube nada.

### ¿Y si el cambio es de las reglas de auditoría?
Muchas reglas viven en las **vistas de Supabase** (`sql/01_audit_views.sql`), no en la
extensión. Esas se actualizan en el servidor (Supabase) y **no requieren publicar una
versión nueva** de la extensión: cambias la vista y todos ven los datos nuevos al refrescar.

---

## C. Instalar en una computadora nueva (cada usuario)

1. Abre el **link de la Web Store** de la extensión (el del item no listado).
2. Clic en **Añadir a Chrome**. Eso es todo: sin carpetas, sin modo desarrollador.
3. Abre `shop.tekmetric.com`; el panel **SA Auditor** aparece arriba a la derecha.
4. Si no te reconoce, pulsa **"cambiar"** y elige tu nombre (o Admin).

A partir de ahí, cada usuario recibe las actualizaciones **automáticamente**.

---

## Resumen de archivos del pipeline

- `extension/` — el código que se publica (ahora incluye `icons/`).
- `scripts/build.sh` — empaqueta `extension/` en `dist/sa-auditor-extension.zip`.
- `scripts/bump-version.sh` — sube la versión en `manifest.json`.
- `.github/workflows/publish-sa-auditor.yml` — CI que empaqueta y publica al hacer push del tag.
