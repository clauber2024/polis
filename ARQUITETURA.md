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
| Capital Humano | ok Finalizada jul/2026 | Alfabetizacao (Censo 2022) + taxa de mortalidade infantil (SIM+SINASC/DATASUS via Base dos Dados/BigQuery, media poolada 2022-2024, 5.570 mun.) |
| Irradiacao Solar | ok Finalizada jul/2026 | Atlas Brasileiro de Energia Solar (LABREN/CCST/INPE, 2a ed. 2017), GHI anual, 5.569 mun. Media climatologica 1999-2015, nao ano especifico |
| IVS Consolidado | ok Completa 06/07/2026 | Media de 3 blocos oficiais do IVS/IPEA (Infraestrutura Urbana, Renda e Trabalho, Capital Humano) sobre vw_indicadores_sociais_consolidado, normalizacao min-max. Moradia fica fora de proposito (ver indice separado). Migration 0015 |

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
- **CadUnico (cobertura e pobreza)** - fechado 04/07/2026, migration
  `0013_capital_humano_cadunico.sql`. Fonte: MDS/SAGI, servico Solr publico
  "MI Social" (`aplicacoes.mds.gov.br/sagi/servicos/misocial`) - API viva,
  NAO e arquivo estatico, atualizada mensalmente. Achado importante: a
  documentacao antiga do dataset (Portal de Dados Abertos, 2021) tem nomes
  de campo desatualizados (`cadunico_tot_fam` nao existe mais - campo real
  e `cadun_qtd_familias_cadastradas_i`) - sempre confirmar via `fl=*` antes
  de usar. Codigo IBGE desta fonte tem 6 digitos (sem digito verificador,
  ex: Sao Paulo = 355030) - join feito comparando com os 6 primeiros digitos
  do codigo_ibge de 7 digitos da base territorial. Duas metricas gravadas:
  `percentual_cadunico` (coluna ja existente desde o scaffold original) =
  cobertura (pessoas cadastradas / populacao total x 100); `percentual_
  pobreza_cadunico` (nova) = das familias JA cadastradas, % em situacao de
  pobreza ou extrema pobreza. Periodo de referencia: 202512 (dez/2025,
  mes mais recente disponivel). Cobertura: 5.570/5.573 municipios (3 sem
  correspondencia). RESSALVA DE QUALIDADE DE DADO: alguns municipios
  pequenos do Norte/Nordeste (ex: Itaubal/AP 129%, Sebastiao Barros/PI 125%)
  apresentam `percentual_cadunico` ACIMA de 100% - fenomeno conhecido de
  descompasso entre a populacao do Censo 2022 (subestimada em areas remotas)
  e o numero de pessoas cadastradas no CadUnico (que pode incluir registros
  de quem migrou e nao foi baixado do sistema) - nao e erro do extractor,
  e limitacao conhecida da fonte, documentar ao exibir este indicador.
  Este indicador e um dos 4 insumos previstos para o futuro "Indice de
  Pobreza Energetica Regional" (RF-080 do DRF: IBGE, CadUnico, TSEE,
  IVS/IPEA) - o indice completo continua bloqueado pelo TSEE (ver acima),
  mas o CadUnico em si ja e indicador valido e utilizavel isoladamente.
  Extractor: `backend/src/etl/loaders/extrair_cadunico.py`.
