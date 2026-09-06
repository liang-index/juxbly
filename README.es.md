# Juxbly

**La fábrica instantánea de apps del navegador.** Describe lo que quieres en la página que estás viendo: el resultado llega de inmediato, y la herramienta que lo produjo se queda — vuelve por sí sola la próxima vez que visites.

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [Português (Brasil)](README.pt-BR.md) · **Español**

> Esta es una traducción de la comunidad que sigue al original en inglés con el mejor esfuerzo y puede ir retrasada; si difieren, el [README en inglés](README.md) es la referencia autoritativa.

> Estado: **preimplementación**. El esqueleto MV3 carga en Chrome y la DSL con su capa de validación está lista; el análisis de páginas, las herramientas, los paneles y la confirmación por resaltado aún no se han construido. Para lo que V1 deliberadamente no hará, ver [`docs/contributing/SCOPE.md`](docs/contributing/SCOPE.md).

<p align="center">
  <img src="docs/assets/screenshots/highlight-confirm.png" width="32.5%" alt="Flujo de construcción: describe la necesidad, Juxbly resalta lo que va a leer, confirma campo por campo" title="Construir: describir &rarr; resaltar &rarr; confirmar" />
  <img src="docs/assets/screenshots/run-panel-result.png" width="32.5%" alt="Panel de ejecución: el resultado llega primero, con la herramienta que lo produjo acreditada en el resultado" title="Ejecutar: primero el resultado, con procedencia" />
  <img src="docs/assets/screenshots/overview-popup.png" width="32.5%" alt="Resumen en la barra de herramientas: herramientas guardadas ordenadas por uso más reciente, listas para volver solas" title="Herramientas persistidas, las más recientes primero" />
</p>
<p align="center"><sub>UI de prototipo: describe una necesidad &rarr; confirma los campos resaltados &rarr; obtén el resultado &rarr; la herramienta se queda y vuelve sola.</sub></p>

---

## 1. Qué es

Juxbly es una extensión de Chrome de código abierto (Manifest V3). Describes una necesidad en lenguaje natural en la página actual. Un modelo analiza la página y produce una configuración **Tool DSL**. La confirmas una vez mediante un resaltado en la propia página, y la herramienta queda **guardada**. A partir de entonces, cada vez que visites una página compatible, la herramienta aparece y se ejecuta sola.

La unidad de valor es la **herramienta (Tool)**, no el prompt:

```
Descubrir → Construir → Confirmar → Guardar → Ejecutar → Entregar → Salud → Reparar → Versionar → Reutilizar
```

## 2. Por qué existe

La mayoría de las tareas web puntuales — "saca la columna de precios de esta tabla", "reúne todas las tarjetas de resultados de esta página de búsqueda", "resume las reseñas de esta página de producto" — son demasiado pequeñas para escribir un script y demasiado específicas para una extensión existente.

La apuesta de Juxbly no es "ejecutar esta tarea una vez". Es:

> **Convertir una necesidad puntual de cola larga en un resultado que te llevas — y una herramienta de página persistente que conservas.**

El resultado va primero: cada ejecución pone los datos frente a ti con copiar / CSV / JSON a un clic. La herramienta queda como subproducto y queda acreditada en el propio resultado, así que siempre sabes qué lo produjo — y que estará ahí la próxima vez.

Eso significa que lo difícil no es solo la generación, sino también la **visibilidad de fallos, la reparación barata y el versionado**. Juxbly no promete que una herramienta nunca se rompa; promete que una herramienta rota se detecta, se explica y se reconstruye barato.

## 3. Para quién es

- Desarrolladores y usuarios avanzados que repiten tareas de información específicas de páginas.
- Investigadores y trabajadores del conocimiento que procesan páginas web en masa.
- Colaboradores interesados en LLM + comprensión de DOM, defensa contra inyección de prompts y herramientas de navegador locales.

Juxbly **no** es una barra lateral de chat genérica, **no** es un scraper universal y **no** es un motor de "la IA escribe y ejecuta JavaScript". Las fronteras explícitas están en [`docs/contributing/SCOPE.md`](docs/contributing/SCOPE.md).

