# voidtribe split version

Bestanden:

- `index.html` — markup en script/style verwijzingen
- `styles.css` — alle CSS
- `shaders.js` — vertex- en fragmentshader strings
- `main.js` — WebGL setup, muis/touch-rotatie, webcam en fallback-texture

De fallback-texture is geen PNG; deze wordt runtime gegenereerd als 256×256 RGBA texture in `main.js`.

Open bij voorkeur via een lokale webserver of publiceer op GitHub Pages/Cloudflare Pages:

```bash
python3 -m http.server 8080
```

Daarna openen: `http://localhost:8080`