- **Irradiacao Solar (INPE/LABREN)** - fechado 04/07/2026. Fonte: Atlas
  Brasileiro de Energia Solar, 2a edicao (2017), LABREN/CCST/INPE
  (`labren.ccst.inpe.br/atlas_2017.html`), extrato CSV "Sedes de Municipios"
  (nao a grade completa 0.1x0.1 grau - evita interpolacao espacial propria).
  Variavel: Irradiacao Global Horizontal (GHI) media anual, convertida de
  Wh/m2.dia para kWh/m2.dia. DADO E MEDIA CLIMATOLOGICA DE 17 ANOS
  (1999-2015), nao um ano especifico - gravado com periodo_referencia =
  2017-01-01 (ano de publicacao) apenas como convencao de chave. LICENCA
  CC BY-NC-ND: uso nao-comercial permitido, mas NAO pode ser usado para
  fins comerciais sem autorizacao do INPE - citar sempre como "LABREN/CCST/
  INPE". Fonte NAO tem codigo IBGE - join feito por NOME+ESTADO normalizado
  (maiusculas, sem acento). Exigiu tabela de alias manual para 21 dos 5.573
  municipios (grafias antigas, hifen vs espaco, DE/DO) - achado notavel:
  a propria fonte do INPE tem um ERRO DE DADO real, a linha de "Porto
  Alegre" (capital do RS) esta rotulada com estado "RIO GRANDE DO NORTE"
  (confirmado via coordenadas - corrigido no extractor). Cobertura final:
  5.569/5.573 municipios (os 4 ausentes sao genuinos: Fernando de Noronha,
  2 placeholders de corpo d'agua no RS, e Boa Esperanca do Norte/MT sem
  correspondencia). Schema ja existia desde a migration 0000 (tabela
  `irradiacao_solar`) - nao precisou nova migration. Extractor:
  `backend/src/etl/loaders/extrair_irradiacao_solar_inpe.py`. Dados mensais
  e outras variaveis (Direta Normal, Difusa, Plano Inclinado, PAR) do
  mesmo Atlas ainda NAO carregados - possivel expansao futura.
- **OBEPE**: referencia metodologica (Indice de Pobreza Energetica Regional), nao fonte
  primaria - ver `docs/DRF.md` secao 14.
- **Mortalidade infantil (Capital Humano)** - fechado 04/07/2026, migration
  `0012_capital_humano_mortalidade_infantil.sql`. Fonte: SIM (obitos) + SINASC
  (nascidos vivos), ambos DATASUS, via Base dos Dados/BigQuery
  (`basedosdados.br_ms_sim.microdados` e `basedosdados.br_ms_sinasc.microdados`
  - NAO usar as tabelas pre-agregadas `municipio_causa_idade*`, estao
  desatualizadas/travadas em 2019). Taxa = media poolada 2022-2024 (soma de
  obitos infantis dividida pela soma de nascidos vivos do periodo, x 1000) -
  escolhida para reduzir ruido estatistico em municipios pequenos. Campo
  `idade` do SIM ja vem limpo em anos decimais pela Base dos Dados (nao e o
  codigo bruto do DATASUS) - filtro `idade < 1` isola automaticamente os
  obitos nao-fetais, sem precisar filtro adicional de `tipo_obito`. Validado
  contra numero nacional: 86.522 obitos / 7.487.033 nascidos (periodo
  2022-2024) = 11,56 por mil, compativel com a taxa oficial do Brasil.
  Extractor: `backend/src/etl/loaders/extrair_capital_humano_mortalidade_infantil.py`.

## Estado das migrations (corrigido 04/07/2026)

Numeracao real em `backend/src/db/migrations/`: 0000 a 0010 (indicadores sociais,
territorio, moradia, favelas). O schema do INDQUAL (`qualidade_conjuntos`,
`qualidade_indicadores`, `qualidade_conjunto_municipio`) foi criado fora desse sistema
formal, via script Python direto - por isso nao aparece na pasta de migrations.
A migration `0011_qualidade_dec_fec_real.sql` (views DEC/FEC real) e a primeira
migration formal relacionada a qualidade de fornecimento. Proxima migration: 0012.

## Fila de trabalho

1. Cruzamento MMGD x indicadores sociais - identificar vazios reais de acesso
2. Atualizar README e CLAUDE.md (Estado Real) com os dados das sessoes de Moradia,
   INDQUAL, DEC/FEC real, Capital Humano e Irradiacao Solar

## Bloqueado (aguardando dado externo)