### Dónde funciona, y dónde le cuesta

Medido en una muestra de diez sitios antes de la implementación:

| Forma de la página | Estado |
|---|---|
| Páginas y documentos regulares y bien estructurados | Fiable — esto es a lo que apunta V1 |
| Scroll infinito | Mejor esfuerzo |
| SPA renderizada en el cliente | Mejor esfuerzo |
| Nombres de clase con hash o generados | Mejor esfuerzo |

"Mejor esfuerzo" significa que puede funcionar y puede no funcionar. Cuando no funciona, Juxbly lo dice en lugar de mostrar un resultado vacío — y nada de aquí afirma que funcione en todos los sitios.

## 4. Cómo funciona

```
Tool DSL (el LLM produce configuración, nunca código)
   ↓
Capability Runtime (extract / transform / llm / render / export)
   ↓
Browser Adapter (el único lugar autorizado para tocar chrome.*)
   ↓
Browser APIs
```

- **El código es fijo, la configuración es variable.** El modelo emite JSON; un intérprete de lista blanca lo ejecuta. No hay `eval`, ni `new Function`, ni carga de código remoto en ningún punto del repositorio.
- **El trabajo determinista nunca llama al modelo.** `extract` / `transform` / `render` son locales; solo los pasos `llm` cuestan tokens, y se omiten cuando las entradas no han cambiado.
- **Trae tu propia clave (BYOK).** Cualquier **endpoint compatible con OpenAI** sirve — OpenAI, OpenRouter, Together, o una pasarela local (LM Studio, el servidor compatible con OpenAI de Ollama, …) — configura la URL base una vez. El contenido de la página va de tu navegador, con tu propia clave de API, al endpoint que elijas. No hay servidor de Juxbly en el camino ni telemetría.

Detalles: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## 5. Instalación (desde el código fuente)

```bash
git clone https://github.com/liang-index/juxbly.git
cd juxbly
pnpm install
pnpm dev            # compila a .output/chrome-mv3 con watch
```

Después, en Chrome:

1. Abre `chrome://extensions`.
2. Activa el **modo de desarrollador**.
3. **Cargar descomprimida** → selecciona `.output/chrome-mv3`.

Primera ejecución: haz clic en la bola flotante de cualquier página y describe lo que quieres. Juxbly pide una clave de API solo en el momento en que de verdad necesita llamar a un modelo.

> El esqueleto carga y el popup se abre, pero nada está cableado todavía: el análisis de páginas, las herramientas, los paneles y la confirmación por resaltado están por venir.

## 6. Desarrollo local

| Comando | Para qué |
|---|---|
| `pnpm install` | instalar dependencias del workspace |
| `pnpm dev` | compilar la extensión en modo watch |
| `pnpm build` | build de producción |
| `pnpm typecheck` | `tsc --noEmit` en todos los paquetes |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest unitarias + integración |
| `pnpm test:bench` | benchmark web local (Fase 2+) |

Configuración completa, depuración y solución de problemas: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

## 7. Pruebas

```bash
pnpm test                 # unitarias (tests/unit) + integración (tests/integration)
pnpm test -- --watch      # modo watch
pnpm test:bench           # Web Corpus + Task Corpus (Fase 2)
```

Las pruebas de integración ejecutan el runtime real contra HTML de fixture con un `BrowserAdapter` simulado y un `LlmPort` simulado — sin Chrome, sin red, sin clave de API. Alcance de las pruebas y regla de disparo de regresión: [`docs/testing/TESTING.md`](docs/testing/TESTING.md).

## 8. Por dónde empezar a leer

