# Performance Panel for Google Sheets

**Descubre qué fórmulas ralentizan tu hoja de cálculo.**

[![Vídeo de demostración (MP4)](media/demo.gif)](media/demo.mp4)

[English](README.md) · [Русский](README.ru.md) · Español · [Deutsch](README.de.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Українська](README.uk.md) · [中文](README.zh.md) · [日本語](README.ja.md)

Hojas de cálculo de Google ya mide cuánto tarda cada fórmula, pero apenas enseña esos números. Este userscript añade un pequeño botón junto a «Compartir». Pulsa «Recalculate» y verás primero las celdas más lentas, cada una con su fórmula, su tiempo y un enlace que te lleva directamente a ella.

## Qué hace

- Recalcula toda la hoja de cálculo o una sola hoja con el propio motor de Google.
- Muestra las celdas más lentas: fórmulas, formato condicional y validación de datos.
- Haz clic en una dirección para ir a la celda.
- Muestra en qué se fue el tiempo: fórmulas, formato, validación, carga.
- Pestaña Experiment: contadores del motor, cuántas veces se ejecutó cada función y los vínculos de la celda seleccionada.

<p>
  <a href="media/performance.png"><img src="media/performance-panel.png" alt="Celdas más lentas con sus fórmulas" width="32%"></a>
  <a href="media/result.png"><img src="media/result-panel.png" alt="Tiempo por etapa" width="32%"></a>
  <a href="media/experiment-counters.png"><img src="media/experiment-counters-panel.png" alt="Contadores del motor" width="32%"></a>
</p>

## Instalación

1. Instala [Violentmonkey](https://violentmonkey.github.io/) o [Tampermonkey](https://www.tampermonkey.net/).
2. Abre el script en [Greasy Fork](https://greasyfork.org/es/scripts/597075-performance-panel-for-google-sheets) y pulsa Instalar.
3. Recarga la hoja de cálculo. El botón con el velocímetro aparece junto a «Compartir».

Funciona en Chrome y Firefox. El panel usa el idioma de Hojas de cálculo de Google si es ruso; en cualquier otro caso, inglés.

## Conviene saber

- Todos los números vienen de Google. El script no estima nada y, si Google no informa de algo, el panel lo dice.
- Nada sale de tu navegador: ni servidores ni analítica. Los resultados se guardan en memoria hasta que recargas la página.
- Recalcular una hoja puede recalcular también las hojas de las que depende.
- Google cambia Hojas de cálculo a menudo. Si cambia algo en lo que se apoya el script, verás un mensaje claro en lugar de números erróneos.
- No está afiliado con Google.

La demostración usa datos de ejemplo. Este repositorio solo contiene el script compilado; Greasy Fork se actualiza desde aquí automáticamente.

Hecho por [@zycck](https://t.me/zycck).
