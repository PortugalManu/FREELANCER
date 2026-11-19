# App Diárias: como instalar

**Endereço do app:** https://portugalmanu.github.io/FREELANCER/

Este repositório já é o app no ar (GitHub Pages). Falta só ligar a planilha: passos 1, 2 e 4, uns 15 minutos, pelo **computador**.

```
/ (raiz)        → o app (index.html, app.js, styles.css, sw.js, manifest, icons/)
apps-script/    → vai para o script da planilha FREELANCER JOSÉ
├── Codigo.gs   (substitui o código atual: mesmo menu, agora com o núcleo separado)
└── Api.gs      (arquivo novo: a "porta" por onde o app fala com a planilha)
```

> Este repositório é **público**: nenhum número da planilha, URL da API ou chave fica aqui. Tudo isso fica só na planilha e no seu celular.

---

## Antes de tudo: teste numa cópia (recomendado)

Em **Arquivo → Fazer uma cópia**, a cópia já vem com o script. Faça os passos 1, 2 e 4 na cópia, brinque à vontade (abater, lançar) e só depois repita na planilha de verdade. Assim nenhum teste mexe nos números reais.

---

## 1. Atualizar o script da planilha

1. Abra a planilha → **Extensões → Apps Script**.
2. **Backup:** copie todo o código atual e salve num arquivo `.txt` no seu computador. Não cole o backup como outro arquivo do script: duas funções com o mesmo nome dão conflito.
3. Abra o `Código.gs` atual, apague tudo e cole o conteúdo de **`apps-script/Codigo.gs`**.
4. Clique em `+` → **Script** → nome **`Api`** → cole o conteúdo de **`apps-script/Api.gs`**.
5. Clique em 💾 Salvar.

> O menu **Freelancers** continua igual e ganha o submenu **App do celular**. As regras de abater não mudaram: o menu e o app agora chamam a mesma função.

## 2. Publicar a "porta" do app (App da Web)

1. No Apps Script: **Implantar → Nova implantação**.
2. Na engrenagem ⚙️ ao lado de "Selecionar tipo", escolha **App da Web**.
3. Preencha:
   - Descrição: `app diarias`
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
4. Clique em **Implantar** → **Autorizar acesso**. O Google vai mostrar "app não verificado", o que é normal, porque o app é seu: clique em **Avançado → Acessar (não seguro)** → Permitir.
5. **Copie a URL do App da Web** (termina em `/exec`).

> **"Qualquer pessoa" não quer dizer que qualquer um entra.** Sem uma chave válida, a API recusa tudo. Quem tem a chave são as pessoas que você cadastrar no passo 4.

> **Quando eu te mandar uma versão nova do script:** cole o código e vá em **Implantar → Gerenciar implantações → ✏️ editar → Versão: Nova versão → Implantar**. A URL continua a mesma. Se você usar "Nova implantação", a URL muda e o app perde a conexão.

## 3. App no ar (já feito)

O app já está publicado em **https://portugalmanu.github.io/FREELANCER/** (GitHub Pages, branch `main`, pasta raiz). Para mudar alguma coisa nele, basta editar os arquivos da raiz deste repositório; o Pages republica sozinho em 1 ou 2 minutos.

## 4. Criar sua chave e instalar no celular

1. Recarregue a planilha (F5). Vá em **Freelancers → App do celular → Criar chave de acesso**.
2. Na primeira vez, o script pede os dois endereços: o do app, `https://portugalmanu.github.io/FREELANCER/` e a URL `/exec` (passo 2).
3. Em **Nome**, coloque `Manu`. À pergunta "pode abater pagamentos?", responda **SIM**.
4. Clique em **Copiar link** e mande o link para você mesma no WhatsApp.
5. No celular, abra o link no **Chrome**. O app já entra configurado.
6. No Chrome, toque em **⋮ → Instalar app** (ou "Adicionar à tela inicial"). Pronto: o app ganha ícone e abre em tela cheia, como um app de verdade.

**Para o José, no futuro:** faça a mesma coisa com o nome `José`, responda **NÃO** e escolha "José". Ele só lança as próprias diárias e vê o resumo. A aba Abater nem aparece para ele.
Para cortar o acesso de alguém: **Freelancers → App do celular → Revogar acesso de uma pessoa**.

---

## Conferindo (critérios de aceite)

| Teste | Esperado |
|---|---|
| Abrir o app | Total R$ 4.252,46 (se nada mudou na planilha desde 14/11) |
| Abater → Diárias José → 360 → Ver prévia | Quita 26/10 (R$ 10), 27/10 e 29/10; 03/11 fica com "falta R$ 160,00". Fica faltando R$ 1.920,00 |
| Confirmar com toque duplo | Grava só uma vez |
| Lançar → José → 13/11 → 170 | Total da coluna B vai para R$ 4.240,00 |

Esses testes foram rodados com uma cópia dos dados da planilha, simulando o Google por baixo (os testes não estão neste repositório porque ele é público e eles contêm os valores). Mesmo assim, o primeiro uso de verdade (de preferência na cópia) é a prova real.

## Lançar compra no cartão

Na aba **Lançar**, escolha **Compra no cartão** no topo e preencha cartão (José ou Manu), data, o que foi, valor e parcelas.

- A compra entra na aba **CARTÕES**, na primeira linha livre depois da última compra, igual a fazer na mão. Pago, Falta e Status continuam sendo as fórmulas da aba.
- **Parcelado:** você digita o valor **total**. O app cria uma linha por parcela ("Pneu 1/3", "Pneu 2/3"…), e os centavos que sobram vão na 1ª. Antes de lançar, ele mostra em quais faturas as parcelas caem. No Resumo, cada parcela só aparece quando chega a fatura dela, igual ao RESUMO da planilha.
- Se já existir uma compra igual (mesma data, cartão, descrição e valor), o app avisa antes.
- Por enquanto, editar ou apagar compra continua sendo pela planilha.

## Editar ou apagar uma diária

No **Resumo**, abra o bloco e toque na diária: aparecem **Editar** e **Apagar**.

- Só dá para editar ou apagar diárias que **ainda não receberam nenhum pagamento**. As pagas ou parciais aparecem com 🔒 e são ajustadas pela planilha, para não bagunçar o "Total Recebido" nem o RECEBIMENTOS.
- Se a data mudar, a diária troca de lugar sozinha e continua dentro da soma do rodapé.
- Antes de gravar, o script confere se a diária não mudou na planilha desde a última atualização do app.
- Fica uma notinha na célula ("Editado pelo app em… Antes: …"), e a aba **LOG DO APP** registra quem lançou, editou ou apagou o quê, e quando.

## Deixando do seu jeito

- **No app**, na aba **Do meu jeito**: cor, tema claro/escuro, letra dos números, cantos, saudação, emoji, valor padrão da diária e pessoa que já vem marcada. Fica salvo na planilha e vale em qualquer celular.
- **Ícone e nome na tela inicial:** troque as imagens da pasta `icons/` e o `name` no `manifest.webmanifest`. Depois, desinstale e instale o app de novo no celular.

## Se algo der errado

| Mensagem | O que fazer |
|---|---|
| "A API respondeu algo inesperado" | A implantação não está como **Qualquer pessoa**, ou a URL não é a que termina em `/exec`. |
| "Chave de acesso inválida ou revogada" | Gere um link novo pelo menu. |
| "A planilha está ocupada" | Alguém (ou o menu) estava gravando na mesma hora. Tente de novo. |
| O app não mostra a mudança que fiz no GitHub | Feche o app e abra de novo. Na segunda abertura ele pega a versão nova. |
