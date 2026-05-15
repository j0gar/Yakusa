# Yakuza Tanaka - Bot de robos

## Variables necesarias en Render

```env
TOKEN=token_del_bot
CLIENT_ID=id_de_aplicacion
GUILD_ID=id_del_servidor
```

## Para que las alertas salgan como Kerobot

Crea un webhook en el canal de alertas de Discord:

Canal > Editar canal > Integraciones > Webhooks > Nuevo webhook > Copiar URL del webhook

En Render añade:

```env
KEROBOT_WEBHOOK_URL=url_del_webhook
KEROBOT_NAME=Kerobot
KEROBOT_AVATAR_URL=url_de_imagen_opcional
```

Si no pones webhook, el aviso saldrá como el bot normal.

## Comandos

- `/panelrobos` crea el panel principal.
- `/alertarobos` crea o actualiza el mensaje único de alertas.
- `/resetrobos` reinicia todo manualmente.

## Start command en Render

```bash
node index.js
```
