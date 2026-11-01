# Build dist from the full repository first, then package a minimal runtime image.
ARG NGINX_IMAGE=nginx:1.30-alpine
FROM ${NGINX_IMAGE}
ENV JAVA_UPSTREAM=qingmu-java:8080 NGINX_ENVSUBST_FILTER=JAVA_UPSTREAM
COPY deploy/nginx/nginx.conf /etc/nginx/nginx.conf
COPY deploy/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/nginx/19-validate-env.sh /docker-entrypoint.d/19-validate-env.sh
RUN chmod +x /docker-entrypoint.d/19-validate-env.sh
COPY dist/ /usr/share/nginx/html/
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
