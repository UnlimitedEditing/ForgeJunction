#!/usr/bin/env node
// Generates x/index.html — replaces the turtle-web HTML generation step,
// which fails on Windows due to Node ESM loader path issues (d: drive).
const { writeFileSync, mkdirSync } = require("fs")
const { join } = require("path")

const out = join(__dirname, "..", "x", "index.html")
mkdirSync(join(__dirname, "..", "x"), { recursive: true })

const html = `<!doctype html>
<html>
\t<head>
\t\t<meta charset="utf-8"/>
\t\t<meta name="viewport" content="width=device-width,initial-scale=1"/>
\t\t<meta name="darkreader" content="dark"/>
\t\t<title>omniclip</title>
\t\t<link rel="stylesheet" href="index.css"/>
\t\t<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.20.0/cdn/themes/dark.css" />
\t\t<script type="module" src="https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.20.0/cdn/shoelace.js"></script>
\t\t<script src="https://cdn.jsdelivr.net/npm/pixi.js@7.4.2/dist/pixi.min.js"></script>
\t\t<script src="https://cdn.jsdelivr.net/npm/pixi-filters@5.3.0/dist/browser/pixi-filters.min.js"></script>
\t\t<script src="https://cdn.jsdelivr.net/npm/@pixi/graphics-extras@7.1.4/dist/graphics-extras.min.js"></script>
\t\t<script src="https://cdn.jsdelivr.net/npm/@pixi-essentials/object-pool@1.0.1/dist/pixi-object-pool.js"></script>
\t\t<script src="https://cdn.jsdelivr.net/npm/@pixi-essentials/bounds@3.0.0/dist/bounds.js"></script>
\t\t<script src="https://cdn.jsdelivr.net/npm/@pixi-essentials/transformer@3.0.2/dist/transformer.js"></script>
\t\t<script src="coi-serviceworker.js"></script>
\t\t<script type="importmap-shim" src="./importmap.json"></script>
\t\t<script defer src="https://cdn.jsdelivr.net/npm/es-module-shims@1.8.2/dist/es-module-shims.min.js"></script>
\t\t<script type="module-shim" src="./main.js"></script>
\t\t<link rel="icon" type="image/png" sizes="32x32" href="./assets/favicon-32x32.png">
\t\t<link rel="preconnect" href="https://fonts.googleapis.com">
\t\t<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
\t\t<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200;400;500;700;800&display=swap" rel="stylesheet">
\t</head>
\t<body>
\t\t<div class="loading-page-indicator">
\t\t\t<img class="logo-loader" src="/assets/icon3.png" />
\t\t\t<div class="loader"><div class="loaderBar"></div></div>
\t\t</div>
\t</body>
</html>
`

writeFileSync(out, html, "utf8")
console.log("[gen-index-html] wrote", out)
