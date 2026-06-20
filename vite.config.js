import { resolve } from "path";
import { defineConfig } from "vite";
import fs from "fs";

if (fs.existsSync(".env")) {
  const envContent = fs.readFileSync(".env", "utf-8");
  envContent.split(/\r?\n/).forEach((line) => {
    const parts = line.split("=");
    if (parts.length >= 2 && !parts[0].trim().startsWith("#")) {
      const key = parts[0].trim();
      const val = parts.slice(1).join("=").trim().replace(/^['"]|['"]$/g, "");
      process.env[key] = val;
    }
  });
}

export default defineConfig({
  plugins: [
    {
      name: "api-serverless-middleware",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url.startsWith("/api/")) {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const apiPath = url.pathname;
            const filePath = resolve(import.meta.dirname, `.${apiPath}.js`);
            
            if (fs.existsSync(filePath)) {
              try {
                const module = await server.ssrLoadModule(filePath);
                const handler = module.default;
                
                const bodyBuffer = await new Promise((resolveBody) => {
                  let body = [];
                  req.on("data", (chunk) => body.push(chunk));
                  req.on("end", () => resolveBody(Buffer.concat(body)));
                });
                
                const bodyStr = bodyBuffer.toString();
                req.body = {};
                if (bodyStr) {
                  try {
                    req.body = JSON.parse(bodyStr);
                  } catch {
                    req.body = bodyStr;
                  }
                }
                
                res.status = (code) => {
                  res.statusCode = code;
                  return res;
                };
                res.json = (data) => {
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify(data));
                  return res;
                };
                
                await handler(req, res);
                return;
              } catch (err) {
                console.error("API Local Error:", err);
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: err.message }));
                return;
              }
            }
          }
          next();
        });
      }
    }
  ],
  build: {
    target: "esnext",
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        carteira: resolve(import.meta.dirname, "carteira.html"),
        loja: resolve(import.meta.dirname, "loja.html"),
        produto: resolve(import.meta.dirname, "produto.html"),
        carrinho: resolve(import.meta.dirname, "carrinho.html"),
        meuspedidos: resolve(import.meta.dirname, "meus-pedidos.html"),
        admin: resolve(import.meta.dirname, "admin/index.html"),
        error403: resolve(import.meta.dirname, "403.html"),
        error404: resolve(import.meta.dirname, "404.html"),
      },
    },
  },
});