| Quiero… | Empieza aquí |
|---|---|
| entender el sistema y los contratos de tipos | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| saber de qué es dueño cada módulo | [`docs/CODE_MAP.md`](docs/CODE_MAP.md) |
| leer la DSL | `packages/dsl` + [`docs/ARCHITECTURE.md` §5](docs/ARCHITECTURE.md) |
| añadir una capability | [`docs/contributing/CAPABILITY_GUIDE.md`](docs/contributing/CAPABILITY_GUIDE.md) |
| leer los design tokens | [`docs/UI_SPEC.md`](docs/UI_SPEC.md) |
| saber qué no hará V1 | [`docs/contributing/SCOPE.md`](docs/contributing/SCOPE.md) |

Dos objetivos guían esta estructura: el **tiempo del desarrollador hasta el primer éxito** y el **tiempo del desarrollador hasta la primera contribución**.

## 9. Contribuir

Primero los caminos de baja fricción: documentación, pruebas, **casos de benchmark**, **recipes**, luego corrección de bugs, luego capabilities pequeñas. La arquitectura central, la DSL, los permisos y las fronteras de seguridad las controla el mantenedor.

Empieza por [`CONTRIBUTING.md`](CONTRIBUTING.md) y sigue la guía que corresponda a tu contribución:

- Capability → [`docs/contributing/CAPABILITY_GUIDE.md`](docs/contributing/CAPABILITY_GUIDE.md)
- Recipe → [`docs/contributing/RECIPE_GUIDE.md`](docs/contributing/RECIPE_GUIDE.md)
- Caso de benchmark → [`docs/contributing/BENCHMARK_GUIDE.md`](docs/contributing/BENCHMARK_GUIDE.md)

## 10. Privacidad y seguridad

- Todos los datos se quedan en `chrome.storage.local`. Sin sincronización, sin cuenta, sin telemetría — esta es una posición permanente del build de código abierto, no un estado temporal.
- Tu clave de API se lee **solo** en el service worker en segundo plano y nunca entra en el content script, en el contexto de la página ni en logs.
- El contenido de la página es entrada no confiable. Los prompts del modelo lo envuelven como *datos*, nunca como instrucciones.
- Reportar una vulnerabilidad: [`SECURITY.md`](SECURITY.md). Declaración de manejo de datos: [`PRIVACY.md`](PRIVACY.md).

## 11. Índice de documentación

| Documento | Papel |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | contratos de tipos e interfaces de módulos |
| [`docs/UI_SPEC.md`](docs/UI_SPEC.md) | design tokens y reglas de comportamiento de componentes |
| [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) | convenciones de ingeniería y la regla de regresión |
| [`docs/CODE_MAP.md`](docs/CODE_MAP.md) | módulo → responsabilidad → dónde mirar |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | puesta en marcha para desarrolladores |
| [`docs/contributing/SCOPE.md`](docs/contributing/SCOPE.md) | lo que V1 deliberadamente no hace |
| [`docs/contributing/CAPABILITY_GUIDE.md`](docs/contributing/CAPABILITY_GUIDE.md) | cómo escribir una capability |
| [`docs/contributing/RECIPE_GUIDE.md`](docs/contributing/RECIPE_GUIDE.md) | cómo publicar una recipe |
| [`docs/contributing/BENCHMARK_GUIDE.md`](docs/contributing/BENCHMARK_GUIDE.md) | cómo funciona el benchmark Web Corpus |
| [`docs/testing/TESTING.md`](docs/testing/TESTING.md) | capas de pruebas y la regla de regresión |
| [`docs/contributing/DOC_CHANGE_PROTOCOL.md`](docs/contributing/DOC_CHANGE_PROTOCOL.md) | cómo cambiar un contrato compartido |

Cada hecho tiene exactamente una fuente autoritativa; los demás documentos solo la referencian ([`docs/contributing/DOC_CHANGE_PROTOCOL.md`](docs/contributing/DOC_CHANGE_PROTOCOL.md)).

## 12. Licencia

El código se distribuye bajo **AGPL-3.0** — ver [`LICENSE`](LICENSE).

**El nombre Juxbly, el logo, el dominio oficial y la identidad oficial en la Chrome Web Store no están cubiertos por la licencia del código** y se rigen por separado según la política de marca en [`TRADEMARK.md`](TRADEMARK.md).
