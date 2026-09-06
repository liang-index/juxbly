# Juxbly

**A fábrica instantânea de apps do navegador.** Descreva o que você quer na página que está vendo: o resultado chega na hora, e a ferramenta que o produziu fica — ela volta sozinha na próxima vez que você visitar.

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · **Português (Brasil)** · [Español](README.es.md)

> Esta é uma tradução da comunidade, mantida por esforço coletivo e sujeita a atraso; quando houver divergência, o [README em inglês](README.md) prevalece.

> Situação: **pré-implementação**. O esqueleto MV3 carrega no Chrome e a DSL com sua camada de validação está pronta; análise de página, ferramentas, painéis e confirmação por destaque ainda não foram construídos. Para o que o V1 deliberadamente não fará, veja [`docs/contributing/SCOPE.md`](docs/contributing/SCOPE.md).

<p align="center">
  <img src="docs/assets/screenshots/highlight-confirm.png" width="32.5%" alt="Fluxo de construção: descreva a necessidade, o Juxbly destaca o que vai ler, confirme campo a campo" title="Construção: descrever &rarr; destacar &rarr; confirmar" />
  <img src="docs/assets/screenshots/run-panel-result.png" width="32.5%" alt="Painel de execução: o resultado chega primeiro, com a ferramenta que o produziu creditada no resultado" title="Executar: resultado primeiro, com procedência" />
  <img src="docs/assets/screenshots/overview-popup.png" width="32.5%" alt="Visão geral na barra de ferramentas: ferramentas salvas ordenadas pelo uso mais recente, prontas para voltar sozinhas" title="Ferramentas persistidas, mais recentes primeiro" />
</p>
<p align="center"><sub>UI de protótipo: descreva uma necessidade &rarr; confirme os campos destacados &rarr; receba o resultado &rarr; a ferramenta fica e volta sozinha.</sub></p>

---

## 1. O que é

Juxbly é uma extensão de código aberto para Chrome (Manifest V3). Você descreve uma necessidade em linguagem natural na página atual. Um modelo analisa a página e produz uma configuração **Tool DSL**. Você confirma uma vez, por um destaque na própria página, e a ferramenta é **salva**. De lá em diante, sempre que você visitar uma página compatível, a ferramenta aparece e executa sozinha.

A unidade de valor é a **ferramenta (Tool)**, não o prompt:

```
Descobrir → Construir → Confirmar → Salvar → Executar → Entregar → Saúde → Reparar → Versionar → Reaproveitar
```

## 2. Por que existe

A maioria das tarefas web pontuais — "extrair a coluna de preços desta tabela", "coletar todos os cartões de resultado desta página de busca", "resumir as avaliações desta página de produto" — é pequena demais para justificar um script e específica demais para uma extensão existente.

A aposta do Juxbly não é "executar esta tarefa uma vez". É:

> **Transformar uma necessidade pontual de cauda longa em um resultado que você leva — e uma ferramenta de página persistente que você guarda.**

O resultado vem primeiro: cada execução coloca os dados na sua frente com copiar / CSV / JSON a um clique. A ferramenta fica como subproduto e é creditada no próprio resultado, então você sempre sabe o que o produziu — e que estará lá na próxima vez.

Isso significa que a parte difícil não é só a geração, mas também **visibilidade de falhas, reparo barato e versionamento**. O Juxbly não promete que uma ferramenta nunca quebra; promete que uma ferramenta quebrada é detectada, explicada e barata de reconstruir.

## 3. Para quem é

- Desenvolvedores e power users que esbarram em tarefas de informação repetitivas e específicas de páginas.
- Pesquisadores e trabalhadores do conhecimento que processam páginas web em massa.
- Contribuidores interessados em LLM + compreensão de DOM, defesa contra injeção de prompt e ferramentas de navegador locais.

O Juxbly **não** é uma barra lateral de chat genérica, **não** é um scraper universal e **não** é um motor de "IA escreve e executa JavaScript". Veja as fronteiras explícitas em [`docs/contributing/SCOPE.md`](docs/contributing/SCOPE.md).

