# Catita · Vendas & metas

React + TypeScript + Vite, com login por senha compartilhada e persistência em Neon Postgres. Interface em português, voltada ao celular. API em Vercel Functions, no mesmo repositório.

## Executar

Configure `.env.local` com `DATABASE_URL`, `APP_PASSWORD` e `SESSION_SECRET`, conforme [DEPLOYMENT.md](DEPLOYMENT.md).

```sh
npm install
npm run db:migrate
npm run dev
```

No PowerShell com scripts desabilitados, use `npm.cmd` no lugar de `npm`.

```sh
npm test
npm run build
npm run db:check
```

Use Node 22.x. `npm run dev` executa também a API local; `npm run preview` serve somente o frontend estático.

## Uso

1. Entre com a senha, defina Gatilho, Acelera e Incrível e, se desejar, Impulso. Marque as folgas do mês; inicialmente todos os dias são de trabalho.
2. Lance o total de cada data; editar substitui o valor anterior. Campo vazio remove o lançamento e zero confirma um dia sem vendas.
3. Hoje entra no divisor enquanto estiver aberto. Marque “Encerrar hoje” para distribuir o saldo somente pelos próximos dias de trabalho.
4. Use o seletor de mês para consultar ou editar outros períodos. “Atualizar” busca mudanças de outro aparelho.
5. Em Backup, exporte JSON, restaure um arquivo ou busque dados da versão anterior neste navegador. Restaurar substitui os dados na nuvem após confirmação.

A média é o saldo da meta dividido pelos dias restantes de trabalho, arredondado para cima em centavos. Vendas em folgas continuam no acumulado. Metas atingidas mostram zero; falta de dias disponíveis mostra um traço com indicação explícita. Datas usam o fuso America/Sao_Paulo.

Registre **Prod** manualmente no lançamento do dia. A média mensal considera somente os valores preenchidos, incluindo zero. O gráfico alterna entre vendas e Prod; dias sem lançamento ficam sem ponto.

Em **Ponto**, registre entrada/saída antes e depois do intervalo. Um único período também é válido; horários devem estar em ordem e dentro do mesmo dia. O intervalo não entra nas horas trabalhadas. Pontos incompletos somam apenas períodos encerrados e não apuram extras. Horas extras são somente o saldo positivo diário, sem compensar dias com menos horas. Trabalho em folga conta integralmente como extra.

Em **Jornadas**, configure a duração prevista para segunda a sábado, domingos e feriados (padrões: 8h20, 6h e 3h). Feriados são marcados manualmente. Cada ponto guarda sua própria jornada prevista; mudar o padrão do mês não altera registros anteriores. A folga é compartilhada entre vendas e ponto.

Os dados antigos em localStorage são preservados; não são enviados ao Neon automaticamente. O app precisa de internet para ler e salvar. Não há cadastro de usuários nem sincronização offline. Fontes externas têm fallback local.

## Código

- `src/App.tsx`, `src/Login.tsx`: tela principal, formulários e login.
- `src/domain.ts`: tipos, cálculos, datas, moeda e validação de backup.
- `src/shifts.ts`, `src/ShiftControl.tsx`: cálculos e registro de ponto.
- `src/TrendChart.tsx`: gráfico SVG de vendas e Prod, com tabela acessível.
- `src/styles.css`: tema e layout responsivo.
- `src/api.ts`: chamadas do frontend para a API.
- `api/index.ts`: login, logout, sessão e operações de dados.
- `server/auth.ts`, `server/database.ts`: autenticação e acesso ao Neon.
- `migrations/`: migrações numeradas de schema e funções de persistência.
- `tests/`: testes de domínio, sessão e proteção HTTP.

A planilha original é uma referência e não é carregada automaticamente. O plano arquitetural original documenta a ideia inicial; este README descreve a implementação atual.

## Publicar no Vercel

1. Envie este repositório ao GitHub.
2. Acesse https://vercel.com/new, conecte o GitHub e importe o repositório.
3. Confira as configurações: framework **Vite**, diretório raiz **./**, comando de build **npm run build**, pasta de saída **dist** e Node **22.x**.
4. Configure `DATABASE_URL`, `APP_PASSWORD` e `SESSION_SECRET` no ambiente Production e aplique a migração no banco de destino.
5. Clique em **Deploy** e abra o endereço de produção gerado. Veja [DEPLOYMENT.md](DEPLOYMENT.md) para as instruções completas.

Novos pushes para a branch de produção (`main`) geram novas publicações automaticamente. Não é necessário enviar `dist` ou `node_modules` ao GitHub.

Para levar lançamentos da V1 no localhost para o site publicado, exporte o backup antigo e restaure no endereço definitivo. Após a importação, os dados ficam no Neon e podem ser acessados em outros aparelhos com a senha.

Referência: https://vercel.com/docs/frameworks/frontend/vite