- **Beneficiarios da CDE / `percentual_tsee`** - bloqueado desde 04/07/2026 ate existir
  arquivo mensal de jan/2026 em diante com a subclasse "Residencial Desconto Social"
  faturada (ver detalhes em Decisoes de fontes). Retomar quando o arquivo estiver
  disponivel no portal. TENTATIVA ADICIONAL EM 04/07/2026: tentado avancar parcialmente
  usando so a subclasse antiga "Residencial Baixa Renda" (sem "Desconto Social") com o
  arquivo mais recente disponivel (jun/25) - bloqueado por problema tecnico no proprio
  portal da ANEEL: downloads de "Beneficiarios da CDE" retornam loop de redirecionamento
  HTTP 302 (confirmado via curl -v e tambem via navegador, testado com jun/25 e mai/24).
  Outro recurso do mesmo portal ("rede-basica-2022") baixou normalmente, entao o
  problema e especifico deste dataset/recurso, nao do portal inteiro - provavelmente
  instabilidade temporaria do lado da ANEEL. Reintentar em sessao futura antes de
  investir mais tempo nisso.

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

## Indices compostos e metodologia de cruzamentos (sessao 04/07/2026)

Alinhamento da metodologia de cruzamentos previstos no DRF (RF-049 a RF-057,
RF-080). Decisoes tomadas:

- **Eixo MMGD (Y)**: usar valor PER CAPITA, nao absoluto - contagem absoluta
  favorece cidades grandes independente da taxa real de adocao. "% domicilios
  com MMGD" seria mais correto conceitualmente mas exige numero de domicilios
  do Censo, que nao esta carregado ainda - per capita e o viavel hoje.
- **Limiar dos quadrantes**: usar MEDIANA, nao media - distribuicoes assimetricas
  (poucos municipios grandes puxam a media, maioria fica artificialmente abaixo).
- **Direcao dos indicadores**: cada indicador tem metadado positivo (quanto
  maior, melhor) ou negativo (quanto maior, pior/mais vulneravel). O valor
  exibido no grafico NUNCA e transformado/invertido - a logica de quadrante
  (favoravel/desfavoravel) e calculada no backend considerando a direcao,
  mantendo os numeros exibidos identicos aos armazenados.

Indicadores negativos identificados: IVS, indice_precariedade_moradia,
indice_precariedade_infraestrutura, taxa_mortalidade_infantil, DEC/FEC
(Qualidade Fornecimento), percentual_pobreza_cadunico. Demais sao positivos.

### Achado arquitetural: fragmentacao de indicadores_sociais por periodo

A chave unica `(unidade_espacial_id, periodo_referencia)` fez cada extractor
gravar os dados do seu proprio periodo de referencia, fragmentando um mesmo
municipio em ate 4 linhas diferentes (2022-01-01, 2024-01-01, 2025-12-01,
2025-12-31), cada uma preenchida so parcialmente. Nao ha serie temporal real
intencional - e efeito colateral de cada extractor escolher seu proprio
periodo. Resolvido via `vw_indicadores_sociais_consolidado` (migration 0014),
que agrega por municipio pegando o valor nao-nulo de cada coluna (MAX, seguro
porque cada coluna so tem valor em UM periodo por municipio).

### Indices compostos de Moradia e Infraestrutura Urbana (migration 0014)

Ate esta sessao, "Infraestrutura Urbana" e "Moradia" existiam so como colunas
brutas de sub-indicadores (a `ARQUITETURA.md`/README ja diziam "indices
proprios inspirados no IVS/IPEA", mas o indice composto de fato nunca tinha
sido calculado). Construidos agora com a mesma metodologia do IVS/IPEA:
normalizacao min-max (0=melhor, 1=pior) sobre a distribuicao nacional atual,
media simples dos sub-indicadores normalizados.

**Indice de Precariedade de Infraestrutura** (negativo, 0 a 1): media
normalizada de `percentual_agua_inadequada`, `percentual_esgoto_inadequado`,
`percentual_lixo_inadequado`. Excluidos `percentual_populacao_rural` e
`densidade_populacional` (caracteristicas demograficas, nao vulnerabilidade
por si so).