### Onde funciona, e onde custa

Medido em uma amostra de dez sites antes da implementação:

| Formato de página | Situação |
|---|---|
| Páginas e documentos regulares e bem estruturados | Confiável — é o que o V1 mira |
| Rolagem infinita | Melhor esforço |
| SPA renderizada no cliente | Melhor esforço |
| Nomes de classe com hash ou gerados | Melhor esforço |

"Melhor esforço" significa que pode funcionar e pode não funcionar. Quando não funciona, o Juxbly diz — em vez de mostrar um resultado vazio — e nada aqui afirma que funciona em todo site.

## 4. Como funciona

```
Tool DSL (o LLM produz configuração, nunca código)
   ↓
Capability Runtime (extract / transform / llm / render / export)
   ↓
Browser Adapter (o único lugar autorizado a tocar chrome.*)
   ↓
Browser APIs
```

- **Código fixo, configuração variável.** O modelo emite JSON; um interpretador de lista branca o executa. Não há `eval`, nem `new Function`, nem carregamento de código remoto em nenhum ponto do repositório.
- **Trabalho determinístico nunca chama o modelo.** `extract` / `transform` / `render` são locais; só os passos `llm` custam tokens — e são pulados quando as entradas não mudaram.
- **Traga sua própria chave (BYOK).** Qualquer **endpoint compatível com OpenAI** serve — OpenAI, OpenRouter, Together, ou um gateway local (LM Studio, o servidor compatível com OpenAI do Ollama, …) — configure a base URL uma vez. O conteúdo da página sai do seu navegador, pela sua própria chave de API, para o endpoint que você escolheu. Não há servidor do Juxbly no caminho e nenhuma telemetria.

Detalhes: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## 5. Instalação (a partir do código-fonte)

```bash
git clone https://github.com/liang-index/juxbly.git
cd juxbly
pnpm install
pnpm dev            # compila para .output/chrome-mv3 com watch
```

Depois, no Chrome:

1. Abra `chrome://extensions`.
2. Ative o **modo do desenvolvedor**.
3. **Carregar sem compactação** → selecione `.output/chrome-mv3`.

Primeira execução: clique na bolha flutuante em qualquer página e descreva o que você quer. O Juxbly pede uma chave de API só no momento em que realmente precisa chamar um modelo.

> O esqueleto carrega e o popup abre, mas nada está conectado ainda: análise de página, ferramentas, painéis e confirmação por destaque ainda virão.

## 6. Desenvolvimento local

| Comando | Para quê |
|---|---|
| `pnpm install` | instalar dependências do workspace |
| `pnpm dev` | compilar a extensão em modo watch |
| `pnpm build` | build de produção |
| `pnpm typecheck` | `tsc --noEmit` em todos os pacotes |
| `pnpm lint` | ESLint |
| `pnpm test` | unidade + integração com Vitest |
| `pnpm test:bench` | benchmark web local (Fase 2+) |

Setup completo, depuração e solução de problemas: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

## 7. Testes

```bash
pnpm test                 # unidade (tests/unit) + integração (tests/integration)
pnpm test -- --watch      # modo watch
pnpm test:bench           # Web Corpus + Task Corpus (Fase 2)
```

Os testes de integração executam o runtime real contra HTML de fixture com um `BrowserAdapter` simulado e um `LlmPort` simulado — sem Chrome, sem rede, sem chave de API. Escopo dos testes e regra de gatilho de regressão: [`docs/testing/TESTING.md`](docs/testing/TESTING.md).

## 8. Por onde começar a ler

