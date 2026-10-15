# SISTEMA - PWA de Hábitos (Solo Leveling)

SISTEMA es una aplicación progresiva de hábitos para móvil. Convierte tus compromisos diarios en misiones, registra el progreso localmente y acompaña el ascenso del cazador hasta el Monarca de las Sombras.

## Características principales

- Misiones diarias, semanales y mensuales, no negociables, categorías editables y penalizaciones.
- Inicio permite marcar todas las misiones de hoy; en Hábitos se gestionan las misiones y, en un apartado propio, sus categorías.
- El XP no es editable: dificultad fácil/media/difícil otorga 10%/15%/25% del XP requerido para el siguiente nivel, escalando automáticamente con el nivel.
- Los objetivos semanales indican cuántas veces completar una misión antes de que termine la semana. Los hábitos mensuales se consideran cumplidos al completarlos al menos una vez dentro del mes.
- Las notificaciones disponibles son recordatorios generales configurados en Ajustes; no hay recordatorios individuales por hábito.
- XP, niveles del 1 al 100, rachas, historial y animaciones de ascenso.
- Seis sombras que se desbloquean secuencialmente al renacer en el nivel 100.
- PWA instalable, funcionamiento offline tras la primera carga y diseño adaptable con soporte de safe-area.
- Exportación e importación de copias JSON; toda la información del jugador se conserva en el navegador.
- HTML, CSS y JavaScript vanilla con módulos ES; sin frameworks, librerías ni proceso de compilación.

## Ejecutar localmente

Se recomienda usar un servidor HTTP local, ya que los módulos ES y el Service Worker no funcionan correctamente desde `file://`.

```bash
npx serve .
```

Alternativas:

```bash
python -m http.server
python3 -m http.server
```

También se puede usar `live-server`. Abre la URL local que indique el servidor.

## Requisitos

Navegador moderno con soporte para Service Worker, módulos ES, localStorage y Notification API. Para instalar la PWA y usar todas las funciones, la aplicación debe estar servida mediante HTTPS (localhost se considera seguro para desarrollo).

## PWA en móvil

- **Android:** abre la app en Chrome o Edge y elige «Añadir a pantalla de inicio» / «Instalar aplicación».
- **iOS:** en Safari usa «Compartir > Añadir a pantalla de inicio». El nombre y el icono de inicio están configurados para mostrar «SISTEMA». La experiencia de notificaciones requiere una PWA instalada y funciona mejor en iOS 16.4 o posterior.
- El manifiesto PWA incluye el nombre «SISTEMA» y los iconos normales y maskable para Android/Chrome. Si ya habías instalado una versión anterior, elimina el acceso anterior y vuelve a añadir la app para que el teléfono actualice su nombre e icono.

## Despliegue en GitHub Pages

1. Sube el contenido de esta carpeta a la raíz de la rama `main` de un repositorio.
2. En GitHub abre **Settings > Pages**.
3. En **Build and deployment**, elige **Deploy from a branch**.
4. Selecciona la rama **main** y la carpeta **/(root)**; pulsa **Save**.
5. Espera la publicación y abre la URL indicada por GitHub Pages.

Los enlaces, el manifiesto y el registro del Service Worker utilizan rutas relativas, por lo que la app funciona también publicada bajo una subruta de repositorio. `.nojekyll` evita que GitHub Pages omita archivos.

## Limitaciones de notificaciones

- Esta versión **no incluye servidor push**. No se envían notificaciones Web Push remotas.
- Los temporizadores de página y Periodic Background Sync dependen del navegador y del sistema operativo; **con la app totalmente cerrada no se garantiza el aviso**.
- La entrega funciona mejor con la app abierta o en segundo plano. La disponibilidad de Periodic Background Sync varía entre navegadores.
- En **iOS** hay que instalar la PWA en la pantalla de inicio para habilitar notificaciones web; se recomienda iOS 16.4 o posterior.
- El permiso solo se solicita cuando el usuario pulsa «Activar recordatorios» en Ajustes. Notification Triggers no se usa porque su soporte continúa siendo experimental.

## Iconografía

La interfaz utiliza iconos geométricos propios en SVG/CSS. No utiliza emojis. Los iconos de instalación son ilustraciones SVG y PNG de marca con variantes maskable y área segura.

## Sistema de Sombras

Las seis sombras empiezan bloqueadas y se liberan de una en una cuando el usuario alcanza el nivel 100 y confirma **Despertar / Reiniciar nivel**. Renacer devuelve el nivel a 1, incrementa el contador y conserva las sombras previamente liberadas.

## Rangos 1–100

| Rango | Niveles |
|---|---:|
| E | 1–14 |
| D | 15–28 |
| C | 29–42 |
| B | 43–56 |
| A | 57–70 |
| S | 71–84 |
| Rango Nacional | 85–99 |
| Monarca de las Sombras | 100 |

## Datos locales

Los datos se guardan en `localStorage` con la clave `sistema_v1`. Usa **Ajustes > Exportar datos JSON** para crear una copia que puedas conservar o importar en otro navegador. «Borrar todos los datos» requiere dos confirmaciones.

## Pruebas rápidas

1. Abre la app por primera vez y acepta el protocolo de bienvenida.
2. En Hábitos, crea una categoría/hábito y completa la misión de hoy; comprueba el XP y prueba desmarcarla.
3. Crea un no negociable, deja una misión pendiente y confirma la penalización al procesar un día posterior.
4. Completa todas las tareas de castigo, exporta un JSON y prueba importar una copia.
5. Comprueba las seis pestañas, el heatmap, las sombras bloqueadas y el diseño móvil.
6. Con HTTPS o localhost, recarga una vez y prueba la app sin conexión.

## Estructura

```text
.
├── app.js
├── index.html
├── styles.css
├── manifest.json
├── sw.js
├── js/         # Estado, almacenamiento, gamificación, UI, utilidades e iconos
└── icons/      # SVG y PNG instalables, incluidas variantes maskable
```

## Roadmap

- Integrar Web Push con un backend y claves VAPID para avisos fiables cuando la aplicación esté cerrada.
- Añadir analíticas históricas más detalladas y sincronización opcional entre dispositivos.