**Indice de Precariedade Habitacional** (negativo, 0 a 1): media normalizada
de `percentual_cortico`, `percentual_parede_inadequada`,
`percentual_populacao_favela`. Excluidos regime de posse (ver indice proprio
abaixo) e contagens absolutas/MCMV (viesadas por tamanho ou medem
intervencao publica, nao vulnerabilidade).

**Indice de Seguranca da Posse** (positivo, 0 a 100, NOVO - decisao explicita
de nao deixar de fora regime de posse): `1,0 x %proprio + 0,5 x %alugado +
0,0 x %cedido`. Pesos refletem seguranca decrescente (proprio = maxima
seguranca; alugado = protegido por contrato mas sem propriedade; cedido =
tipicamente informal/precario). Retorna NULL (nao 0) quando os 3 campos de
origem sao nulos - 3 municipios sem nenhum dado de regime de posse (bug
corrigido durante a validacao: a primeira versao usava COALESCE(...,0) sem
guarda, fazendo esses 3 municipios aparecerem com "seguranca zero" ao inves
de "sem dado").

**Cobertura de Investimento Publico Habitacional** (positivo, unidades por
1.000 hab, NOVO - decisao explicita de nao deixar de fora investimento
publico): `(unidades FGTS + unidades OGU entregues) / populacao x 1000`.
Populacao reconstituida via `densidade_populacional x area_km2` (mesmo
metodo do extractor de RAIS).

Validado: Sao Paulo (infra 0,018 - quase o melhor do pais) vs Rio Branco/AC
(infra 0,230, moradia similar, cobertura MCMV maior per capita) - direcoes
e magnitudes plausiveis.

Views: `vw_indicadores_sociais_consolidado`, `vw_indices_compostos_moradia_infraestrutura`.

### IVS Consolidado (migration 0015, sessao 06/07/2026)

Fechando o indicador `ivs` (coluna ja existente desde o scaffold original,
citada na lista de "indicadores negativos" desta mesma secao, mas nunca
calculada ate agora). Mesma metodologia de normalizacao min-max ja usada nos
indices de Moradia/Infraestrutura (migration 0014): media dos 3 blocos
oficiais do IVS/IPEA, cada bloco = media de indicadores normalizados.

- **Bloco Infraestrutura Urbana**: media normalizada de
  `percentual_populacao_rural`, `percentual_agua_inadequada`,
  `percentual_esgoto_inadequado`, `percentual_lixo_inadequado`.
  `densidade_populacional` EXCLUIDA por ambiguidade de sinal (mesmo
  criterio ja aplicado ao indice de precariedade de infraestrutura da
  migration 0014 - baixa E alta densidade podem ambas indicar
  vulnerabilidade, por motivos opostos).
- **Bloco Renda e Trabalho**: media normalizada de `renda_media_domiciliar`
  (invertida) e `percentual_vinculos_formais` (invertida).
- **Bloco Capital Humano**: media normalizada de `taxa_alfabetizacao`
  (invertida) e `taxa_mortalidade_infantil` (nao invertida).
- **IVS** = media simples dos 3 blocos.
- Moradia (seguranca da posse, cortico, favela) fica FORA do IVS de
  proposito - eixo separado (`vw_indices_compostos_moradia_infraestrutura`),
  para permitir testar "MMGD x Seguranca da Posse" isoladamente sem diluir
  no IVS geral.

Usa `vw_indicadores_sociais_consolidado` (migration 0014) como fonte, ja
resolvendo a fragmentacao por `periodo_referencia`. Validado: 21.595 linhas
/ ~5.571 municipios com IVS calculado, distribuicao 0,09 a 0,78 (media
0,45) - plausivel para indice normalizado 0-1.

View: `vw_ivs_consolidado`.


## Manutencao deste documento

Atualizar ao fim de cada sessao de carga de dados: estado da `unidades_espaciais`,
tabela de dimensoes e fila de trabalho. Decisoes de fontes so mudam com nova pesquisa.
