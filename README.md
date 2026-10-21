# SISTEMA - PWA de Hábitos (Solo Leveling)

SISTEMA es una aplicación progresiva de hábitos para móvil. Convierte tus compromisos diarios en misiones, registra el progreso localmente y acompaña el ascenso del cazador hasta el Monarca de las Sombras.

## Características principales

- Misiones diarias, semanales y mensuales, no negociables, categorías editables y penalizaciones.
- Inicio permite marcar todas las misiones de hoy; en Hábitos se gestionan las misiones y, en un apartado propio, sus categorías.
- La pestaña Habilidad permite guardar varias habilidades semanales con título y descripción, editarlas o eliminarlas; Inicio muestra solo cada título. El domingo se puede marcar si cada habilidad fue completada. Las pendientes pasan a la semana siguiente y quedan registradas en el historial semanal.
- El XP no es editable: dificultad fácil/media/difícil otorga 10%/15%/25% del XP requerido para el siguiente nivel. La frecuencia multiplica esa recompensa: diario 1×, semanal 2× y mensual 3×.
- Los hábitos semanales y mensuales tienen un objetivo de repeticiones configurable. Cada marca de la casilla suma una repetición y solo al alcanzar el objetivo se entrega el XP de esa misión. La casilla permite avanzar de una en una hasta completar el objetivo. El objetivo queda fijado tras la primera repetición del periodo; los cambios se aplican al siguiente. El progreso parcial se conserva durante su semana o mes y cuenta para las penalizaciones de cierre.
- Dos días por semana (de lunes a domingo) pueden contar como flexibles si se completó al menos el 80% de los hábitos diarios activos, redondeado hacia arriba. Todos los no negociables activos deben estar completos.
- Al procesar un día flexible incompleto, Inicio muestra una advertencia y el saldo de flexibilidad restante. Si no queda flexibilidad o faltó un no negociable, se activa el castigo en un diálogo de pantalla completa que no se puede cerrar hasta completar todas sus tareas.
- Los hábitos semanales deben alcanzar su objetivo antes del cierre del domingo; los mensuales deben completarse antes del último día natural del mes. Al cerrar un periodo incumplido, se activa el mismo castigo y se pierde el 50% del XP requerido en el nivel actual por cada hábito vencido, además de la penalización normal de 25 XP por activar el castigo. La pérdida se acumula y puede hacer descender niveles; no se puede bajar del nivel 1.
- Cada no negociable completado otorga 3% del XP requerido para subir el nivel actual. Completar todos los hábitos diarios activos y no negociables otorga un bonus diario adicional del 2%; se obtiene una sola vez al cumplirlos simultáneamente.
- Al completar una misión, su casilla queda bloqueada ese día y no se puede desmarcar. Los hábitos semanales y mensuales pueden volver a marcarse en otros días del periodo.
- Los porcentajes se calculan sobre el requisito de XP del nivel actual; no son cantidades configurables ni fijas.
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

Navegador moderno con soporte para Service Worker, módulos ES y localStorage. Para instalar la PWA y usar todas las funciones, la aplicación debe estar servida mediante HTTPS (localhost se considera seguro para desarrollo).

## PWA en móvil

- **Android:** abre la app en Chrome o Edge y elige «Añadir a pantalla de inicio» / «Instalar aplicación».
- **iOS:** en Safari usa «Compartir > Añadir a pantalla de inicio». El nombre y el icono de inicio están configurados para mostrar «SISTEMA».
- El manifiesto PWA incluye el nombre «SISTEMA» y los iconos normales y maskable para Android/Chrome. Si ya habías instalado una versión anterior, elimina el acceso anterior y vuelve a añadir la app para que el teléfono actualice su nombre e icono.

## Despliegue en GitHub Pages

1. Sube el contenido de esta carpeta a la raíz de la rama `main` de un repositorio.
2. En GitHub abre **Settings > Pages**.
3. En **Build and deployment**, elige **Deploy from a branch**.
4. Selecciona la rama **main** y la carpeta **/(root)**; pulsa **Save**.
5. Espera la publicación y abre la URL indicada por GitHub Pages.

Los enlaces, el manifiesto y el registro del Service Worker utilizan rutas relativas, por lo que la app funciona también publicada bajo una subruta de repositorio. `.nojekyll` evita que GitHub Pages omita archivos.

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
2. En Hábitos, crea una categoría y misiones de distintas frecuencias. Marca una misión semanal/mensual por partes y comprueba que la casilla sume una repetición cada vez y que el XP se entregue solo al alcanzar el objetivo.
3. Crea un no negociable, deja una misión pendiente y confirma la penalización al procesar un día posterior.
4. Completa todas las tareas de castigo, exporta un JSON y prueba importar una copia.
5. Guarda varias habilidades semanales con descripción, edítalas/elimina alguna, comprueba los títulos enlazados desde Inicio y, el domingo, marca una como completada. Comprueba que las pendientes pasen a la semana siguiente y aparezcan en el historial de la semana anterior.
6. Comprueba las pestañas, el heatmap, las sombras bloqueadas y el diseño móvil.
7. Con HTTPS o localhost, recarga una vez y prueba la app sin conexión.

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
