# WebSandbox

Collection de petits projets web "sandbox". Chaque projet tourne dans son propre conteneur Docker, exposé sur son propre sous-domaine via le Traefik déjà en place sur le serveur de prod (hors de ce repo).

## Structure

```
projects/<nom>/       # un dossier par projet, autonome
  Dockerfile
  docker-compose.yml
  ...code
.env.example          # DOMAIN
```

## Branches

- `main` = prod. Contient uniquement des projets terminés et déployables. Ce qui est sur `main` est en ligne.
- `projet/<nom>` = une branche par projet. Tout le dev d'un projet se fait là, uniquement dans `projects/<nom>/`.
- Mise en prod : merge de `projet/<nom>` dans `main`, puis deploy sur le serveur.
- Ne jamais modifier un autre projet que celui de la branche courante. Ce fichier ne se modifie que sur `main`.

Créer un projet :
```bash
git checkout main && git checkout -b projet/<nom>
mkdir projects/<nom>
```

## Traefik (prod)

Traefik tourne déjà en prod, il n'est pas géré ici. Paramètres à confirmer (**TODO : à transmettre**), utilisés dans le modèle ci-dessous :
- réseau Docker externe : `web` (?)
- entrypoint HTTPS : `websecure` (?)
- certresolver : `le` (?)
- domaine : `DOMAIN` (?)

## Conventions d'un projet

- `<nom>` en kebab-case ; il sert de nom de dossier, de branche, de service et de sous-domaine.
- URL : `https://<nom>.${DOMAIN}`
- Chaque projet a son `docker-compose.yml` qui rejoint le réseau externe `web` avec les labels Traefik. Aucun port publié sur l'hôte : seul Traefik expose 80/443.
- Stack libre par projet (statique, Node, Python…), tant que ça tient dans un Dockerfile.

Modèle `projects/<nom>/docker-compose.yml` :
```yaml
services:
  app:
    build: .
    container_name: <nom>
    restart: unless-stopped
    labels:
      - traefik.enable=true
      - traefik.http.routers.<nom>.rule=Host(`<nom>.${DOMAIN}`)
      - traefik.http.routers.<nom>.entrypoints=websecure
      - traefik.http.routers.<nom>.tls.certresolver=le
      - traefik.http.services.<nom>.loadbalancer.server.port=<port interne de l'app>
    networks:
      - web

networks:
  web:
    external: true
```

## Commandes

Déployer / mettre à jour un projet :
```bash
git pull
cd projects/<nom> && docker compose --env-file ../../.env up -d --build
```

En local : `docker compose up --build` suffit si on publie temporairement un port (`ports: ["8080:<port>"]`), à ne pas committer.
