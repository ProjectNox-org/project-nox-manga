# Fastify API — patch de segurança (aplicação manual)

`/srv/project-nox/releases/api-01` **não é um repositório Git**: é artefato de build
executado por `systemd` (`nox-api.service`, `ExecStart=/usr/bin/node server.js`).
Por isso o patch fica versionado aqui, em vez de em uma branch.

## Vulnerabilidade corrigida

`POST /api/auth/reset/request` (público) devolvia `reset_token` no corpo da resposta, e
`POST /api/auth/register` devolvia `confirm_token`. Como `/api/auth/reset/confirm` troca a
senha a partir desse token, qualquer pessoa podia solicitar reset para o e-mail de outra
pessoa e receber o token diretamente — account takeover sem acesso ao e-mail.

## Aplicação

1. Backup: `sudo cp -a /srv/project-nox/releases/api-01/server.js /tmp/server.js.bak-tokenleak-$(date +%s)`
2. Aplicar `server.js.patch` (diff unificado contra o arquivo em produção).
3. Verificar: `sudo node --check /srv/project-nox/releases/api-01/server.js`
4. Verificar ausência: `sudo grep -c 'reset_token\|confirm_token' /srv/project-nox/releases/api-01/server.js` → `0`
5. `sudo systemctl restart nox-api` e confirmar:
   `curl -s -X POST http://127.0.0.1:3000/api/auth/reset/request -H 'content-type: application/json' -d '{"email":"x@example.com"}'`
   deve responder apenas `{"ok":true,"message":"se o e-mail existir, enviaremos instrucoes"}`.

## Rollback

Restaurar o backup do passo 1 e reiniciar `nox-api`.

## Risco residual

O processo de deploy do Fastify continua sem versionamento. Enquanto isso não mudar,
um rebuild manual pode reintroduzir o vazamento — o passo 4 é a verificação obrigatória
pós-deploy.
