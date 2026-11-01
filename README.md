# 100 como tú

De cada 100 personas como tú, ¿cuántas participaron? Visualización web de los datos de la Plataforma de los Conteos Censales de Participación Ciudadana (CCPC) 2009-2024 del INE.

Equipo INEvitables · Hackea la participación: Datos que construyen democracia · Reto 3.

## Contenido

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Página única. Estructura y textos. |
| `styles.css` | Estilos. Los colores institucionales están en el bloque `:root` (tema claro y oscuro). |
| `app.js` | Lógica: filtros, monito arrastrable, cuadrícula de 100 figuras, mapa de cuadros, línea del tiempo, comparación y tarjeta. |
| `datos.js` | Datos agregados (entidad × edad × sexo × elección), 2009-2024. Se genera con `tools/agrega_zips.py`. |
| `tools/agrega_zips.py` | Convierte los ZIP oficiales del INE (un CSV por entidad) en `datos.js`, leyendo por bloques. |
| `tools/agrega_csv.py` | Igual, pero para el CSV grande «Tabla General» exportado del tablero del INE (una elección). |

No hay servidor, base de datos, paso de compilación ni dependencias: son archivos estáticos.

## Verlo en local

Abrir `index.html` en el navegador, o servir la carpeta: `python3 -m http.server 8000` y entrar a `http://localhost:8000`.

## Actualizar los datos (cada elección)

1. Descargar los ZIP del portal oficial: <https://ine.mx/transparencia/datos-abiertos/visualizacion-datos/conteos-censales-participacion/> (los de «Conteos Censales» de cada año; los de Prisión Preventiva y Voto Anticipado se ignoran).
2. Guardarlos, sin descomprimir, en una carpeta (por ejemplo `zips/`).
3. Generar los datos: `python3 tools/agrega_zips.py zips --out datos.js` (requiere Python 3 y pandas; tarda unos minutos).
4. Revisar lo que imprime: `LN` debe ser igual a `SV + NV + NS` en cada año y la participación nacional debe coincidir con el tablero oficial «Datos generales».
5. Si hay una elección nueva, agregar su año a `TIPOS` en el script (`P` presidencial, `I` intermedia).

El script registra el nombre y el SHA-256 de cada ZIP dentro de `datos.js` (`meta.archivos`) y deja `agregado.csv`, la tabla pequeña que alimenta el sitio. Participación = sí votaron ÷ (sí votaron + no votaron), definición del Manual CCPC 2009-2024.

## Incrustarlo en otro sitio

```html
<iframe src="https://joshuasv79.github.io/100_como_tu/" title="100 como tú: participación ciudadana"
        width="100%" height="1100" style="border:0" loading="lazy"></iframe>
```

## Adaptar la identidad visual

Editar solo las variables del bloque `:root` de `styles.css`. Los valores actuales son aproximaciones de la paleta institucional (gris, beige, blanco y negro); sustituirlos por los del manual de identidad vigente.

## Accesibilidad

Contraste AA, navegación completa con teclado (el arrastre es opcional: cada opción también se elige con un toque), alternativa textual para cada gráfica y tabla equivalente, tema claro y oscuro, y respeto a `prefers-reduced-motion`.

## Privacidad

Sin cookies propias, sin analítica y sin guardar selecciones ni apuestas. La tarjeta para compartir se genera en el navegador. Solo se usan datos agregados. El tablero oficial del INE incrustado en la página se carga desde los servidores del INE.

## Licencia y derechos

Los derechos patrimoniales se ceden al INE por 10 años conforme a la carta de cesión firmada por el equipo, conforme a la Base Décimo Primera de la convocatoria.
