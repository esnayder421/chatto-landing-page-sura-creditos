# ──────────────────────────────────────────────
#  AquaShield Landing Page – Static site con Nginx
# ──────────────────────────────────────────────

# Imagen base ligera de Nginx (Alpine = ~23 MB)
FROM nginx:alpine

# Copiar los archivos estáticos al directorio raíz de Nginx
COPY index.html /usr/share/nginx/html/index.html
COPY aquashield-webhook.js /usr/share/nginx/html/aquashield-webhook.js
COPY robots.txt /usr/share/nginx/html/robots.txt
COPY sitemap.xml /usr/share/nginx/html/sitemap.xml

# (Opcional) Configuración personalizada de Nginx
# Se sobrescribe la config por defecto para:
#   - Comprimir las respuestas (gzip)
#   - Cachear assets correctamente
#   - Servir index.html como fallback (SPA-ready)
RUN printf 'server {\n\
    listen 80;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    gzip on;\n\
    gzip_types text/html text/css application/javascript application/json text/xml application/xml;\n\
    gzip_min_length 1024;\n\
\n\
    # Headers SEO y seguridad\n\
    add_header X-Content-Type-Options "nosniff";\n\
    add_header X-Frame-Options "SAMEORIGIN";\n\
    add_header Referrer-Policy "strict-origin-when-cross-origin";\n\
\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
\n\
    # robots.txt y sitemap sin cache para siempre tenerlos frescos\n\
    location ~* ^/(robots\\.txt|sitemap\\.xml)$ {\n\
        add_header Cache-Control "no-cache";\n\
        add_header Content-Type "text/plain; charset=utf-8";\n\
    }\n\
\n\
    # Cache de assets estáticos\n\
    location ~* \\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?)$ {\n\
        expires 1y;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

# Puerto expuesto (Dokploy lo detecta automáticamente)
EXPOSE 80

# Nginx corre en primer plano
CMD ["nginx", "-g", "daemon off;"]
