# Catita · Vendas & metas

Aplicativo pessoal em React + TypeScript + Vite. Frontend-only, sem conta ou backend. Dados em localStorage, separados por mês.

## Executar

```sh
npm install
npm run dev
```

No PowerShell com scripts desabilitados, use `npm.cmd` no lugar de `npm`.

```sh
npm test
npm run build
npm run preview
```

Os testes usam o suporte a TypeScript do Node 22.6 ou superior.

## Uso

1. Defina as três metas e marque as folgas do mês. Inicialmente todos os dias são de trabalho.
2. Lance o total de cada data; editar substitui o valor anterior. Campo vazio remove o lançamento e zero confirma um dia sem vendas.
3. Hoje entra no divisor enquanto estiver aberto. Marque “Encerrar hoje” para distribuir o saldo somente pelos próximos dias de trabalho.
4. Use o seletor de mês para consultar ou editar outros períodos.
5. Exporte backups JSON regularmente. A restauração substitui o conjunto de dados após confirmação.

A média é o saldo da meta dividido pelos dias restantes de trabalho, arredondado para cima em centavos. Vendas em folgas continuam no acumulado. Metas atingidas mostram zero; falta de dias disponíveis mostra um traço com indicação explícita. Datas usam o fuso America/Sao_Paulo.

Os dados ficam no navegador e no endereço onde o app foi aberto. Limpar os dados do site, mudar de endereço ou trocar de aparelho exige restauração de backup. Prefira editar em uma única aba. Sem service worker nesta V1: o app precisa carregar antes de funcionar sem rede. Fontes externas têm fallback local.

## Código

- `src/App.tsx`: tela principal, formulários e persistência direta.
- `src/domain.ts`: tipos, cálculos, datas, moeda e validação de backup.
- `src/styles.css`: tema e layout responsivo.
- `tests/domain.test.ts`: regras de cálculo e limites importantes.

A planilha original é uma referência e não é carregada automaticamente: a aplicação começa vazia para não misturar dados reais com exemplos.

## Publicar no Vercel

1. Envie este repositório ao GitHub.
2. Acesse https://vercel.com/new, conecte o GitHub e importe o repositório.
3. Confira as configurações: framework **Vite**, diretório raiz **./**, comando de build **npm run build**, pasta de saída **dist**. Não há variáveis de ambiente a configurar.
4. Clique em **Deploy** e abra o endereço de produção gerado.

Novos pushes para a branch de produção (`main`) geram novas publicações automaticamente. Não é necessário enviar `dist` ou `node_modules` ao GitHub.

Para levar lançamentos do localhost para o site publicado, exporte o backup no aplicativo local e restaure no endereço definitivo. Use sempre o mesmo endereço de produção: cada domínio tem seu próprio localStorage.

Referência: https://vercel.com/docs/frameworks/frontend/vite
