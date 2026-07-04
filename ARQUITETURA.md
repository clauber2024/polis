# ARQUITETURA.md — Estado Atual e Decisões de Dados
> Complemento ao [`CLAUDE.md`](./CLAUDE.md) (padroes tecnicos) e ao [`README.md`](./README.md).
> Este documento cobre o que muda com frequencia: estado dos dados, decisoes de fontes
> e fila de trabalho. Padroes de codigo, banco e Git estao no CLAUDE.md - nao duplicar aqui.
> Ultima atualizacao: 04/07/2026.

## Estado dos dados (pos-sessao DEC/FEC real, jul/2026)

Tabela `unidades_espaciais`:
- 5.573 municipios (`municipio:<codigo_ibge>`)
- 12.348 FCUs - Favelas e Comunidades Urbanas como unidades espaciais proprias
  (tipo `favela_comunidade_urbana`; coluna `tipo` expandida para VARCHAR(40))
- 3.696 ZEIS/AEIS em 4 capitais: RJ 1.044, SP 2.574, Recife 76, Rio Branco 2

| Dimensao | Status | Notas |
|---|---|---|
| Territorio | ok | IBGE Malha 2025, 5.573 municipios |
| MMGD | ok | ANEEL jun/2026: 5.567 mun., 50.086 MW, 8M UCs |
| Infraestrutura Urbana | ok | Censo 2022/SIDRA, 5.570 mun., 5 indicadores |
| Renda e Trabalho | ok | RAIS 2024 via BigQuery, 5.571 mun. |
| Moradia | ok Finalizada jul/2026 | Regime de ocupacao (Censo) + FCU + ZEIS/AEIS + inadequacao (% parede) + MCMV/FGTS (5.111 mun., 36,6M UH) + MCMV/OGU (4.883 mun., 1,7M UH) |
| Qualidade de Fornecimento | ok Finalizada jul/2026 | INDQUAL/ANEEL: DEC/FEC + 21 variantes por origem de interrupcao, ~4,9M registros. Conjunto eletrico -> municipio e N:N (42.661 pares); view resolve por pior-caso e media. **DEC/FEC "real" (sem expurgo de Dia Critico) fechado em 04/07/2026**: views `vw_qualidade_conjunto_real` e `vw_qualidade_municipio_real` (migration 0011), formula confirmada contra o dicionario oficial da ANEEL (`dominio-indicadores.csv`) - soma `DEC + DECINC + DECIPC + DECXNC + DECXPC` (e equivalente FEC); variantes IND/INE/INO/IP/XN/XP sao decomposicao do valor ja incluso no oficial e NAO entram na soma. Cobertura validada identica a view oficial (423.147 linhas municipio/ano/periodo em ambas) |
| Capital Humano | parcial | Alfabetizacao ok; falta DATASUS (mortalidade infantil) |
| Irradiacao Solar | pendente | INPE, nao iniciado |

## Decisoes de fontes (confirmadas por pesquisa, jul/2026)

- **BDGD**: publica no Portal de Dados Abertos ANEEL desde 2022 (nao precisa LAI).
  Limitacao real: arquivos `.gdb` por distribuidora, pesados, sem API nacional.
  FIC/DIC individual por UC pode estar no BDO separado, ou via LAI para cruzamentos
  especificos. UGBT/UGMT da BDGD tem MMGD georreferenciada (util para cruzamentos sub-municipais).
- **INDQUAL** (Qualidade de Fornecimento) - confirmado e carregado, jul/2026: dataset
  ANEEL "Indicadores Coletivos de Continuidade (DEC e FEC)", granularidade Conjunto
  Eletrico (3 CSVs relacionais via `dadosabertos.aneel.gov.br`): `atributos` (metadado
  do conjunto), `indicadores-continuidade-coletivos-2020-2029` (valores, formato longo -
  22 siglas carregadas, nao so DEC/FEC), `indqual-municipio` (de-para conjunto<->municipio,
  chave `IdeConjUnidConsumidoras`/`IdeConjUndConsumidoras` - nome de coluna diverge entre
  arquivos). Relacao conjunto<->municipio e N:N - schema usa tabela de juncao propria
  (`qualidade_conjunto_municipio`) + view (`vw_qualidade_municipio`) que agrega por
  pior-caso (MAX) como padrao, com media disponivel para referencia. 6 codigos IBGE da
  fonte nao existem em `municipios` (padrao `*9999`/`*9922` - massas d'agua/sem-municipio,
  esperado e ignorado no ETL). Schema criado fora do sistema formal de migrations
  (script Python direto).