| Eu quero… | Comece aqui |
|---|---|
| entender o sistema e os contratos de tipo | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| saber o que cada módulo é dono | [`docs/CODE_MAP.md`](docs/CODE_MAP.md) |
| ler a DSL | `packages/dsl` + [`docs/ARCHITECTURE.md` §5](docs/ARCHITECTURE.md) |
| adicionar uma capability | [`docs/contributing/CAPABILITY_GUIDE.md`](docs/contributing/CAPABILITY_GUIDE.md) |
| ler os design tokens | [`docs/UI_SPEC.md`](docs/UI_SPEC.md) |
| saber o que o V1 não fará | [`docs/contributing/SCOPE.md`](docs/contributing/SCOPE.md) |

Dois objetivos guiam este layout: **tempo do desenvolvedor até o primeiro sucesso** e **tempo do desenvolvedor até a primeira contribuição**.

## 9. Contribuindo

Caminhos de menor atrito primeiro: documentação, testes, **casos de benchmark**, **recipes**, depois correções de bugs, depois capabilities pequenas. Arquitetura central, DSL, permissões e fronteiras de segurança são controladas pelo mantenedor.

Comece pelo [`CONTRIBUTING.md`](CONTRIBUTING.md) e siga o guia que corresponde à sua contribuição:

- Capability → [`docs/contributing/CAPABILITY_GUIDE.md`](docs/contributing/CAPABILITY_GUIDE.md)
- Recipe → [`docs/contributing/RECIPE_GUIDE.md`](docs/contributing/RECIPE_GUIDE.md)
- Caso de benchmark → [`docs/contributing/BENCHMARK_GUIDE.md`](docs/contributing/BENCHMARK_GUIDE.md)

## 10. Privacidade e segurança

- Todos os dados ficam em `chrome.storage.local`. Sem sincronização, sem conta, sem telemetria — esta é uma posição permanente do build open source, não um estado temporário.
- Sua chave de API é lida **apenas** no service worker em segundo plano e nunca entra no content script, no contexto da página ou em logs.
- Conteúdo de página é entrada não confiável. Os prompts do modelo o envolvem como *dados*, nunca como instruções.
- Reportar uma vulnerabilidade: [`SECURITY.md`](SECURITY.md). Declaração de tratamento de dados: [`PRIVACY.md`](PRIVACY.md).

## 11. Índice da documentação

| Documento | Papel |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | contratos de tipo e interfaces de módulo |
| [`docs/UI_SPEC.md`](docs/UI_SPEC.md) | design tokens e regras de comportamento dos componentes |
| [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) | convenções de engenharia e a regra de regressão |
| [`docs/CODE_MAP.md`](docs/CODE_MAP.md) | módulo → responsabilidade → onde olhar |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | primeiros passos para desenvolvedores |
| [`docs/contributing/SCOPE.md`](docs/contributing/SCOPE.md) | o que o V1 deliberadamente não faz |
| [`docs/contributing/CAPABILITY_GUIDE.md`](docs/contributing/CAPABILITY_GUIDE.md) | como escrever uma capability |
| [`docs/contributing/RECIPE_GUIDE.md`](docs/contributing/RECIPE_GUIDE.md) | como publicar uma recipe |
| [`docs/contributing/BENCHMARK_GUIDE.md`](docs/contributing/BENCHMARK_GUIDE.md) | como o benchmark Web Corpus funciona |
| [`docs/testing/TESTING.md`](docs/testing/TESTING.md) | camadas de teste e a regra de regressão |
| [`docs/contributing/DOC_CHANGE_PROTOCOL.md`](docs/contributing/DOC_CHANGE_PROTOCOL.md) | como mudar um contrato compartilhado |

Cada fato tem exatamente uma fonte autoritativa; os demais documentos apenas a referenciam ([`docs/contributing/DOC_CHANGE_PROTOCOL.md`](docs/contributing/DOC_CHANGE_PROTOCOL.md)).

## 12. Licença

O código é licenciado sob **AGPL-3.0** — veja [`LICENSE`](LICENSE).

**O nome Juxbly, o logo, o domínio oficial e a identidade oficial na Chrome Web Store não são cobertos pela licença do código** e são regidos separadamente pela política de marca em [`TRADEMARK.md`](TRADEMARK.md).
