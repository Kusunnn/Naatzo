// src/templates/react-vite.js
// Plantilla probada de frontend: React + Vite. En Docker se compila y se
// sirve con nginx. Versiones fijas.

function files({ slug, projectName, withBackend }) {
  const pkg = {
    name: `${slug}-frontend`,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
    dependencies: { react: "18.3.1", "react-dom": "18.3.1" },
    devDependencies: { vite: "5.4.11", "@vitejs/plugin-react": "4.3.4" },
  };

  const healthCheck = withBackend
    ? `
  const [api, setApi] = useState("revisando...");

  useEffect(() => {
    fetch(\`\${API_URL}/health\`)
      .then((r) => r.json())
      .then((d) => setApi(d.ok ? "en linea" : "con errores"))
      .catch(() => setApi("sin conexion"));
  }, []);
`
    : "";

  const app = `${withBackend ? 'import { useEffect, useState } from "react";\n\nconst API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";\n\n' : ""}export default function App() {${healthCheck}
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>${escapeJsx(projectName)}</h1>
      <p>Estructura inicial generada por Naatzo.</p>${withBackend ? "\n      <p>API: {api}</p>" : ""}
    </main>
  );
}
`;

  const main = `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`;

  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(projectName)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`;

  const vite = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
`;

  const dockerfile = `FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
`;

  return [
    { path: "frontend/package.json", content: `${JSON.stringify(pkg, null, 2)}\n` },
    { path: "frontend/index.html", content: html },
    { path: "frontend/vite.config.js", content: vite },
    { path: "frontend/src/main.jsx", content: main },
    { path: "frontend/src/App.jsx", content: app },
    { path: "frontend/Dockerfile", content: dockerfile },
    { path: "frontend/.dockerignore", content: "node_modules\ndist\n.env\n" },
  ];
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function escapeJsx(s) {
  return String(s).replace(/[{}<>&]/g, (c) => `{"${c}"}`);
}

module.exports = { files };