- **DEC/FEC sem expurgo (real)** - fechado em 04/07/2026, migration `0011_qualidade_dec_fec_real.sql`.
  Confirmado via dicionario oficial ANEEL (`dominio-indicadores.csv`, dataset
  indicadores-coletivos-de-continuidade-dec-e-fec): sufixo "C" (`DECINC`, `DECIPC`,
  `DECXNC`, `DECXPC` e equivalentes FEC) sao as parcelas expurgadas por ocorrerem em
  "Dia Critico" (NT 071/2011-SRD/ANEEL); demais variantes (`IND`, `INE`, `INO`, `IP`,
  `XN`, `XP`) sao decomposicao do valor ja incluso no DEC/FEC oficial e nao devem ser
  somadas de novo. Views: `vw_qualidade_conjunto_real` (por conjunto/ano/periodo) e
  `vw_qualidade_municipio_real` (agregada por municipio, mesmo padrao pior-caso/media
  da view oficial). Relevante para justica energetica: eventos extremos tendem a
  concentrar em certas regioes e o numero oficial "limpo" pode mascarar isso.
- **TSEE / baixa renda** (indicador alvo: `percentual_tsee`) - BLOQUEADO ate ter dados
  de jan/2026 em diante (investigado 04/07/2026): usar dataset ANEEL "Beneficiarios da
  CDE" (`dadosabertos.aneel.gov.br/dataset/beneficiarios-da-cde`), nao os shapefiles UCBT.
  Estrutura: um arquivo ZIP por mes (nao consolidado), granularidade municipio+distribuidora.
  Dicionario de dados oficial (PDF, `dm-beneficiarios-da-cde.pdf`) esta desatualizado
  (23/11/2022) e NAO lista a subclasse "Residencial Desconto Social" criada pela Lei
  15.235/2025 - so mostra as variantes antigas de baixa renda (indigena, quilombola,
  BPC, multifamiliar). Achado critico via Voto ANEEL (41a RPO, 9/12/2025): embora a Lei
  15.235/2025 seja de julho/2025, o FATURAMENTO sob a nova subclasse so comeca em
  1o de janeiro de 2026 - arquivos mensais anteriores a essa data nao tem a subclasse
  nova, mesmo apos a lei. Proximo passo: obter um arquivo mensal de jan/2026 em diante
  (baixar manualmente via navegador, pois resource IDs de arquivos futuros nao sao
  previsiveis/pesquisaveis) e inspecionar colunas reais (`IdcSubclasse` vs `DscTipoSubsidio`)
  antes de escrever o extractor. Extractor final deve capturar as duas subclasses:
  "Residencial Baixa Renda" E "Residencial Desconto Social".
- **Censo 2022**: sem dado utilizavel de acesso a eletricidade - excluido do Eixo 4.
- **OBEPE**: referencia metodologica (Indice de Pobreza Energetica Regional), nao fonte
  primaria - ver `docs/DRF.md` secao 14.

## Estado das migrations (corrigido 04/07/2026)

Numeracao real em `backend/src/db/migrations/`: 0000 a 0010 (indicadores sociais,
territorio, moradia, favelas). O schema do INDQUAL (`qualidade_conjuntos`,
`qualidade_indicadores`, `qualidade_conjunto_municipio`) foi criado fora desse sistema
formal, via script Python direto - por isso nao aparece na pasta de migrations.
A migration `0011_qualidade_dec_fec_real.sql` (views DEC/FEC real) e a primeira
migration formal relacionada a qualidade de fornecimento. Proxima migration: 0012.

## Fila de trabalho

1. Irradiacao Solar - INPE
2. Cruzamento MMGD x indicadores sociais - identificar vazios reais de acesso
3. Capital Humano - DATASUS, mortalidade infantil
4. Atualizar README e CLAUDE.md (Estado Real) com os dados das sessoes de Moradia,
   INDQUAL e DEC/FEC real

## Bloqueado (aguardando dado externo)

- **Beneficiarios da CDE / `percentual_tsee`** - bloqueado desde 04/07/2026 ate existir
  arquivo mensal de jan/2026 em diante com a subclasse "Residencial Desconto Social"
  faturada (ver detalhes em Decisoes de fontes). Retomar quando o arquivo estiver
  disponivel no portal.

## Ideias para investigar (nao priorizadas)

- **Perdas tecnicas e nao tecnicas** (ANEEL) - indicador de justica energetica
  potencialmente forte: perdas nao tecnicas (furto/fraude) tendem a concentrar em
  areas de baixa renda e correlacionam com fiscalizacao/corte mais agressivos nessas
  regioes. Nao investigado ainda se esta no Portal de Dados Abertos, granularidade
  (distribuidora? conjunto? municipio?) e formato. Levantado em sessao de 03/07/2026,
  ainda sem pesquisa de viabilidade.
- **Queima de equipamentos** (transformadores/eletrodomesticos por sobretensao) -
  tende a concentrar onde a rede tem pouca protecao (para-raios, aterramento)
  combinado com alta incidencia de raios (densidade de descargas atmosfericas maior
  em partes do Centro-Oeste/Norte). Possivel cruzamento: dados de protecao de rede
  (BDGD) x mapas de densidade de raios (INPE/ELAT tem esse dado). Nao investigado
  ainda se ANEEL disponibiliza reclamacoes/ressarcimentos por queima de equipamento
  em dataset aberto. Levantado em 03/07/2026.

## Manutencao deste documento

Atualizar ao fim de cada sessao de carga de dados: estado da `unidades_espaciais`,
tabela de dimensoes e fila de trabalho. Decisoes de fontes so mudam com nova pesquisa.
