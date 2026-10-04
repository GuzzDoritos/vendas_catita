# Neon + Vercel: configuração

O aplicativo usa uma senha compartilhada, sessão em cookie por 30 dias e um único espaço privado de dados. Não há cadastro de usuários.

## Desenvolvimento local

1. Copie `.env.example` para `.env.local`.
2. Preencha `DATABASE_URL` com a connection string fornecida pelo Neon. Use o banco destinado ao aplicativo.
3. Defina `APP_PASSWORD` com uma senha exclusiva de pelo menos 12 caracteres.
4. Defina `SESSION_SECRET` com pelo menos 32 caracteres aleatórios. Para gerar um valor:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Esses valores são exclusivos do servidor. Não use o prefixo `VITE_`. `.env.local` está ignorado pelo Git.

```sh
npm install
npm run db:migrate
npm run dev
```

`npm run dev` executa o frontend e a API local no mesmo endereço, normalmente http://localhost:5173. Reinicie o servidor após alterar as variáveis. `npm run preview` serve apenas os arquivos estáticos; não use esse comando para testar a API.

## Publicação no Vercel

1. Envie o código para o repositório conectado ao Vercel.
2. Em **Project → Settings → Environment Variables**, adicione `DATABASE_URL`, `APP_PASSWORD` e `SESSION_SECRET` ao ambiente **Production**.
3. Use Node.js **22.x**. Mantenha o framework **Vite**, build `npm run build` e saída `dist`.
4. Rode `npm run db:migrate` com a connection string do banco de destino. O script aplica as migrações pendentes em ordem e registra cada arquivo em `schema_migrations`; novas execuções não reaplicam arquivos já registrados. Use o script também em bancos existentes.
5. Faça um novo deploy. Mudanças nas variáveis exigem redeploy.
6. Abra o endereço de produção, entre com a senha e registre um valor. Reabra em outro navegador e confirme que o valor aparece.

O diretório `api/` é publicado como Vercel Function. Não é necessário criar um servidor separado, trocar para Next.js ou configurar CORS.

Previews devem usar um banco/branch Neon separado, com as próprias variáveis. Não conecte testes de preview ao banco real por conveniência. Sem as variáveis, o app mostra indisponibilidade e não permite acessar os dados.

## Levar os dados antigos

Depois de entrar, abra **Backup → Buscar dados da versão anterior** no mesmo navegador e endereço usados pela V1. Confira a prévia antes de confirmar a substituição dos dados na nuvem.

Se os dados antigos estiverem no localhost ou em outro endereço, exporte JSON na versão antiga e importe o arquivo no site novo. O botão de busca local não consegue ler o localStorage de outro domínio. Os dados locais originais não são apagados durante a migração.

O backup deve ter no máximo 900 KB e não conter vendas futuras. A restauração substitui o conjunto completo de dados: exporte uma cópia do banco atual antes de confirmar.

## Sessão e segurança

- Cookie assinado, HttpOnly, SameSite=Strict e Secure no Vercel; duração fixa de 30 dias. HTTP é permitido apenas no desenvolvimento local.
- Senha e assinatura verificadas no servidor; nenhum segredo faz parte do bundle do navegador.
- Toda leitura/gravação de dados exige sessão válida; gravações também exigem origem igual à do aplicativo.
- Até 20 tentativas de login por janela de 15 minutos, compartilhadas pela aplicação. O contador fica no Postgres e sobrevive aos reinícios das funções. Isso também significa que muitas tentativas de outra pessoa podem temporariamente impedir o login; sessões existentes continuam funcionando.
- Alterar `APP_PASSWORD` ou `SESSION_SECRET` e fazer redeploy invalida as sessões existentes.
- Sair remove o cookie do navegador atual. Não há lista de dispositivos nem revogação individual de tokens; para encerrar todas as sessões, altere `SESSION_SECRET`.

## Persistência e conflitos

`monthly_plans` contém metas e jornadas padrão; `daily_entries`, vendas, Prod e folgas; `shift_entries`, os dois períodos e a jornada prevista de cada data. `app_state` guarda uma revisão global; `login_attempts` implementa o limite de login. Backups usam JSON versão 2; arquivos da versão 1 são convertidos ao importar.

A migração 002 preserva vendas, metas e folgas existentes. Impulso e Prod começam vazios. Ela bloqueia gravações por versões antigas do servidor para proteger os novos campos: aplique a migração junto da publicação do código novo e recarregue abas antigas após o deploy.

Como o conjunto pessoal é pequeno, cada gravação substitui o snapshot completo em uma transação. A revisão é conferida com bloqueio no banco: duas gravações concorrentes da mesma revisão não podem sobrescrever uma à outra. Não há ORM, fila offline ou sincronização automática em tempo real.

Use **Atualizar** para buscar mudanças de outro aparelho. Um conflito mantém o formulário aberto e pede que você anote o valor, feche a janela e atualize. Se uma solicitação expirar depois de o banco confirmar a gravação, atualize para conferir o resultado antes de tentar novamente.

Os saves exigem conexão. O backup JSON continua disponível. Ao adicionar vários usuários no futuro, será necessário adicionar autenticação individual, ownership dos registros e filtros de acesso.

## Verificações

```sh
npm test
npm run build
npm run db:check
```

`db:check` usa o Neon configurado e verifica leitura, escrita, conflito, exclusão e rollback. As alterações de teste são revertidas em uma subtransação; os dados e a revisão originais são preservados. O teste bloqueia brevemente o espaço de dados enquanto executa.

Referências: [Vite no Vercel](https://vercel.com/docs/frameworks/frontend/vite), [driver serverless Neon](https://neon.com/blog/serverless-driver-ga).
